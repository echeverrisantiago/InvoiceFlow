import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/with-tenant';
import { prisma } from '@/lib/prisma';
import { enforceRateLimit, extractOrgLimiter } from '@/lib/ratelimit';
import { runInvoiceExtraction } from '@/lib/invoice-extraction';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getTenantContext();

    if (!context) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const limited = await enforceRateLimit(
      extractOrgLimiter,
      `org:${context.organization.id}`
    );
    if (limited) return limited;

    if (!context.subscription.isActive) {
      return NextResponse.json(
        {
          error:
            'Tu periodo de prueba ha terminado. Suscríbete para continuar.',
          code: 'SUBSCRIPTION_REQUIRED',
        },
        { status: 402 }
      );
    }

    const { id } = await params;

    const invoice = await prisma.invoice.findUnique({
      where: {
        id,
        organizationId: context.organization.id,
      },
      select: { id: true },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: 'Factura no encontrada' },
        { status: 404 }
      );
    }

    const outcome = await runInvoiceExtraction(id, context.organization.nit);

    switch (outcome.kind) {
      case 'extracted':
        return NextResponse.json({
          success: true,
          extracted: outcome.data,
        });

      case 'discarded':
        return NextResponse.json({
          success: false,
          skipped: true,
          reason: 'ISSUED_BY_ORGANIZATION',
          message: outcome.message,
        });

      case 'retry': {
        const minutes = Math.max(
          1,
          Math.round((outcome.nextRetryAt.getTime() - Date.now()) / 60_000)
        );

        return NextResponse.json(
          {
            error: `La IA está temporalmente sin cuota. Reintentaremos automáticamente en ~${minutes} min.`,
            retry: true,
            retryAt: outcome.nextRetryAt.toISOString(),
          },
          { status: 429 }
        );
      }

      case 'failed':
        return NextResponse.json({ error: outcome.error }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Extraction error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al procesar factura' },
      { status: 500 }
    );
  }
}
