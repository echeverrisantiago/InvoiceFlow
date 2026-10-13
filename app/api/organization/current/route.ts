import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext, isAdmin } from '@/lib/with-tenant';
import { prisma } from '@/lib/prisma';
import { getInvoiceQuota } from '@/lib/plans';

export async function GET() {
  const context = await getTenantContext();

  if (!context) {
    return NextResponse.json(
      { error: 'No autenticado' },
      { status: 401 }
    );
  }

  const [invoiceCount, quota] = await Promise.all([
    prisma.invoice.count({
      where: { organizationId: context.organization.id },
    }),
    getInvoiceQuota(context.organization.id),
  ]);

  return NextResponse.json({
    organization: context.organization,
    subscription: context.subscription,
    invoiceCount,
    quota: {
      limit: quota.limit,
      used: quota.used,
      remaining: quota.remaining,
      planName: quota.plan.name,
      periodStart: quota.periodStart,
      periodEnd: quota.periodEnd,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const context = await getTenantContext();

  if (!context) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  if (!isAdmin(context)) {
    return NextResponse.json(
      { error: 'Se requieren permisos de administrador' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const rawNit = typeof body.nit === 'string' ? body.nit.trim() : '';
    // Keep digits, dots, dashes and spaces; store null when empty.
    const sanitized = rawNit.replace(/[^0-9.\-\s]/g, '').slice(0, 30).trim();
    const nit = sanitized.length > 0 ? sanitized : null;

    const organization = await prisma.organization.update({
      where: { id: context.organization.id },
      data: { nit },
      select: { id: true, name: true, nit: true },
    });

    return NextResponse.json({ success: true, organization });
  } catch (error: any) {
    console.error('Update organization NIT error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al guardar el NIT' },
      { status: 500 }
    );
  }
}
