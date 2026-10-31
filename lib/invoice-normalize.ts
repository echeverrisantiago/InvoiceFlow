import type { InvoiceData, InvoiceLineItem } from '@/types';

/**
 * Normaliza los ítems y totales de una factura para que todas las fuentes
 * (IA, XML, edición manual) produzcan la misma forma.
 *
 * Reglas:
 * - Si hay total pero falta cantidad o precio → cantidad 1, precio = total
 *   (saldos anteriores, cuotas, ajustes...).
 * - Si hay cantidad y precio → total = cantidad × precio.
 * - Si falta el subtotal → suma de los ítems.
 * - Si falta el IVA → total − subtotal (nunca negativo).
 */

const round2 = (value: number) => Math.round(value * 100) / 100;

function toNumber(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeInvoiceItem(
  item: Partial<InvoiceLineItem> | null | undefined
): InvoiceLineItem {
  const description = String(item?.description ?? '').trim();

  let quantity = toNumber(item?.quantity);
  let unitPrice = toNumber(item?.unitPrice);
  let total = toNumber(item?.total);

  if (total === null && quantity !== null && unitPrice !== null) {
    total = round2(quantity * unitPrice);
  }

  if (total !== null && (quantity === null || unitPrice === null)) {
    quantity = 1;
    unitPrice = total;
  }

  return { description, quantity, unitPrice, total };
}

export function normalizeInvoiceData<T extends Partial<InvoiceData>>(data: T): T {
  const items = Array.isArray(data.items)
    ? data.items.map((item) => normalizeInvoiceItem(item))
    : [];

  let subtotal = toNumber((data as Record<string, unknown>).subtotal);
  let iva = toNumber((data as Record<string, unknown>).iva);
  let total = toNumber((data as Record<string, unknown>).total);

  const hasItemTotals = items.some((item) => item.total !== null);
  const itemsTotal = round2(
    items.reduce((sum, item) => sum + (item.total ?? 0), 0)
  );

  if (subtotal === null && hasItemTotals) subtotal = itemsTotal;
  if (total === null && subtotal !== null) total = subtotal;
  if (iva === null && subtotal !== null && total !== null) {
    iva = round2(Math.max(0, total - subtotal));
  }

  return { ...data, items, subtotal, iva, total } as T;
}
