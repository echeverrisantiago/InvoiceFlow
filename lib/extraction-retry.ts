import { prisma } from '@/lib/prisma';

/**
 * Reintentos de extracción ante errores transitorios (cuota de IA, 429...).
 *
 * El intento inicial cuenta como 0 reintentos. Después se programan 3
 * reintentos con espera creciente; el cron los recoge cuando vencen.
 */
export const MAX_EXTRACTION_ATTEMPTS = 4; // intento inicial + 3 reintentos
const RETRY_DELAYS_MINUTES = [5, 15, 60];

export interface ExtractionFailureResult {
  retryScheduled: boolean;
  nextRetryAt: Date | null;
  attempt: number;
}

export async function registerExtractionFailure({
  invoiceId,
  retryable,
  retryCount,
  rawResponse,
}: {
  invoiceId: string;
  retryable: boolean;
  retryCount: number;
  rawResponse: unknown;
}): Promise<ExtractionFailureResult> {
  const attempt = retryCount + 1;
  const canRetry = retryable && attempt < MAX_EXTRACTION_ATTEMPTS;

  const delayMinutes =
    RETRY_DELAYS_MINUTES[
      Math.min(retryCount, RETRY_DELAYS_MINUTES.length - 1)
    ];
  const nextRetryAt = canRetry
    ? new Date(Date.now() + delayMinutes * 60_000)
    : null;

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: 'FAILED',
      extractedData: (rawResponse ?? null) as any,
      retryCount: attempt,
      nextRetryAt,
    },
  });

  return { retryScheduled: canRetry, nextRetryAt, attempt };
}
