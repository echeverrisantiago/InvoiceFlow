// Pure, dependency-free helpers to detect invoice file kinds.
// Safe to import from both client components and server code.

export const ZIP_MIME_TYPES = [
  'application/zip',
  'application/x-zip-compressed',
  'application/x-zip',
  'multipart/x-zip',
  'application/octet-stream',
];

export const XML_MIME_TYPES = ['application/xml', 'text/xml'];

// MIME types accepted for manual upload (PDF/image + electronic invoice).
export const ACCEPTED_UPLOAD_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-zip',
  'multipart/x-zip',
  'application/xml',
  'text/xml',
];

function normalizeMime(mime?: string | null): string {
  return (mime || '').toLowerCase().split(';')[0].trim();
}

export function isZipFileName(name?: string | null): boolean {
  return !!name && name.toLowerCase().trim().endsWith('.zip');
}

export function isXmlFileName(name?: string | null): boolean {
  return !!name && name.toLowerCase().trim().endsWith('.xml');
}

export function isZipMime(mime?: string | null): boolean {
  const normalized = normalizeMime(mime);
  // application/octet-stream is only a zip when the filename says so.
  if (normalized === 'application/octet-stream') return false;
  return ZIP_MIME_TYPES.includes(normalized);
}

export function isXmlMime(mime?: string | null): boolean {
  return XML_MIME_TYPES.includes(normalizeMime(mime));
}

export function isZipFile(mime?: string | null, name?: string | null): boolean {
  return isZipMime(mime) || isZipFileName(name);
}

export function isXmlFile(mime?: string | null, name?: string | null): boolean {
  return isXmlMime(mime) || isXmlFileName(name);
}

export function isElectronicInvoiceFile(
  mime?: string | null,
  name?: string | null
): boolean {
  return isZipFile(mime, name) || isXmlFile(mime, name);
}

export function fileNameFromUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const withoutQuery = url.split(/[?#]/)[0];
  const lastSegment = withoutQuery.split('/').pop();
  if (!lastSegment) return undefined;
  try {
    return decodeURIComponent(lastSegment);
  } catch {
    return lastSegment;
  }
}

/**
 * Cheap check to decide whether an XML string looks like a Colombian DIAN
 * electronic invoice document (UBL Invoice / CreditNote / DebitNote or the
 * AttachedDocument container), without fully parsing it.
 */
export function looksLikeDianInvoiceXml(text?: string | null): boolean {
  if (!text) return false;
  const sample = text.slice(0, 4000);
  return /<([A-Za-z0-9_-]+:)?(Invoice|CreditNote|DebitNote|AttachedDocument)[\s/>]/i.test(
    sample
  );
}
