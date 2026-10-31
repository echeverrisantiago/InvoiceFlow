import { describe, it, expect } from 'vitest';
import {
  normalizeInvoiceData,
  normalizeInvoiceItem,
} from '@/lib/invoice-normalize';

describe('normalizeInvoiceItem', () => {
  it('deriva cantidad 1 y precio cuando solo hay total', () => {
    const item = normalizeInvoiceItem({
      description: 'Saldo mes anterior',
      total: 44413,
    });

    expect(item).toEqual({
      description: 'Saldo mes anterior',
      quantity: 1,
      unitPrice: 44413,
      total: 44413,
    });
  });

  it('calcula el total cuando hay cantidad y precio', () => {
    const item = normalizeInvoiceItem({
      description: 'Producto',
      quantity: 2,
      unitPrice: 1000,
      total: null,
    });

    expect(item.total).toBe(2000);
  });

  it('respeta los tres valores si existen', () => {
    const item = normalizeInvoiceItem({
      description: 'Producto',
      quantity: 2,
      unitPrice: 1000,
      total: 2000,
    });

    expect(item).toEqual({
      description: 'Producto',
      quantity: 2,
      unitPrice: 1000,
      total: 2000,
    });
  });

  it('no inventa valores en una línea vacía', () => {
    const item = normalizeInvoiceItem({
      description: '',
      quantity: null,
      unitPrice: null,
      total: null,
    });

    expect(item).toEqual({
      description: '',
      quantity: null,
      unitPrice: null,
      total: null,
    });
  });

  it('es idempotente', () => {
    const once = normalizeInvoiceItem({ description: 'X', total: 5000 });
    expect(normalizeInvoiceItem(once)).toEqual(once);
  });
});

describe('normalizeInvoiceData', () => {
  it('completa subtotal e IVA a partir de los ítems', () => {
    const data = normalizeInvoiceData({
      supplier: 'COLOMBIA TELECOMUNICACIONES S.A. E.S.P. BIC',
      total: 212413,
      items: [
        { description: 'Saldo mes anterior', total: 44413 },
        { description: 'Valor Cuota Equipo Mes Anterior', total: 162000 },
        { description: 'Valor Cuota(s)', total: 6000 },
      ],
    } as any);

    expect(data.total).toBe(212413);
    expect(data.subtotal).toBe(212413);
    expect(data.iva).toBe(0);
    expect(data.items).toHaveLength(3);
    expect(data.items?.[0]).toMatchObject({
      quantity: 1,
      unitPrice: 44413,
      total: 44413,
    });
  });

  it('calcula el total desde los ítems si falta', () => {
    const data = normalizeInvoiceData({
      supplier: 'Proveedor',
      items: [
        { description: 'A', total: 1000 },
        { description: 'B', total: 500 },
      ],
    } as any);

    expect(data.subtotal).toBe(1500);
    expect(data.total).toBe(1500);
    expect(data.iva).toBe(0);
  });
});
