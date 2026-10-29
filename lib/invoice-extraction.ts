import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { extractInvoiceData } from '@/lib/ia';
import { getInvoiceFileFromEmail } from '@/lib/email-file';
import { isInvoiceIssuedByOrganization } from '@/lib/electronic-invoice';
import { getAdminClient } from '@/lib/supabase/admin';
import { resolveInvoiceStoragePath } from '@/lib/invoice-storage';
import { registerExtractionFailure } from '@/lib/extraction-retry';
import type { InvoiceData } from '@/types';

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

export type InvoiceExtractionOutcome =
  | { kind: 'extracted'; data: InvoiceData }
  | { kind: 'discarded'; message: string }
  | { kind: 'not-invoice'; message: string }
  | { kind: 'retry'; error: string; nextRetryAt: Date; attempt: number }
  | { kind: 'failed'; error: string };

/**
 * Extrae y guarda los datos de una factura. Compartido por el endpoint manual
 * y por el cron de reintentos.
 */
export async function runInvoiceExtraction(
  invoiceId: string,
  organizationNit: string | null
): Promise<InvoiceExtractionOutcome> {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) {
    return { kind: 'failed', error: 'Factura no encontrada' };
  }

  // Email-sourced invoices are fetched live from the inbox; manual uploads live
  // in the private `invoices` bucket.
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

  const extraction = invoiceFile
    ? await extractInvoiceData(
        invoiceFile.buffer,
        invoiceFile.mimeType,
        invoiceFile.fileName
      )
    : await extractInvoiceData(invoice.fileUrl, undefined, invoice.fileName);

  if (!extraction.success || !extraction.data) {
    // El documento no es una factura: se elimina la fila en lugar de dejarla
    // como error en el listado.
    if (extraction.isInvoice === false) {
      await discardInvoice({
        id: invoice.id,
        filePath: invoice.filePath,
        fileUrl: invoice.fileUrl,
        source: invoice.source,
      });

      return {
        kind: 'not-invoice',
        message:
          'El archivo no parece una factura, así que no se registró. Si estás seguro de que lo es, súbelo de nuevo o edítalo manualmente.',
      };
    }

    const error = extraction.error || 'Error al extraer datos';

    const failure = await registerExtractionFailure({
      invoiceId: invoice.id,
      retryable: Boolean(extraction.retryable),
      retryCount: invoice.retryCount,
      rawResponse: extraction.rawResponse ?? { error },
    });

    if (failure.retryScheduled && failure.nextRetryAt) {
      return {
        kind: 'retry',
        error,
        nextRetryAt: failure.nextRetryAt,
        attempt: failure.attempt,
      };
    }

    return { kind: 'failed', error };
  }

  // Discard invoices the organization emitted itself (only for DIAN XML).
  if (
    extraction.source === 'XML' &&
    isInvoiceIssuedByOrganization(extraction.data, organizationNit)
  ) {
    await discardInvoice({
      id: invoice.id,
      filePath: invoice.filePath,
      fileUrl: invoice.fileUrl,
      source: invoice.source,
    });

    return {
      kind: 'discarded',
      message:
        'Esta factura fue emitida por tu empresa, por lo que no se registró como cuenta por pagar.',
    };
  }

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
      paymentStatus: getPaymentStatusFromDueDate(
        new Date(extraction.data.dueDate)
      ),
      retryCount: 0,
      nextRetryAt: null,
    },
  });

  return { kind: 'extracted', data: extraction.data };
}
