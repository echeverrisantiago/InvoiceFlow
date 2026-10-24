import { nanoid } from 'nanoid';
import { prisma } from '@/lib/prisma';
import { getInvoiceQuota } from '@/lib/plans';
import {
  getAccessTokenForOAuth,
  isInvoiceAttachment,
  inferMimeType,
  type EmailAccountConfig,
} from '@/lib/email-file';
import { listGmailMessageIds, getGmailMessage } from '@/lib/gmail';
import { storeInvoiceFromAttachment } from '@/lib/email-processing';

const MAX_EMAILS_PER_RUN = 50;

export interface FetchEmailsResult {
  success: boolean;
  processed: number;
  skipped: number;
  errors: string[];
}

/**
 * Importa facturas nuevas de una cuenta de Gmail usando la Gmail API
 * (solo lectura).
 */
export async function fetchNewGmailEmails(
  config: EmailAccountConfig
): Promise<FetchEmailsResult> {
  const errors: string[] = [];
  let processed = 0;
  let skipped = 0;

  const tokenResult = await getAccessTokenForOAuth(config);
  if (!tokenResult.accessToken) {
    return {
      success: false,
      processed: 0,
      skipped: 0,
      errors: [
        tokenResult.needsReconnect
          ? `La cuenta ${config.email} necesita reconexión (${tokenResult.error || 'token inválido'}).`
          : tokenResult.error || 'No se pudo obtener token de acceso OAuth',
      ],
    };
  }
  const accessToken = tokenResult.accessToken;

  const organization = await prisma.organization.findUnique({
    where: { id: config.organizationId },
    select: { nit: true },
  });
  const organizationNit = organization?.nit ?? null;

  const quota = await getInvoiceQuota(config.organizationId);
  let remainingQuota = quota.remaining;
  if (remainingQuota <= 0) {
    return {
      success: true,
      processed: 0,
      skipped: 0,
      errors: [
        `Límite de ${quota.limit} facturas/mes del plan ${quota.plan.name} alcanzado; no se importaron correos.`,
      ],
    };
  }

  // Cursor: `internalDate` del último correo procesado. Se solapa un minuto y el
  // índice único evita duplicados. En el primer barrido se mira desde la
  // creación de la cuenta (-1 día, por el desfase UTC vs. hora local).
  const after = config.lastEmailDate
    ? new Date(config.lastEmailDate.getTime() - 60_000)
    : new Date(config.createdAt.getTime() - 24 * 60 * 60 * 1000);

  try {
    // Los ids vienen del más antiguo al más nuevo, para poder avanzar el cursor
    // de forma segura.
    const { ids: messageIds, truncated } = await listGmailMessageIds({
      accessToken,
      after,
      limit: MAX_EMAILS_PER_RUN,
    });

    if (truncated) {
      errors.push(
        'El buzón tiene más correos con adjuntos de los que se pueden paginar en una ejecución; los más antiguos de la ventana quedaron sin revisar.'
      );
    }

    console.log(
      `[fetchNewGmailEmails] ${messageIds.length} mensajes encontrados para ${config.email}.`
    );

    let maxInternalDate = config.lastEmailDate ? config.lastEmailDate.getTime() : 0;

    for (const messageId of messageIds) {
      if (remainingQuota <= 0) break;

      try {
        const message = await getGmailMessage({ accessToken, messageId });
        if (!message) {
          errors.push(`No se pudo obtener el mensaje ${messageId}`);
          continue;
        }

        if (message.internalDate > maxInternalDate) {
          maxInternalDate = message.internalDate;
        }

        for (const attachment of message.attachments) {
          if (remainingQuota <= 0) break;
          if (!isInvoiceAttachment(attachment)) continue;

          try {
            const fileName = attachment.filename || `invoice-${nanoid()}.pdf`;
            const mimeType = attachment.contentType || inferMimeType(fileName);

            const outcome = await storeInvoiceFromAttachment({
              config,
              organizationNit,
              buffer: attachment.content,
              mimeType,
              fileName,
              messageUid: null,
              messageId,
            });

            if (outcome === 'skipped') {
              skipped++;
            } else if (outcome === 'processed') {
              processed++;
              remainingQuota--;
            }
          } catch (attError: unknown) {
            const msg =
              attError instanceof Error ? attError.message : 'Error desconocido';
            errors.push(
              `Error procesando attachment ${attachment.filename || 'unknown'}: ${msg}`
            );
          }
        }
      } catch (msgError: unknown) {
        const msg = msgError instanceof Error ? msgError.message : 'Error desconocido';
        errors.push(`Error leyendo mensaje ${messageId}: ${msg}`);
      }
    }

    await prisma.emailAccount.update({
      where: { id: config.id },
      data: {
        ...(maxInternalDate > 0 ? { lastEmailDate: new Date(maxInternalDate) } : {}),
        lastCheckedAt: new Date(),
      },
    });

    console.log(
      `[fetchNewGmailEmails] Completado para ${config.email}: ${processed} procesados, ${skipped} omitidos, ${errors.length} errores`
    );
    return { success: true, processed, skipped, errors };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error consultando la Gmail API';
    console.error(`[fetchNewGmailEmails] Error para ${config.email}:`, msg);
    return { success: false, processed, skipped, errors: [msg] };
  }
}
