import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/with-tenant';
import { prisma } from '@/lib/prisma';
import { syncPreapproval } from '@/lib/subscription-sync';

/**
 * Estado de la suscripción para la pantalla de confirmación del pago.
 * Antes de responder consulta Mercado Pago, así no hay que esperar al webhook.
 */
export async function GET() {
  const context = await getTenantContext();
  if (!context) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  try {
    await syncPreapproval(context.organization.id);
  } catch (error) {
    console.error('Subscription status sync error:', error);
  }

  const subscription = await prisma.subscription.findUnique({
    where: { organizationId: context.organization.id },
    select: {
      status: true,
      plan: true,
      interval: true,
      currentPeriodEnd: true,
      paymentFailedAt: true,
    },
  });

  return NextResponse.json(
    { subscription },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
