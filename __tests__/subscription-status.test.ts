import { describe, it, expect } from 'vitest';
import {
  PAYMENT_GRACE_DAYS,
  graceEndsAt,
  isSubscriptionActive,
} from '@/lib/subscription-status';

const NOW = new Date('2026-10-25T12:00:00.000Z');

function daysFromNow(days: number): Date {
  const date = new Date(NOW);
  date.setDate(date.getDate() + days);
  return date;
}

describe('estado de la suscripción (dunning)', () => {
  it('ACTIVE siempre está activa', () => {
    expect(
      isSubscriptionActive({ status: 'ACTIVE', currentPeriodEnd: daysFromNow(-30) }, NOW)
    ).toBe(true);
  });

  it('TRIALING está activa hasta el final del trial', () => {
    expect(
      isSubscriptionActive({ status: 'TRIALING', currentPeriodEnd: daysFromNow(3) }, NOW)
    ).toBe(true);
    expect(
      isSubscriptionActive({ status: 'TRIALING', currentPeriodEnd: daysFromNow(-1) }, NOW)
    ).toBe(false);
  });

  it('CANCELED mantiene acceso hasta el final del periodo pagado', () => {
    expect(
      isSubscriptionActive({ status: 'CANCELED', currentPeriodEnd: daysFromNow(2) }, NOW)
    ).toBe(true);
    expect(
      isSubscriptionActive({ status: 'CANCELED', currentPeriodEnd: daysFromNow(-2) }, NOW)
    ).toBe(false);
  });

  it('PAST_DUE mantiene el acceso durante la gracia', () => {
    expect(
      isSubscriptionActive({ status: 'PAST_DUE', currentPeriodEnd: daysFromNow(-3) }, NOW)
    ).toBe(true);

    expect(
      isSubscriptionActive({ status: 'PAST_DUE', currentPeriodEnd: daysFromNow(-6) }, NOW)
    ).toBe(false);
  });

  it('sin suscripción o estado desconocido no hay acceso', () => {
    expect(isSubscriptionActive(null, NOW)).toBe(false);
    expect(
      isSubscriptionActive({ status: 'NONE', currentPeriodEnd: daysFromNow(10) }, NOW)
    ).toBe(false);
  });

  it('graceEndsAt suma los días de gracia', () => {
    const end = graceEndsAt(new Date('2026-10-01T00:00:00.000Z'));
    expect(end?.toISOString()).toBe('2026-10-06T00:00:00.000Z');
    expect(PAYMENT_GRACE_DAYS).toBe(5);
    expect(graceEndsAt(null)).toBeNull();
  });
});
