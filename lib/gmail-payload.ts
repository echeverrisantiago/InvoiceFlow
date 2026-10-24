import type { gmail_v1 } from 'googleapis';

/**
 * Recorre recursivamente el árbol MIME de un mensaje de Gmail y devuelve las
 * partes que corresponden a adjuntos (las que tienen `filename`).
 *
 * Módulo sin dependencias de runtime, para poder testearlo de forma aislada.
 */
export function extractAttachmentParts(
  payload?: gmail_v1.Schema$MessagePart | null
): gmail_v1.Schema$MessagePart[] {
  const parts: gmail_v1.Schema$MessagePart[] = [];

  const walk = (part?: gmail_v1.Schema$MessagePart | null) => {
    if (!part) return;

    if (part.filename && (part.body?.attachmentId || part.body?.data)) {
      parts.push(part);
    }

    for (const child of part.parts || []) {
      walk(child);
    }
  };

  walk(payload);
  return parts;
}
