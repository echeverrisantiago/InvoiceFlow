import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { prisma } from '@/lib/prisma';
import { nanoid } from 'nanoid';
import { refreshGmailAccessToken, refreshOutlookAccessToken } from '@/lib/email-oauth';

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

export async function getAccessTokenForOAuth(config: EmailAccountConfig): Promise<string | null> {
  if (config.provider !== 'GMAIL' && config.provider !== 'OUTLOOK') return null;
  if (!config.oauthRefreshToken) return null;

  const now = new Date();
  if (config.oauthTokenExpiry && config.oauthAccessToken && config.oauthTokenExpiry > now) {
    return config.oauthAccessToken;
  }

  let newToken: { accessToken?: string | null; expiryDate: Date | null };
  if (config.provider === 'GMAIL') {
    newToken = await refreshGmailAccessToken(config.oauthRefreshToken);
  } else {
    newToken = await refreshOutlookAccessToken(config.oauthRefreshToken);
  }

  if (newToken.accessToken) {
    await prisma.emailAccount.update({
      where: { id: config.id },
      data: {
        oauthAccessToken: newToken.accessToken,
        oauthTokenExpiry: newToken.expiryDate,
      },
    });
    return newToken.accessToken;
  }

  return null;
}

export function isInvoiceAttachment(att: { contentType?: string; filename?: string }): boolean {
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
}

export function inferMimeType(fileName: string): string {
  if (fileName.toLowerCase().endsWith('.pdf')) return 'application/pdf';
  if (fileName.toLowerCase().endsWith('.png')) return 'image/png';
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
  };

  const accessToken = await getAccessTokenForOAuth(config);
  if (!accessToken) return null;

  const settings = getImapSettings(config.provider);
  const client = new ImapFlow({
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
