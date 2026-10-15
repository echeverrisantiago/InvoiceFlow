import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

/**
 * Rate limiting con Upstash Redis.
 *
 * Si las variables de entorno no están configuradas (o Redis falla), el sistema
 * opera en modo "fail-open": las peticiones pasan sin limitar para no tumbar el
 * servicio por una dependencia externa caída.
 */

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

/**
 * Considera la configuración válida solo si la URL es https y no son los
 * valores de ejemplo del `.env.example`. Así evitamos que un placeholder o un
 * valor mal formado rompa el arranque del módulo.
 */
function hasValidConfig(): boolean {
  if (!url || !token) return false;
  if (!/^https:\/\//i.test(url)) return false;
  if (url.includes('your_upstash') || token.includes('your_upstash')) return false;
  return true;
}

let redis: Redis | null = null;

if (hasValidConfig()) {
  try {
    redis = new Redis({ url: url!, token: token! });
  } catch (error) {
    console.error('Rate limit: configuración de Redis inválida (fail-open):', error);
    redis = null;
  }
}

export const isRateLimitEnabled = redis !== null;

type Window = `${number} ${'s' | 'm' | 'h' | 'd'}`;

const PREFIX = 'entrafactura:ratelimit';

function createLimiter(tokens: number, window: Window, name: string): Ratelimit | null {
  if (!redis) return null;
  try {
    return new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(tokens, window),
      analytics: false,
      prefix: `${PREFIX}:${name}`,
    });
  } catch (error) {
    console.error(`Rate limit: no se pudo crear el limiter "${name}" (fail-open):`, error);
    return null;
  }
}

/** Registro de organización (endpoint público). */
export const registerIpLimiter = createLimiter(5, '10 m', 'register-ip');
/** Registro de trial desde la landing (endpoint público, crea usuario y envía email). */
export const trialRegisterIpLimiter = createLimiter(5, '1 h', 'trial-register-ip');
/** Recuperación de contraseña por IP y por email (envía emails). */
export const forgotPasswordIpLimiter = createLimiter(5, '15 m', 'forgot-password-ip');
export const forgotPasswordEmailLimiter = createLimiter(3, '1 h', 'forgot-password-email');
/** Validación y uso de tokens de recuperación (fuerza bruta). */
export const resetPasswordIpLimiter = createLimiter(10, '15 m', 'reset-password-ip');
/** Subida y extracción de facturas, por organización (evita bloquear por IP compartida). */
export const uploadOrgLimiter = createLimiter(60, '1 h', 'upload-org');
export const extractOrgLimiter = createLimiter(60, '1 h', 'extract-org');

/**
 * Obtiene la IP del cliente a partir de los headers de proxy (Vercel).
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * Aplica un limiter. Devuelve `null` si la petición puede continuar, o una
 * respuesta 429 lista para retornar si se excedió el límite.
 */
export async function enforceRateLimit(
  limiter: Ratelimit | null,
  identifier: string,
  extraHeaders?: Record<string, string>
): Promise<NextResponse | null> {
  if (!limiter) return null;

  try {
    const { success, limit, remaining, reset } = await limiter.limit(identifier);

    if (success) return null;

    const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));

    return NextResponse.json(
      {
        error: 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.',
        code: 'RATE_LIMITED',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': String(remaining),
          'X-RateLimit-Reset': String(reset),
          ...extraHeaders,
        },
      }
    );
  } catch (error) {
    // Fail-open: si Redis falla, no bloqueamos la petición.
    console.error('Rate limit error (fail-open):', error);
    return null;
  }
}
