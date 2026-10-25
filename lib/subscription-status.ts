/**
 * Estado efectivo de una suscripción.
 *
 * Regla de dunning: cuando un cobro recurrente falla, la suscripción pasa a
 * `PAST_DUE` pero el cliente mantiene el acceso durante un periodo de gracia
 * que empieza al terminar el periodo ya pagado.
 */

export const PAYMENT_GRACE_DAYS = 5;

export interface SubscriptionLike {
  status: string | null | undefined;
  currentPeriodEnd: Date | string | null | undefined;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Fin del periodo de gracia tras un cobro fallido. */
export function graceEndsAt(
  currentPeriodEnd: Date | string | null | undefined
): Date | null {
  const end = toDate(currentPeriodEnd);
  if (!end) return null;

  const grace = new Date(end);
  grace.setDate(grace.getDate() + PAYMENT_GRACE_DAYS);
  return grace;
}

/**
 * `true` si la organización debe tener acceso:
 * - ACTIVE: siempre.
 * - TRIALING / CANCELED: hasta el final del periodo.
 * - PAST_DUE: hasta 5 días después del final del periodo (gracia).
 */
export function isSubscriptionActive(
  subscription: SubscriptionLike | null | undefined,
  now: Date = new Date()
): boolean {
  if (!subscription) return false;

  if (subscription.status === 'ACTIVE') return true;

  const periodEnd = toDate(subscription.currentPeriodEnd);

  if (
    subscription.status === 'TRIALING' ||
    subscription.status === 'CANCELED'
  ) {
    return !!periodEnd && periodEnd > now;
  }

  if (subscription.status === 'PAST_DUE') {
    const grace = graceEndsAt(periodEnd);
    return !!grace && grace > now;
  }

  return false;
}
