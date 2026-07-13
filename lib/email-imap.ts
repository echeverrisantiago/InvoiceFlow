import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { nanoid } from 'nanoid';

const ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.IMAP_ENCRYPTION_KEY;

const MAX_EMAILS_PER_RUN = 50;
const IMAP_CONNECT_TIMEOUT = 30_000;
const IMAP_SOCKET_TIMEOUT = 60_000;
const MAILBOX_LOCK_TIMEOUT = 30_000;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timeout tras ${ms}ms: ${label}`));
    }, ms);
  });
  try {
    const result = await Promise.race([promise, timeout]);
    clearTimeout(timer!);
    return result;
  } catch (e) {
    clearTimeout(timer!);
    throw e;
  }
}

export interface EmailAccountConfig {
  id: string;
  organizationId: string;
  email: string;
  imapHost: string;
  imapPort: number;
  imapUsername: string;
  imapPassword: string;
  useTls: boolean;
  isActive: boolean;
  lastCheckedAt: Date | null;
  lastEmailUid: bigint | null;
  createdAt: Date;
}

export function encryptPassword(password: string): string {
  if (!ENCRYPTION_KEY) throw new Error('IMAP_ENCRYPTION_KEY no configurada');
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptPassword(encrypted: string): string {
  if (!ENCRYPTION_KEY) throw new Error('IMAP_ENCRYPTION_KEY no configurada');
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const parts = encrypted.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encryptedText = parts.slice(2).join(':');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export async function testImapConnection(config: {
  imapHost: string;
  imapPort: number;
  imapUsername: string;
  imapPassword: string;
  useTls: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const client = new ImapFlow({
      host: config.imapHost,
      port: config.imapPort,
      auth: {
        user: config.imapUsername,
        pass: config.imapPassword,
      },
      secure: config.useTls,
      logger: false,
      connectionTimeout: IMAP_CONNECT_TIMEOUT,
      socketTimeout: IMAP_SOCKET_TIMEOUT,
    });

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
  const password = decryptPassword(config.imapPassword);
  const errors: string[] = [];
  let processed = 0;

  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    auth: {
      user: config.imapUsername,
      pass: password,
    },
    secure: config.useTls,
    logger: false,
    connectionTimeout: IMAP_CONNECT_TIMEOUT,
    socketTimeout: IMAP_SOCKET_TIMEOUT,
  });

  try {
    console.log(`[fetchNewEmails] Conectando a ${config.imapHost}:${config.imapPort}...`);
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
            client.fetchOne(uid, { source: true, uid: true }),
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

          const invoiceAttachments = attachments.filter((att: any) => {
            const contentType = (att.contentType || '').toLowerCase();
            const filename = (att.filename || '').toLowerCase();
            return (
              contentType.includes('pdf') ||
              contentType.includes('png') ||
              contentType.includes('jpeg') ||
              filename.endsWith('.pdf') ||
              filename.endsWith('.png') ||
              filename.endsWith('.jpg') ||
              filename.endsWith('.jpeg')
            );
          });

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

              const supabase = await createClient();

              const fileExt = fileName.split('.').pop() || 'pdf';
              const storageFileName = `${nanoid()}.${fileExt}`;
              const filePath = `${config.organizationId}/${storageFileName}`;

              const { error: uploadError } = await supabase.storage
                .from('invoices')
                .upload(filePath, buffer, {
                  contentType: mimeType,
                  upsert: false,
                });

              if (uploadError) {
                errors.push(`Error subiendo ${fileName}: ${uploadError.message}`);
                continue;
              }

              const { data: urlData } = supabase.storage
                .from('invoices')
                .getPublicUrl(filePath);

              const invoice = await prisma.invoice.create({
                data: {
                  organizationId: config.organizationId,
                  fileName,
                  fileUrl: urlData.publicUrl,
                  fileSize: buffer.length,
                  source: 'EMAIL',
                  status: 'PROCESSING',
                  paymentStatus: 'PENDING',
                },
              });

              const { extractInvoiceData } = await import('@/lib/ia');
              const extraction = await withTimeout(
                extractInvoiceData(urlData.publicUrl),
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
                    invoiceItems: extraction.data.items,
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
                  select: { driveRefreshToken: true },
                });

                if (org?.driveRefreshToken) {
                  try {
                    const { uploadToDrive } = await import('@/lib/drive');
                    const driveFileId = await withTimeout(
                      uploadToDrive({
                        fileUrl: urlData.publicUrl,
                        fileName,
                        refreshToken: org.driveRefreshToken,
                      }),
                      60_000,
                      'uploadToDrive'
                    );

                    await prisma.invoice.update({
                      where: { id: invoice.id },
                      data: {
                        driveFileId,
                        status: 'BACKED_UP',
                      },
                    });
                  } catch (driveError) {
                    console.error('Drive upload error:', driveError);
                  }
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
