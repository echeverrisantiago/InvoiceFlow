import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/with-tenant';

export async function GET() {
  const context = await getTenantContext();

  if (!context) {
    return NextResponse.json(
      { error: 'No autenticado' },
      { status: 401 }
    );
  }

  return NextResponse.json({
    organization: context.organization,
  });
}
