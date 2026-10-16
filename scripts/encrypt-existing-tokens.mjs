/**
 * Migración: cifra los tokens OAuth que quedaron en texto plano en la base de
 * datos antes de implementar el cifrado a nivel de aplicación.
 *
 * Es idempotente: los valores ya cifrados (prefijo `enc:v1:`) se omiten, así que
 * se puede ejecutar varias veces sin riesgo.
 *
 * Uso:
 *   npm run encrypt:tokens
 *
 * Requiere TOKEN_ENCRYPTION_KEY en el entorno (o en .env / .env.local).
 *
 * NOTA: la lógica de cifrado debe mantenerse idéntica a `lib/token-crypto.ts`.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'enc:v1:';
const IV_LENGTH = 12;

// --- Cargar variables de entorno (.env.local tiene prioridad sobre .env) ---
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

      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

function loadKey() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY no está configurada. Genera una con `npm run gen:encryption-key`.'
    );
  }
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY inválida: debe representar 32 bytes.');
  }
  return key;
}

function encrypt(value, key) {
  if (!value || value.startsWith(PREFIX)) return value;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decrypt(value, key) {
  if (!value || !value.startsWith(PREFIX)) return value;
  const [ivB64, tagB64, dataB64] = value.slice(PREFIX.length).split(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

async function main() {
  loadEnvFiles();
  const key = loadKey();
  const dryRun = process.argv.includes('--dry-run');

  // Autocomprobación del esquema de cifrado.
  const sample = encrypt('roundtrip-check', key);
  if (decrypt(sample, key) !== 'roundtrip-check') {
    throw new Error('La autocomprobación de cifrado/descifrado falló.');
  }

  if (dryRun) {
    console.log('🔎 Modo --dry-run: no se escribirá nada en la base de datos.');
  }

  const prisma = new PrismaClient();
  let orgsUpdated = 0;
  let accountsUpdated = 0;

  const organizations = await prisma.organization.findMany({
    select: { id: true, driveRefreshToken: true, onedriveRefreshToken: true },
  });

  for (const org of organizations) {
    const data = {};
    const drive = encrypt(org.driveRefreshToken, key);
    const onedrive = encrypt(org.onedriveRefreshToken, key);
    if (drive !== org.driveRefreshToken) data.driveRefreshToken = drive;
    if (onedrive !== org.onedriveRefreshToken) data.onedriveRefreshToken = onedrive;

    if (Object.keys(data).length > 0) {
      if (!dryRun) await prisma.organization.update({ where: { id: org.id }, data });
      orgsUpdated++;
    }
  }

  const accounts = await prisma.emailAccount.findMany({
    select: { id: true, oauthRefreshToken: true, oauthAccessToken: true },
  });

  for (const account of accounts) {
    const data = {};
    const refresh = encrypt(account.oauthRefreshToken, key);
    const access = encrypt(account.oauthAccessToken, key);
    if (refresh !== account.oauthRefreshToken) data.oauthRefreshToken = refresh;
    if (access !== account.oauthAccessToken) data.oauthAccessToken = access;

    if (Object.keys(data).length > 0) {
      if (!dryRun) await prisma.emailAccount.update({ where: { id: account.id }, data });
      accountsUpdated++;
    }
  }

  await prisma.$disconnect();

  console.log(`✅ ${dryRun ? 'Simulación' : 'Migración'} completa:`);
  console.log(`   - Organizaciones ${dryRun ? 'por actualizar' : 'actualizadas'}: ${orgsUpdated}/${organizations.length}`);
  console.log(`   - Cuentas de correo ${dryRun ? 'por actualizar' : 'actualizadas'}: ${accountsUpdated}/${accounts.length}`);
}

main().catch((error) => {
  console.error('❌ Error en la migración:', error);
  process.exit(1);
});
