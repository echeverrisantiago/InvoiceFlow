import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
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
} from '@/lib/email-file';

const MAX_EMAILS_PER_RUN = 50;

export async function testImapConnection(config: {
  provider?: string;
  email?: string;
  accessToken?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    if (!config.accessToken) {
      return { success: false, error: 'No hay token de acceso disponible' };
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

export async function fetchNewEmails(
  config: EmailAccountConfig
): Promise<{ success: boolean; processed: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;

  const accessToken = await getAccessTokenForOAuth(config);
  if (!accessToken) {
    return { success: false, processed: 0, errors: ['No se pudo obtener token de acceso OAuth'] };
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
      const latestUid = client.mailbox ? (client.mailbox.uidNext - 1) : null;
      console.log(`[fetchNewEmails] lastEmailUid actual: ${config.lastEmailUid ?? 'null'}, último UID en INBOX: ${latestUid ?? 'null'}`);

      let searchOptions: Record<string, unknown> = { seen: false };

      if (config.lastEmailUid) {
        searchOptions = { uid: `${Number(config.lastEmailUid) + 1}:*` };
      }

      const searchResult = await withTimeout(client.search(searchOptions), 30_000, 'búsqueda IMAP');
      const messages = Array.isArray(searchResult) ? searchResult : [];
      console.log(`[fetchNewEmails] ${messages.length} mensajes encontrados. Procesando hasta ${MAX_EMAILS_PER_RUN}...`);

      const limitedMessages = messages.slice(-MAX_EMAILS_PER_RUN);
      let maxUid = config.lastEmailUid ? Number(config.lastEmailUid) : 0;
      let msgIndex = 0;

      for (const uid of limitedMessages) {
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
            const emailDate = new Date(parsed.date).toISOString().slice(0, 10);
            const accountDate = config.createdAt.toISOString().slice(0, 10);
            const isLastEmail = msgIndex === limitedMessages.length - 1;
            if (isLastEmail) {
              console.log(
                `[DEBUG] Ultimo correo - emailDate: "${emailDate}", ` +
                `accountDate: "${accountDate}", raw: "${parsed.date}", ` +
                `filtrado: ${emailDate < accountDate}`
              );
            }
            if (emailDate < accountDate) {
              continue;
            }
          }

          const attachments = parsed.attachments || [];

          const invoiceAttachments = attachments.filter((att: any) =>
            isInvoiceAttachment(att)
          );

          for (const attachment of invoiceAttachments) {
            try {
              const fileName = attachment.filename || `invoice-${nanoid()}.pdf`;
              const buffer = attachment.content;
              const mimeType =
                attachment.contentType ||
                (fileName.endsWith('.pdf')
                  ? 'application/pdf'
                  : fileName.endsWith('.png')
                    ? 'image/png'
                    : 'image/jpeg');

              const invoiceId = nanoid();
              const invoice = await prisma.invoice.create({
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
                  messageUid: message.uid != null ? BigInt(message.uid) : null,
                  attachmentFilename: fileName,
                },
              });

              const { extractInvoiceData } = await import('@/lib/ia');
              const extraction = await withTimeout(
                extractInvoiceData(buffer, mimeType),
                120_000,
                'extractInvoiceData'
              );

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
                      new Date(extraction.data.dueDate) <
                      new Date(new Date().setHours(0, 0, 0, 0))
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

                if (config.provider === 'GMAIL' && org?.driveRefreshToken) {
                  await backupToDrive({ buffer, mimeType, fileName, refreshToken: org.driveRefreshToken, invoiceId: invoice.id });
                } else if (config.provider === 'OUTLOOK' && org?.onedriveRefreshToken) {
                  await backupToOneDrive({ buffer, contentType: mimeType, fileName, refreshToken: org.onedriveRefreshToken, invoiceId: invoice.id });
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

              processed++;
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

      if (maxUid > 0 && processed > 0) {
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

    console.log(`[fetchNewEmails] Completado para ${config.email}: ${processed} procesados, ${errors.length} errores`);
    return { success: true, processed, errors };
  } catch (error: unknown) {
    await client.logout().catch(() => {});
    const msg = error instanceof Error ? error.message : 'Error en conexión IMAP';
    console.error(`[fetchNewEmails] Error en conexión IMAP para ${config.email}:`, msg);
    return {
      success: false,
      processed,
      errors: [msg],
    };
  }
}

async function backupToDrive({ buffer, mimeType, fileName, refreshToken, invoiceId }: { buffer: Buffer; mimeType: string; fileName: string; refreshToken: string; invoiceId: string }) {
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

async function backupToOneDrive({ buffer, contentType, fileName, refreshToken, invoiceId }: { buffer: Buffer; contentType: string; fileName: string; refreshToken: string; invoiceId: string }) {
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
