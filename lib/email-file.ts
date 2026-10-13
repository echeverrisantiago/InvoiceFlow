import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { prisma } from '@/lib/prisma';
import { nanoid } from 'nanoid';
import { refreshGmailAccessToken, refreshOutlookAccessToken } from '@/lib/email-oauth';
import { isXmlFileName, isZipFileName, looksLikeDianInvoiceXml } from '@/lib/file-types';

export const IMAP_CONNECT_TIMEOUT = 30_000;
export const IMAP_SOCKET_TIMEOUT = 60_000;
export const MAILBOX_LOCK_TIMEOUT = 30_000;

export interface EmailAccountConfig {
  id: string;
  organizationId: string;
  email: string;
  provider: string;
  isActive: boolean;
  lastCheckedAt: Date | null;
  lastEmailUid: bigint | null;
  createdAt: Date;
  oauthRefreshToken: string | null;
  oauthAccessToken: string | null;
  oauthTokenExpiry: Date | null;
  needsReconnect: boolean;
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
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

export function getImapSettings(provider: string): { host: string; port: number; tls: boolean } {
  if (provider === 'GMAIL') {
    return { host: 'imap.gmail.com', port: 993, tls: true };
  }
  if (provider === 'OUTLOOK') {
    return { host: 'outlook.office365.com', port: 993, tls: true };
  }
  return { host: '', port: 0, tls: false };
}

export interface AccessTokenResult {
  accessToken: string | null;
  needsReconnect: boolean;
  /** True only on the run where the account transitions to needsReconnect. */
  justFlagged: boolean;
  error?: string;
}

/**
 * Marks the account as needing reconnection and, the first time it happens,
 * notifies the organization admins by email.
 */
async function flagNeedsReconnect(
  config: EmailAccountConfig,
  error: string
): Promise<boolean> {
  const justFlagged = !config.needsReconnect;

  await prisma.emailAccount.update({
    where: { id: config.id },
    data: {
      needsReconnect: true,
      lastError: error,
      lastErrorAt: new Date(),
    },
  });

  if (justFlagged) {
    try {
      const { notifyEmailReconnect } = await import('@/lib/email-reconnect');
      await notifyEmailReconnect({
        accountId: config.id,
        organizationId: config.organizationId,
        email: config.email,
        provider: config.provider,
        error,
      });
    } catch (notifyError) {
      console.error('Error enviando aviso de reconexión:', notifyError);
    }
  }

  return justFlagged;
}

export async function getAccessTokenForOAuth(
  config: EmailAccountConfig
): Promise<AccessTokenResult> {
  if (config.provider !== 'GMAIL' && config.provider !== 'OUTLOOK') {
    return {
      accessToken: null,
      needsReconnect: false,
      justFlagged: false,
      error: 'Proveedor de correo no soportado',
    };
  }

  if (!config.oauthRefreshToken) {
    const error = 'No hay refresh token almacenado';
    const justFlagged = await flagNeedsReconnect(config, error);
    return { accessToken: null, needsReconnect: true, justFlagged, error };
  }

  const now = new Date();
  if (config.oauthTokenExpiry && config.oauthAccessToken && config.oauthTokenExpiry > now) {
    return { accessToken: config.oauthAccessToken, needsReconnect: false, justFlagged: false };
  }

  const result =
    config.provider === 'GMAIL'
      ? await refreshGmailAccessToken(config.oauthRefreshToken)
      : await refreshOutlookAccessToken(config.oauthRefreshToken);

  if (result.accessToken) {
    await prisma.emailAccount.update({
      where: { id: config.id },
      data: {
        oauthAccessToken: result.accessToken,
        oauthTokenExpiry: result.expiryDate,
        needsReconnect: false,
        lastError: null,
        lastErrorAt: null,
      },
    });
    return { accessToken: result.accessToken, needsReconnect: false, justFlagged: false };
  }

  if (result.isAuthError) {
    const error = result.error || 'Token revocado o caducado';
    const justFlagged = await flagNeedsReconnect(config, error);
    return { accessToken: null, needsReconnect: true, justFlagged, error };
  }

  // Transient (network) error: keep the previous state and do not alarm.
  return {
    accessToken: null,
    needsReconnect: config.needsReconnect,
    justFlagged: false,
    error: result.error,
  };
}

export function isInvoiceAttachment(att: {
  contentType?: string;
  filename?: string;
  content?: Buffer;
}): boolean {
  const contentType = (att.contentType || '').toLowerCase();
  const filename = (att.filename || '').toLowerCase();

  const isPdfOrImage =
    contentType.includes('pdf') ||
    contentType.includes('png') ||
    contentType.includes('jpeg') ||
    filename.endsWith('.pdf') ||
    filename.endsWith('.png') ||
    filename.endsWith('.jpg') ||
    filename.endsWith('.jpeg');
  if (isPdfOrImage) return true;

  // ZIP containers of electronic invoices.
  if (contentType.includes('zip') || isZipFileName(filename)) return true;

  // Standalone XML: only accept it when it looks like a DIAN invoice.
  const isXml = contentType.includes('xml') || isXmlFileName(filename);
  if (!isXml) return false;

  if (att.content) {
    return looksLikeDianInvoiceXml(att.content.toString('utf8'));
  }
  return true;
}

export function inferMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.zip')) return 'application/zip';
  if (lower.endsWith('.xml')) return 'application/xml';
  return 'image/jpeg';
}

