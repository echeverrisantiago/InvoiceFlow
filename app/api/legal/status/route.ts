import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/with-tenant';
import { getLatestAcceptance } from '@/lib/legal-acceptance';
import { PRIVACY_VERSION, TERMS_VERSION, isCurrentAcceptance } from '@/lib/legal';

export async function GET() {
  const context = await getTenantContext();

  if (!context) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const latest = await getLatestAcceptance(context.user.id);

  return NextResponse.json(
    {
      needsReacceptance: !isCurrentAcceptance(latest),
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      acceptedAt: latest?.acceptedAt ?? null,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
