import { describe, it, expect, vi, afterEach } from 'vitest';

// Evitamos instanciar un cliente Redis real durante las pruebas.
vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@upstash/ratelimit', () => {
  const slidingWindow = vi.fn(() => ({}));
  const Ratelimit = vi.fn().mockImplementation(() => ({ limit: vi.fn() }));
  (Ratelimit as unknown as { slidingWindow: typeof slidingWindow }).slidingWindow =
    slidingWindow;
  return { Ratelimit };
});

import { enforceRateLimit, getClientIp } from '@/lib/ratelimit';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getClientIp', () => {
  it('usa el primer valor de x-forwarded-for', () => {
    const request = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' },
    });
    expect(getClientIp(request)).toBe('1.1.1.1');
  });

  it('usa x-real-ip cuando no hay x-forwarded-for', () => {
    const request = new Request('http://localhost', {
      headers: { 'x-real-ip': '3.3.3.3' },
    });
    expect(getClientIp(request)).toBe('3.3.3.3');
  });

  it('devuelve "unknown" si no hay headers de IP', () => {
    const request = new Request('http://localhost');
    expect(getClientIp(request)).toBe('unknown');
  });
});

describe('enforceRateLimit', () => {
  it('es fail-open cuando no hay limiter (Redis no configurado)', async () => {
    const result = await enforceRateLimit(null, 'ip:1.1.1.1');
    expect(result).toBeNull();
  });

  it('permite la petición cuando el limiter la aprueba', async () => {
    const limiter = {
      limit: vi.fn().mockResolvedValue({
        success: true,
        limit: 5,
        remaining: 4,
        reset: Date.now() + 60000,
      }),
    };

    const result = await enforceRateLimit(limiter as never, 'ip:1.1.1.1');
    expect(result).toBeNull();
    expect(limiter.limit).toHaveBeenCalledWith('ip:1.1.1.1');
  });

  it('devuelve 429 con headers y body cuando se excede el límite', async () => {
    const limiter = {
      limit: vi.fn().mockResolvedValue({
        success: false,
        limit: 5,
        remaining: 0,
        reset: Date.now() + 60000,
      }),
    };

    const response = await enforceRateLimit(limiter as never, 'ip:1.1.1.1');

    expect(response).not.toBeNull();
    expect(response!.status).toBe(429);
    expect(response!.headers.get('Retry-After')).toBeTruthy();
    expect(response!.headers.get('X-RateLimit-Limit')).toBe('5');
    expect(response!.headers.get('X-RateLimit-Remaining')).toBe('0');

    const body = await response!.json();
    expect(body.code).toBe('RATE_LIMITED');
  });

  it('es fail-open si Redis lanza un error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const limiter = {
      limit: vi.fn().mockRejectedValue(new Error('Redis caído')),
    };

    const result = await enforceRateLimit(limiter as never, 'ip:1.1.1.1');
    expect(result).toBeNull();
    expect(consoleError).toHaveBeenCalled();
  });

  it('incluye headers extra (CORS) en la respuesta 429', async () => {
    const limiter = {
      limit: vi.fn().mockResolvedValue({
        success: false,
        limit: 5,
        remaining: 0,
        reset: Date.now() + 60000,
      }),
    };

    const response = await enforceRateLimit(limiter as never, 'ip:1.1.1.1', {
      'Access-Control-Allow-Origin': 'https://entrafactura.com',
    });

    expect(response!.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://entrafactura.com'
    );
  });
});