export interface InvoiceFileFromEmail {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

export async function getInvoiceFileFromEmail({
  emailAccountId,
  messageUid,
  attachmentFilename,
}: {
  emailAccountId: string | null;
  messageUid: bigint | number | null;
  attachmentFilename: string | null;
}): Promise<InvoiceFileFromEmail | null> {
  if (!emailAccountId || !messageUid) return null;

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
  });
  if (!emailAccount || !emailAccount.isActive) return null;

  const config: EmailAccountConfig = {
    id: emailAccount.id,
    organizationId: emailAccount.organizationId,
    email: emailAccount.email,
    provider: emailAccount.provider,
    isActive: emailAccount.isActive,
    lastCheckedAt: emailAccount.lastCheckedAt,
    lastEmailUid: emailAccount.lastEmailUid,
    createdAt: emailAccount.createdAt,
    oauthRefreshToken: emailAccount.oauthRefreshToken,
    oauthAccessToken: emailAccount.oauthAccessToken,
    oauthTokenExpiry: emailAccount.oauthTokenExpiry,
    needsReconnect: emailAccount.needsReconnect,
  };

  const tokenResult = await getAccessTokenForOAuth(config);
  if (!tokenResult.accessToken) return null;

  const settings = getImapSettings(config.provider);
  const client = new ImapFlow({
    host: settings.host,
    port: settings.port,
    auth: {
      user: config.email,
      accessToken: tokenResult.accessToken,
    },
    secure: settings.tls,
    logger: false as const,
    connectionTimeout: IMAP_CONNECT_TIMEOUT,
    socketTimeout: IMAP_SOCKET_TIMEOUT,
  });

  try {
    await withTimeout(client.connect(), IMAP_CONNECT_TIMEOUT, 'conexión IMAP preview');
    const lock = await withTimeout(client.getMailboxLock('INBOX'), MAILBOX_LOCK_TIMEOUT, 'getMailboxLock INBOX');

    try {
      let fetchResult: Awaited<ReturnType<typeof client.fetchOne>>;
      try {
        fetchResult = await withTimeout(
          client.fetchOne(Number(messageUid), { source: true }, { uid: true }),
          60_000,
          `fetchOne UID ${messageUid}`
        );
      } catch (fetchError: unknown) {
        const status = (fetchError as { responseStatus?: string })?.responseStatus;
        const responseText = (fetchError as { responseText?: string })?.responseText;
        const executed = (fetchError as { executedCommand?: string })?.executedCommand;
        const enriched = new Error(
          `Error fetchOne UID ${messageUid}: ${fetchError instanceof Error ? fetchError.message : 'desconocido'}` +
            (status ? ` [${status}]` : '') +
            (responseText ? ` - "${responseText}"` : '') +
            (executed ? ` | cmd: ${executed}` : '')
        );
        throw enriched;
      }

      if (!fetchResult) return null;

      const parsed: any = await withTimeout(simpleParser(fetchResult.source as any), 30_000, 'simpleParser');
      const attachments = parsed.attachments || [];

      let attachment: any = null;
      if (attachmentFilename) {
        attachment =
          attachments.find((att: any) => att.filename === attachmentFilename) || null;
      }
      if (!attachment) {
        attachment = attachments.find((att: any) => isInvoiceAttachment(att)) || null;
      }
      if (!attachment) return null;

      const fileName = attachment.filename || attachmentFilename || `invoice-${nanoid()}.pdf`;
      const mimeType = attachment.contentType || inferMimeType(fileName);

      return {
        buffer: attachment.content,
        mimeType,
        fileName,
      };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}
