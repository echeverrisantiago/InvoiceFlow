import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/with-tenant';
import { prisma } from '@/lib/prisma';
import { extractInvoiceData } from '@/lib/ia';
import { Prisma } from '@prisma/client';
import { getInvoiceFileFromEmail } from '@/lib/email-file';
import { isInvoiceIssuedByOrganization } from '@/lib/electronic-invoice';
import { getAdminClient } from '@/lib/supabase/admin';
import { enforceRateLimit, extractOrgLimiter } from '@/lib/ratelimit';
import { resolveInvoiceStoragePath } from '@/lib/invoice-storage';

function getPaymentStatusFromDueDate(dueDate: Date): 'PENDING' | 'OVERDUE' {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const parsedDueDate = new Date(dueDate);
  parsedDueDate.setHours(0, 0, 0, 0);

  return parsedDueDate < today ? 'OVERDUE' : 'PENDING';
}

/**
 * Removes an invoice that should not be registered, along with its uploaded
 * file in Supabase Storage (manual uploads) to avoid orphaned objects.
 */
async function discardInvoice(invoice: {
  id: string;
  filePath: string | null;
  fileUrl: string;
  source: string;
}): Promise<void> {
  if (invoice.source !== 'EMAIL') {
    const storagePath = resolveInvoiceStoragePath(invoice);
    if (storagePath) {
      try {
        const supabase = getAdminClient();
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
    });

    if (!invoice) {
      return NextResponse.json(
        { error: 'Factura no encontrada' },
        { status: 404 }
      );
    }

    // Resolve the invoice file.
    // - Email-sourced invoices are fetched live from the inbox.
    // - Manual uploads live in the private `invoices` bucket (downloaded via Storage API).
    let invoiceFile: { buffer: Buffer; mimeType: string; fileName: string } | null = null;

    if (
      invoice.source === 'EMAIL' &&
      invoice.emailAccountId &&
      invoice.messageId
    ) {
      invoiceFile = await getInvoiceFileFromEmail({
        emailAccountId: invoice.emailAccountId,
        messageId: invoice.messageId,
        attachmentFilename: invoice.attachmentFilename,
      });
    } else {
      const storagePath = resolveInvoiceStoragePath(invoice);
      if (storagePath) {
        const supabase = getAdminClient();
        const { data, error } = await supabase.storage
          .from('invoices')
          .download(storagePath);

        if (!error && data) {
          invoiceFile = {
            buffer: Buffer.from(await data.arrayBuffer()),
            mimeType: data.type || 'application/pdf',
            fileName: invoice.fileName,
          };
        } else if (error) {
          console.error('Error descargando archivo de Storage:', error);
        }
      }
    }

    // Extract data (electronic invoice XML when available, otherwise AI)
    const extraction = invoiceFile
      ? await extractInvoiceData(invoiceFile.buffer, invoiceFile.mimeType, invoiceFile.fileName)
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
        filePath: invoice.filePath,
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
    await prisma.invoice.update({
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

    return NextResponse.json({
      success: true,
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
