import { describe, it, expect } from 'vitest';
import {
  periodFromPreapproval,
  pendingChangeWasCharged,
} from '@/lib/subscription-sync';

describe('período desde la preapproval', () => {
  it('usa next_payment_date y resta los meses del período', () => {
    const period = periodFromPreapproval(
      { next_payment_date: '2026-12-16T17:31:37.000-04:00' },
      1
    );

    expect(period?.start.toISOString()).toBe('2026-11-16T21:31:37.000Z');
    expect(period?.end.toISOString()).toBe('2026-12-16T21:31:37.000Z');
  });

  it('usa last_charged_date si no hay próxima fecha', () => {
    const period = periodFromPreapproval(
      { summarized: { last_charged_date: '2026-11-16T17:31:38.000-04:00' } },
      1
    );

    expect(period?.start.toISOString()).toBe('2026-11-16T21:31:38.000Z');
    expect(period?.end.toISOString()).toBe('2026-12-16T21:31:38.000Z');
  });

  it('calcula un período anual', () => {
    const period = periodFromPreapproval(
      { next_payment_date: '2027-11-16T17:31:37.000-04:00' },
      12
    );

    expect(period?.start.toISOString()).toBe('2026-11-16T21:31:37.000Z');
    expect(period?.end.toISOString()).toBe('2027-11-16T21:31:37.000Z');
  });

  it('devuelve null sin fechas', () => {
    expect(periodFromPreapproval({}, 1)).toBeNull();
  });
});

describe('aplicación del cambio de plan pendiente', () => {
  const currentPeriodStart = new Date('2026-11-16T21:31:38.000Z');
  const pendingEffectiveAt = new Date('2026-12-16T21:31:37.000Z');

  it('no aplica si no hay cambio pendiente', () => {
    expect(
      pendingChangeWasCharged(
        { pendingPlan: null, pendingEffectiveAt, currentPeriodStart },
        { summarized: { last_charged_date: '2026-12-16T17:31:38.000-04:00' } },
        new Date('2026-12-17T00:00:00.000Z')
      )
    ).toBe(false);
  });

  it('no aplica con el cobro del período actual', () => {
    expect(
      pendingChangeWasCharged(
        { pendingPlan: 'PRO', pendingEffectiveAt, currentPeriodStart },
        { summarized: { last_charged_date: '2026-11-16T17:31:38.000-04:00' } },
        new Date('2026-11-20T00:00:00.000Z')
      )
    ).toBe(false);
  });

  it('no aplica antes de la fecha efectiva', () => {
    expect(
      pendingChangeWasCharged(
        { pendingPlan: 'PRO', pendingEffectiveAt, currentPeriodStart },
        { summarized: { last_charged_date: '2026-12-16T17:31:38.000-04:00' } },
        new Date('2026-12-10T00:00:00.000Z')
      )
    ).toBe(false);
  });

  it('aplica después del cobro del ciclo siguiente', () => {
    expect(
      pendingChangeWasCharged(
        { pendingPlan: 'PRO', pendingEffectiveAt, currentPeriodStart },
        { summarized: { last_charged_date: '2026-12-16T17:31:38.000-04:00' } },
        new Date('2026-12-17T00:00:00.000Z')
      )
    ).toBe(true);
  });

  it('no aplica si el cobro sigue pendiente', () => {
    expect(
      pendingChangeWasCharged(
        { pendingPlan: 'PRO', pendingEffectiveAt, currentPeriodStart },
        {
          summarized: {
            last_charged_date: '2026-12-16T17:31:38.000-04:00',
            pending_charge_quantity: 1,
          },
        },
        new Date('2026-12-17T00:00:00.000Z')
      )
    ).toBe(false);
  });
});
