'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { InvoiceLineItem } from '@/types';
import { formatCurrency, formatDate, toDateInputValue } from '@/lib/utils';

export type EditableInvoice = {
  id: string;
  fileName: string;
  fileUrl: string;
  createdAt: string | Date;
  supplier: string | null;
  supplierNit: string | null;
  issueDate: string | Date | null;
  dueDate: string | Date | null;
  subtotal: number | null;
  iva: number | null;
  total: number | null;
  description: string | null;
  internalNotes: string | null;
  invoiceItems: InvoiceLineItem[] | null;
  paymentStatus: 'PENDING' | 'PAID' | 'OVERDUE';
  status: string;
  source: 'EMAIL' | 'MANUAL';
  uploadedBy: {
    name: string | null;
    email: string;
  } | null;
};

function isPdf(fileName: string, fileUrl: string) {
  return fileName.toLowerCase().endsWith('.pdf') || fileUrl.toLowerCase().includes('.pdf');
}

export function InvoiceDetailForm({ invoice }: { invoice: EditableInvoice }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<InvoiceLineItem[]>(invoice.invoiceItems ?? []);
  const [form, setForm] = useState({
    supplier: invoice.supplier ?? '',
    supplierNit: invoice.supplierNit ?? '',
    issueDate: toDateInputValue(invoice.issueDate),
    dueDate: toDateInputValue(invoice.dueDate),
    description: invoice.description ?? '',
    internalNotes: invoice.internalNotes ?? '',
    paymentStatus: invoice.paymentStatus,
  });

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const round2 = (value: number) => Math.round(value * 100) / 100;

  const itemTotals = useMemo(
    () => items.map((item) => round2((item.quantity ?? 0) * (item.unitPrice ?? 0))),
    [items]
  );

  const computedTotal = round2(itemTotals.reduce((sum, total) => sum + total, 0));
  const computedSubtotal = round2(computedTotal / 1.19);
  const computedIva = round2(computedTotal - computedSubtotal);

  const handleSave = async () => {
    setLoading(true);

    try {
      const response = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...form,
          subtotal: computedSubtotal,
          iva: computedIva,
          total: computedTotal,
          invoiceItems: items,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al guardar cambios');
      }

      toast.success('Factura actualizada');
      router.refresh();
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar factura');
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (
    index: number,
    field: keyof InvoiceLineItem,
    value: string
  ) => {
    setItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        if (field === 'description') {
          return { ...item, [field]: value };
        }

        const numeric = value === '' ? null : Number(value);

        if (numeric !== null && numeric <= 0) {
          return item;
        }

        if (field === 'quantity' || field === 'unitPrice') {
          const quantity = field === 'quantity' ? numeric : item.quantity;
          const unitPrice = field === 'unitPrice' ? numeric : item.unitPrice;
          return {
            ...item,
            [field]: numeric,
            total: round2((quantity ?? 0) * (unitPrice ?? 0)),
          };
        }

        return {
          ...item,
          [field]: numeric,
        };
      })
    );
  };

  const addItem = () => {
    setItems((current) => [
      ...current,
      {
        description: '',
        quantity: null,
        unitPrice: null,
        total: 0,
      },
    ]);
  };

  const removeItem = (index: number) => {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const pdf = isPdf(invoice.fileName, invoice.fileUrl);

  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string>(invoice.fileUrl);
  const [previewIsPdf, setPreviewIsPdf] = useState<boolean>(pdf);

  useEffect(() => {
    if (invoice.source !== 'EMAIL') return;

    let objectUrl: string | null = null;

    (async () => {
      try {
        const res = await fetch(invoice.fileUrl);
        if (!res.ok) {
          let message = 'Vista previa no disponible.';
          try {
            const data = await res.json();
            if (data.error) message = data.error;
          } catch {
            /* fallback al mensaje genérico */
          }
          setPreviewError(message);
          return;
        }

        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        setPreviewSrc(objectUrl);
        setPreviewIsPdf(isPdf(invoice.fileName, '') || blob.type.includes('pdf'));
      } catch {
        setPreviewError('Vista previa no disponible. Error al obtener el archivo desde el correo.');
      }
    })();

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [invoice.source, invoice.fileUrl, invoice.fileName]);

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Datos de la factura</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="supplier">Proveedor</Label>
              <Input id="supplier" name="supplier" value={form.supplier} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplierNit">NIT</Label>
              <Input id="supplierNit" name="supplierNit" value={form.supplierNit} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentStatus">Estado</Label>
              <select
                id="paymentStatus"
                name="paymentStatus"
                value={form.paymentStatus}
                onChange={handleChange}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="PENDING">Pendiente</option>
                <option value="PAID">Pagada</option>
                <option value="OVERDUE">Vencida</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="issueDate">Fecha de emisión</Label>
              <Input id="issueDate" name="issueDate" type="date" value={form.issueDate} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Fecha de vencimiento</Label>
              <Input id="dueDate" name="dueDate" type="date" value={form.dueDate} onChange={handleChange} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">Descripción</Label>
              <textarea
                id="description"
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={4}
                className="flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-4 md:col-span-2">
              <div className="flex items-center justify-between">
                <Label>Ítems de la factura</Label>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  Agregar ítem
                </Button>
              </div>

              {items.length > 0 ? (
                <div className="space-y-3">
                  {items.map((item, index) => (
                    <div key={index} className="grid gap-3 rounded-md border p-4 md:grid-cols-[2fr_0.8fr_1fr_1fr_auto]">
                      <div className="space-y-2">
                        <Label>Descripción</Label>
                        <Input
                          value={item.description}
                          onChange={(event) => updateItem(index, 'description', event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Cantidad</Label>
                        <Input
                          type="number"
                          step="1"
                          min="1"
                          value={item.quantity ?? ''}
                          onChange={(event) => updateItem(index, 'quantity', event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Precio unitario</Label>
                        <Input
                          type="number"
                          step="1"
                          min="1"
                          value={item.unitPrice ?? ''}
                          onChange={(event) => updateItem(index, 'unitPrice', event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Total</Label>
                        <Input
                          type="number"
                          step="0.01"
                          readOnly
                          value={itemTotals[index] || ''}
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeItem(index)}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No hay ítems detectados todavía.
                </div>
              )}
            </div>
            <div className="md:col-span-2 flex justify-end">
              <div className="w-full max-w-xs space-y-2 rounded-md border p-4">
                <p className="text-sm font-medium">Resumen de totales</p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{formatCurrency(computedSubtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">IVA (19%)</span>
                  <span className="font-medium">{formatCurrency(computedIva)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 text-base">
                  <span className="font-semibold">Total</span>
                  <span className="font-semibold">{formatCurrency(computedTotal)}</span>
                </div>
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="internalNotes">Notas internas</Label>
              <textarea
                id="internalNotes"
                name="internalNotes"
                value={form.internalNotes}
                onChange={handleChange}
                rows={5}
                className="flex min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button onClick={handleSave} disabled={loading}>
                {loading ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Vista previa del archivo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {previewError ? (
              <div className="flex min-h-[200px] w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-muted/40 p-6 text-center">
                <p className="text-sm font-medium text-destructive">Vista previa no disponible</p>
                <p className="text-sm text-muted-foreground">{previewError}</p>
                <p className="text-xs text-muted-foreground">
                  Esta factura fue importada desde un correo electrónico. Si el correo fue
                  cambiado, eliminado o el mensaje ya no existe, el archivo no puede mostrarse.
                </p>
              </div>
            ) : previewIsPdf ? (
              <iframe
                src={previewSrc}
                title={invoice.fileName}
                className="h-[600px] w-full rounded-md border"
              />
            ) : (
              <img
                src={previewSrc}
                alt={invoice.fileName}
                className="w-full rounded-md border object-contain"
              />
            )}

            <div className="flex gap-3">
              <Button asChild variant="outline">
                <a href={invoice.fileUrl} target="_blank" rel="noreferrer">
                  Ver archivo completo
                </a>
              </Button>
              <Button asChild>
                <a href={invoice.fileUrl} download={invoice.fileName}>
                  Descargar
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Metadatos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground">Estado técnico</p>
              <p className="font-medium">{invoice.status}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Fecha de subida</p>
              <p className="font-medium">{formatDate(invoice.createdAt)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Subida por</p>
              <p className="font-medium">
                {invoice.uploadedBy?.name || invoice.uploadedBy?.email || 'No disponible'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Archivo</p>
              <p className="font-medium break-all">{invoice.fileName}</p>
            </div>
            {invoice.total !== null && (
              <div>
                <p className="text-muted-foreground">Total actual</p>
                <p className="font-medium">{formatCurrency(invoice.total)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}