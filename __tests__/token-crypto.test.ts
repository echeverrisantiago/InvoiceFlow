import { describe, it, expect, beforeAll, vi } from 'vitest';
import {
  encryptToken,
  decryptToken,
  isEncryptedToken,
  isTokenEncryptionConfigured,
} from '@/lib/token-crypto';

const KEY = Buffer.alloc(32, 7).toString('base64');

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = KEY;
});

describe('token-crypto', () => {
  it('cifra y descifra un token (round-trip)', () => {
    const encrypted = encryptToken('refresh-token-abc');
    expect(isEncryptedToken(encrypted)).toBe(true);
    expect(decryptToken(encrypted)).toBe('refresh-token-abc');
  });

  it('no deja el texto plano visible en el valor cifrado', () => {
    const encrypted = encryptToken('super-secret-token');
    expect(encrypted).not.toContain('super-secret-token');
  });

  it('no vuelve a cifrar un valor ya cifrado (idempotente)', () => {
    const encrypted = encryptToken('token-idempotente')!;
    expect(encryptToken(encrypted)).toBe(encrypted);
  });

  it('devuelve intactos los valores heredados sin cifrar', () => {
    expect(decryptToken('token-en-claro-legacy')).toBe('token-en-claro-legacy');
    expect(isEncryptedToken('token-en-claro-legacy')).toBe(false);
  });

  it('maneja valores nulos o vacíos', () => {
    expect(encryptToken(null)).toBeNull();
    expect(encryptToken(undefined)).toBeUndefined();
    expect(encryptToken('')).toBe('');
    expect(decryptToken(null)).toBeNull();
    expect(decryptToken(undefined)).toBeUndefined();
    expect(decryptToken('')).toBe('');
  });

  it('usa un IV aleatorio: dos cifrados del mismo valor difieren', () => {
    const a = encryptToken('mismo-valor')!;
    const b = encryptToken('mismo-valor')!;
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe('mismo-valor');
    expect(decryptToken(b)).toBe('mismo-valor');
  });

  it('detecta manipulación del texto cifrado', () => {
    const encrypted = encryptToken('token-integridad')!;
    const prefix = 'enc:v1:';
    const [iv, tag, data] = encrypted.slice(prefix.length).split(':');
    // Invierte un bit del ciphertext real (base64 sigue siendo válido).
    const bytes = Buffer.from(data, 'base64');
    bytes[0] ^= 0x01;
    const tampered = `${prefix}${iv}:${tag}:${bytes.toString('base64')}`;
    expect(() => decryptToken(tampered)).toThrow();
  });

  it('falla de forma explícita si no hay clave configurada', async () => {
    vi.resetModules();
    const original = process.env.TOKEN_ENCRYPTION_KEY;
    delete process.env.TOKEN_ENCRYPTION_KEY;

    const fresh = await import('@/lib/token-crypto');
    expect(fresh.isTokenEncryptionConfigured()).toBe(false);
    expect(() => fresh.encryptToken('x')).toThrow(/TOKEN_ENCRYPTION_KEY/);

    process.env.TOKEN_ENCRYPTION_KEY = original;
    vi.resetModules();
  });

  it('reporta que el cifrado está configurado cuando hay clave', () => {
    expect(isTokenEncryptionConfigured()).toBe(true);
  });
});
