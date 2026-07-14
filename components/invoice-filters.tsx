'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'PENDING', label: 'Pendiente' },
  { value: 'PAID', label: 'Pagado' },
  { value: 'OVERDUE', label: 'Vencido' },
  { value: 'PROCESSING', label: 'Procesando' },
  { value: 'EXTRACTED', label: 'Extraído' },
  { value: 'BACKED_UP', label: 'Guardado' },
  { value: 'FAILED', label: 'Error' },
] as const;

export function InvoiceFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const supplier = searchParams.get('supplier') ?? '';
  const dateFrom = searchParams.get('dateFrom') ?? '';
  const dateTo = searchParams.get('dateTo') ?? '';
  const amountMin = searchParams.get('amountMin') ?? '';
  const amountMax = searchParams.get('amountMax') ?? '';
  const status = searchParams.get('status') ?? '';

  function applyFilters(formData: FormData) {
    const params = new URLSearchParams();

    const supplierVal = formData.get('supplier') as string;
    const dateFromVal = formData.get('dateFrom') as string;
    const dateToVal = formData.get('dateTo') as string;
    const amountMinVal = formData.get('amountMin') as string;
    const amountMaxVal = formData.get('amountMax') as string;
    const statusVal = formData.get('status') as string;

    params.set('page', '1');
    if (supplierVal) params.set('supplier', supplierVal);
    if (dateFromVal) params.set('dateFrom', dateFromVal);
    if (dateToVal) params.set('dateTo', dateToVal);
    if (amountMinVal) params.set('amountMin', amountMinVal);
    if (amountMaxVal) params.set('amountMax', amountMaxVal);
    if (statusVal) params.set('status', statusVal);

    const qs = params.toString();
    router.push(qs ? `/dashboard/invoices?${qs}` : '/dashboard/invoices');
  }

  function clearFilters() {
    router.push('/dashboard/invoices');
  }

  const hasFilters = supplier || dateFrom || dateTo || amountMin || amountMax || status;

  return (
    <form action={applyFilters} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div>
          <label htmlFor="supplier" className="mb-1 block text-xs font-medium text-muted-foreground">
            Proveedor
          </label>
          <Input
            id="supplier"
            name="supplier"
            placeholder="Buscar proveedor..."
            defaultValue={supplier}
            className="h-9"
          />
        </div>

        <div>
          <label htmlFor="dateFrom" className="mb-1 block text-xs font-medium text-muted-foreground">
            Fecha desde
          </label>
          <Input
            id="dateFrom"
            name="dateFrom"
            type="date"
            defaultValue={dateFrom}
            className="h-9"
          />
        </div>

        <div>
          <label htmlFor="dateTo" className="mb-1 block text-xs font-medium text-muted-foreground">
            Fecha hasta
          </label>
          <Input
            id="dateTo"
            name="dateTo"
            type="date"
            defaultValue={dateTo}
            className="h-9"
          />
        </div>

        <div>
          <label htmlFor="amountMin" className="mb-1 block text-xs font-medium text-muted-foreground">
            Monto mín.
          </label>
          <Input
            id="amountMin"
            name="amountMin"
            type="number"
            placeholder="0"
            defaultValue={amountMin}
            className="h-9"
          />
        </div>

        <div>
          <label htmlFor="amountMax" className="mb-1 block text-xs font-medium text-muted-foreground">
            Monto máx.
          </label>
          <Input
            id="amountMax"
            name="amountMax"
            type="number"
            placeholder="0"
            defaultValue={amountMax}
            className="h-9"
          />
        </div>

        <div>
          <label htmlFor="status" className="mb-1 block text-xs font-medium text-muted-foreground">
            Estado
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm">
          <Search className="mr-2 h-4 w-4" />
          Aplicar Filtros
        </Button>
        {hasFilters && (
          <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
            <X className="mr-2 h-4 w-4" />
            Limpiar
          </Button>
        )}
      </div>
    </form>
  );
}
