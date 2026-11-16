import { prisma } from '@/lib/prisma';
import { getPreapproval } from '@/lib/mercadopago';
import { notifyPaymentFailed } from '@/lib/subscription-notifications';
import { BillingInterval, getIntervalMonths } from '@/types';

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function intervalFromFrequency(
  frequency?: number | null
): BillingInterval {
  return frequency && frequency >= 12 ? 'YEARLY' : 'MONTHLY';
}

const STATUS_MAP: Record<string, 'ACTIVE' | 'CANCELED' | 'PAST_DUE'> = {
  authorized: 'ACTIVE',
  cancelled: 'CANCELED',
  paused: 'PAST_DUE',
};

/** Campos de la preapproval que usamos para sincronizar el período. */
export interface PreapprovalDetails {
  id?: string | null;
  status?: string | null;
  payer_id?: string | number | null;
  auto_recurring?: { frequency?: number | null } | null;
  summarized?: {
    last_charged_date?: string | null;
    charged_quantity?: number | null;
    pending_charge_quantity?: number | null;
  } | null;
  next_payment_date?: string | null;
}

function toDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Calcula el período actual a partir de la próxima fecha de cobro.
 * Si Mercado Pago no la envía, usa la fecha del último cobro.
 */
export function periodFromPreapproval(
  preapproval: PreapprovalDetails,
  months: number
): { start: Date; end: Date } | null {
  const next = toDate(preapproval.next_payment_date);
  if (next) {
    const start = new Date(next);
    start.setMonth(start.getMonth() - months);
    return { start, end: next };
  }

  const last = toDate(preapproval.summarized?.last_charged_date);
  if (last) {
    return { start: last, end: addMonths(last, months) };
  }

  return null;
}

export function lastChargeDate(
  preapproval: PreapprovalDetails
): Date | null {
  return toDate(preapproval.summarized?.last_charged_date);
}

/**
 * `true` cuando ya se cobró el ciclo siguiente y corresponde aplicar el
 * cambio de plan pendiente. Evita aplicar el cambio con el cobro del ciclo
 * actual o con un cobro que todavía está pendiente/fallido.
 */
export function pendingChangeWasCharged(
  subscription: {
    pendingPlan: string | null;
    pendingEffectiveAt: Date | string | null;
    currentPeriodStart: Date | string;
  },
  preapproval: PreapprovalDetails,
  now: Date = new Date()
): boolean {
  if (!subscription.pendingPlan) return false;
  if (preapproval.summarized?.pending_charge_quantity) return false;

  const last = lastChargeDate(preapproval);
  if (!last) return false;

  const currentStart = toDate(subscription.currentPeriodStart);
  if (!currentStart) return false;

  // Un cobro posterior al inicio del período actual es un cobro nuevo.
  if (last.getTime() <= currentStart.getTime() + 60 * 60 * 1000) {
    return false;
  }

  const effectiveAt = toDate(subscription.pendingEffectiveAt);
  if (!effectiveAt) return true;

  // El cobro puede ejecutarse unas horas antes de la fecha programada.
  return now.getTime() >= effectiveAt.getTime() - 24 * 60 * 60 * 1000;
}

/**
 * Aplica el estado de una preapproval de Mercado Pago a la suscripción local.
 * Compartido por el webhook y por la confirmación al volver del checkout.
 */
export async function applyPreapproval({
  organizationId,
  preapproval,
  currentPeriodEnd,
  wasPastDue,
}: {
  organizationId: string;
  preapproval: PreapprovalDetails;
  currentPeriodEnd: Date | null;
  wasPastDue: boolean;
}): Promise<{ status?: 'ACTIVE' | 'CANCELED' | 'PAST_DUE' }> {
  const mappedStatus = preapproval.status
    ? STATUS_MAP[preapproval.status]
    : undefined;

  const current = await prisma.subscription.findUnique({
    where: { organizationId },
  });
  if (!current) return { status: mappedStatus };

  const preapprovalInterval = intervalFromFrequency(
    preapproval.auto_recurring?.frequency
  );
  // Si hay un cambio de periodicidad pendiente, el período actual sigue
  // rigiéndose por la periodicidad vieja hasta el próximo cobro.
  const interval = current.pendingInterval
    ? (current.interval as BillingInterval)
    : preapprovalInterval;

  const now = new Date();
  const startsFailing = mappedStatus === 'PAST_DUE' && !wasPastDue;
  const data: Record<string, unknown> = {};

  if (mappedStatus && current.status !== mappedStatus) {
    data.status = mappedStatus;
  }

  if (!current.pendingInterval && current.interval !== interval) {
    data.interval = interval;
  }

  if (
    preapproval.id &&
    current.mercadoPagoSubscriptionId !== preapproval.id
  ) {
    data.mercadoPagoSubscriptionId = preapproval.id;
  }

  if (
    preapproval.payer_id &&
    current.mercadoPagoCustomerId !== String(preapproval.payer_id)
  ) {
    data.mercadoPagoCustomerId = String(preapproval.payer_id);
  }

  if (mappedStatus === 'ACTIVE') {
    const months = getIntervalMonths(interval);
    const period = periodFromPreapproval(preapproval, months);

    if (period) {
      if (
        Math.abs(
          current.currentPeriodStart.getTime() - period.start.getTime()
        ) > 60_000
      ) {
        data.currentPeriodStart = period.start;
      }
      if (
        Math.abs(current.currentPeriodEnd.getTime() - period.end.getTime()) >
        60_000
      ) {
        data.currentPeriodEnd = period.end;
      }
    }

    if (current.paymentFailedAt) data.paymentFailedAt = null;
  }

  if (startsFailing) data.paymentFailedAt = now;

  if (Object.keys(data).length > 0) {
    await prisma.subscription.update({
      where: { organizationId },
      data: data as any,
    });
  }

  if (startsFailing) {
    await notifyPaymentFailed({
      organizationId,
      currentPeriodEnd: currentPeriodEnd ?? now,
      reason: `preapproval_${preapproval.status}`,
    });
  }

  return { status: mappedStatus };
}

/**
 * Consulta la preapproval actual en Mercado Pago y sincroniza la suscripción.
 * Sirve para confirmar el pago sin esperar al webhook y para corregir el
 * período cuando el webhook se perdió.
 */
export async function syncPreapproval(
  organizationId: string
): Promise<string | null> {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
  });

  if (!subscription) return null;
  if (!subscription.mercadoPagoSubscriptionId) return subscription.status;

  const preapproval = (await getPreapproval(
    subscription.mercadoPagoSubscriptionId
  )) as PreapprovalDetails;

  const now = new Date();

  if (
    subscription.pendingPlan &&
    pendingChangeWasCharged(subscription, preapproval, now)
  ) {
    const start = lastChargeDate(preapproval) ?? now;
    const interval = (subscription.pendingInterval ??
      subscription.interval) as BillingInterval;
    const months = getIntervalMonths(interval);

    await prisma.subscription.update({
      where: { organizationId },
      data: {
        plan: subscription.pendingPlan,
        interval,
        pendingPlan: null,
        pendingInterval: null,
        pendingEffectiveAt: null,
        status: 'ACTIVE',
        currentPeriodStart: start,
        currentPeriodEnd: addMonths(start, months),
        paymentFailedAt: null,
      },
    });

    return 'ACTIVE';
  }

  const { status } = await applyPreapproval({
    organizationId,
    preapproval,
    currentPeriodEnd: subscription.currentPeriodEnd,
    wasPastDue: subscription.status === 'PAST_DUE',
  });

  return status ?? subscription.status;
}
