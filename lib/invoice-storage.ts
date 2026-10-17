/**
 * Helpers para resolver la ruta (path) de un objeto dentro del bucket
 * `invoices` de Supabase Storage.
 *
 * Las subidas manuales guardan el path directamente en `invoice.filePath`.
 * Las filas antiguas guardaban la URL pública completa en `invoice.fileUrl`,
 * por lo que se puede derivar el path a partir de ella durante la migración.
 */

const PATH_MARKERS = [
  '/object/public/invoices/',
  '/object/sign/invoices/',
  '/object/invoices/',
];

export function getStoragePathFromUrl(
  fileUrl: string | null | undefined
): string | null {
  if (!fileUrl) return null;

  for (const marker of PATH_MARKERS) {
    const index = fileUrl.indexOf(marker);
    if (index === -1) continue;

    const path = fileUrl.slice(index + marker.length).split('?')[0];
    if (!path) return null;

    try {
      return decodeURIComponent(path);
    } catch {
      return path;
    }
  }

  return null;
}

/** Devuelve el path del objeto en Storage para una factura, si lo hay. */
export function resolveInvoiceStoragePath(invoice: {
  filePath?: string | null;
  fileUrl?: string | null;
}): string | null {
  if (invoice.filePath) return invoice.filePath;
  return getStoragePathFromUrl(invoice.fileUrl);
}
