import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { nanoid } from 'nanoid';
import { withTimeout, type EmailAccountConfig } from '@/lib/email-file';
import { isInvoiceIssuedByOrganization } from '@/lib/electronic-invoice';
import { decryptToken } from '@/lib/token-crypto';

export type AttachmentOutcome = 'processed' | 'skipped' | 'duplicate';

/**
 * Procesa un adjunto de correo: extrae los datos con IA, crea la factura y,
 * si procede, la respalda en Drive/OneDrive.
 *
 * Compartido por la lectura de Gmail (Gmail API) y de Outlook (IMAP).
 */
export async function storeInvoiceFromAttachment({
  config,
  organizationNit,
  buffer,
  mimeType,
  fileName,
  messageUid,
  messageId,
}: {
  config: EmailAccountConfig;
  organizationNit: string | null;
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  /** IMAP UID (Outlook y facturas antiguas de Gmail). */
  messageUid: bigint | null;
  /** Id de mensaje de la Gmail API. */
  messageId: string | null;
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
        messageUid,
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

    const org = await prisma.organization.findUnique({
      where: { id: config.organizationId },
      select: {
        driveRefreshToken: true,
        onedriveRefreshToken: true,
      },
    });

    const driveRefreshToken = decryptToken(org?.driveRefreshToken);
    const onedriveRefreshToken = decryptToken(org?.onedriveRefreshToken);

    if (config.provider === 'GMAIL' && driveRefreshToken) {
      await backupToDrive({
        buffer,
        mimeType,
        fileName,
        refreshToken: driveRefreshToken,
        invoiceId: invoice.id,
      });
    } else if (config.provider === 'OUTLOOK' && onedriveRefreshToken) {
      await backupToOneDrive({
        buffer,
        contentType: mimeType,
        fileName,
        refreshToken: onedriveRefreshToken,
        invoiceId: invoice.id,
      });
    }
  } else {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: 'FAILED',
        extractedData: extraction.rawResponse,
      },
    });
  }

  return 'processed';
}

async function backupToDrive({
  buffer,
  mimeType,
  fileName,
  refreshToken,
  invoiceId,
}: {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  refreshToken: string;
  invoiceId: string;
}) {
  try {
    const { uploadToDrive } = await import('@/lib/drive');
    const driveFileId = await withTimeout(
      uploadToDrive({ fileName, refreshToken, buffer, contentType: mimeType }),
      60_000,
      'uploadToDrive'
    );
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { driveFileId, status: 'BACKED_UP' },
    });
  } catch (driveError) {
    console.error('Google Drive upload error:', driveError);
  }
}

async function backupToOneDrive({
  buffer,
  contentType,
  fileName,
  refreshToken,
  invoiceId,
}: {
  buffer: Buffer;
  contentType: string;
  fileName: string;
  refreshToken: string;
  invoiceId: string;
}) {
  try {
    const { uploadToOneDrive } = await import('@/lib/onedrive');
    const onedriveFileId = await withTimeout(
      uploadToOneDrive({ buffer, contentType, fileName, refreshToken }),
      60_000,
      'uploadToOneDrive'
    );
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { driveFileId: onedriveFileId, status: 'BACKED_UP' },
    });
  } catch (onedriveError) {
    console.error('OneDrive upload error:', onedriveError);
  }
}
