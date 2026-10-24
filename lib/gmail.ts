import { google, gmail_v1 } from 'googleapis';
import { extractAttachmentParts } from '@/lib/gmail-payload';

/**
 * Acceso de solo lectura a Gmail mediante la Gmail API
 * (scope `https://www.googleapis.com/auth/gmail.readonly`).
 *
 * Antes se usaba IMAP, pero Google solo autoriza IMAP con el scope completo
 * `https://mail.google.com/`, que además permite enviar y borrar correo.
 */

export { extractAttachmentParts };

export interface GmailAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface GmailMessage {
  id: string;
  /** `internalDate` del mensaje, en milisegundos epoch. */
  internalDate: number;
  attachments: GmailAttachment[];
}

export function getGmailApi(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.gmail({ version: 'v1', auth });
}

/**
 * Ids de mensajes con adjuntos, **del más antiguo al más nuevo** (máx. `limit`).
 *
 * `messages.list` devuelve del más nuevo al más antiguo, así que para tomar los
 * más antiguos (y no saltarse correos) hay que paginar toda la ventana.
 * `truncated` avisa de que había más mensajes de los que se pudieron paginar.
 *
 * `after` acota la búsqueda por `internalDate`; si se omite, se usan los
 * últimos 2 días (primer contacto con la cuenta).
 */
export async function listGmailMessageIds({
  accessToken,
  after,
  limit = 50,
}: {
  accessToken: string;
  after?: Date | null;
  limit?: number;
}): Promise<{ ids: string[]; truncated: boolean }> {
  const gmail = getGmailApi(accessToken);

  const dateFilter = after
    ? `after:${Math.floor(after.getTime() / 1000)}`
    : 'newer_than:2d';
  const q = `in:inbox has:attachment ${dateFilter}`;

  const PAGE_SIZE = 100;
  const MAX_PAGES = 10;

  const collected: string[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  do {
    const { data } = await gmail.users.messages.list({
      userId: 'me',
      q,
      maxResults: PAGE_SIZE,
      pageToken,
    });

    for (const message of data.messages || []) {
      if (message.id) collected.push(message.id);
    }

    pageToken = data.nextPageToken ?? undefined;
    pages++;
  } while (pageToken && pages < MAX_PAGES);

  return {
    ids: collected.slice(-limit).reverse(),
    truncated: Boolean(pageToken),
  };
}

/**
 * Descarga un mensaje con sus adjuntos ya decodificados.
 * Devuelve `null` si el mensaje ya no existe (borrado o movido).
 */
export async function getGmailMessage({
  accessToken,
  messageId,
}: {
  accessToken: string;
  messageId: string;
}): Promise<GmailMessage | null> {
  const gmail = getGmailApi(accessToken);

  let message: gmail_v1.Schema$Message | null = null;
  try {
    const { data } = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });
    message = data;
  } catch (error: unknown) {
    const status = (error as { code?: number; response?: { status?: number } })
      ?.response?.status;
    if (status === 404 || (error as { code?: number })?.code === 404) {
      return null;
    }
    throw error;
  }

  if (!message) return null;

  const attachments: GmailAttachment[] = [];

  for (const part of extractAttachmentParts(message.payload)) {
    let encoded = part.body?.data || null;

    if (part.body?.attachmentId) {
      const { data } = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: part.body.attachmentId,
      });
      encoded = data.data || null;
    }

    if (!encoded) continue;

    attachments.push({
      filename: part.filename || '',
      contentType: part.mimeType || '',
      content: Buffer.from(encoded, 'base64url'),
    });
  }

  return {
    id: messageId,
    internalDate: Number(message.internalDate ?? 0),
    attachments,
  };
}

/** Verifica el acceso a la cuenta y devuelve su dirección de correo. */
export async function getGmailProfileEmail(accessToken: string): Promise<string | null> {
  const gmail = getGmailApi(accessToken);
  const { data } = await gmail.users.getProfile({ userId: 'me' });
  return data.emailAddress ?? null;
}
