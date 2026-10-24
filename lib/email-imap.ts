import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { prisma } from '@/lib/prisma';
import { nanoid } from 'nanoid';
import {
  EmailAccountConfig,
  MAILBOX_LOCK_TIMEOUT,
  IMAP_CONNECT_TIMEOUT,
  IMAP_SOCKET_TIMEOUT,
  withTimeout,
  getImapSettings,
  getAccessTokenForOAuth,
  isInvoiceAttachment,
  inferMimeType,
} from '@/lib/email-file';
import { getInvoiceQuota } from '@/lib/plans';
import { getGmailProfileEmail } from '@/lib/gmail';
import { storeInvoiceFromAttachment } from '@/lib/email-processing';
import { fetchNewGmailEmails, type FetchEmailsResult } from '@/lib/email-gmail';

const MAX_EMAILS_PER_RUN = 50;

/**
 * Comprueba el acceso a la cuenta según el proveedor:
 * - Gmail: perfil de la Gmail API (solo lectura).
 * - Outlook: conexión IMAP.
 */
export async function testImapConnection(config: {
  provider?: string;
  email?: string;
  accessToken?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    if (!config.accessToken) {
      return { success: false, error: 'No hay token de acceso disponible' };
    }

    if (config.provider === 'GMAIL') {
      const email = await getGmailProfileEmail(config.accessToken);
      if (!email) {
        return { success: false, error: 'No se pudo leer el perfil de Gmail' };
      }
      return { success: true };
    }

    const settings = getImapSettings(config.provider || '');
    const imapConfig = {
      host: settings.host,
      port: settings.port,
      auth: {
        user: config.email || '',
        accessToken: config.accessToken,
      },
      secure: settings.tls,
      logger: false as const,
      connectionTimeout: IMAP_CONNECT_TIMEOUT,
      socketTimeout: IMAP_SOCKET_TIMEOUT,
    };

    const client = new ImapFlow(imapConfig);
    await withTimeout(client.connect(), IMAP_CONNECT_TIMEOUT, 'test conexión IMAP');
    await withTimeout(client.logout(), 10_000, 'test logout IMAP');

    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al conectar con IMAP';
    return { success: false, error: message };
  }
}

/**
 * Importa facturas nuevas de una cuenta de correo.
 * Gmail va por la Gmail API (solo lectura); Outlook, por IMAP.
 */
export async function fetchNewEmails(
  config: EmailAccountConfig
): Promise<FetchEmailsResult> {
  if (config.provider === 'GMAIL') {
    return fetchNewGmailEmails(config);
  }
  return fetchNewImapEmails(config);
}

