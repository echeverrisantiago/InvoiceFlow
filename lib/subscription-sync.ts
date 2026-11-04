import { prisma } from '@/lib/prisma';
import { getPreapproval } from '@/lib/mercadopago';
import { notifyPaymentFailed } from '@/lib/subscription-notifications';
import { BillingInterval, getIntervalMonths } from '@/types';

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function intervalFromFrequency(frequency?: number): BillingInterval {
  return frequency && frequency >= 12 ? 'YEARLY' : 'MONTHLY';
}

const STATUS_MAP: Record<string, 'ACTIVE' | 'CANCELED' | 'PAST_DUE'> = {
  authorized: 'ACTIVE',
  cancelled: 'CANCELED',
  paused: 'PAST_DUE',
};

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
  preapproval: {
    id?: string | null;
    status?: string | null;
    payer_id?: string | number | null;
    auto_recurring?: { frequency?: number } | null;
  };
  currentPeriodEnd: Date | null;
  wasPastDue: boolean;
}): Promise<{ status?: 'ACTIVE' | 'CANCELED' | 'PAST_DUE' }> {
  const mappedStatus = preapproval.status
    ? STATUS_MAP[preapproval.status]
    : undefined;

  const interval = intervalFromFrequency(preapproval.auto_recurring?.frequency);
  const now = new Date();
  const startsFailing = mappedStatus === 'PAST_DUE' && !wasPastDue;

  await prisma.subscription.update({
    where: { organizationId },
    data: {
      interval,
      mercadoPagoSubscriptionId: preapproval.id ?? undefined,
      mercadoPagoCustomerId: preapproval.payer_id
        ? String(preapproval.payer_id)
        : undefined,
      ...(mappedStatus ? { status: mappedStatus } : {}),
      ...(startsFailing ? { paymentFailedAt: now } : {}),
      ...(mappedStatus === 'ACTIVE'
        ? {
            currentPeriodStart: now,
            currentPeriodEnd: addMonths(now, getIntervalMonths(interval)),
            paymentFailedAt: null,
          }
        : {}),
    },
  });

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
 * Sirve para confirmar el pago sin esperar al webhook.
 */
export async function syncPreapproval(
  organizationId: string
): Promise<string | null> {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
  });

  if (!subscription) return null;
  if (!subscription.mercadoPagoSubscriptionId) return subscription.status;

  // Ya está activa: no volvemos a llamar a Mercado Pago (evita mover el
  // período de facturación con cada sondeo).
  if (subscription.status === 'ACTIVE') return subscription.status;

  const preapproval = await getPreapproval(
    subscription.mercadoPagoSubscriptionId
  );

  const { status } = await applyPreapproval({
    organizationId,
    preapproval,
    currentPeriodEnd: subscription.currentPeriodEnd,
    wasPastDue: subscription.status === 'PAST_DUE',
  });

  return status ?? subscription.status;
}
