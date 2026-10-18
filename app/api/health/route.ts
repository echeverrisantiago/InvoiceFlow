import { NextResponse } from 'next/server';

// No depende de la base de datos: solo verifica que la app responde.
// Un fallo de DB debe detectarse aparte para no dar falsos negativos aquí.
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    { ok: true, ts: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
