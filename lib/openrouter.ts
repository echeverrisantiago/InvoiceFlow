/**
 * Cliente mínimo de OpenRouter (API compatible con OpenAI Chat Completions).
 *
 * OpenRouter se usa como proveedor principal para leer PDFs e imágenes de
 * forma nativa. No añade dependencias: una sola llamada REST con la clave en
 * cabecera.
 */

const DEFAULT_MODEL = 'google/gemini-3.5-flash';
const DEFAULT_FALLBACK_MODELS = 'google/gemini-3.1-flash-lite';
const MAX_OUTPUT_TOKENS = 8192;
const MAX_INLINE_RETRIES = 1;
const INLINE_RETRY_WAIT_MS = 2_000;

/** Tiempo máximo por intento. Deja margen al respaldo de Groq. */
export const OPENROUTER_TIMEOUT_MS = 70_000;

export interface OpenRouterPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

export class OpenRouterError extends Error {
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
    this.name = 'OpenRouterError';
    this.retryable = options.retryable;
    this.status = options.status;
    this.timedOut = options.timedOut;
  }
}

export function isOpenRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

export function openRouterModel(): string {
  return process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
}

function openRouterModelChain(): string[] {
  const fallbacks = (process.env.OPENROUTER_FALLBACK_MODELS?.trim() ||
    DEFAULT_FALLBACK_MODELS)
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);

  return Array.from(new Set([openRouterModel(), ...fallbacks]));
}

function errorMessageFromBody(body: string): string {
  try {
    const parsed = JSON.parse(body);
    return (
      parsed?.error?.message ||
      parsed?.message ||
      body.slice(0, 300)
    );
  } catch {
    return body.slice(0, 300);
  }
}

/** Convierte las partes internas al formato de contenido de OpenRouter. */
function toContentParts(parts: OpenRouterPart[]): any[] {
  const content: any[] = [];

  for (const part of parts) {
    if (typeof part.text === 'string' && part.text.length > 0) {
      content.push({ type: 'text', text: part.text });
      continue;
    }

    if (!part.inlineData) continue;

    const { mimeType, data } = part.inlineData;

    // Gemini lee los PDF de forma nativa: OpenRouter los reenvía tal cual.
    if (mimeType === 'application/pdf') {
      content.push({
        type: 'file',
        file: {
          filename: 'documento.pdf',
          file_data: `data:${mimeType};base64,${data}`,
        },
      });
      continue;
    }

    content.push({
      type: 'image_url',
      image_url: { url: `data:${mimeType};base64,${data}` },
    });
  }

  return content;
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';

  return content
    .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim();
}

