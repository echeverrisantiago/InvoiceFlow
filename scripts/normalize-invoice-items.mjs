/**
 * Normaliza los ítems de las facturas ya guardadas:
 * - Líneas con total pero sin cantidad/precio → cantidad 1 y precio = total.
 * - Líneas con cantidad y precio → total = cantidad × precio.
 * - Si falta el subtotal en la factura → suma de ítems.
 * - Si falta el IVA → total − subtotal.
 *
 * Es idempotente: se puede ejecutar varias veces.
 *
 * Uso:
 *   npm run normalize:items
 *   npm run normalize:items -- --dry-run
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const round2 = (value) => Math.round(value * 100) / 100;

function toNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeItem(item) {
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

function itemsEqual(a, b) {
  if (a.length !== b.length) return false;

  return a.every((item, index) => {
    const other = b[index] ?? {};
    return (
      (item.description ?? '') === (other.description ?? '') &&
      (item.quantity ?? null) === (other.quantity ?? null) &&
      (item.unitPrice ?? null) === (other.unitPrice ?? null) &&
      (item.total ?? null) === (other.total ?? null)
    );
  });
}

function loadEnvFiles() {
  for (const file of ['.env.local', '.env']) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;

    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const key = match[1];
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

async function main() {
  loadEnvFiles();
  const dryRun = process.argv.includes('--dry-run');
  const prisma = new PrismaClient();

  const invoices = await prisma.invoice.findMany({
    where: { invoiceItems: { not: null } },
    select: {
      id: true,
      supplier: true,
      invoiceItems: true,
      subtotal: true,
      iva: true,
      total: true,
    },
  });

  let updated = 0;

  for (const invoice of invoices) {
    if (!Array.isArray(invoice.invoiceItems) || invoice.invoiceItems.length === 0) {
      continue;
    }

    const items = invoice.invoiceItems.map(normalizeItem);
    const hasItemTotals = items.some((item) => item.total !== null);
    const itemsTotal = round2(
      items.reduce((sum, item) => sum + (item.total ?? 0), 0)
    );

    const data = {};

    if (!itemsEqual(items, invoice.invoiceItems)) {
      data.invoiceItems = items;
    }

    const subtotal =
      invoice.subtotal ?? (hasItemTotals ? itemsTotal : null);
    if (invoice.subtotal === null && subtotal !== null) {
      data.subtotal = subtotal;
    }

    const total = invoice.total ?? subtotal;
    if (
      invoice.iva === null &&
      subtotal !== null &&
      total !== null
    ) {
      data.iva = round2(Math.max(0, total - subtotal));
    }

    if (Object.keys(data).length === 0) continue;

    if (!dryRun) {
      await prisma.invoice.update({ where: { id: invoice.id }, data });
    }
    updated++;

    console.log(
      `  ${dryRun ? '~' : '✓'} ${invoice.id} | ${invoice.supplier ?? '(sin proveedor)'} | ítems: ${items.length}`
    );
  }

  await prisma.$disconnect();

  console.log(
    `\n${dryRun ? 'Simulación' : 'Backfill'} completado: ${updated} factura(s) ${dryRun ? 'por actualizar' : 'actualizada(s)'} de ${invoices.length}.`
  );
}

main().catch((error) => {
  console.error('❌ Error normalizando ítems:', error);
  process.exit(1);
});
