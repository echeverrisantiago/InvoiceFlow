import { prisma } from '@/lib/prisma';
import { nanoid } from 'nanoid';
import { refreshGmailAccessToken, refreshOutlookAccessToken } from '@/lib/email-oauth';
import { decryptToken, encryptToken } from '@/lib/token-crypto';
import { isXmlFileName, isZipFileName, looksLikeDianInvoiceXml } from '@/lib/file-types';
import { getGmailMessage } from '@/lib/gmail';
import { getGraphMessage } from '@/lib/graph';

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

export interface EmailAccountConfig {
  id: string;
  organizationId: string;
  email: string;
  provider: string;
  isActive: boolean;
  lastCheckedAt: Date | null;
  /** Fecha del último mensaje procesado (cursor de sincronización). */
  lastEmailDate: Date | null;
  createdAt: Date;
  oauthRefreshToken: string | null;
  oauthAccessToken: string | null;
  oauthTokenExpiry: Date | null;
  needsReconnect: boolean;
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
export async function flagNeedsReconnect(
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
    return {
      accessToken: decryptToken(config.oauthAccessToken),
      needsReconnect: false,
      justFlagged: false,
    };
  }

  const refreshToken = decryptToken(config.oauthRefreshToken);
  const result =
    config.provider === 'GMAIL'
      ? await refreshGmailAccessToken(refreshToken)
      : await refreshOutlookAccessToken(refreshToken);

  if (result.accessToken) {
    await prisma.emailAccount.update({
      where: { id: config.id },
      data: {
        oauthAccessToken: encryptToken(result.accessToken),
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

/**
 * Elige el adjunto a previsualizar: primero el que coincide con el nombre
 * guardado en la factura y, si no, el primer adjunto que parezca factura.
 */
export function pickInvoiceAttachment<T extends { contentType?: string; filename?: string; content?: Buffer }>(
  attachments: T[],
  attachmentFilename: string | null
): T | null {
  if (attachmentFilename) {
    const match = attachments.find((att) => att.filename === attachmentFilename);
    if (match) return match;
  }
  return attachments.find((att) => isInvoiceAttachment(att)) || null;
}

export interface InvoiceFileFromEmail {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

/**
 * Recupera el adjunto original desde el proveedor:
 * Gmail (Gmail API) u Outlook (Microsoft Graph).
 */
export async function getInvoiceFileFromEmail({
  emailAccountId,
  messageId,
  attachmentFilename,
}: {
  emailAccountId: string | null;
  /** Id del mensaje en la API del proveedor. */
  messageId: string | null;
  attachmentFilename: string | null;
}): Promise<InvoiceFileFromEmail | null> {
  if (!emailAccountId || !messageId) return null;

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
    lastEmailDate: emailAccount.lastEmailDate,
    createdAt: emailAccount.createdAt,
    oauthRefreshToken: emailAccount.oauthRefreshToken,
    oauthAccessToken: emailAccount.oauthAccessToken,
    oauthTokenExpiry: emailAccount.oauthTokenExpiry,
    needsReconnect: emailAccount.needsReconnect,
  };

  const tokenResult = await getAccessTokenForOAuth(config);
  if (!tokenResult.accessToken) return null;

  const accessToken = tokenResult.accessToken;

  const message =
    config.provider === 'GMAIL'
      ? await withTimeout(
          getGmailMessage({ accessToken, messageId }),
          60_000,
          `Gmail get ${messageId}`
        )
      : config.provider === 'OUTLOOK'
        ? await withTimeout(
            getGraphMessage({ accessToken, messageId }),
            60_000,
            `Graph get ${messageId}`
          )
        : null;

  if (!message) return null;

  const attachment = pickInvoiceAttachment(message.attachments, attachmentFilename);
  if (!attachment) return null;

  const fileName = attachment.filename || attachmentFilename || `invoice-${nanoid()}.pdf`;

  return {
    buffer: attachment.content,
    mimeType: attachment.contentType || inferMimeType(fileName),
    fileName,
  };
}
