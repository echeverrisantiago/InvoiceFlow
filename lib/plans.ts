import { prisma } from '@/lib/prisma';
import { PlanDefinition, getPlanDefinition } from '@/types';

interface SubscriptionPeriod {
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
}

export interface InvoiceQuota {
  plan: PlanDefinition;
  limit: number;
  used: number;
  remaining: number;
  periodStart: Date;
  periodEnd: Date | null;
}

/**
 * Resolves the billing period used to count monthly invoice usage.
 * Falls back to the start of the current calendar month when there is no
 * subscription period available.
 */
export function resolvePeriod(subscription: SubscriptionPeriod | null): {
  start: Date;
  end: Date | null;
} {
  if (subscription?.currentPeriodStart) {
    return {
      start: subscription.currentPeriodStart,
      end: subscription.currentPeriodEnd ?? null,
    };
  }

  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return { start, end: null };
}

/**
 * Computes the invoice quota for an organization based on its current
 * subscription plan and billing period.
 */
export async function getInvoiceQuota(
  organizationId: string
): Promise<InvoiceQuota> {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
  });

  const plan = getPlanDefinition(subscription?.plan);
  const { start, end } = resolvePeriod(subscription);

  const used = await prisma.invoice.count({
    where: {
      organizationId,
      createdAt: { gte: start, ...(end ? { lte: end } : {}) },
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
