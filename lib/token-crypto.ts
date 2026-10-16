import crypto from 'crypto';

/**
 * Cifrado a nivel de aplicación para tokens OAuth (refresh/access tokens).
 *
 * Usa AES-256-GCM: autenticado (detecta manipulación) y con IV aleatorio por
 * cifrado. El resultado se guarda como texto con el formato:
 *
 *   enc:v1:<iv_base64>:<authTag_base64>:<ciphertext_base64>
 *
 * El prefijo permite distinguir valores cifrados de valores en claro
 * heredados, de modo que la migración puede ser gradual. La clave se toma de
 * `TOKEN_ENCRYPTION_KEY` (32 bytes en base64, o 64 caracteres hex).
 */

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'enc:v1:';
const IV_LENGTH = 12;

let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY no está configurada. Genera una con `npm run gen:encryption-key` y añádela a tus variables de entorno.'
    );
  }

  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');

  if (key.length !== 32) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY inválida: debe representar 32 bytes (base64 o 64 caracteres hex).'
    );
  }

  cachedKey = key;
  return key;
}

/** Indica si hay una clave de cifrado válida configurada. */
export function isTokenEncryptionConfigured(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}

/** Indica si un valor ya está cifrado con este esquema. */
export function isEncryptedToken(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/**
 * Cifra un token. Los valores vacíos/nulos se devuelven tal cual y los que ya
 * están cifrados no se vuelven a cifrar (idempotente).
 */
export function encryptToken<T extends string | null | undefined>(value: T): T {
  if (value == null || value === '') return value;
  if (isEncryptedToken(value)) return value;

  const key = loadKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}` as T;
}

/**
 * Descifra un token. Si el valor no está cifrado (formato heredado en claro)
 * se devuelve tal cual para permitir una migración gradual.
 */
export function decryptToken<T extends string | null | undefined>(value: T): T {
  if (value == null || value === '') return value;
  if (!isEncryptedToken(value)) return value;

  const key = loadKey();
  const parts = value.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Valor cifrado con formato inválido');
  }

  const [ivB64, authTagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);

  return decrypted.toString('utf8') as T;
}

/** Genera una clave nueva de 32 bytes en base64. */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('base64');
}
