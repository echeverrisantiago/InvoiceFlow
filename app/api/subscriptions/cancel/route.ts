import { NextResponse } from 'next/server';
import { getTenantContext, requireAdmin } from '@/lib/with-tenant';
import { cancelPreapproval } from '@/lib/mercadopago';
import { prisma } from '@/lib/prisma';

export async function POST() {
  try {
    const adminError = await requireAdmin();
    if (adminError) return adminError;

    const context = await getTenantContext();
    if (!context) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const organizationId = context.organization.id;

    const subscription = await prisma.subscription.findUnique({
      where: { organizationId },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: 'No hay suscripción activa' },
        { status: 404 }
      );
    }

    if (
      subscription.mercadoPagoSubscriptionId &&
      subscription.status !== 'CANCELED'
    ) {
      try {
        await cancelPreapproval(subscription.mercadoPagoSubscriptionId);
      } catch (error) {
        console.error('Could not cancel preapproval in Mercado Pago:', error);
      }
    }

    // Keep access until the end of the already-paid period.
    await prisma.subscription.update({
      where: { organizationId },
      data: {
        status: 'CANCELED',
        cancelAtPeriodEnd: true,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Cancel subscription error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al cancelar la suscripción' },
      { status: 500 }
    );
  }
}
