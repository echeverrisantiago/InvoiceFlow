'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCw } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Algo salió mal</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Ocurrió un error al cargar esta sección. Puedes intentarlo de nuevo.
        </p>
      </div>
      <Button onClick={reset}>
        <RotateCw className="mr-2 h-4 w-4" />
        Reintentar
      </Button>
    </div>
  );
}
