import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext, requireAdmin } from '@/lib/with-tenant';
import { updatePreapproval } from '@/lib/mercadopago';
import { prisma } from '@/lib/prisma';
import {
  BillingInterval,
  PlanKey,
  isBillingInterval,
  isPlanKey,
} from '@/types';

/**
 * Programa un cambio de plan para el próximo cobro.
 *
 * No hay prorrateo: el plan actual sigue vigente hasta el final del período
 * pagado y Mercado Pago cobra el nuevo monto en la siguiente renovación.
 */
export async function POST(request: NextRequest) {
  try {
    const adminError = await requireAdmin();
    if (adminError) return adminError;

    const context = await getTenantContext();
    if (!context) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const plan = body?.plan;
    const interval = body?.interval;

    if (!isPlanKey(plan) || !isBillingInterval(interval)) {
      return NextResponse.json(
        { error: 'Plan o periodicidad inválidos' },
        { status: 400 }
      );
    }

    const organizationId = context.organization.id;
    const subscription = await prisma.subscription.findUnique({
      where: { organizationId },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: 'No hay una suscripción para cambiar' },
        { status: 404 }
      );
    }

    if (subscription.status !== 'ACTIVE') {
      return NextResponse.json(
        {
          error:
            'Solo puedes cambiar de plan con una suscripción activa. Si está cancelada o vencida, elige un plan para reactivarla.',
        },
        { status: 400 }
      );
    }

    if (!subscription.mercadoPagoSubscriptionId) {
      return NextResponse.json(
        {
          error:
            'Esta suscripción no tiene una preapproval de Mercado Pago asociada. Contacta a soporte.',
        },
        { status: 400 }
      );
    }

    // Volver al plan actual cancela cualquier cambio pendiente y restaura el
    // monto de la preapproval.
    if (
      subscription.plan === plan &&
      subscription.interval === interval
    ) {
      if (subscription.pendingPlan) {
        await updatePreapproval({
          id: subscription.mercadoPagoSubscriptionId,
          plan: subscription.plan as PlanKey,
          interval: subscription.interval as BillingInterval,
        });
      }

      await prisma.subscription.update({
        where: { organizationId },
        data: {
          pendingPlan: null,
          pendingInterval: null,
          pendingEffectiveAt: null,
        },
      });

      return NextResponse.json({
        success: true,
        pendingPlan: null,
        pendingInterval: null,
        effectiveAt: null,
      });
    }

    const updated = await updatePreapproval({
      id: subscription.mercadoPagoSubscriptionId,
      plan,
      interval,
    });

    const rawNext = (updated as any)?.next_payment_date;
    const parsedNext = rawNext ? new Date(rawNext) : null;
    const effectiveAt =
      parsedNext && !Number.isNaN(parsedNext.getTime())
        ? parsedNext
        : subscription.currentPeriodEnd;

    await prisma.subscription.update({
      where: { organizationId },
      data: {
        pendingPlan: plan,
        pendingInterval: interval,
        pendingEffectiveAt: effectiveAt,
      },
    });

    return NextResponse.json({
      success: true,
      pendingPlan: plan,
      pendingInterval: interval,
      effectiveAt: effectiveAt.toISOString(),
    });
  } catch (error: any) {
    console.error('Change subscription plan error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al cambiar de plan' },
      { status: 500 }
    );
  }
}
