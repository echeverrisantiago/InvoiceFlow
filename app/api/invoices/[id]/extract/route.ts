import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/with-tenant';
import { prisma } from '@/lib/prisma';
import { extractInvoiceData } from '@/lib/ia';
import { uploadToDrive } from '@/lib/drive';
import { Prisma } from '@prisma/client';
import { getInvoiceFileFromEmail } from '@/lib/email-file';
import { isInvoiceIssuedByOrganization } from '@/lib/electronic-invoice';
import { createClient } from '@/lib/supabase/server';
import { enforceRateLimit, extractOrgLimiter } from '@/lib/ratelimit';
import { decryptToken } from '@/lib/token-crypto';

function getPaymentStatusFromDueDate(dueDate: Date): 'PENDING' | 'OVERDUE' {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const parsedDueDate = new Date(dueDate);
  parsedDueDate.setHours(0, 0, 0, 0);

  return parsedDueDate < today ? 'OVERDUE' : 'PENDING';
}

/**
 * Extracts the Supabase Storage object path from a public URL
 * (e.g. https://x.supabase.co/storage/v1/object/public/invoices/org/file.zip).
 */
function getStoragePathFromUrl(fileUrl: string): string | null {
  const marker = '/object/public/invoices/';
  const index = fileUrl.indexOf(marker);
  if (index === -1) return null;
  const path = fileUrl.slice(index + marker.length).split('?')[0];
  if (!path) return null;
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * Removes an invoice that should not be registered, along with its uploaded
 * file in Supabase Storage (manual uploads) to avoid orphaned objects.
 */
async function discardInvoice(invoice: {
  id: string;
  fileUrl: string;
  source: string;
}): Promise<void> {
  if (invoice.source !== 'EMAIL') {
    const storagePath = getStoragePathFromUrl(invoice.fileUrl);
    if (storagePath) {
      try {
        const supabase = await createClient();
        await supabase.storage.from('invoices').remove([storagePath]);
      } catch (error) {
        console.error('Error eliminando archivo de Supabase Storage:', error);
      }
    }
  }

  try {
    await prisma.invoice.delete({ where: { id: invoice.id } });
  } catch (error) {
    console.error('Error eliminando factura omitida:', error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getTenantContext();

    if (!context) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    const limited = await enforceRateLimit(
      extractOrgLimiter,
      `org:${context.organization.id}`
    );
    if (limited) return limited;

    if (!context.subscription.isActive) {
      return NextResponse.json(
        {
          error:
            'Tu periodo de prueba ha terminado. Suscríbete para continuar.',
          code: 'SUBSCRIPTION_REQUIRED',
        },
        { status: 402 }
      );
    }

    const { id } = await params;

    // Get invoice
    const invoice = await prisma.invoice.findUnique({
      where: {
        id,
        organizationId: context.organization.id,
      },
      include: {
        organization: true,
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: 'Factura no encontrada' },
        { status: 404 }
      );
    }

    // Resolve the invoice file. Email-sourced invoices are fetched live from the inbox.
    let emailFile: { buffer: Buffer; mimeType: string; fileName: string } | null = null;
    if (invoice.source === 'EMAIL' && invoice.emailAccountId && invoice.messageUid) {
      emailFile = await getInvoiceFileFromEmail({
        emailAccountId: invoice.emailAccountId,
        messageUid: invoice.messageUid,
        attachmentFilename: invoice.attachmentFilename,
      });
    }

    // Extract data (electronic invoice XML when available, otherwise AI)
    const extraction = emailFile
      ? await extractInvoiceData(emailFile.buffer, emailFile.mimeType, emailFile.fileName)
      : await extractInvoiceData(invoice.fileUrl, undefined, invoice.fileName);

    if (!extraction.success || !extraction.data) {
      // Update status to failed
      await prisma.invoice.update({
        where: { id },
        data: {
          status: 'FAILED',
          extractedData: extraction.rawResponse,
        },
      });

      return NextResponse.json(
        { error: extraction.error || 'Error al extraer datos' },
        { status: 500 }
      );
    }

    // Discard invoices the organization emitted itself (only for DIAN XML).
    if (
      extraction.source === 'XML' &&
      isInvoiceIssuedByOrganization(extraction.data, context.organization.nit)
    ) {
      await discardInvoice({
        id: invoice.id,
        fileUrl: invoice.fileUrl,
        source: invoice.source,
      });

      return NextResponse.json({
        success: false,
        skipped: true,
        reason: 'ISSUED_BY_ORGANIZATION',
        message:
          'Esta factura fue emitida por tu empresa, por lo que no se registró como cuenta por pagar.',
      });
    }

    // Update invoice with extracted data
    const updatedInvoice = await prisma.invoice.update({
      where: { id },
      data: {
        supplier: extraction.data.supplier,
        supplierNit: extraction.data.supplierNit,
        issueDate: new Date(extraction.data.issueDate),
        dueDate: new Date(extraction.data.dueDate),
        subtotal: extraction.data.subtotal,
        iva: extraction.data.iva,
        total: extraction.data.total,
        description: extraction.data.description,
        invoiceItems: extraction.data.items as unknown as Prisma.InputJsonValue,
        extractedData: extraction.rawResponse,
        status: 'EXTRACTED',
        paymentStatus: getPaymentStatusFromDueDate(
          new Date(extraction.data.dueDate)
        ),
      },
    });

    // Upload to Google Drive (if configured)
    const driveRefreshToken = decryptToken(invoice.organization.driveRefreshToken);
    if (driveRefreshToken) {
      try {
        const driveFileId = await uploadToDrive(
          emailFile
            ? {
                fileName: invoice.fileName,
                refreshToken: driveRefreshToken,
                buffer: emailFile.buffer,
                contentType: emailFile.mimeType,
              }
            : {
                fileUrl: invoice.fileUrl,
                fileName: invoice.fileName,
                refreshToken: driveRefreshToken,
              }
        );

        // Update with Drive file ID
        await prisma.invoice.update({
          where: { id },
          data: {
            driveFileId,
            status: 'BACKED_UP',
          },
        });
      } catch (driveError: any) {
        console.error('Drive upload error:', driveError);
        if (driveError.message?.includes('invalid_grant')) {
          await prisma.organization.update({
            where: { id: invoice.organizationId },
            data: {
              driveRefreshToken: null,
              driveTokenExpiry: null,
            },
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      invoice: updatedInvoice,
      extracted: extraction.data,
    });
  } catch (error: any) {
    console.error('Extraction error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al procesar factura' },
      { status: 500 }
    );
  }
}
