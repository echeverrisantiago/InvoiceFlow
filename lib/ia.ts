import { ChatGroq } from '@langchain/groq';
import { HumanMessage } from '@langchain/core/messages';
import type { ExtractionResult, InvoiceData } from '@/types';
import {
  isElectronicInvoiceFile,
  isXmlFile,
  isZipFile,
  fileNameFromUrl,
} from '@/lib/file-types';
import { parseExtractionResponse } from '@/lib/extraction-parse';

const visionModel = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY!,
  model: process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b',
  temperature: 0,
  // El plan gratuito rechaza peticiones con salida esperada > 1000 tokens/min.
  maxTokens: 900,
});

const textModel = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY!,
  model: process.env.GROQ_TEXT_MODEL || 'openai/gpt-oss-120b',
  temperature: 0,
  maxTokens: 2000,
});

/**
 * Reintento inmediato ante límites de tasa de Groq (429).
 *
 * Solo se espera dentro de la petición si la espera es corta (límites por
 * minuto). Si la cuota es diaria, se propaga el error y la factura queda
 * programada para reintentarse desde el cron.
 */
const MAX_INLINE_RETRIES = 1;
const MAX_INLINE_WAIT_MS = 25_000;

function isRateLimitError(error: unknown): boolean {
  const e = error as any;
  if (!e || typeof e !== 'object') return false;
  return (
    e.status === 429 ||
    e.statusCode === 429 ||
    e.name === 'RateLimitQuotaExhaustedError' ||
    e?.error?.error?.code === 'rate_limit_exceeded' ||
    e?.response?.status === 429
  );
}

function retryAfterSeconds(error: unknown): number | null {
  const e = error as any;
  const raw =
    e?.headers?.['retry-after'] ??
    e?.response?.headers?.['retry-after'] ??
    e?.headers?.get?.('retry-after');

  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

async function invokeWithRateLimitRetry<T>(invoke: () => Promise<T>): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      return await invoke();
    } catch (error) {
      if (!isRateLimitError(error) || attempt >= MAX_INLINE_RETRIES) {
        throw error;
      }

      const seconds = retryAfterSeconds(error);

      // Esperas largas (cuota diaria): no bloqueamos la petición; el cron
      // reintentará la factura más adelante.
      if (seconds !== null && seconds * 1000 > MAX_INLINE_WAIT_MS) {
        throw error;
      }

      const waitMs = Math.min(
        (seconds ?? (attempt + 1) * 5) * 1000,
        MAX_INLINE_WAIT_MS
      );
      console.warn(
        `[ia] Límite de Groq (429). Reintentando en ${Math.round(waitMs / 1000)}s...`
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      attempt++;
    }
  }
}

const EXTRACTION_PROMPT = `Eres un asistente experto en extraer información de facturas colombianas. Analiza el documento proporcionado y responde SOLO con este JSON:

{
  "isInvoice": true o false,
  "documentType": "FACTURA" | "EXTRACTO" | "PUBLICIDAD" | "ENCUESTA" | "OTRO",
  "supplier": "Nombre del proveedor/emisor",
  "supplierNit": "NIT del proveedor (solo números y dígito de verificación)",
  "issueDate": "Fecha de emisión (formato ISO: YYYY-MM-DD)",
  "dueDate": "Fecha de vencimiento (formato ISO: YYYY-MM-DD)",
  "subtotal": monto subtotal (número sin símbolos),
  "iva": monto IVA (número sin símbolos),
  "total": monto total (número sin símbolos),
  "description": "Descripción breve de los productos/servicios",
  "items": [
    {
      "description": "Nombre del producto o servicio",
      "quantity": cantidad numérica o null,
      "unitPrice": precio unitario numérico o null,
      "total": valor total de la línea numérico o null
    }
  ]
}

PRIMERO decide qué es el documento:
- "FACTURA": factura de venta, cuenta de cobro, comprobante de pago o recibo de compra. Aunque esté girada, borrosa o sea una foto, si muestra proveedor y valores, ES una factura.
- "EXTRACTO": extracto bancario o de tarjeta.
- "PUBLICIDAD": imagen promocional o anuncio.
- "ENCUESTA": encuesta, invitación o notificación.
- "OTRO": cualquier otra cosa (logo, firma, captura de chat, etc.).

Si NO es una factura:
- "isInvoice": false
- deja supplier, supplierNit, fechas, montos, description e items en null/[].
- NO inventes datos.

IMPORTANTE (solo si es factura):
- Fechas en formato colombiano suelen ser DD/MM/YYYY - conviértelas a YYYY-MM-DD
- Si no encuentras la fecha de vencimiento, calcula 30 días después de la fecha de emisión
- Montos deben ser números sin puntos, comas ni símbolos (ej: 150000 no 150.000)
- NIT debe incluir dígito de verificación si está disponible
- Si falta algún dato, usa null
- Si hay varios productos o servicios, agrégalos en "items"
- Si no puedes identificar la cantidad o precio unitario de un ítem, usa null pero conserva la descripción
- Valida que subtotal + iva ≈ total (con tolerancia del 1%)

Responde SOLO con el JSON, sin texto adicional.`;

interface ElectronicInvoiceOutcome {
  data?: InvoiceData;
  pdfBuffer?: Buffer;
  xmlText?: string;
  error?: string;
}

/**
 * Tries to read a Colombian electronic invoice (DIAN UBL 2.1) from a ZIP or a
 * standalone XML, without calling the AI. Returns the parsed data when possible
 * and, for ZIPs, the embedded PDF so the AI can be used as a fallback.
 */
