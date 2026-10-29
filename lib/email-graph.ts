import { nanoid } from 'nanoid';
import { prisma } from '@/lib/prisma';
import { getInvoiceQuota } from '@/lib/plans';
import {
  getAccessTokenForOAuth,
  flagNeedsReconnect,
  isInvoiceAttachment,
  inferMimeType,
  type EmailAccountConfig,
} from '@/lib/email-file';
import { listGraphMessages, getGraphMessage, GraphApiError } from '@/lib/graph';
import { storeInvoiceFromAttachment } from '@/lib/email-processing';
import type { FetchEmailsResult } from '@/lib/email-sync';

const MAX_EMAILS_PER_RUN = 50;

/**
 * Importa facturas nuevas de una cuenta de Outlook usando Microsoft Graph
 * (solo lectura, scope `Mail.Read`).
 */
export async function fetchNewGraphEmails(
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

  // Cursor: `receivedDateTime` del último correo procesado, con un minuto de
  // solape (el índice único evita duplicados). En el primer barrido se mira
  // desde la creación de la cuenta (-1 día por el desfase UTC).
  const after = config.lastEmailDate
    ? new Date(config.lastEmailDate.getTime() - 60_000)
    : new Date(config.createdAt.getTime() - 24 * 60 * 60 * 1000);

  try {
    // Graph devuelve los mensajes del más antiguo al más nuevo.
    const messages = await listGraphMessages({
      accessToken,
      after,
      limit: MAX_EMAILS_PER_RUN,
    });

    console.log(
      `[fetchNewGraphEmails] ${messages.length} mensajes encontrados para ${config.email}.`
    );

    const messageIds = messages.map((message) => message.id);

    // Mensajes ya importados: se omiten antes de descargar adjuntos o llamar a
    // la IA (el cursor mantiene un solape de 60 s).
    const alreadyImported = messageIds.length
      ? await prisma.invoice.findMany({
          where: {
            emailAccountId: config.id,
            messageId: { in: messageIds },
          },
          select: { messageId: true },
        })
      : [];

    const importedMessageIds = new Set(
      alreadyImported
        .map((row) => row.messageId)
        .filter((id): id is string => Boolean(id))
    );

    if (importedMessageIds.size > 0) {
      console.log(
        `[fetchNewGraphEmails] ${importedMessageIds.size} mensaje(s) ya importados: omitidos.`
      );
    }

    let maxReceivedAt = config.lastEmailDate ? config.lastEmailDate.getTime() : 0;

    for (const { id: messageId, receivedAt } of messages) {
      if (remainingQuota <= 0) break;

      if (importedMessageIds.has(messageId)) {
        // Solo se avanza el cursor: nada de descargas ni IA.
        if (receivedAt > maxReceivedAt) {
          maxReceivedAt = receivedAt;
        }
        continue;
      }

      try {
        const message = await getGraphMessage({ accessToken, messageId });
        if (!message) {
          errors.push(`No se pudo obtener el mensaje ${messageId}`);
          continue;
        }

        if (message.receivedAt > maxReceivedAt) {
          maxReceivedAt = message.receivedAt;
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
        if (msgError instanceof GraphApiError && msgError.isAuthError) {
          throw msgError;
        }
        const msg = msgError instanceof Error ? msgError.message : 'Error desconocido';
        errors.push(`Error leyendo mensaje ${messageId}: ${msg}`);
      }
    }

    await prisma.emailAccount.update({
      where: { id: config.id },
      data: {
        ...(maxReceivedAt > 0 ? { lastEmailDate: new Date(maxReceivedAt) } : {}),
        lastCheckedAt: new Date(),
      },
    });

    console.log(
      `[fetchNewGraphEmails] Completado para ${config.email}: ${processed} procesados, ${skipped} omitidos, ${errors.length} errores`
    );
    return { success: true, processed, skipped, errors };
  } catch (error: unknown) {
    if (error instanceof GraphApiError && error.isAuthError) {
      const justFlagged = await flagNeedsReconnect(config, error.message);
      return {
        success: false,
        processed,
        skipped,
        errors: [
          justFlagged
            ? `La cuenta ${config.email} necesita reconexión: ${error.message}`
            : error.message,
        ],
      };
    }

    const msg = error instanceof Error ? error.message : 'Error consultando Microsoft Graph';
    console.error(`[fetchNewGraphEmails] Error para ${config.email}:`, msg);
    return { success: false, processed, skipped, errors: [msg] };
  }
}
