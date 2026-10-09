import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext, requireAdmin } from '@/lib/with-tenant';
import { createSubscriptionPreference } from '@/lib/mercadopago';
import { prisma } from '@/lib/prisma';
import { DEFAULT_PLAN, PlanKey, isPlanKey } from '@/types';

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

    // Create MP preference
    const preference = await createSubscriptionPreference({
      organizationId: context.organization.id,
      email: context.user.email,
      plan,
    });

    // Update subscription intent
    await prisma.subscription.upsert({
      where: {
        organizationId: context.organization.id,
      },
      update: {
        plan,
        status: 'TRIALING',
      },
      create: {
        organizationId: context.organization.id,
        plan,
        status: 'TRIALING',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    return NextResponse.json({
      success: true,
      preferenceId: preference.id,
      initPoint: preference.init_point,
    });
  } catch (error: any) {
    console.error('Create subscription error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al crear suscripción' },
      { status: 500 }
    );
  }
}
