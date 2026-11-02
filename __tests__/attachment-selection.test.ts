import { describe, it, expect } from 'vitest';
import {
  MIN_IMAGE_BYTES,
  selectInvoiceAttachments,
} from '@/lib/email-file';
import { shouldUsePdfFallback } from '@/lib/electronic-invoice';

const image = (filename: string, size: number) => ({
  filename,
  contentType: 'image/jpeg',
  content: Buffer.alloc(size),
});

describe('selectInvoiceAttachments', () => {
  it('ignora las imágenes cuando el correo trae un documento', () => {
    const zip = {
      filename: 'factura.zip',
      contentType: 'application/zip',
      content: Buffer.alloc(1000),
    };

    const result = selectInvoiceAttachments([
      image('inline_b64_1.jpg', 50_000),
      zip,
      image('banner.png', 40_000),
    ]);

    expect(result.map((att) => att.filename)).toEqual(['factura.zip']);
  });

  it('acepta imágenes grandes cuando el correo solo trae imágenes', () => {
    const result = selectInvoiceAttachments([
      image('factura.jpg', MIN_IMAGE_BYTES + 1),
    ]);

    expect(result).toHaveLength(1);
  });

  it('descarta logos e iconos pequeños', () => {
    const result = selectInvoiceAttachments([
      image('logo.jpg', MIN_IMAGE_BYTES - 1),
      image('icono.png', 5_000),
    ]);

    expect(result).toHaveLength(0);
  });

  it('con PDF e imágenes solo procesa el PDF', () => {
    const pdf = {
      filename: 'factura.pdf',
      contentType: 'application/pdf',
      content: Buffer.alloc(1000),
    };

    const result = selectInvoiceAttachments([pdf, image('firma.jpg', 50_000)]);

    expect(result.map((att) => att.filename)).toEqual(['factura.pdf']);
  });

  it('ignora extractos y certificados bancarios', () => {
    const statements = [
      {
        filename: 'Extracto_1175702641_202610_TARJETA_VISA_d768.pdf',
        contentType: 'application/pdf',
        content: Buffer.alloc(1000),
      },
      {
        filename: 'loan_account-60360792460.pdf',
        contentType: 'application/pdf',
        content: Buffer.alloc(1000),
      },
    ];
    const factura = {
      filename: 'factura-octubre.pdf',
      contentType: 'application/pdf',
      content: Buffer.alloc(1000),
    };

    const result = selectInvoiceAttachments([...statements, factura]);

    expect(result.map((att) => att.filename)).toEqual(['factura-octubre.pdf']);
  });

  it('no confunde el "estado de cuenta" de una factura de servicios', () => {
    const factura = {
      filename: 'Estado_Cuenta_6055497193.pdf',
      contentType: 'application/pdf',
      content: Buffer.alloc(1000),
    };

    const result = selectInvoiceAttachments([factura]);

    expect(result).toHaveLength(1);
  });

  it('ignora adjuntos que no son factura', () => {
    const csv = {
      filename: 'datos.csv',
      contentType: 'text/csv',
      content: Buffer.alloc(1000),
    };

    expect(selectInvoiceAttachments([csv])).toHaveLength(0);
  });
});

describe('shouldUsePdfFallback', () => {
  it('usa el PDF cuando el XML trae total 0', () => {
    expect(shouldUsePdfFallback({ total: 0 } as any, true)).toBe(true);
  });

  it('no usa el PDF cuando el XML trae total', () => {
    expect(shouldUsePdfFallback({ total: 212413 } as any, true)).toBe(false);
  });

  it('no usa el PDF si el ZIP no lo contiene', () => {
    expect(shouldUsePdfFallback({ total: 0 } as any, false)).toBe(false);
    expect(shouldUsePdfFallback(null, true)).toBe(false);
  });
});
