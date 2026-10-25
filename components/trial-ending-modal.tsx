'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { differenceInCalendarDays } from 'date-fns';
import { Sparkles } from 'lucide-react';
import { useOrganization } from '@/lib/organization-context';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'entrafactura:trial-ending-modal';
const DAYS_THRESHOLD = 5;

/**
 * Recordatorio de fin de prueba: se muestra como máximo una vez al día
 * durante los últimos 5 días del periodo de prueba.
 */
export function TrialEndingModal() {
  const { organization, subscription, loading } = useOrganization();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading || !subscription) return;
    // Solo el administrador puede elegir plan.
    if (organization?.role !== 'ADMIN') return;
    if (!subscription.isTrial || subscription.requiresRenewal) return;
    if (pathname.startsWith('/dashboard/settings/billing')) return;
    if (!subscription.currentPeriodEnd) return;

    const daysLeft = differenceInCalendarDays(
      new Date(subscription.currentPeriodEnd),
      new Date()
    );
    if (daysLeft < 0 || daysLeft > DAYS_THRESHOLD) return;

    const today = new Date().toISOString().slice(0, 10);
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === today) return;
      // Se marca al mostrarlo: no reaparece en cada navegación del día.
      window.localStorage.setItem(STORAGE_KEY, today);
    } catch {
      /* almacenamiento no disponible */
    }

    setOpen(true);
  }, [loading, subscription, pathname, organization?.role]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!open || !subscription?.currentPeriodEnd) return null;

  const daysLeft = Math.max(
    0,
    differenceInCalendarDays(new Date(subscription.currentPeriodEnd), new Date())
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="trial-ending-title"
        className="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>

        <h2
          id="trial-ending-title"
          className="text-xl font-semibold tracking-tight"
        >
          {daysLeft === 0
            ? 'Tu prueba gratis termina hoy'
            : daysLeft === 1
              ? 'Te queda 1 día de prueba gratis'
              : `Te quedan ${daysLeft} días de prueba gratis`}
        </h2>

        <p className="mt-2 text-sm text-muted-foreground">
          Elige tu plan para no quedarte sin acceso a tus facturas. No perderás
          nada de lo que ya has registrado.
        </p>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Ahora no
          </Button>
          <Button asChild onClick={() => setOpen(false)}>
            <Link href="/dashboard/settings/billing">Elegir mi plan</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
