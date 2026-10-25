import { describe, it, expect } from 'vitest';
import { buildMessagesQuery, GraphApiError } from '@/lib/graph';

describe('Microsoft Graph', () => {
  it('pide mensajes con adjuntos desde una fecha, en orden ascendente', () => {
    const path = buildMessagesQuery({
      after: new Date('2026-10-01T00:00:00.000Z'),
      limit: 50,
    });

    expect(path.startsWith('/me/mailFolders/inbox/messages?')).toBe(true);

    const params = new URLSearchParams(path.split('?')[1]);
    expect(params.get('$filter')).toBe(
      'receivedDateTime ge 2026-10-01T00:00:00.000Z and hasAttachments eq true'
    );
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
});
