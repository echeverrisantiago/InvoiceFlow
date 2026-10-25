'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertTriangle, CreditCard } from 'lucide-react';
import { useOrganization } from '@/lib/organization-context';

/**
 * Aviso cuando Mercado Pago rechazó el último cobro recurrente.
 * El acceso se mantiene durante el periodo de gracia.
 */
export function PaymentFailedBanner() {
  const { subscription } = useOrganization();

  if (!subscription?.isPastDue) return null;

  const grace = subscription.graceEndsAt
    ? new Date(subscription.graceEndsAt)
    : null;
  const graceExpired = grace ? grace.getTime() <= Date.now() : false;

  return (
    <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-900">
              No pudimos cobrar tu último pago
            </p>
            <p className="text-xs text-amber-800">
              {grace && !graceExpired
                ? `Tienes hasta el ${format(grace, "d 'de' MMMM", {
                    locale: es,
                  })} para actualizar tu método de pago y no perder el acceso.`
                : 'Tu periodo de gracia terminó. Actualiza tu método de pago para recuperar el acceso.'}
            </p>
          </div>
        </div>

        <Link
          href="/dashboard/settings/billing"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-700"
        >
          <CreditCard className="h-4 w-4" />
          Actualizar pago
        </Link>
      </div>
    </div>
  );
}