async function requestOpenRouter(
  model: string,
  parts: OpenRouterPart[]
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new OpenRouterError('Falta OPENROUTER_API_KEY', {
      retryable: false,
    });
  }

  const hasPdf = parts.some(
    (part) => part.inlineData?.mimeType === 'application/pdf'
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);

  try {
    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(process.env.NEXT_PUBLIC_APP_URL
            ? { 'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL }
            : {}),
          'X-Title': 'EntraFactura',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: toContentParts(parts) }],
          temperature: 0,
          max_tokens: MAX_OUTPUT_TOKENS,
          response_format: { type: 'json_object' },
          // Gemini 3 exige razonamiento, pero se puede reducir al mínimo.
          // `exclude` evita devolverlo; los tokens se cobran igual.
          reasoning: { effort: 'minimal', exclude: true },
          // Fuerza el paso nativo del PDF: evita el OCR de Mistral (coste
          // extra) y conserva la calidad sobre documentos escaneados.
          ...(hasPdf
            ? {
                plugins: [
                  { id: 'file-parser', pdf: { engine: 'native' } },
                ],
              }
            : {}),
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

      const prefix =
        response.status === 402
          ? 'OpenRouter sin saldo (402). Recarga créditos'
          : `OpenRouter HTTP ${response.status}`;

      throw new OpenRouterError(
        `${prefix}: ${errorMessageFromBody(body)}`,
        { retryable, status: response.status }
      );
    }

    let payload: any;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new OpenRouterError(
        'OpenRouter devolvió una respuesta que no es JSON',
        { retryable: true }
      );
    }

    if (payload?.error) {
      const status = Number(payload.error.code) || undefined;
      throw new OpenRouterError(
        `OpenRouter: ${payload.error.message || 'error del proveedor'}`,
        {
          retryable: status === 408 || status === 429 || (status ?? 0) >= 500,
          status,
        }
      );
    }

    const choice = payload?.choices?.[0];
    const text = contentToText(choice?.message?.content);

    if (!text) {
      const finishReason = choice?.finish_reason || 'sin contenido';
      // `length` suele significar que el razonamiento consumió el
      // presupuesto de salida: conviene reintentar más tarde.
      throw new OpenRouterError(
        `OpenRouter no devolvió texto (${finishReason})`,
        { retryable: finishReason === 'length' }
      );
    }

    return text;
  } catch (error) {
    if (error instanceof OpenRouterError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new OpenRouterError('OpenRouter agotó el tiempo de espera', {
        retryable: true,
        timedOut: true,
      });
    }
    throw new OpenRouterError(
      error instanceof Error ? error.message : 'Error de red con OpenRouter',
      { retryable: true }
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function requestOpenRouterWithRetry(
  model: string,
  parts: OpenRouterPart[]
): Promise<string> {
  let attempt = 0;

  while (true) {
    try {
      return await requestOpenRouter(model, parts);
    } catch (error) {
      const openRouterError =
        error instanceof OpenRouterError
          ? error
          : new OpenRouterError(String(error), { retryable: true });

      // Los timeouts no se reintentan aquí: duplicarían la espera. La factura
      // queda programada para el cron.
      const canRetry =
        openRouterError.retryable &&
        openRouterError.status !== 404 &&
        !openRouterError.timedOut &&
        attempt < MAX_INLINE_RETRIES;

      if (!canRetry) throw openRouterError;

      console.warn(
        `[openrouter] ${openRouterError.message}. Reintentando en ${
          INLINE_RETRY_WAIT_MS / 1000
        }s...`
      );
      await new Promise((resolve) => setTimeout(resolve, INLINE_RETRY_WAIT_MS));
      attempt++;
    }
  }
}

/**
 * Envía contenido a OpenRouter y devuelve el texto de la respuesta.
 *
 * Fuerza JSON y reduce el razonamiento al mínimo para que la extracción sea
 * rápida, barata y con presupuesto de salida predecible.
 *
 * Si el modelo configurado ya no existe (404) o falla por capacidad (429/5xx),
 * prueba los de `OPENROUTER_FALLBACK_MODELS`.
 */
export async function generateOpenRouterContent(
  parts: OpenRouterPart[]
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new OpenRouterError('Falta OPENROUTER_API_KEY', {
      retryable: false,
    });
  }

  let lastError: OpenRouterError | null = null;

  for (const model of openRouterModelChain()) {
    try {
      return await requestOpenRouterWithRetry(model, parts);
    } catch (error) {
      lastError =
        error instanceof OpenRouterError
          ? error
          : new OpenRouterError(String(error), { retryable: true });

      // Se prueba el siguiente modelo si el actual ya no existe (404) o si
      // falló por capacidad (429/5xx). Los timeouts no cambian de modelo:
      // duplicarían la espera y el cron ya reintenta la factura.
      const canTryNextModel =
        lastError.status === 404 ||
        (lastError.status !== undefined && lastError.retryable);

      if (!canTryNextModel) throw lastError;

      console.warn(
        `[openrouter] El modelo ${model} falló (${lastError.message}); probando el siguiente.`
      );
    }
  }

  throw (
    lastError ||
    new OpenRouterError('OpenRouter no tiene modelos configurados', {
      retryable: false,
    })
  );
}
