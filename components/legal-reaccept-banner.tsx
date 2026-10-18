'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Aviso de re-aceptación legal: aparece cuando la versión vigente de los
 * Términos/Privacidad es más nueva que la aceptada por el usuario.
 */
export function LegalReacceptBanner() {
  const [needsReacceptance, setNeedsReacceptance] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const res = await fetch('/api/legal/status');
        if (!res.ok) return;
        const data = await res.json();
        if (active) setNeedsReacceptance(Boolean(data.needsReacceptance));
      } catch {
        /* silencioso */
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (!needsReacceptance) return null;

  const accept = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/legal/accept', { method: 'POST' });
      if (!res.ok) throw new Error('request failed');
      setNeedsReacceptance(false);
      toast.success('Gracias. Términos y Política actualizados.');
    } catch {
      toast.error('No se pudo registrar la aceptación. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200 sm:flex-row sm:items-center">
      <ShieldCheck className="h-4 w-4 shrink-0" />
      <div className="flex-1">
        <p className="font-medium">
          Actualizamos los Términos y la Política de Privacidad
        </p>
        <p className="text-xs">
          Necesitamos que los aceptes para seguir usando EntraFactura.{' '}
          <Link href="/terminos" target="_blank" className="font-medium underline">
            Términos
          </Link>{' '}
          ·{' '}
          <Link href="/privacidad" target="_blank" className="font-medium underline">
            Privacidad
          </Link>
        </p>
      </div>
      <button
        type="button"
        onClick={accept}
        disabled={loading}
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Aceptar
      </button>
    </div>
  );
}
