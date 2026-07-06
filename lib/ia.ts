import { ChatGroq } from '@langchain/groq';
import { HumanMessage } from '@langchain/core/messages';
import type { ExtractionResult, InvoiceData } from '@/types';

// Vision model for images
const visionModel = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY!,
  model: 'llama-3.2-11b-vision-preview',
  temperature: 0,
});

// Text model for PDFs
const textModel = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY!,
  model: 'llama-3.3-70b-versatile',
  temperature: 0,
});

const EXTRACTION_PROMPT = `Eres un asistente experto en extraer información de facturas colombianas. Analiza la factura proporcionada y extrae los siguientes datos en formato JSON:

{
  "supplier": "Nombre del proveedor/emisor",
  "supplierNit": "NIT del proveedor (solo números y dígito de verificación)",
  "issueDate": "Fecha de emisión (formato ISO: YYYY-MM-DD)",
  "dueDate": "Fecha de vencimiento (formato ISO: YYYY-MM-DD)",
  "subtotal": monto subtotal (número sin símbolos),
  "iva": monto IVA (número sin símbolos),
  "total": monto total (número sin símbolos),
  "description": "Descripción breve de los productos/servicios"
}

IMPORTANTE:
- Fechas en formato colombiano suelen ser DD/MM/YYYY - conviértelas a YYYY-MM-DD
- Si no encuentras la fecha de vencimiento, calcula 30 días después de la fecha de emisión
- Montos deben ser números sin puntos, comas ni símbolos (ej: 150000 no 150.000)
- NIT debe incluir dígito de verificación si está disponible
- Si falta algún dato, usa null
- Valida que subtotal + iva ≈ total (con tolerancia del 1%)

Responde SOLO con el JSON, sin texto adicional.`;

export async function extractInvoiceData(
  fileUrl: string
): Promise<ExtractionResult> {
  try {
    const response = await fetch(fileUrl);

    if (!response.ok) {
      return {
        success: false,
        error: `Error al obtener archivo: HTTP ${response.status}`,
      };
    }

    const contentType = response.headers.get('content-type') || '';

    // Detect if response is HTML (error page) instead of a real file
    if (contentType.includes('text/html')) {
      return {
        success: false,
        error: 'La URL del archivo devuelve HTML en lugar del archivo. Verifica que el bucket de Supabase es público.',
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const isPdf = contentType.includes('pdf') || fileUrl.toLowerCase().includes('.pdf');

    let result;

    if (isPdf) {
      const { extractText } = await import('unpdf');

      let pdfText: string;
      try {
        const { text } = await extractText(new Uint8Array(buffer));
        pdfText = Array.isArray(text) ? text.join('\n').trim() : String(text).trim();
      } catch (pdfError: any) {
        return { success: false, error: `Error al leer PDF: ${pdfError.message}` };
      }

      if (!pdfText) {
        return { success: false, error: 'El PDF no contiene texto extraíble (puede ser una imagen escaneada)' };
      }

      const message = new HumanMessage(
        `${EXTRACTION_PROMPT}\n\nContenido del PDF:\n${pdfText.slice(0, 8000)}`
      );
      result = await textModel.invoke([message]);
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
      result = await visionModel.invoke([message]);
    }
    const content = result.content.toString();

    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        success: false,
        error: 'No se pudo extraer JSON de la respuesta',
        rawResponse: content,
      };
    }

    const data: InvoiceData = JSON.parse(jsonMatch[0]);

    // Validate data
    if (!data.supplier || !data.total) {
      return {
        success: false,
        error: 'Datos incompletos en la extracción',
        rawResponse: data,
      };
    }

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
    };
  } catch (error: any) {
    console.error('AI extraction error:', error);
    return {
      success: false,
      error: error.message || 'Error al extraer datos con IA',
      rawResponse: error,
    };
  }
}
