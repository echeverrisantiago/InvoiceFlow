'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PLAN_PRICE } from '@/types';

declare global {
  interface Window {
    MercadoPago: any;
  }
}

const features = [
  'Facturas ilimitadas',
  'Extracción de datos con IA',
  'Backup en Google Drive / OneDrive',
  'Conexión de correo (Gmail / Outlook)',
  'Alertas de vencimiento',
  'Dashboard completo y análisis',
  'Soporte',
];

export default function BillingPage() {
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);

    try {
      const response = await fetch('/api/subscriptions/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
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
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Facturación</h1>
        <p className="text-muted-foreground">
          Un solo plan con todas las funcionalidades de FactuMeIA
        </p>
      </div>

      {/* Single Plan Card */}
      <div className="max-w-md">
        <Card className="border-primary shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl">Plan Mensual</CardTitle>
            <CardDescription>
              <span className="text-3xl font-bold text-foreground">
                {new Intl.NumberFormat('es-CO', {
                  style: 'currency',
                  currency: 'COP',
                  minimumFractionDigits: 0,
                }).format(PLAN_PRICE)}
              </span>
              <span className="text-muted-foreground">/mes</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-3">
              {features.map((feature, index) => (
                <li key={index} className="flex items-start gap-3">
                  <Check className="h-5 w-5 shrink-0 text-primary" />
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>
            <Button
              onClick={handleSubscribe}
              disabled={loading}
              className="w-full"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Procesando...
                </>
              ) : (
                `Suscribirse por $69,000/mes`
              )}
            </Button>
          </CardContent>
        </Card>
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
        </CardContent>
      </Card>
    </div>
  );
}
