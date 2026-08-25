import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext, requireAdmin } from '@/lib/with-tenant';
import { createSubscriptionPreference } from '@/lib/mercadopago';
import { prisma } from '@/lib/prisma';

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

    // Create MP preference
    const preference = await createSubscriptionPreference({
      organizationId: context.organization.id,
      email: context.user.email,
    });

    // Update subscription intent
    await prisma.subscription.upsert({
      where: {
        organizationId: context.organization.id,
      },
      update: {
        plan: 'STARTER',
        status: 'TRIALING',
      },
      create: {
        organizationId: context.organization.id,
        plan: 'STARTER',
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
