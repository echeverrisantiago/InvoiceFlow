import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import crypto from 'node:crypto';
import { PRIVACY_HASH, TERMS_HASH } from '@/lib/legal';

function sha256(relativePath: string): string {
  const content = readFileSync(resolve(process.cwd(), relativePath));
  return crypto.createHash('sha256').update(content).digest('hex');
}

// Si estos fallan: cambiaste el texto legal sin actualizar lib/legal.ts.
// Corrige con: npm run legal:hash
describe('versiones legales', () => {
  it('TERMS_HASH coincide con el texto de app/terminos/page.tsx', () => {
    expect(TERMS_HASH).toBe(sha256('app/terminos/page.tsx'));
  });

  it('PRIVACY_HASH coincide con el texto de app/privacidad/page.tsx', () => {
    expect(PRIVACY_HASH).toBe(sha256('app/privacidad/page.tsx'));
  });
});
