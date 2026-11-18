import { describe, it, expect } from 'vitest';
import { buildMessagesQuery, GraphApiError } from '@/lib/graph';

describe('Microsoft Graph', () => {
  it('pide los mensajes desde una fecha, sin filtrar por hasAttachments', () => {
    const path = buildMessagesQuery({
      after: new Date('2026-10-01T00:00:00.000Z'),
      limit: 50,
    });

    expect(path.startsWith('/me/mailFolders/inbox/messages?')).toBe(true);

    const params = new URLSearchParams(path.split('?')[1]);
    expect(params.get('$filter')).toBe(
      'receivedDateTime ge 2026-10-01T00:00:00.000Z'
    );
    // Graph marca hasAttachments=false en correos con imágenes inline; si se
    // filtra por ese campo, esos correos nunca se revisan.
    expect(params.get('$filter')).not.toContain('hasAttachments');
    expect(params.get('$orderby')).toBe('receivedDateTime asc');
    expect(params.get('$select')).toBe('id,receivedDateTime');
    expect(params.get('$top')).toBe('50');
  });

  it('usa 50 mensajes por defecto', () => {
    const path = buildMessagesQuery({ after: new Date('2026-10-01T00:00:00.000Z') });
    const params = new URLSearchParams(path.split('?')[1]);
    expect(params.get('$top')).toBe('50');
  });

  it('considera los 401/403 como error de autenticación', () => {
    expect(new GraphApiError('sin token', 401).isAuthError).toBe(true);
    expect(new GraphApiError('sin permiso', 403).isAuthError).toBe(true);
    expect(new GraphApiError('sin permiso', 500, 'ErrorAccessDenied').isAuthError).toBe(
      true
    );
    expect(new GraphApiError('servidor', 500).isAuthError).toBe(false);
  });

  it('solo reintenta con refresh ante un token inválido, no ante un 403', () => {
    expect(new GraphApiError('token vencido', 401).canRetryWithRefresh).toBe(true);
    expect(
      new GraphApiError('token inválido', 500, 'InvalidAuthenticationToken')
        .canRetryWithRefresh
    ).toBe(true);
    expect(new GraphApiError('sin permiso', 403).canRetryWithRefresh).toBe(false);
    expect(new GraphApiError('servidor', 500).canRetryWithRefresh).toBe(false);
  });
});
