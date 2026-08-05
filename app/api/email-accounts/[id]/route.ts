import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext, requireAdmin } from '@/lib/with-tenant';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminError = await requireAdmin();
  if (adminError) return adminError;

  const context = await getTenantContext();
  const { id } = await params;

  const existing = await prisma.emailAccount.findUnique({
    where: { id, organizationId: context!.organization.id },
  });

  if (!existing) {
    return NextResponse.json(
      { error: 'Cuenta de email no encontrada' },
      { status: 404 }
    );
  }

  await prisma.emailAccount.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