async function fetchNewImapEmails(
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

  const settings = getImapSettings(config.provider);
  const imapConfig = {
    host: settings.host,
    port: settings.port,
    auth: {
      user: config.email,
      accessToken,
    },
    secure: settings.tls,
    logger: false as const,
    connectionTimeout: IMAP_CONNECT_TIMEOUT,
    socketTimeout: IMAP_SOCKET_TIMEOUT,
  };

  const client = new ImapFlow(imapConfig);

  try {
    console.log(`[fetchNewEmails] Conectando a ${imapConfig.host}:${imapConfig.port}...`);
    await withTimeout(client.connect(), IMAP_CONNECT_TIMEOUT, 'conexión IMAP');
    console.log(`[fetchNewEmails] Conectado. Abriendo INBOX...`);

    const lock = await withTimeout(client.getMailboxLock('INBOX'), MAILBOX_LOCK_TIMEOUT, 'getMailboxLock INBOX');

    try {
      console.log(`[fetchNewEmails] lastEmailUid actual: ${config.lastEmailUid ?? 'null'}`);

      let searchOptions: Record<string, unknown>;
      if (config.lastEmailUid) {
        searchOptions = { uid: `${Number(config.lastEmailUid) + 1}:*` };
      } else {
        // -1 día: evita excluir correos por el desfase UTC vs. hora local del buzón
        searchOptions = {
          since: new Date(config.createdAt.getTime() - 24 * 60 * 60 * 1000),
        };
      }

      const searchResult = await withTimeout(
        client.search(searchOptions, { uid: true }),
        30_000,
        'búsqueda IMAP'
      );
      const messages = Array.isArray(searchResult) ? searchResult : [];
      console.log(`[fetchNewEmails] ${messages.length} mensajes encontrados. Procesando hasta ${MAX_EMAILS_PER_RUN}...`);

      const limitedMessages = messages.slice(0, MAX_EMAILS_PER_RUN);
      let maxUid = config.lastEmailUid ? Number(config.lastEmailUid) : 0;
      let msgIndex = 0;

      for (const uid of limitedMessages) {
        if (remainingQuota <= 0) break;
        try {
          const fetchResult = await withTimeout(
            client.fetchOne(uid, { source: true }, { uid: true }),
            60_000,
            `fetchOne UID ${uid}`
          );

          if (!fetchResult) {
            errors.push(`No se pudo obtener mensaje UID ${uid}`);
            continue;
          }

          const message = fetchResult;

          if (message.uid > maxUid) {
            maxUid = message.uid;
          }

          const parsed: any = await withTimeout(simpleParser(message.source as any), 30_000, 'simpleParser');

          if (config.createdAt && parsed.date) {
            const emailDate = new Date(parsed.date);
            // -1 día: tolera el desfase UTC vs. hora local del buzón en la creación
            const cutoff = new Date(
              config.createdAt.getTime() - 24 * 60 * 60 * 1000
            );
            const isLastEmail = msgIndex === limitedMessages.length - 1;
            if (isLastEmail) {
              console.log(
                `[DEBUG] Ultimo correo - emailDate: "${emailDate.toISOString()}", ` +
                `cutoff: "${cutoff.toISOString()}", raw: "${parsed.date}", ` +
                `filtrado: ${emailDate < cutoff}`
              );
            }
            if (emailDate < cutoff) {
              continue;
            }
          }

          const attachments = parsed.attachments || [];

          const invoiceAttachments = attachments.filter((att: any) =>
            isInvoiceAttachment(att)
          );

          for (const attachment of invoiceAttachments) {
            if (remainingQuota <= 0) break;
            try {
              const fileName = attachment.filename || `invoice-${nanoid()}.pdf`;
              const buffer = attachment.content;
              const mimeType = attachment.contentType || inferMimeType(fileName);

              const outcome = await storeInvoiceFromAttachment({
                config,
                organizationNit,
                buffer,
                mimeType,
                fileName,
                messageUid: message.uid != null ? BigInt(message.uid) : null,
                messageId: null,
              });

              if (outcome === 'skipped') {
                skipped++;
              } else if (outcome === 'processed') {
                processed++;
                remainingQuota--;
              }
            } catch (attError: unknown) {
              const msg = attError instanceof Error ? attError.message : 'Error desconocido';
              errors.push(
                `Error procesando attachment ${attachment.filename || 'unknown'}: ${msg}`
              );
            }
          }
        } catch (msgError: unknown) {
          const msg = msgError instanceof Error ? msgError.message : 'Error desconocido';
          errors.push(`Error leyendo mensaje UID ${uid}: ${msg}`);
        } finally {
          msgIndex++;
        }
      }

      if (maxUid > 0) {
        await withTimeout(
          prisma.emailAccount.update({
            where: { id: config.id },
            data: {
              lastEmailUid: maxUid,
              lastCheckedAt: new Date(),
            },
          }),
          30_000,
          'update lastEmailUid'
        );
      } else {
        await withTimeout(
          prisma.emailAccount.update({
            where: { id: config.id },
            data: {
              lastCheckedAt: new Date(),
            },
          }),
          30_000,
          'update lastCheckedAt'
        );
      }
    } finally {
      lock.release();
    }

    await withTimeout(client.logout(), 10_000, 'logout IMAP');

    console.log(`[fetchNewEmails] Completado para ${config.email}: ${processed} procesados, ${skipped} omitidos, ${errors.length} errores`);
    return { success: true, processed, skipped, errors };
  } catch (error: unknown) {
    await client.logout().catch(() => {});
    const msg = error instanceof Error ? error.message : 'Error en conexión IMAP';
    console.error(`[fetchNewEmails] Error en conexión IMAP para ${config.email}:`, msg);
    return {
      success: false,
      processed,
      skipped,
      errors: [msg],
    };
  }
}
