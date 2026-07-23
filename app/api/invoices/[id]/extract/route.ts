import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/with-tenant';
import { prisma } from '@/lib/prisma';
import { extractInvoiceData } from '@/lib/ia';
import { uploadToDrive } from '@/lib/drive';
import { Prisma } from '@prisma/client';

function getPaymentStatusFromDueDate(dueDate: Date): 'PENDING' | 'OVERDUE' {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const parsedDueDate = new Date(dueDate);
  parsedDueDate.setHours(0, 0, 0, 0);

  return parsedDueDate < today ? 'OVERDUE' : 'PENDING';
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

    // Extract data with AI
    const extraction = await extractInvoiceData(invoice.fileUrl);

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
    if (invoice.organization.driveRefreshToken) {
      try {
        const driveFileId = await uploadToDrive({
          fileUrl: invoice.fileUrl,
          fileName: invoice.fileName,
          refreshToken: invoice.organization.driveRefreshToken,
        });

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
