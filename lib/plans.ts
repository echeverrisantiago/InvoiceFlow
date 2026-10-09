import { prisma } from '@/lib/prisma';
import { PlanDefinition, getPlanDefinition } from '@/types';

export interface InvoiceQuota {
  plan: PlanDefinition;
  limit: number;
  used: number;
  remaining: number;
  periodStart: Date;
  periodEnd: Date | null;
}

/**
 * Invoice usage is counted per calendar month (1st to last day) so that the
 * "X facturas por mes" limit applies equally to monthly and yearly plans.
 */
export function resolvePeriod(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Computes the invoice quota for an organization based on its current
 * subscription plan and the current calendar month.
 */
export async function getInvoiceQuota(
  organizationId: string
): Promise<InvoiceQuota> {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
  });

  const plan = getPlanDefinition(subscription?.plan);
  const { start, end } = resolvePeriod();

  const used = await prisma.invoice.count({
    where: {
      organizationId,
      createdAt: { gte: start, lte: end },
    },
  });

  return {
    plan,
    limit: plan.maxInvoicesPerMonth,
    used,
    remaining: Math.max(0, plan.maxInvoicesPerMonth - used),
    periodStart: start,
    periodEnd: end,
  };
}

export interface EmailAccountQuota {
  plan: PlanDefinition;
  limit: number;
  used: number;
  allowed: boolean;
}

/**
 * Checks whether the organization can connect another email account under
 * its current plan.
 */
export async function getEmailAccountQuota(
  organizationId: string
): Promise<EmailAccountQuota> {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
  });

  const plan = getPlanDefinition(subscription?.plan);
  const used = await prisma.emailAccount.count({ where: { organizationId } });

  return {
    plan,
    limit: plan.maxEmailAccounts,
    used,
    allowed: used < plan.maxEmailAccounts,
  };
}
