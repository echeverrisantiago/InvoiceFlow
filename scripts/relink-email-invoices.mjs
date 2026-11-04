/**
 * Reenlaza las facturas importadas por correo con su cuenta de email.
 *
 * 1. Rellena `emailAccountEmail` en las facturas que conservan la relación.
 * 2. Para las huérfanas (cuenta eliminada), busca el mensaje por `messageId`
 *    en las cuentas activas de la misma organización y reasigna la cuenta.
 *
 * Es idempotente.
 *
 * Uso:
 *   npm run relink:invoices
 *   npm run relink:invoices -- --dry-run
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

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

function decrypt(value, key) {
  if (!value || !value.startsWith('enc:v1:')) return value;
  const [iv, tag, data] = value.slice(7).split(':');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

async function gmailAccessToken(account, key) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: decrypt(account.oauthRefreshToken, key),
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  return data.access_token || null;
}

async function graphAccessToken(account, key) {
  const res = await fetch(
    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.OUTLOOK_CLIENT_ID,
        client_secret: process.env.OUTLOOK_CLIENT_SECRET,
        refresh_token: decrypt(account.oauthRefreshToken, key),
        grant_type: 'refresh_token',
        scope: 'offline_access https://graph.microsoft.com/Mail.Read',
      }),
    }
  );
  const data = await res.json();
  return data.access_token || null;
}

async function messageExists(provider, accessToken, messageId) {
  const url =
    provider === 'GMAIL'
      ? `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
          messageId
        )}?format=minimal`
      : `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(
          messageId
        )}?$select=id`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.ok;
}

async function main() {
  loadEnvFiles();
  const dryRun = process.argv.includes('--dry-run');
  const prisma = new PrismaClient();
  const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY, 'base64');

  const invoices = await prisma.invoice.findMany({
    where: { source: 'EMAIL' },
    select: {
      id: true,
      organizationId: true,
      emailAccountId: true,
      emailAccountEmail: true,
      messageId: true,
    },
  });

  const accounts = await prisma.emailAccount.findMany({
    select: {
      id: true,
      organizationId: true,
      email: true,
      provider: true,
      isActive: true,
      oauthRefreshToken: true,
    },
  });

  // 1) Rellenar el correo de origen en las que conservan cuenta.
  let filled = 0;
  for (const invoice of invoices) {
    if (!invoice.emailAccountId || invoice.emailAccountEmail) continue;

    const account = accounts.find((a) => a.id === invoice.emailAccountId);
    if (!account) continue;

    if (!dryRun) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { emailAccountEmail: account.email },
      });
    }
    filled++;
  }

  // 2) Reenlazar huérfanas por messageId.
  const orphans = invoices.filter((i) => !i.emailAccountId && i.messageId);
  const byMessage = new Map();
  for (const invoice of orphans) {
    if (!byMessage.has(invoice.messageId)) byMessage.set(invoice.messageId, []);
    byMessage.get(invoice.messageId).push(invoice);
  }

  console.log(
    `Facturas: ${invoices.length} | email rellenado: ${filled} | mensajes únicos por resolver: ${byMessage.size}`
  );

  const tokenCache = new Map();
  async function getToken(account) {
    if (tokenCache.has(account.id)) return tokenCache.get(account.id);

    let token = null;
    try {
      token =
        account.provider === 'GMAIL'
          ? await gmailAccessToken(account, key)
          : await graphAccessToken(account, key);
    } catch {
      token = null;
    }

    tokenCache.set(account.id, token);
    return token;
  }

  let relinked = 0;
  let unresolved = 0;

  for (const [messageId, list] of byMessage.entries()) {
    const organizationId = list[0].organizationId;
    const candidates = accounts.filter(
      (a) =>
        a.organizationId === organizationId &&
        a.isActive &&
        a.oauthRefreshToken
    );

    let found = null;
    for (const account of candidates) {
      const token = await getToken(account);
      if (!token) continue;

      try {
        if (await messageExists(account.provider, token, messageId)) {
          found = account;
          break;
        }
      } catch {
        /* seguir con la siguiente cuenta */
      }
    }

    const ids = list.map((i) => i.id);

    if (found) {
      if (!dryRun) {
        await prisma.invoice.updateMany({
          where: { id: { in: ids } },
          data: { emailAccountId: found.id, emailAccountEmail: found.email },
        });
      }
      relinked += ids.length;
      console.log(`  ${dryRun ? '~' : '✓'} ${ids.length} → ${found.email}`);
    } else {
      unresolved += ids.length;
      console.log(`  ? ${messageId}: sin cuenta activa (${ids.length})`);
    }
  }

  await prisma.$disconnect();

  console.log(
    `\n${dryRun ? 'Simulación' : 'Backfill'} completado: ${filled} email(s), ${relinked} factura(s) reenlazadas, ${unresolved} sin resolver.`
  );
}

main().catch((error) => {
  console.error('❌ Error reenlazando facturas:', error);
  process.exit(1);
});