async function tryElectronicInvoice(
  buffer: Buffer,
  contentType: string,
  fileName: string
): Promise<ElectronicInvoiceOutcome> {
  const { parseInvoiceFromZip, parseDianInvoiceXml } = await import(
    '@/lib/electronic-invoice'
  );

  if (isZipFile(contentType, fileName)) {
    const result = parseInvoiceFromZip(buffer);
    if (result.data) {
      return { data: result.data, pdfBuffer: result.pdf?.buffer };
    }
    if (result.pdf) {
      return { pdfBuffer: result.pdf.buffer };
    }
    return {
      error: 'El ZIP no contiene una factura electrónica XML válida ni un PDF.',
    };
  }

  if (isXmlFile(contentType, fileName)) {
    const xmlText = buffer.toString('utf8');
    const data = parseDianInvoiceXml(xmlText);
    if (data) {
      return { data };
    }
    // Fall back to the text model using the raw XML.
    return { xmlText };
  }

  return { error: 'Formato de factura electrónica no reconocido.' };
}

export async function extractInvoiceData(
  fileOrBuffer: string | Buffer,
  contentTypeHint?: string,
  fileNameHint?: string
): Promise<ExtractionResult> {
  try {
    let buffer: Buffer;
    let contentType: string;
    let fileName: string;
    let isPdf: boolean;

    if (typeof fileOrBuffer === 'string') {
      const response = await fetch(fileOrBuffer);

      if (!response.ok) {
        return {
          success: false,
          error: `Error al obtener archivo: HTTP ${response.status}`,
        };
      }

      contentType = response.headers.get('content-type') || '';
      fileName = fileNameHint || fileNameFromUrl(fileOrBuffer) || '';
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      isPdf = contentType.includes('pdf') || fileName.toLowerCase().endsWith('.pdf');
    } else {
      buffer = fileOrBuffer;
      contentType = contentTypeHint || '';
      fileName = fileNameHint || '';
      isPdf = contentType.includes('pdf') || fileName.toLowerCase().endsWith('.pdf');
    }

    // Detect if response is HTML (error page) instead of a real file
    if (contentType.includes('text/html')) {
      return {
        success: false,
        error: 'La URL del archivo devuelve HTML en lugar del archivo. Verifica que el bucket de Supabase es público.',
      };
    }

    // Electronic invoicing: read the DIAN XML instead of using the AI.
    let preExtractedText: string | undefined;
    if (isElectronicInvoiceFile(contentType, fileName)) {
      const outcome = await tryElectronicInvoice(buffer, contentType, fileName);

      if (outcome.data) {
        return {
          success: true,
          data: outcome.data,
          rawResponse: { source: 'XML', fileName: fileName || undefined },
          source: 'XML',
        };
      }

      if (outcome.pdfBuffer) {
        // ZIP without a usable XML: fall back to the AI using the embedded PDF.
        buffer = outcome.pdfBuffer;
        contentType = 'application/pdf';
        isPdf = true;
      } else if (outcome.xmlText) {
        // Standalone XML that could not be parsed: let the text model try.
        preExtractedText = outcome.xmlText.slice(0, 8000);
      } else {
        return {
          success: false,
          error: outcome.error || 'No se pudieron extraer datos de la factura electrónica',
        };
      }
    }

    let result;

    if (isPdf || preExtractedText) {
      let pdfText: string;
      if (preExtractedText) {
        pdfText = preExtractedText;
      } else {
        const { extractText } = await import('unpdf');

        try {
          const { text } = await extractText(new Uint8Array(buffer));
          pdfText = Array.isArray(text) ? text.join('\n').trim() : String(text).trim();
        } catch (pdfError: any) {
          return { success: false, error: `Error al leer PDF: ${pdfError.message}` };
        }

        if (!pdfText) {
          return { success: false, error: 'El PDF no contiene texto extraíble (puede ser una imagen escaneada)' };
        }
      }

      const message = new HumanMessage(
        `${EXTRACTION_PROMPT}\n\nContenido del documento:\n${pdfText.slice(0, 8000)}`
      );
      result = await invokeWithRateLimitRetry(() => textModel.invoke([message]));
    } else {
      // Send image directly to vision model
      const base64 = buffer.toString('base64');
      const mimeType = contentType || 'image/jpeg';
      const message = new HumanMessage({
        content: [
          { type: 'text', text: EXTRACTION_PROMPT },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
        ],
      });
      result = await invokeWithRateLimitRetry(() => visionModel.invoke([message]));
    }
    const content = result.content.toString();
    const parsed = parseExtractionResponse(content);

    if (parsed.kind === 'invalid') {
      return {
        success: false,
        error: parsed.error,
        rawResponse: parsed.raw,
      };
    }

    if (parsed.kind === 'not-invoice') {
      return {
        success: false,
        isInvoice: false,
        error: `El documento no parece una factura (${parsed.documentType || 'otro'})`,
        rawResponse: parsed.raw,
      };
    }

    if (parsed.kind === 'incomplete') {
      return {
        success: false,
        error: 'Datos incompletos en la extracción',
        rawResponse: parsed.data,
      };
    }

    const data = parsed.data;

    // Validate math (subtotal + iva ≈ total)
    if (data.subtotal && data.iva && data.total) {
      const calculatedTotal = data.subtotal + data.iva;
      const difference = Math.abs(calculatedTotal - data.total);
      const tolerance = data.total * 0.01; // 1%

      if (difference > tolerance) {
        console.warn('Math validation warning:', {
          subtotal: data.subtotal,
          iva: data.iva,
          total: data.total,
          calculatedTotal,
          difference,
        });
      }
    }

    return {
      success: true,
      data,
      rawResponse: data,
      source: 'AI',
    };
  } catch (error: any) {
    console.error('AI extraction error:', error);
    return {
      success: false,
      error: error.message || 'Error al extraer datos con IA',
      rawResponse: error,
      retryable: isRateLimitError(error),
    };
  }
}
