/**
 * Pone el bucket `invoices` de Supabase Storage en PRIVADO.
 *
 * ⚠️ Ejecútalo SOLO después de desplegar el código que sirve los archivos con
 * URLs firmadas. Si lo ejecutas antes, las facturas manuales existentes dejarán
 * de verse hasta que el nuevo código esté en producción.
 *
 * Uso:
 *   npm run storage:private            # aplica
 *   npm run storage:private -- --dry-run
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;

  const bucket = buckets.find((b) => b.id === 'invoices');
  if (!bucket) {
    throw new Error('No se encontró el bucket "invoices" en el proyecto.');
  }

  console.log(`Bucket "invoices": public = ${bucket.public}`);

  if (!bucket.public) {
    console.log('Ya está privado. Nada que hacer.');
    return;
  }

  if (dryRun) {
    console.log('🔎 Modo --dry-run: se pondría el bucket en privado.');
    return;
  }

  const { error } = await supabase.storage.updateBucket('invoices', { public: false });
  if (error) throw error;

  console.log('✅ El bucket "invoices" ahora es privado.');
}

main().catch((error) => {
  console.error('❌ Error:', error?.message || error);
  process.exit(1);
});
