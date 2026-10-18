import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/with-tenant';
import {
  getAcceptanceRequestMeta,
  recordTermsAcceptance,
} from '@/lib/legal-acceptance';

export async function POST(request: NextRequest) {
  const context = await getTenantContext();

  if (!context) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const meta = getAcceptanceRequestMeta(request);

  await recordTermsAcceptance({
    userId: context.user.id,
    source: 'REACCEPT',
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ success: true });
}
