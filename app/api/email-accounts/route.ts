import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/with-tenant';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const context = await getTenantContext();
  if (!context) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const accounts = await prisma.emailAccount.findMany({
    where: { organizationId: context.organization.id },
    select: {
      id: true,
      email: true,
      provider: true,
      isActive: true,
      lastCheckedAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ accounts });
}
