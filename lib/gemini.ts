/**
 * Cliente mínimo de la API de Gemini (Google AI Studio) por REST.
 *
 * Se usa para leer PDFs e imágenes de forma nativa: Gemini entiende el
 * documento completo (incluidos los escaneados) sin necesidad de extraer el
 * texto con `unpdf`. No añade dependencias nuevas.
 */

const DEFAULT_MODEL = 'gemini-3.5-flash';
const DEFAULT_FALLBACK_MODELS = 'gemini-3.1-flash-lite';
const MAX_OUTPUT_TOKENS = 8192;
const MAX_INLINE_RETRIES = 1;
const INLINE_RETRY_WAIT_MS = 2_000;

/** Tiempo máximo por intento. Deja margen al respaldo de Groq. */
export const GEMINI_TIMEOUT_MS = 70_000;

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

export class GeminiError extends Error {
  /** `true` si conviene reintentar más tarde (429, 5xx, timeout...). */
  retryable: boolean;
  status?: number;
  /** `true` cuando se agotó el tiempo de espera (no se reintenta en línea). */
  timedOut?: boolean;

  constructor(
    message: string,
    options: { retryable: boolean; status?: number; timedOut?: boolean }
  ) {
    super(message);
    this.name = 'GeminiError';
    this.retryable = options.retryable;
    this.status = options.status;
    this.timedOut = options.timedOut;
  }
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

function geminiModelChain(): string[] {
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS?.trim() ||
    DEFAULT_FALLBACK_MODELS)
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);

  return Array.from(new Set([geminiModel(), ...fallbacks]));
}

/**
 * MIME válido para Gemini. El almacenamiento suele devolver
 * `application/octet-stream`, así que se deduce por la extensión.
 */
export function geminiMimeType(
  contentType?: string | null,
  fileName?: string | null
): string {
  const normalized = (contentType || '').toLowerCase().split(';')[0].trim();
  if (normalized && normalized !== 'application/octet-stream') {
    return normalized;
  }

  const name = (fileName || '').toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.heic')) return 'image/heic';
  if (name.endsWith('.heif')) return 'image/heif';
  return 'image/jpeg';
}

function errorMessageFromBody(body: string): string {
  try {
    const parsed = JSON.parse(body);
    return parsed?.error?.message || body.slice(0, 300);
  } catch {
    return body.slice(0, 300);
  }
}

async function requestGemini(
  model: string,
  parts: GeminiPart[]
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiError('Falta GEMINI_API_KEY', { retryable: false });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // La key va en cabecera para que no quede en logs de URL.
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            responseMimeType: 'application/json',
            // Sin "thinking": más rápido, más barato y sin consumir el
            // presupuesto de salida en razonamiento.
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: controller.signal,
      }
    );

    const body = await response.text();

    if (!response.ok) {
      const retryable =
        response.status === 408 ||
        response.status === 429 ||
        response.status >= 500;
      throw new GeminiError(
        `Gemini HTTP ${response.status}: ${errorMessageFromBody(body)}`,
        { retryable, status: response.status }
      );
    }

    let payload: any;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new GeminiError(
        'Gemini devolvió una respuesta que no es JSON',
        { retryable: true }
      );
    }

    const blockReason = payload?.promptFeedback?.blockReason;
    if (blockReason) {
      throw new GeminiError(
        `Gemini bloqueó el documento (${blockReason})`,
        { retryable: false }
      );
    }

    const candidate = payload?.candidates?.[0];
    const text = (candidate?.content?.parts || [])
      .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim();

    if (!text) {
      const finishReason = candidate?.finishReason || 'sin contenido';
      throw new GeminiError(
        `Gemini no devolvió texto (${finishReason})`,
        { retryable: finishReason !== 'SAFETY' }
      );
    }

    return text;
  } catch (error) {
    if (error instanceof GeminiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new GeminiError('Gemini agotó el tiempo de espera', {
        retryable: true,
        timedOut: true,
      });
    }
    throw new GeminiError(
      error instanceof Error ? error.message : 'Error de red con Gemini',
      { retryable: true }
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function requestGeminiWithRetry(
  model: string,
  parts: GeminiPart[]
): Promise<string> {
  let attempt = 0;

  while (true) {
    try {
      return await requestGemini(model, parts);
    } catch (error) {
      const geminiError =
        error instanceof GeminiError
          ? error
          : new GeminiError(String(error), { retryable: true });

      // Los timeouts no se reintentan aquí: duplicarían la espera. La factura
      // queda programada para el cron.
      const canRetry =
        geminiError.retryable &&
        geminiError.status !== 404 &&
        !geminiError.timedOut &&
        attempt < MAX_INLINE_RETRIES;

      if (!canRetry) throw geminiError;

      console.warn(
        `[gemini] ${geminiError.message}. Reintentando en ${
          INLINE_RETRY_WAIT_MS / 1000
        }s...`
      );
      await new Promise((resolve) => setTimeout(resolve, INLINE_RETRY_WAIT_MS));
      attempt++;
    }
  }
}

/**
 * Envía contenido a Gemini y devuelve el texto de la respuesta.
 *
 * Fuerza `responseMimeType: application/json` y desactiva el "thinking" para
 * que la extracción sea rápida, barata y con presupuesto de salida predecible.
 *
 * Si el modelo configurado ya no existe (404), prueba los de
 * `GEMINI_FALLBACK_MODELS`: Google retira modelos con frecuencia.
 */
export async function generateGeminiContent(
  parts: GeminiPart[]
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiError('Falta GEMINI_API_KEY', { retryable: false });
  }

  let lastError: GeminiError | null = null;

  for (const model of geminiModelChain()) {
    try {
      return await requestGeminiWithRetry(model, parts);
    } catch (error) {
      lastError =
        error instanceof GeminiError
          ? error
          : new GeminiError(String(error), { retryable: true });

      // Se prueba el siguiente modelo si el actual ya no existe (404) o si
      // falló por capacidad (429/5xx). Los timeouts no cambian de modelo:
      // duplicarían la espera y el cron ya reintenta la factura.
      const canTryNextModel =
        lastError.status === 404 ||
        (lastError.status !== undefined && lastError.retryable);

      if (!canTryNextModel) throw lastError;

      console.warn(
        `[gemini] El modelo ${model} falló (${lastError.message}); probando el siguiente.`
      );
    }
  }

  throw (
    lastError ||
    new GeminiError('Gemini no tiene modelos configurados', {
      retryable: false,
    })
  );
}
