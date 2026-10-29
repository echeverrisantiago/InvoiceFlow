const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

/**
 * Acceso de solo lectura al buzón de Outlook mediante Microsoft Graph
 * (scope delegado `Mail.Read`).
 *
 * Antes se usaba IMAP con `IMAP.AccessAsUser.All`, que concede lectura y
 * escritura del buzón completo.
 */

export class GraphApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'GraphApiError';
    this.status = status;
    this.code = code;
  }

  /** Token inválido/caducado o sin permiso: hay que reconectar la cuenta. */
  get isAuthError(): boolean {
    return (
      this.status === 401 ||
      this.status === 403 ||
      this.code === 'InvalidAuthenticationToken' ||
      this.code === 'ErrorAccessDenied'
    );
  }
}

export interface GraphAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface GraphMessage {
  id: string;
  /** `receivedDateTime` en milisegundos epoch. */
  receivedAt: number;
  attachments: GraphAttachment[];
}

interface RawAttachment {
  id?: string;
  name?: string;
  contentType?: string;
  size?: number;
  contentBytes?: string;
  '@odata.type'?: string;
}

async function graphFetch(accessToken: string, path: string): Promise<Response> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    let code: string | undefined;
    let message = `Microsoft Graph respondió ${res.status}`;
    try {
      const body = await res.json();
      code = body?.error?.code;
      message = body?.error?.message || message;
    } catch {
      /* respuesta sin JSON */
    }
    throw new GraphApiError(message, res.status, code);
  }

  return res;
}

async function graphJson<T>(accessToken: string, path: string): Promise<T> {
  const res = await graphFetch(accessToken, path);
  return (await res.json()) as T;
}

/**
 * Query de mensajes de la bandeja de entrada con adjuntos, del más antiguo al
 * más nuevo (así el cursor avanza sin saltarse correos).
 */
export function buildMessagesQuery({
  after,
  limit = 50,
}: {
  after: Date;
  limit?: number;
}): string {
  const params = new URLSearchParams({
    $filter: `receivedDateTime ge ${after.toISOString()} and hasAttachments eq true`,
    $select: 'id,receivedDateTime',
    $orderby: 'receivedDateTime asc',
    $top: String(limit),
  });

  return `/me/mailFolders/inbox/messages?${params.toString()}`;
}

export interface GraphMessageRef {
  id: string;
  /** `receivedDateTime` en milisegundos epoch. */
  receivedAt: number;
}

/** Mensajes con adjuntos desde `after`, en orden ascendente. */
export async function listGraphMessages({
  accessToken,
  after,
  limit = 50,
}: {
  accessToken: string;
  after: Date;
  limit?: number;
}): Promise<GraphMessageRef[]> {
  const data = await graphJson<{
    value?: Array<{ id?: string; receivedDateTime?: string }>;
  }>(accessToken, buildMessagesQuery({ after, limit }));

  return (data.value || [])
    .filter(
      (message): message is { id: string; receivedDateTime?: string } =>
        Boolean(message.id)
    )
    .map((message) => ({
      id: message.id,
      receivedAt: message.receivedDateTime
        ? Date.parse(message.receivedDateTime)
        : 0,
    }));
}

async function fetchAttachmentBuffer(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<Buffer | null> {
  const base = `/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`;

  try {
    const attachment = await graphJson<RawAttachment>(accessToken, base);
    if (attachment?.contentBytes) {
      return Buffer.from(attachment.contentBytes, 'base64');
    }
  } catch (error) {
    if (error instanceof GraphApiError && error.isAuthError) throw error;
    // Algunos adjuntos grandes no traen contentBytes: se intenta con $value.
  }

  try {
    const res = await graphFetch(accessToken, `${base}/$value`);
    return Buffer.from(await res.arrayBuffer());
  } catch (error) {
    if (error instanceof GraphApiError && error.isAuthError) throw error;
    return null;
  }
}

function isFileAttachment(attachment: RawAttachment): boolean {
  return (
    attachment['@odata.type'] === '#microsoft.graph.fileAttachment' ||
    Boolean(attachment.contentBytes)
  );
}

/**
 * Descarga un mensaje con sus adjuntos ya decodificados.
 * Devuelve `null` si el mensaje ya no existe.
 */
export async function getGraphMessage({
  accessToken,
  messageId,
}: {
  accessToken: string;
  messageId: string;
}): Promise<GraphMessage | null> {
  const encodedId = encodeURIComponent(messageId);

  let message: { id?: string; receivedDateTime?: string } | null = null;
  try {
    message = await graphJson<{ id?: string; receivedDateTime?: string }>(
      accessToken,
      `/me/messages/${encodedId}?$select=id,receivedDateTime`
    );
  } catch (error) {
    if (error instanceof GraphApiError && error.status === 404) return null;
    throw error;
  }

  if (!message) return null;

  const list = await graphJson<{ value?: RawAttachment[] }>(
    accessToken,
    `/me/messages/${encodedId}/attachments?$select=id,name,contentType,size`
  );

  const attachments: GraphAttachment[] = [];

  for (const attachment of list.value || []) {
    if (!isFileAttachment(attachment)) continue;

    let content: Buffer | null = attachment.contentBytes
      ? Buffer.from(attachment.contentBytes, 'base64')
      : null;

    if (!content && attachment.id) {
      content = await fetchAttachmentBuffer(accessToken, messageId, attachment.id);
    }

    if (!content) continue;

    attachments.push({
      filename: attachment.name || '',
      contentType: attachment.contentType || '',
      content,
    });
  }

  return {
    id: message.id || messageId,
    receivedAt: message.receivedDateTime ? Date.parse(message.receivedDateTime) : 0,
    attachments,
  };
}

/** Verifica el acceso y devuelve la dirección del buzón. */
export async function getGraphProfileEmail(accessToken: string): Promise<string | null> {
  const data = await graphJson<{ mail?: string; userPrincipalName?: string }>(
    accessToken,
    '/me?$select=mail,userPrincipalName'
  );

  return data.mail || data.userPrincipalName || null;
}
