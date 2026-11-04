import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext, requireAdmin } from '@/lib/with-tenant';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  request: NextRequest,
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

  // Por defecto solo se desactiva: conserva el vínculo con las facturas ya
  // importadas y permite reconectar sin perder la vista previa. El borrado
  // definitivo es explícito (?permanent=1).
  const permanent = request.nextUrl.searchParams.get('permanent') === '1';

  if (permanent) {
    await prisma.emailAccount.delete({ where: { id } });
  } else {
    await prisma.emailAccount.update({
      where: { id },
      data: {
        isActive: false,
        needsReconnect: false,
        lastError: null,
        lastErrorAt: null,
      },
    });
  }

  return NextResponse.json({ success: true, permanent });
}
