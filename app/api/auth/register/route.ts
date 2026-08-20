import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { authId, email, name, organizationName } = await request.json();

    // Validate input
    if (!authId || !email || !name || !organizationName) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos' },
        { status: 400 }
      );
    }

    // Create user and organization in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          authId,
          email,
          name,
        },
      });

      // Create organization
      const organization = await tx.organization.create({
        data: {
          name: organizationName,
        },
      });

      // Add user as admin member
      await tx.organizationMember.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          role: 'ADMIN',
        },
      });

      // Create initial subscription (trial)
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + 30); // 30 days trial

      await tx.subscription.create({
        data: {
          organizationId: organization.id,
          plan: 'STARTER',
          status: 'TRIALING',
          currentPeriodStart: new Date(),
          currentPeriodEnd: trialEndDate,
        },
      });

      return { user, organization };
    });

    return NextResponse.json({
      success: true,
      user: result.user,
      organization: result.organization,
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al crear cuenta' },
      { status: 500 }
    );
  }
}
