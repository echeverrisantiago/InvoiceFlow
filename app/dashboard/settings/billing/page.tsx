'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PLAN_LIMITS } from '@/types';

declare global {
  interface Window {
    MercadoPago: any;
  }
}

export default function BillingPage() {
  const [loading, setLoading] = useState<string | null>(null);

  const handleSubscribe = async (plan: 'STARTER' | 'PRO') => {
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

  const plans = [
    {
      name: 'Starter',
      key: 'STARTER' as const,
      price: PLAN_LIMITS.STARTER.price,
      features: [
        `${PLAN_LIMITS.STARTER.maxInvoicesPerMonth} facturas por mes`,
        'Extracción con IA',
        'Backup en Google Drive',
        'Dashboard básico',
        'Alertas de vencimiento',
      ],
    },
    {
      name: 'Pro',
      key: 'PRO' as const,
      price: PLAN_LIMITS.PRO.price,
      recommended: true,
      features: [
        'Facturas ilimitadas',
        'Extracción con IA',
        'Backup en Google Drive',
        'Dashboard completo',
        'Alertas de vencimiento',
        'Análisis avanzados',
        'Soporte prioritario',
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Facturación</h1>
        <p className="text-muted-foreground">
          Elige el plan que mejor se adapte a tus necesidades
        </p>
      </div>

      {/* Plans Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {plans.map((plan) => (
          <Card
            key={plan.key}
            className={
              plan.recommended
                ? 'border-primary shadow-lg'
                : ''
            }
          >
            <CardHeader>
              {plan.recommended && (
                <div className="mb-2">
                  <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                    Recomendado
                  </span>
                </div>
              )}
              <CardTitle className="text-2xl">{plan.name}</CardTitle>
              <CardDescription>
                <span className="text-3xl font-bold text-foreground">
                  {new Intl.NumberFormat('es-CO', {
                    style: 'currency',
                    currency: 'COP',
                    minimumFractionDigits: 0,
                  }).format(plan.price)}
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
                onClick={() => handleSubscribe(plan.key)}
                disabled={loading !== null}
                className="w-full"
                variant={plan.recommended ? 'default' : 'outline'}
                size="lg"
              >
                {loading === plan.key ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  `Suscribirse a ${plan.name}`
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* FAQ */}
      <Card>
        <CardHeader>
          <CardTitle>Preguntas Frecuentes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold mb-1">¿Puedo cancelar en cualquier momento?</h4>
            <p className="text-sm text-muted-foreground">
              Sí, puedes cancelar tu suscripción en cualquier momento. No hay
              compromisos a largo plazo.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-1">¿Qué métodos de pago aceptan?</h4>
            <p className="text-sm text-muted-foreground">
              Aceptamos todos los métodos de pago disponibles en Mercado Pago:
              tarjetas de crédito, débito, PSE y efectivo.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-1">¿Puedo cambiar de plan?</h4>
            <p className="text-sm text-muted-foreground">
              Sí, puedes actualizar o bajar tu plan en cualquier momento. Los
              cambios se aplican en el próximo ciclo de facturación.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
