import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { nanoid } from 'nanoid';
import { withTimeout, type EmailAccountConfig } from '@/lib/email-file';
import { isInvoiceIssuedByOrganization } from '@/lib/electronic-invoice';
import { registerExtractionFailure } from '@/lib/extraction-retry';

export type AttachmentOutcome = 'processed' | 'skipped' | 'duplicate';

/**
 * Procesa un adjunto de correo: extrae los datos con IA y crea la factura.
 *
 * Compartido por la lectura de Gmail (Gmail API) y de Outlook (Microsoft Graph).
 */
export async function storeInvoiceFromAttachment({
  config,
  organizationNit,
  buffer,
  mimeType,
  fileName,
  messageId,
}: {
  config: EmailAccountConfig;
  organizationNit: string | null;
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  /** Id del mensaje en la API del proveedor (Gmail o Microsoft Graph). */
  messageId: string;
}): Promise<AttachmentOutcome> {
  const { extractInvoiceData } = await import('@/lib/ia');
  const extraction = await withTimeout(
    extractInvoiceData(buffer, mimeType, fileName),
    120_000,
    'extractInvoiceData'
  );

  // Skip invoices the organization emitted itself (only for DIAN XML).
  if (
    extraction.success &&
    extraction.data &&
    extraction.source === 'XML' &&
    isInvoiceIssuedByOrganization(extraction.data, organizationNit)
  ) {
    return 'skipped';
  }

  const invoiceId = nanoid();
  let invoice;
  try {
    invoice = await prisma.invoice.create({
      data: {
        id: invoiceId,
        organizationId: config.organizationId,
        fileName,
        fileUrl: `/api/invoices/${invoiceId}/file`,
        fileSize: buffer.length,
        source: 'EMAIL',
        status: 'PROCESSING',
        paymentStatus: 'PENDING',
        emailAccountId: config.id,
        messageId,
        attachmentFilename: fileName,
      },
    });
  } catch (createError) {
    // Unique constraint (same account + message + attachment): already imported.
    if (
      createError instanceof Prisma.PrismaClientKnownRequestError &&
      createError.code === 'P2002'
    ) {
      return 'duplicate';
    }
    throw createError;
  }

  if (extraction.success && extraction.data) {
    await prisma.invoice.update({
      where: { id: invoice.id },
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
        paymentStatus:
          new Date(extraction.data.dueDate) < new Date(new Date().setHours(0, 0, 0, 0))
            ? 'OVERDUE'
            : 'PENDING',
      },
    });
  } else {
    await registerExtractionFailure({
      invoiceId: invoice.id,
      retryable: Boolean(extraction.retryable),
      retryCount: 0,
      rawResponse: extraction.rawResponse ?? { error: extraction.error },
    });
  }

  return 'processed';
}

