import { describe, it, expect } from 'vitest';
import {
  MAX_IMAGES_PER_EMAIL,
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
  it('procesa imágenes grandes aunque el correo también traiga un documento', () => {
    const zip = {
      filename: 'factura.zip',
      contentType: 'application/zip',
      content: Buffer.alloc(1000),
    };

    const result = selectInvoiceAttachments([
      image('ktronix.jpeg', 80_000),
      zip,
      image('picanha.jpeg', 70_000),
    ]);

    expect(result.map((att) => att.filename)).toEqual([
      'ktronix.jpeg',
      'factura.zip',
      'picanha.jpeg',
    ]);
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

  it('con PDF e imágenes procesa el PDF y las imágenes que parecen factura', () => {
    const pdf = {
      filename: 'factura.pdf',
      contentType: 'application/pdf',
      content: Buffer.alloc(1000),
    };

    const result = selectInvoiceAttachments([
      pdf,
      image('firma.jpg', 50_000),
      image('factura-escaneada.jpg', 50_000),
    ]);

    expect(result.map((att) => att.filename)).toEqual([
      'factura.pdf',
      'factura-escaneada.jpg',
    ]);
  });

  it('descarta imágenes con nombre de logo, firma o banner aunque sean grandes', () => {
    const result = selectInvoiceAttachments([
      image('logo-ktronix.jpg', 80_000),
      image('KtronixLogo.jpeg', 80_000),
      image('firma digital.png', 50_000),
      image('banner.png', 40_000),
      image('ktronix.jpeg', 80_000),
    ]);

    expect(result.map((att) => att.filename)).toEqual(['ktronix.jpeg']);
  });

  it('no descarta una factura por una palabra que contenga "firma"', () => {
    const result = selectInvoiceAttachments([
      image('confirmacion-pago.jpg', 50_000),
    ]);

    expect(result.map((att) => att.filename)).toEqual(['confirmacion-pago.jpg']);
  });

  it('limita la cantidad de imágenes procesadas por correo', () => {
    const images = Array.from({ length: MAX_IMAGES_PER_EMAIL + 2 }, (_, index) =>
      image(`factura-${index}.jpg`, 50_000)
    );

    const result = selectInvoiceAttachments(images);

    expect(result).toHaveLength(MAX_IMAGES_PER_EMAIL);
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
