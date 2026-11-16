'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Loader2, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { toast } from 'sonner';
import {
  BillingInterval,
  DEFAULT_INTERVAL,
  PLANS,
  PLAN_KEYS,
  PlanKey,
  getAnnualSavings,
  getPlanPrice,
} from '@/types';
import { useOrganization } from '@/lib/organization-context';

declare global {
  interface Window {
    MercadoPago: any;
  }
}

const formatCop = (value: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(value);

export default function BillingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<PlanKey | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [changingPlan, setChangingPlan] = useState<PlanKey | null>(null);
  const [clearingPending, setClearingPending] = useState(false);
  const [interval, setInterval] = useState<BillingInterval>(DEFAULT_INTERVAL);
  const [notice, setNotice] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<
    'idle' | 'processing' | 'success' | 'timeout' | 'error'
  >('idle');
  const [pollKey, setPollKey] = useState(0);
  const [confirmed, setConfirmed] = useState<{
    plan: string | null;
    currentPeriodEnd: string | null;
  } | null>(null);
  const { subscription, refetch } = useOrganization();

  const currentPlanKey =
    (subscription?.plan as PlanKey | undefined) ?? undefined;
  const currentInterval =
    (subscription?.interval as BillingInterval | undefined) ?? undefined;
  const pendingPlanKey =
    (subscription?.pendingPlan as PlanKey | null) ?? null;
  const pendingInterval =
    (subscription?.pendingInterval as BillingInterval | null) ?? null;
  const isYearly = interval === 'YEARLY';

  const status = subscription?.status;
  const isActiveSub = status === 'ACTIVE';
  const isTrialing = status === 'TRIALING' && Boolean(subscription?.isActive);
  const isCanceled = status === 'CANCELED' && Boolean(subscription?.isActive);
  const isPastDue = status === 'PAST_DUE' && Boolean(subscription?.isActive);
  const canChangePlan =
    isActiveSub && Boolean(subscription?.hasMercadoPagoSubscription);

  const currentPlanDef = currentPlanKey ? PLANS[currentPlanKey] : null;
  const currentPrice =
    currentPlanDef && currentInterval
      ? getPlanPrice(currentPlanDef, currentInterval)
      : null;
  const currentIntervalLabel =
    currentInterval === 'YEARLY' ? 'año' : 'mes';
  const pendingEffectiveAt =
    subscription?.pendingEffectiveAt ??
    subscription?.currentPeriodEnd ??
    null;
  const summaryDate = isPastDue
    ? subscription?.graceEndsAt ?? subscription?.currentPeriodEnd ?? null
    : subscription?.currentPeriodEnd ?? null;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNotice(params.get('notice'));
    if (subscription?.interval === 'YEARLY' || subscription?.interval === 'MONTHLY') {
      setInterval(subscription.interval);
    }
  }, [subscription?.interval]);

  // Al volver del checkout de Mercado Pago mostramos el estado del pago.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returning =
      params.get('checkout') === 'return' ||
      Boolean(params.get('preapproval_id'));

    if (!returning) return;

    const mpStatus = params.get('status');
    if (mpStatus === 'failure' || mpStatus === 'rejected') {
      setCheckout('error');
      return;
    }

    setCheckout('processing');
  }, []);

  // Al entrar a facturación sincronizamos una vez con Mercado Pago. Así se
  // corrige el período si el webhook se perdió o si el cobro fue manual.
  const subscriptionLoaded = subscription !== null;
  const syncedRef = useRef(false);

  useEffect(() => {
    if (!subscriptionLoaded || syncedRef.current) return;
    syncedRef.current = true;

    let cancelled = false;

    fetch('/api/subscriptions/status', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const next = data?.subscription;
        if (!next) return;

        const changed =
          next.status !== subscription?.status ||
          next.plan !== subscription?.plan ||
          next.interval !== subscription?.interval ||
          next.currentPeriodEnd !== subscription?.currentPeriodEnd ||
          next.pendingPlan !== subscription?.pendingPlan ||
          next.pendingInterval !== subscription?.pendingInterval ||
          next.pendingEffectiveAt !== subscription?.pendingEffectiveAt;

        if (changed) {
          refetch();
        }
      })
      .catch(() => {
        /* silencioso */
      });

    return () => {
      cancelled = true;
    };
  }, [subscriptionLoaded, subscription, refetch]);

  // Consulta el estado (sincronizando con Mercado Pago) hasta confirmar.
  useEffect(() => {
    if (checkout !== 'processing') return;

    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      attempts++;

      try {
        const res = await fetch('/api/subscriptions/status', {
          cache: 'no-store',
        });
        const data = await res.json();
        if (cancelled) return;

        if (data?.subscription?.status === 'ACTIVE') {
          setConfirmed({
            plan: data.subscription.plan ?? null,
            currentPeriodEnd: data.subscription.currentPeriodEnd ?? null,
          });
          await refetch();
          if (cancelled) return;

          setCheckout('success');
          window.history.replaceState({}, '', window.location.pathname);
          setTimeout(() => router.push('/dashboard/invoices'), 4000);
          return;
        }
      } catch {
        /* reintentar */
      }

      if (cancelled) return;

      if (attempts >= 30) {
        setCheckout('timeout');
        return;
      }

      timer = setTimeout(tick, 2000);
    };

    timer = setTimeout(tick, 800);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [checkout, pollKey, refetch, router]);

  const noticeConfig: Record<
    string,
    { message: string; type: 'warning' | 'error' | 'success' | 'info' }
  > = {
    subscription_required: {
      message:
        'Tu periodo de prueba ha terminado. Elige un plan para continuar usando EntraFactura.',
      type: 'warning',
    },
    trial_limit: {
      message:
        'Alcanzaste el límite de facturas de tu periodo de prueba. Elige un plan para continuar.',
      type: 'warning',
    },
    plan_limit: {
      message:
        'Alcanzaste el límite de facturas de tu plan para este período. Mejora tu plan para continuar.',
      type: 'warning',
    },
    success: {
      message: '¡Pago exitoso! Tu suscripción está activa.',
      type: 'success',
    },
    failure: {
      message: 'El pago no se completó. Intenta nuevamente.',
      type: 'error',
    },
    pending: {
      message: 'Tu pago está pendiente de confirmación.',
      type: 'info',
    },
    canceled: {
      message:
        'Suscripción cancelada. Conservarás el acceso hasta el final del período pagado.',
      type: 'info',
    },
  };

  const currentNotice = notice ? noticeConfig[notice] : null;

  const handleSubscribe = async (plan: PlanKey) => {
    setLoading(plan);

    try {
      const response = await fetch('/api/subscriptions/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan, interval }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al crear suscripción');
      }

      const { initPoint } = await response.json();

      // Redirect to Mercado Pago checkout
      window.location.href = initPoint;
    } catch (error: any) {
      toast.error(error.message || 'Error al procesar suscripción');
      setLoading(null);
    }
  };

  const handleCancel = async () => {
    if (
      !confirm(
        '¿Estás seguro de cancelar tu suscripción? Dejarás de renovar y conservarás el acceso hasta el final del período pagado.'
      )
    ) {
      return;
    }

    setCanceling(true);
    try {
      const response = await fetch('/api/subscriptions/cancel', {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al cancelar la suscripción');
      }

      toast.success('Suscripción cancelada');
      await refetch();
      setNotice('canceled');
    } catch (error: any) {
      toast.error(error.message || 'Error al cancelar la suscripción');
    } finally {
      setCanceling(false);
    }
  };

  const handleChangePlan = async (
    plan: PlanKey,
    nextInterval: BillingInterval
  ) => {
    const planName = PLANS[plan].name;
    const intervalLabel = nextInterval === 'YEARLY' ? 'anual' : 'mensual';
    const effectiveDate = subscription?.currentPeriodEnd
      ? new Date(subscription.currentPeriodEnd).toLocaleDateString('es-CO')
      : 'el próximo cobro';
    const samePlan = plan === currentPlanKey;

    const message = samePlan
      ? `¿Cambiar tu plan a la modalidad ${intervalLabel}? Se aplicará el ${effectiveDate}.`
      : `¿Cambiar al plan ${planName} (${intervalLabel})? Se aplicará el ${effectiveDate}. Conservas tu plan actual hasta esa fecha.`;

    if (!confirm(message)) return;

    setChangingPlan(plan);
    try {
      const response = await fetch('/api/subscriptions/change-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, interval: nextInterval }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al cambiar de plan');
      }

      toast.success(
        samePlan
          ? `Cambio a modalidad ${intervalLabel} programado`
          : `Cambio al plan ${planName} programado`
      );
      await refetch();
    } catch (error: any) {
      toast.error(error.message || 'Error al cambiar de plan');
    } finally {
      setChangingPlan(null);
    }
  };

  const handleCancelPending = async () => {
    if (!currentPlanKey || !currentInterval) return;
    if (!confirm('¿Cancelar el cambio de plan programado?')) return;

    setClearingPending(true);
    try {
      const response = await fetch('/api/subscriptions/change-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: currentPlanKey,
          interval: currentInterval,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al cancelar el cambio');
      }

      toast.success('Cambio de plan cancelado');
      await refetch();
    } catch (error: any) {
      toast.error(error.message || 'Error al cancelar el cambio');
    } finally {
      setClearingPending(false);
    }
  };

  if (checkout !== 'idle') {
    const confirmedPlanName =
      confirmed?.plan && PLANS[confirmed.plan as PlanKey]
        ? PLANS[confirmed.plan as PlanKey].name
        : null;

    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 px-8 py-10 text-center">
            {checkout === 'processing' && (
              <>
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <h2 className="text-xl font-semibold">Confirmando tu pago…</h2>
                <p className="text-sm text-muted-foreground">
                  Estamos verificando la suscripción con Mercado Pago. No
                  cierres esta ventana.
                </p>
              </>
            )}

            {checkout === 'success' && (
              <>
                <CheckCircle2 className="h-12 w-12 text-green-600" />
                <h2 className="text-xl font-semibold">
                  ¡Suscripción activada!
                </h2>
                <p className="text-sm text-muted-foreground">
                  {confirmedPlanName ? `Plan ${confirmedPlanName}` : 'Tu plan está activo'}
                  {confirmed?.currentPeriodEnd
                    ? ` · próximo cobro el ${new Date(
                        confirmed.currentPeriodEnd
                      ).toLocaleDateString('es-CO')}`
                    : ''}
                </p>
                <Button
                  className="mt-2 w-full"
                  onClick={() => router.push('/dashboard/invoices')}
                >
                  Ir a mis facturas
                </Button>
                <p className="text-xs text-muted-foreground">
                  Te llevaremos automáticamente en unos segundos…
                </p>
              </>
            )}

            {checkout === 'timeout' && (
              <>
                <AlertTriangle className="h-12 w-12 text-amber-500" />
                <h2 className="text-xl font-semibold">Seguimos confirmando</h2>
                <p className="text-sm text-muted-foreground">
                  Mercado Pago aún no confirma el pago. Suele tardar unos
                  segundos; puedes reintentar o seguir usando la app.
                </p>
                <div className="mt-2 flex w-full flex-col gap-2">
                  <Button
                    onClick={() => {
                      setCheckout('processing');
                      setPollKey((key) => key + 1);
                    }}
                  >
                    Reintentar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => router.push('/dashboard/invoices')}
                  >
                    Ir a mis facturas
                  </Button>
                </div>
              </>
            )}

            {checkout === 'error' && (
              <>
                <AlertTriangle className="h-12 w-12 text-red-600" />
                <h2 className="text-xl font-semibold">
                  El pago no se completó
                </h2>
                <p className="text-sm text-muted-foreground">
                  No se realizó ningún cobro. Puedes intentarlo de nuevo cuando
                  quieras.
                </p>
                <Button
                  className="mt-2 w-full"
                  onClick={() => {
                    window.history.replaceState(
                      {},
                      '',
                      window.location.pathname
                    );
                    setCheckout('idle');
                  }}
                >
                  Volver a los planes
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Facturación</h1>
        <p className="text-muted-foreground">
          {isActiveSub && currentPlanDef && currentPrice !== null
            ? `Tu plan ${currentPlanDef.name} · ${formatCop(
                currentPrice
              )}/${currentIntervalLabel}`
            : isTrialing
              ? 'Estás en período de prueba. Elige un plan para continuar.'
              : isCanceled
                ? 'Tu suscripción está cancelada; conservas el acceso hasta el final del período.'
                : isPastDue
                  ? 'No pudimos cobrar tu último pago. Actualiza tu método de pago.'
                  : 'Elige el plan y la periodicidad que mejor se adapten a tu operación'}
        </p>
      </div>

      {/* Notice banner */}
      {currentNotice && (
        <div
          className={`
            flex items-start gap-3 rounded-lg border p-4
            ${
              currentNotice.type === 'success'
                ? 'border-green-300 bg-green-50 text-green-800'
                : currentNotice.type === 'error'
                  ? 'border-red-300 bg-red-50 text-red-800'
                  : currentNotice.type === 'info'
                    ? 'border-blue-300 bg-blue-50 text-blue-800'
                    : 'border-amber-300 bg-amber-50 text-amber-800'
            }
          `}
        >
          {currentNotice.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : currentNotice.type === 'error' ? (
            <AlertTriangle className="h-5 w-5 shrink-0" />
          ) : (
            <Info className="h-5 w-5 shrink-0" />
          )}
          <p className="text-sm font-medium">{currentNotice.message}</p>
        </div>
      )}

      {/* Resumen de la suscripción */}
      {subscription &&
        (isActiveSub || isTrialing || isCanceled || isPastDue) && (
          <Card>
            <CardHeader>
              <CardTitle>Tu suscripción</CardTitle>
              <CardDescription>
                {isActiveSub
                  ? 'Activa'
                  : isTrialing
                    ? 'Período de prueba'
                    : isCanceled
                      ? 'Cancelada'
                      : 'Pago pendiente'}
                {currentPlanDef ? ` · Plan ${currentPlanDef.name}` : ''}
                {currentPrice !== null
                  ? ` · ${formatCop(currentPrice)}/${currentIntervalLabel}`
                  : ''}
                {summaryDate
                  ? ` · ${
                      isActiveSub
                        ? 'próximo cobro'
                        : isPastDue
                          ? 'gracia hasta'
                          : 'vigente hasta'
                    } ${new Date(summaryDate).toLocaleDateString('es-CO')}`
                  : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {pendingPlanKey && (
                <div className="flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 sm:flex-row sm:items-center sm:justify-between">
                  <p>
                    Cambio programado al plan{' '}
                    <strong>{PLANS[pendingPlanKey].name}</strong>
                    {pendingInterval
                      ? ` (${
                          pendingInterval === 'YEARLY' ? 'anual' : 'mensual'
                        })`
                      : ''}{' '}
                    para el{' '}
                    {pendingEffectiveAt
                      ? new Date(pendingEffectiveAt).toLocaleDateString('es-CO')
                      : 'próximo cobro'}
                    .
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelPending}
                    disabled={
                      clearingPending || loading !== null || canceling
                    }
                  >
                    {clearingPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Cancelando...
                      </>
                    ) : (
                      'Cancelar cambio'
                    )}
                  </Button>
                </div>
              )}

              {isActiveSub && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Al cancelar dejarás de renovar automáticamente y conservarás
                    el acceso hasta el final del período pagado.
                  </p>
                  <Button
                    variant="outline"
                    className="border-red-200 text-red-600 hover:bg-red-50"
                    onClick={handleCancel}
                    disabled={
                      canceling || loading !== null || changingPlan !== null
                    }
                  >
                    {canceling ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Cancelando...
                      </>
                    ) : (
                      'Cancelar suscripción'
                    )}
                  </Button>
                </div>
              )}

              {isCanceled && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Conservas el acceso hasta el final del período pagado. Para
                    volver a renovar, elige un plan.
                  </p>
                  {currentPlanKey && (
                    <Button
                      onClick={() => handleSubscribe(currentPlanKey)}
                      disabled={
                        loading !== null ||
                        canceling ||
                        changingPlan !== null
                      }
                    >
                      Reactivar
                    </Button>
                  )}
                </div>
              )}

              {isPastDue && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    No pudimos cobrar tu suscripción. Actualiza tu método de
                    pago para evitar la suspensión.
                  </p>
                  {currentPlanKey && (
                    <Button
                      onClick={() => handleSubscribe(currentPlanKey)}
                      disabled={
                        loading !== null ||
                        canceling ||
                        changingPlan !== null
                      }
                    >
                      Actualizar pago
                    </Button>
                  )}
                </div>
              )}

              {isTrialing && (
                <p className="text-sm text-muted-foreground">
                  Tu período de prueba termina el{' '}
                  {summaryDate
                    ? new Date(summaryDate).toLocaleDateString('es-CO')
                    : 'próximamente'}
                  . Elige un plan para continuar sin interrupciones.
                </p>
              )}
            </CardContent>
          </Card>
        )}

      {/* Interval toggle */}
      <div className="flex justify-center">
        <div className="inline-flex items-center rounded-lg border p-1">
          <button
            type="button"
            onClick={() => setInterval('MONTHLY')}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              !isYearly
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Mensual
          </button>
          <button
            type="button"
            onClick={() => setInterval('YEARLY')}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              isYearly
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Anual
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                isYearly
                  ? 'bg-primary-foreground/20 text-primary-foreground'
                  : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400'
              }`}
            >
              2 meses gratis
            </span>
          </button>
        </div>
      </div>

      {isActiveSub && (
        <p className="text-center text-xs text-muted-foreground">
          El selector aplica a los planes a los que te cambies. Tu plan actual
          mantiene su precio y periodicidad.
        </p>
      )}

      {/* Plans */}
      <div className="grid gap-6 md:grid-cols-3">
        {PLAN_KEYS.map((key) => {
          const plan = PLANS[key];
          const isCurrentPlan = currentPlanKey === key;
          const isCurrentSelection =
            isCurrentPlan && currentInterval === interval;
          const isPendingSelection =
            pendingPlanKey === key && pendingInterval === interval;
          const isFeatured = key === 'PRO';
          const price = getPlanPrice(plan, interval);
          const monthlyEquivalent = Math.round(price / 12);
          const savings = getAnnualSavings(plan);
          const intervalLabel = interval === 'YEARLY' ? 'año' : 'mes';
          const isSamePlanDifferentInterval =
            isCurrentPlan && !isCurrentSelection;

          const badge =
            isActiveSub && isCurrentPlan
              ? 'Plan actual'
              : isTrialing && isCurrentPlan
                ? 'Plan de prueba'
                : isCanceled && isCurrentPlan
                  ? 'Cancelada'
                  : isPastDue && isCurrentPlan
                    ? 'Pago pendiente'
                    : isPendingSelection
                      ? 'Cambio programado'
                      : null;

          const badgeTone =
            badge === 'Pago pendiente'
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-400'
              : badge === 'Cancelada'
                ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-400'
                : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400';

          return (
            <Card
              key={key}
              className={isFeatured ? 'border-primary shadow-lg' : ''}
            >
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  {badge && (
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badgeTone}`}
                    >
                      {badge}
                    </span>
                  )}
                </div>
                <CardDescription>
                  <span className="text-3xl font-bold text-foreground">
                    {formatCop(price)}
                  </span>
                  <span className="text-muted-foreground">
                    /{intervalLabel}
                  </span>
                  {interval === 'YEARLY' && (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Equivale a {formatCop(monthlyEquivalent)}/mes · ahorras{' '}
                      {formatCop(savings)}
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <Check className="h-5 w-5 shrink-0 text-primary" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                {isActiveSub ? (
                  isCurrentSelection ? (
                    <Button
                      disabled
                      className="w-full"
                      variant={isFeatured ? 'default' : 'outline'}
                      size="lg"
                    >
                      Plan actual
                    </Button>
                  ) : isPendingSelection ? (
                    <Button
                      disabled
                      className="w-full"
                      variant="outline"
                      size="lg"
                    >
                      Cambio programado
                    </Button>
                  ) : canChangePlan ? (
                    <Button
                      onClick={() => handleChangePlan(key, interval)}
                      disabled={
                        loading !== null ||
                        canceling ||
                        changingPlan !== null ||
                        clearingPending
                      }
                      className="w-full"
                      variant={isFeatured ? 'default' : 'outline'}
                      size="lg"
                    >
                      {changingPlan === key ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Programando...
                        </>
                      ) : isSamePlanDifferentInterval ? (
                        `Cambiar a ${
                          interval === 'YEARLY' ? 'anual' : 'mensual'
                        }`
                      ) : (
                        `Cambiar a ${plan.name}`
                      )}
                    </Button>
                  ) : (
                    <Button
                      disabled
                      className="w-full"
                      variant="outline"
                      size="lg"
                    >
                      Contactar soporte
                    </Button>
                  )
                ) : isTrialing ? (
                  <Button
                    onClick={() => handleSubscribe(key)}
                    disabled={
                      loading !== null ||
                      canceling ||
                      changingPlan !== null
                    }
                    className="w-full"
                    variant={isFeatured ? 'default' : 'outline'}
                    size="lg"
                  >
                    {loading === key ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Procesando...
                      </>
                    ) : (
                      'Elegir este plan'
                    )}
                  </Button>
                ) : isCanceled ? (
                  <Button
                    onClick={() => handleSubscribe(key)}
                    disabled={
                      loading !== null ||
                      canceling ||
                      changingPlan !== null
                    }
                    className="w-full"
                    variant={isFeatured ? 'default' : 'outline'}
                    size="lg"
                  >
                    {loading === key ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Procesando...
                      </>
                    ) : isCurrentPlan ? (
                      'Reactivar'
                    ) : (
                      'Elegir este plan'
                    )}
                  </Button>
                ) : isPastDue ? (
                  <Button
                    onClick={() => handleSubscribe(key)}
                    disabled={
                      loading !== null ||
                      canceling ||
                      changingPlan !== null
                    }
                    className="w-full"
                    variant={isFeatured ? 'default' : 'outline'}
                    size="lg"
                  >
                    {loading === key ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Procesando...
                      </>
                    ) : isCurrentPlan ? (
                      'Actualizar pago'
                    ) : (
                      'Elegir este plan'
                    )}
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleSubscribe(key)}
                    disabled={
                      loading !== null ||
                      canceling ||
                      changingPlan !== null
                    }
                    className="w-full"
                    variant={isFeatured ? 'default' : 'outline'}
                    size="lg"
                  >
                    {loading === key ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Procesando...
                      </>
                    ) : (
                      `Comenzar por ${formatCop(price)}/${intervalLabel}`
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* FAQ */}
      <Card>
        <CardHeader>
          <CardTitle>Preguntas Frecuentes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold mb-1">¿Cómo funciona el plan anual?</h4>
            <p className="text-sm text-muted-foreground">
              Pagas 10 meses y obtienes 12 (2 meses gratis). El cobro se realiza
              automáticamente una vez al año.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-1">¿Puedo cambiar de plan o periodicidad?</h4>
            <p className="text-sm text-muted-foreground">
              Sí. El cambio se programa para el próximo cobro: conservas tu plan
              actual hasta esa fecha y no hay cobros prorrateados. Si cambias de
              opinión antes de la renovación, puedes volver a tu plan actual para
              cancelar el cambio.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-1">¿Puedo cancelar en cualquier momento?</h4>
            <p className="text-sm text-muted-foreground">
              Sí. Al cancelar dejas de renovar automáticamente y conservas el
              acceso hasta el final del período ya pagado.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-1">¿Cómo se cuentan las facturas del plan?</h4>
            <p className="text-sm text-muted-foreground">
              El límite de facturas se cuenta por mes calendario y aplica tanto
              a facturas subidas manualmente como a las importadas desde tus
              correos.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-1">¿Qué métodos de pago aceptan?</h4>
            <p className="text-sm text-muted-foreground">
              Aceptamos los métodos de pago disponibles en Mercado Pago para
              suscripciones: tarjetas de crédito y débito.
            </p>
          </div>
        </CardContent>
      </Card>

      {loading !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Redirigiendo a Mercado Pago…</p>
            <p className="text-xs text-muted-foreground">
              No cierres esta ventana
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
