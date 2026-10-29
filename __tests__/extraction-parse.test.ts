import { describe, it, expect } from 'vitest';
import { parseExtractionResponse } from '@/lib/extraction-parse';

describe('parseExtractionResponse', () => {
  it('acepta una factura válida', () => {
    const result = parseExtractionResponse(
      JSON.stringify({
        isInvoice: true,
        documentType: 'FACTURA',
        supplier: 'SPORTY CITY S.A.S.',
        supplierNit: '9007770633',
        issueDate: '2026-10-10',
        dueDate: '2026-10-10',
        subtotal: 149900,
        iva: 0,
        total: 149900,
        description: 'MENSUALIDAD SMART',
        items: [
          { description: 'MENSUALIDAD SMART', quantity: 1, unitPrice: 149900, total: 149900 },
        ],
      })
    );

    expect(result.kind).toBe('invoice');
    if (result.kind === 'invoice') {
      expect(result.data.supplier).toBe('SPORTY CITY S.A.S.');
      expect(result.data.total).toBe(149900);
      expect(result.data.items).toHaveLength(1);
    }
  });

  it('descarta cuando el modelo dice que no es una factura', () => {
    const result = parseExtractionResponse(
      JSON.stringify({
        isInvoice: false,
        documentType: 'PUBLICIDAD',
        supplier: null,
        total: null,
        issueDate: null,
        items: [],
      })
    );

    expect(result.kind).toBe('not-invoice');
    if (result.kind === 'not-invoice') {
      expect(result.documentType).toBe('PUBLICIDAD');
    }
  });

  it('descarta una respuesta completamente vacía (sin isInvoice)', () => {
    const result = parseExtractionResponse(
      JSON.stringify({
        supplier: null,
        supplierNit: null,
        issueDate: null,
        dueDate: null,
        subtotal: null,
        iva: null,
        total: null,
        description: null,
        items: [],
      })
    );

    expect(result.kind).toBe('not-invoice');
  });

  it('marca como incompleta una factura sin total', () => {
    const result = parseExtractionResponse(
      JSON.stringify({
        isInvoice: true,
        supplier: 'PROVEEDOR',
        total: null,
        items: [],
      })
    );

    expect(result.kind).toBe('incomplete');
  });

  it('normaliza items cuando falta el array', () => {
    const result = parseExtractionResponse(
      JSON.stringify({ isInvoice: true, supplier: 'PROVEEDOR', total: 1000 })
    );

    expect(result.kind).toBe('invoice');
    if (result.kind === 'invoice') {
      expect(result.data.items).toEqual([]);
    }
  });

  it('rechaza respuestas sin JSON', () => {
    expect(parseExtractionResponse('No puedo procesar esto').kind).toBe('invalid');
  });

  it('rechaza JSON malformado', () => {
    expect(parseExtractionResponse('{ "supplier": ').kind).toBe('invalid');
  });
});
