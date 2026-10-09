import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/with-tenant';
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
