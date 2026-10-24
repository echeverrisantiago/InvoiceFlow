import { describe, it, expect } from 'vitest';
import { extractAttachmentParts } from '@/lib/gmail-payload';

describe('extractAttachmentParts (Gmail MIME)', () => {
  it('encuentra adjuntos en un payload multipart anidado', () => {
    const payload = {
      partId: '',
      mimeType: 'multipart/mixed',
      parts: [
        {
          partId: '0',
          mimeType: 'multipart/alternative',
          parts: [
            {
              partId: '0.0',
              mimeType: 'text/plain',
              filename: '',
              body: { data: 'aG9sYQ' },
            },
          ],
        },
        {
          partId: '1',
          mimeType: 'application/pdf',
          filename: 'factura.pdf',
          body: { attachmentId: 'abc', size: 10 },
        },
        {
          partId: '2',
          mimeType: 'multipart/mixed',
          parts: [
            {
              partId: '2.0',
              mimeType: 'application/xml',
              filename: 'factura.xml',
              body: { attachmentId: 'def' },
            },
          ],
        },
      ],
    };

    const parts = extractAttachmentParts(payload);

    expect(parts.map((part) => part.filename)).toEqual(['factura.pdf', 'factura.xml']);
  });

  it('ignora el cuerpo del mensaje, aunque venga incrustado', () => {
    const payload = {
      mimeType: 'multipart/alternative',
      parts: [
        { mimeType: 'text/plain', filename: '', body: { data: 'aG9sYQ' } },
        { mimeType: 'text/html', filename: '', body: { data: 'PGgxPkhvbGE8L2gxPg' } },
      ],
    };

    expect(extractAttachmentParts(payload)).toEqual([]);
  });

  it('devuelve un adjunto incrustado pequeño (sin attachmentId)', () => {
    const payload = {
      mimeType: 'image/jpeg',
      filename: 'factura.jpg',
      body: { data: 'Zm90bw', size: 4 },
    };

    const parts = extractAttachmentParts(payload);

    expect(parts).toHaveLength(1);
    expect(parts[0].filename).toBe('factura.jpg');
  });

  it('maneja payloads vacíos', () => {
    expect(extractAttachmentParts(null)).toEqual([]);
    expect(extractAttachmentParts(undefined)).toEqual([]);
    expect(extractAttachmentParts({})).toEqual([]);
  });
});
