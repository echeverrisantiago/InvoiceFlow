/**
 * Calcula el SHA-256 del texto de las páginas legales y (con --write) lo
 * actualiza en lib/legal.ts.
 *
 * Uso:
 *   node scripts/legal-hash.mjs            # solo muestra los hashes
 *   node scripts/legal-hash.mjs --write    # los escribe en lib/legal.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import crypto from 'node:crypto';

const TERMS_FILE = 'app/terminos/page.tsx';
const PRIVACY_FILE = 'app/privacidad/page.tsx';
const LEGAL_FILE = 'lib/legal.ts';

function sha256(file) {
  const content = readFileSync(resolve(process.cwd(), file));
  return crypto.createHash('sha256').update(content).digest('hex');
}

const termsHash = sha256(TERMS_FILE);
const privacyHash = sha256(PRIVACY_FILE);

console.log(`${TERMS_FILE}\n  ${termsHash}`);
console.log(`${PRIVACY_FILE}\n  ${privacyHash}`);

if (!process.argv.includes('--write')) {
  console.log('\n(usa --write para actualizar lib/legal.ts)');
  process.exit(0);
}

const legalPath = resolve(process.cwd(), LEGAL_FILE);
let legal = readFileSync(legalPath, 'utf8');

const before = legal;
legal = legal.replace(
  /export const TERMS_HASH =\s*\n?\s*'[^']*';/,
  `export const TERMS_HASH =\n  '${termsHash}';`
);
legal = legal.replace(
  /export const PRIVACY_HASH =\s*\n?\s*'[^']*';/,
  `export const PRIVACY_HASH =\n  '${privacyHash}';`
);

if (legal === before) {
  console.error('⚠️  No se pudo actualizar lib/legal.ts (revisa el formato de los constantes).');
  process.exit(1);
}

writeFileSync(legalPath, legal);
console.log('\n✅ Hashes escritos en lib/legal.ts');
