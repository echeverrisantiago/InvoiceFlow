'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Loader2, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { PLANS, PLAN_KEYS, PlanKey } from '@/types';
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
  const [loading, setLoading] = useState<PlanKey | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { subscription } = useOrganization();

  const currentPlan = subscription?.plan as PlanKey | undefined;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNotice(params.get('notice'));
  }, []);

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
        body: JSON.stringify({ plan }),
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Facturación</h1>
        <p className="text-muted-foreground">
          Elige el plan que mejor se adapte a tu operación
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

      {/* Plans */}
      <div className="grid gap-6 md:grid-cols-3">
        {PLAN_KEYS.map((key) => {
          const plan = PLANS[key];
          const isCurrent = currentPlan === key;
          const isFeatured = key === 'PRO';

          return (
            <Card
              key={key}
              className={isFeatured ? 'border-primary shadow-lg' : ''}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  {isCurrent && (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-400">
                      Plan actual
                    </span>
                  )}
                </div>
                <CardDescription>
                  <span className="text-3xl font-bold text-foreground">
                    {formatCop(plan.price)}
                  </span>
                  <span className="text-muted-foreground">/mes</span>
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
                <Button
                  onClick={() => handleSubscribe(key)}
                  disabled={loading !== null}
                  className="w-full"
                  variant={isFeatured ? 'default' : 'outline'}
                  size="lg"
                >
                  {loading === key ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Procesando...
                    </>
                  ) : isCurrent ? (
                    `Renovar por ${formatCop(plan.price)}/mes`
                  ) : (
                    `Suscribirse por ${formatCop(plan.price)}/mes`
                  )}
                </Button>
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
            <h4 className="font-semibold mb-1">¿Puedo cambiar de plan en cualquier momento?</h4>
            <p className="text-sm text-muted-foreground">
              Sí, puedes suscribirte a cualquiera de los planes en cualquier
              momento. El nuevo plan se activa al confirmar el pago.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-1">¿Puedo cancelar en cualquier momento?</h4>
            <p className="text-sm text-muted-foreground">
              Sí, puedes cancelar tu suscripción en cualquier momento. No hay
              compromisos a largo plazo.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-1">¿Cómo se cuentan las facturas del plan?</h4>
            <p className="text-sm text-muted-foreground">
              El límite de facturas se cuenta por período de facturación y se
              reinicia con cada pago mensual. Aplica tanto a facturas subidas
              manualmente como a las importadas desde tus correos.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-1">¿Qué métodos de pago aceptan?</h4>
            <p className="text-sm text-muted-foreground">
              Aceptamos todos los métodos de pago disponibles en Mercado Pago:
              tarjetas de crédito, débito, PSE y efectivo.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
