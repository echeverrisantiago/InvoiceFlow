import { prisma } from '@/lib/prisma';
import { nanoid } from 'nanoid';
import {
  refreshGmailAccessToken,
  refreshOutlookAccessToken,
  type TokenRefreshResult,
} from '@/lib/email-oauth';
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
  config.needsReconnect = true;

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

const DEFINITIVE_AUTH_ERROR_PATTERN =
  /invalid_grant|invalid_client|unauthorized_client|AADSTS(?:65001|70000|50173|70008|50020)/i;

/**
 * Errores que no se arreglan reintentando: el refresh token fue revocado,
 * expiró o el cliente OAuth está mal configurado.
 */
function isDefinitiveAuthError(error: string | undefined): boolean {
  return DEFINITIVE_AUTH_ERROR_PATTERN.test(error || '');
}

async function refreshWithRetry(
  config: EmailAccountConfig,
  refreshToken: string
): Promise<TokenRefreshResult> {
  const doRefresh = () =>
    config.provider === 'GMAIL'
      ? refreshGmailAccessToken(refreshToken)
      : refreshOutlookAccessToken(refreshToken);

  let result = await doRefresh();

  // Microsoft a veces devuelve un error de autenticación transitorio
  // (`AuthenticationException`) sin que el refresh token esté revocado. Se
  // reintenta una vez antes de molestar al usuario con una reconexión.
  if (
    result.accessToken ||
    !result.isAuthError ||
    isDefinitiveAuthError(result.error)
  ) {
    return result;
  }

  console.warn(
    `[email] Refresh de ${config.email} falló con un error no definitivo; reintentando una vez.`
  );
  await new Promise((resolve) => setTimeout(resolve, 750));
  result = await doRefresh();
  return result;
}

async function persistRefreshedToken(
  config: EmailAccountConfig,
  result: TokenRefreshResult
): Promise<void> {
  if (!result.accessToken) return;

  const encryptedAccessToken = encryptToken(result.accessToken);
  const encryptedRefreshToken = result.refreshToken
    ? encryptToken(result.refreshToken)
    : undefined;

  await prisma.emailAccount.update({
    where: { id: config.id },
    data: {
      oauthAccessToken: encryptedAccessToken,
      oauthTokenExpiry: result.expiryDate,
      // Guardar el refresh token rotado es obligatorio con Microsoft: el
      // anterior deja de ser válido cuando se emite uno nuevo.
      ...(encryptedRefreshToken
        ? { oauthRefreshToken: encryptedRefreshToken }
        : {}),
      needsReconnect: false,
      lastError: null,
      lastErrorAt: null,
    },
  });

  config.oauthAccessToken = encryptedAccessToken;
  config.oauthTokenExpiry = result.expiryDate;
  if (encryptedRefreshToken) config.oauthRefreshToken = encryptedRefreshToken;
  config.needsReconnect = false;
}

/**
 * Fuerza un refresh del token, aunque la fecha de expiración almacenada diga
 * que todavía es válido. Se usa cuando Microsoft Graph responde 401: el token
 * puede haber sido revocado antes de su vencimiento nominal.
 */
export async function forceRefreshAccessToken(
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

  const refreshToken = decryptToken(config.oauthRefreshToken);
  const result = await refreshWithRetry(config, refreshToken);

  if (result.accessToken) {
    await persistRefreshedToken(config, result);
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

  return forceRefreshAccessToken(config);
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

/** Imágenes: facturas fotografiadas, pero también logos y banners. */
export function isImageAttachment(att: {
  contentType?: string;
  filename?: string;
}): boolean {
  const contentType = (att.contentType || '').toLowerCase();
  const filename = (att.filename || '').toLowerCase();

  if (/\.(png|jpe?g|webp|gif|bmp|heic|heif)$/.test(filename)) return true;
  return contentType.startsWith('image/') && !contentType.includes('tiff');
}

/** Documentos que por sí solos ya son una factura (XML/PDF/ZIP DIAN). */
export function isDocumentAttachment(att: {
  contentType?: string;
  filename?: string;
}): boolean {
  const contentType = (att.contentType || '').toLowerCase();
  const filename = (att.filename || '').toLowerCase();

  if (/\.(pdf|zip|xml)$/.test(filename)) return true;
  return (
    contentType.includes('pdf') ||
    contentType.includes('zip') ||
    contentType.includes('xml')
  );
}

/** Un logo o icono nunca es una factura legible. */
export const MIN_IMAGE_BYTES = 15 * 1024;

/**
 * Extractos y certificados bancarios: no son cuentas por pagar. Se descartan
 * antes de llamar a la IA (suelen venir además protegidos con contraseña).
 *
 * Ojo: no se filtra "estado de cuenta" porque Movistar/Claro usan ese nombre
 * para la factura del mes.
 */
const BANK_STATEMENT_PATTERN = /extracto|certificado bancario|loan_account/i;

export function isBankStatementAttachment(att: {
  filename?: string;
  contentType?: string;
}): boolean {
  return BANK_STATEMENT_PATTERN.test(att.filename || '');
}

/**
 * Decide qué adjuntos de un correo deben procesarse como factura.
 *
 * - Descarta extractos/certificados bancarios.
 * - Si el correo trae un documento (PDF/ZIP/XML), las imágenes son decoración
 *   (logos, banners): se ignoran.
 * - Si solo trae imágenes, se aceptan las que tengan tamaño suficiente.
 */
export function selectInvoiceAttachments<
  T extends { contentType?: string; filename?: string; content?: Buffer },
>(attachments: T[]): T[] {
  const hasDocument = attachments.some((att) => isDocumentAttachment(att));

  return attachments.filter((att) => {
    if (isBankStatementAttachment(att)) return false;
    if (!isInvoiceAttachment(att)) return false;

    if (isImageAttachment(att)) {
      if (hasDocument) return false;
      if ((att.content?.length ?? 0) < MIN_IMAGE_BYTES) return false;
    }

    return true;
  });
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
