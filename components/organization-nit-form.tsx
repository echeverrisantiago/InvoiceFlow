'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function OrganizationNitForm({
  initialNit,
  isAdmin,
}: {
  initialNit: string | null;
  isAdmin: boolean;
}) {
  const [nit, setNit] = useState(initialNit ?? '');
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const handleSave = async () => {
    setSaving(true);

    try {
      const response = await fetch('/api/organization/current', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nit }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al guardar el NIT');
      }

      toast.success('NIT actualizado');
      router.refresh();
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar el NIT');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="space-y-2">
        <div>
          <p className="text-sm font-medium text-muted-foreground">NIT</p>
          <p className="text-lg font-semibold">{initialNit || 'No configurado'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="organization-nit">NIT de la empresa</Label>
        <Input
          id="organization-nit"
          value={nit}
          onChange={(event) => setNit(event.target.value)}
          placeholder="900123456-7"
          inputMode="numeric"
        />
        <p className="text-xs text-muted-foreground">
          Se usa para descartar las facturas electrónicas que tu empresa emite y
          quedarte solo con las que debes pagar. Si lo dejas vacío no se filtra
          ninguna factura.
        </p>
      </div>
      <Button onClick={handleSave} disabled={saving} size="sm">
        {saving ? 'Guardando...' : 'Guardar NIT'}
      </Button>
    </div>
  );
}
