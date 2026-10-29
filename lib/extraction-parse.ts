import type { InvoiceData } from '@/types';

/**
 * Interpreta la respuesta del modelo y decide si el documento es una factura.
 *
 * El modelo devuelve el mismo JSON de siempre más dos campos:
 *   - `isInvoice`: si el documento es una factura/comprobante.
 *   - `documentType`: FACTURA | EXTRACTO | PUBLICIDAD | ENCUESTA | OTRO.
 *
 * Así descartamos imágenes y documentos que no son facturas sin una llamada
 * adicional ni heurísticas de tamaño.
 */

export type ParsedExtraction =
  | { kind: 'invoice'; data: InvoiceData }
  | { kind: 'not-invoice'; documentType: string | null; raw: unknown }
  | { kind: 'incomplete'; data: InvoiceData }
  | { kind: 'invalid'; error: string; raw: unknown };

export function parseExtractionResponse(content: string): ParsedExtraction {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      kind: 'invalid',
      error: 'No se pudo extraer JSON de la respuesta',
      raw: content,
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return {
      kind: 'invalid',
      error: 'La respuesta de la IA no es un JSON válido',
      raw: jsonMatch[0],
    };
  }

  const documentType =
    typeof parsed.documentType === 'string' ? parsed.documentType : null;

  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const hasAnyData =
    Boolean(parsed.supplier) ||
    parsed.total !== null && parsed.total !== undefined ||
    Boolean(parsed.issueDate) ||
    items.length > 0;

  // El modelo dice explícitamente que no es una factura, o (si no incluyó el
  // campo) la respuesta viene completamente vacía.
  if (parsed.isInvoice === false) {
    return { kind: 'not-invoice', documentType, raw: parsed };
  }
  if (parsed.isInvoice === undefined && !hasAnyData) {
    return { kind: 'not-invoice', documentType, raw: parsed };
  }

  const data = parsed as InvoiceData;
  data.items = items;

  if (!data.supplier || !data.total) {
    return { kind: 'incomplete', data };
  }

  return { kind: 'invoice', data };
}
