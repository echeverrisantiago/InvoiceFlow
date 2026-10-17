/**
 * Migración de datos: completa `invoice.filePath` para las facturas subidas
 * manualmente que aún guardan la URL pública de Storage en `fileUrl`.
 *
 * También reescribe `fileUrl` al endpoint interno `/api/invoices/<id>/file`,
 * dejando el mismo formato que usan las facturas importadas por correo.
 *
 * Es idempotente: las filas que ya tienen `filePath` se omiten.
 *
 * Uso:
 *   npm run migrate:file-paths            # aplica
 *   npm run migrate:file-paths -- --dry-run
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const PATH_MARKERS = [
  '/object/public/invoices/',
  '/object/sign/invoices/',
  '/object/invoices/',
];

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

function getStoragePathFromUrl(fileUrl) {
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

async function main() {
  loadEnvFiles();
  const dryRun = process.argv.includes('--dry-run');

  if (dryRun) {
    console.log('🔎 Modo --dry-run: no se escribirá nada en la base de datos.');
  }

  const prisma = new PrismaClient();
  let updated = 0;
  let skipped = 0;

  const invoices = await prisma.invoice.findMany({
    where: { source: 'MANUAL', filePath: null },
    select: { id: true, fileUrl: true },
  });

  for (const invoice of invoices) {
    const path = getStoragePathFromUrl(invoice.fileUrl);
    if (!path) {
      skipped++;
      continue;
    }

    if (!dryRun) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          filePath: path,
          fileUrl: `/api/invoices/${invoice.id}/file`,
        },
      });
    }
    updated++;
  }

  await prisma.$disconnect();

  console.log(`✅ ${dryRun ? 'Simulación' : 'Migración'} completa:`);
  console.log(`   - Facturas ${dryRun ? 'por actualizar' : 'actualizadas'}: ${updated}`);
  console.log(`   - Omitidas (sin path derivable): ${skipped}`);
  console.log(`   - Candidatas evaluadas: ${invoices.length}`);
}

main().catch((error) => {
  console.error('❌ Error en la migración:', error);
  process.exit(1);
});
