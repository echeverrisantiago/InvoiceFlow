import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { fetchNewEmails } from '@/lib/email-imap';

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
      prisma.emailAccount.findMany({ where: { isActive: true } }),
      30_000,
      'consulta cuentas activas'
    );

    const results = [];
    const startTime = Date.now();
    const GLOBAL_TIMEOUT = 240_000;

    for (const account of accounts) {
      if (Date.now() - startTime > GLOBAL_TIMEOUT) {
        results.push({
          accountId: account.id,
          email: account.email,
          success: false,
          processed: 0,
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
          errors: result.errors,
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Error desconocido';
        results.push({
          accountId: account.id,
          email: account.email,
          success: false,
          processed: 0,
          errors: [msg],
        });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      accountsProcessed: results.length,
      totalInvoicesCreated: results.reduce((sum, r) => sum + r.processed, 0),
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
