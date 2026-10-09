'use client';

import Link from 'next/link';
import { differenceInCalendarDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarDays, Sparkles } from 'lucide-react';
import { useOrganization } from '@/lib/organization-context';
import { TRIAL_MAX_INVOICES } from '@/types';

export function TrialBanner() {
  const { subscription, invoiceCount, quota } = useOrganization();

  if (!subscription?.isTrial || subscription.requiresRenewal) {
    return null;
  }

  const end = subscription.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd)
    : null;
  const daysLeft = end ? differenceInCalendarDays(end, new Date()) : null;
  const urgent = daysLeft !== null && daysLeft <= 3;
  const limit = quota?.limit ?? TRIAL_MAX_INVOICES;
  const used = Math.min(quota?.used ?? invoiceCount, limit);
  const progress = Math.round((used / limit) * 100);

  return (
    <div
      className={`
        mb-6 rounded-lg border p-4
        ${urgent ? 'border-amber-300 bg-amber-50' : 'border-primary/20 bg-primary/5'}
      `}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <CalendarDays
            className={`h-5 w-5 shrink-0 ${urgent ? 'text-amber-600' : 'text-primary'}`}
          />
          <div>
            <p className="text-sm font-semibold">
              {daysLeft !== null && daysLeft > 0 ? (
                <>
                  Te quedan{' '}
                  <span className={urgent ? 'text-amber-700' : 'text-primary'}>
                    {daysLeft} {daysLeft === 1 ? 'día' : 'días'}
                  </span>{' '}
                  de tu prueba gratuita
                </>
              ) : (
                <>Tu prueba gratuita termina hoy</>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {end
                ? `Termina el ${format(end, "d 'de' MMMM 'de' yyyy", { locale: es })}`
                : 'Periodo de prueba activo'}
              {' · '}
              {used} de {limit} facturas usadas
            </p>
          </div>
        </div>

        <Link
          href="/dashboard/settings/billing"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Sparkles className="h-4 w-4" />
          Suscribirme
        </Link>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
