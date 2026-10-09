import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext, requireAdmin } from '@/lib/with-tenant';
import { cancelPreapproval, createPreapproval } from '@/lib/mercadopago';
import { prisma } from '@/lib/prisma';
import {
  DEFAULT_INTERVAL,
  DEFAULT_PLAN,
  BillingInterval,
  PlanKey,
  isBillingInterval,
  isPlanKey,
} from '@/types';

export async function POST(request: NextRequest) {
  try {
    const adminError = await requireAdmin();
    if (adminError) return adminError;

    const context = await getTenantContext();
    if (!context) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const plan: PlanKey = isPlanKey(body?.plan) ? body.plan : DEFAULT_PLAN;
    const interval: BillingInterval = isBillingInterval(body?.interval)
      ? body.interval
      : DEFAULT_INTERVAL;

    const organizationId = context.organization.id;

    const existing = await prisma.subscription.findUnique({
      where: { organizationId },
    });

    // Cancel & recreate: stop the current recurring charge before creating a new one.
    if (
      existing?.mercadoPagoSubscriptionId &&
      existing.status !== 'CANCELED' &&
      existing.status !== 'TRIALING'
    ) {
      try {
        await cancelPreapproval(existing.mercadoPagoSubscriptionId);
      } catch (error) {
        console.error('Could not cancel previous preapproval:', error);
      }
    }

    // Create the recurring subscription (pending until the buyer authorizes it).
    const preapproval = await createPreapproval({
      organizationId,
      email: context.user.email,
      plan,
      interval,
    });

    const isTrialing = !existing || existing.status === 'TRIALING';

    await prisma.subscription.upsert({
      where: { organizationId },
      update: {
        plan,
        interval,
        mercadoPagoSubscriptionId: preapproval.id ?? null,
        mercadoPagoCustomerId: preapproval.payer_id
          ? String(preapproval.payer_id)
          : undefined,
        ...(isTrialing ? { status: 'TRIALING' as const } : {}),
      },
      create: {
        organizationId,
        plan,
        interval,
        status: 'TRIALING',
        mercadoPagoSubscriptionId: preapproval.id ?? null,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    return NextResponse.json({
      success: true,
      preapprovalId: preapproval.id,
      initPoint: preapproval.init_point,
    });
  } catch (error: any) {
    console.error('Create subscription error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al crear suscripción' },
      { status: 500 }
    );
  }
}
