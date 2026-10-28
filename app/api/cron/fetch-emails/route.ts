import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { fetchNewEmails } from '@/lib/email-sync';
import { isSubscriptionActive } from '@/lib/subscription-status';
import { runInvoiceExtraction } from '@/lib/invoice-extraction';
import { MAX_EXTRACTION_ATTEMPTS } from '@/lib/extraction-retry';

export const maxDuration = 240;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timeout tras ${ms}ms: ${label}`));
    }, ms);
  });
  try {
    const result = await Promise.race([promise, timeout]);
    clearTimeout(timer!);
    return result;
  } catch (e) {
    clearTimeout(timer!);
    throw e;
  }
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const accounts = await withTimeout(
      prisma.emailAccount.findMany({
        where: { isActive: true },
        include: {
          organization: { include: { subscription: true } },
        },
      }),
      30_000,
      'consulta cuentas activas'
    );

    const now = new Date();
    const activeAccounts = accounts.filter((account) =>
      isSubscriptionActive(account.organization.subscription, now)
    );

    const results = [];
    const startTime = Date.now();
    const GLOBAL_TIMEOUT = 240_000;

    for (const account of activeAccounts) {
      if (Date.now() - startTime > GLOBAL_TIMEOUT) {
        results.push({
          accountId: account.id,
          email: account.email,
          success: false,
          processed: 0,
          skipped: 0,
          errors: ['Timeout global alcanzado'],
        });
        continue;
      }

      try {
        const result = await fetchNewEmails(account);
        results.push({
          accountId: account.id,
          email: account.email,
          success: result.success,
          processed: result.processed,
          skipped: result.skipped,
          errors: result.errors,
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Error desconocido';
        results.push({
          accountId: account.id,
          email: account.email,
          success: false,
          processed: 0,
          skipped: 0,
          errors: [msg],
        });
      }
    }

    // Reintentos de extracción programados (cuota de IA agotada, 429...).
    const retryCandidates = await withTimeout(
      prisma.invoice.findMany({
        where: {
          status: 'FAILED',
          nextRetryAt: { not: null, lte: new Date() },
          retryCount: { lt: MAX_EXTRACTION_ATTEMPTS },
        },
        select: {
          id: true,
          retryCount: true,
          organization: {
            select: { nit: true, subscription: true },
          },
        },
        orderBy: { nextRetryAt: 'asc' },
        take: 10,
      }),
      30_000,
      'consulta reintentos de extracción'
    );

    const retries: Array<{
      invoiceId: string;
      result: string;
      error?: string;
    }> = [];

    for (const candidate of retryCandidates) {
      if (Date.now() - startTime > GLOBAL_TIMEOUT) break;
      if (!isSubscriptionActive(candidate.organization.subscription, new Date())) {
        continue;
      }

      try {
        const outcome = await runInvoiceExtraction(
          candidate.id,
          candidate.organization.nit
        );
        retries.push({ invoiceId: candidate.id, result: outcome.kind });
      } catch (error: unknown) {
        retries.push({
          invoiceId: candidate.id,
          result: 'error',
          error: error instanceof Error ? error.message : 'Error desconocido',
        });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      timestampLocal: new Date().toLocaleString('es-CO', {
        timeZone: 'America/Bogota',
      }),
      accountsProcessed: results.length,
      totalInvoicesCreated: results.reduce((sum, r) => sum + r.processed, 0),
      totalInvoicesSkipped: results.reduce((sum, r) => sum + r.skipped, 0),
      retriesProcessed: retries.length,
      retries,
      details: results,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al procesar emails';
    console.error('Fetch emails cron error:', error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
