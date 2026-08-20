import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { authId: authUser.id },
      select: {
        id: true,
        email: true,
        isTrialUser: true,
        trialStartedAt: true,
        passwordChangedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    if (user.isTrialUser && !user.passwordChangedAt) {
      const trialExpired =
        user.trialStartedAt &&
        new Date() > new Date(user.trialStartedAt.getTime() + 30 * 24 * 60 * 60 * 1000);

      if (trialExpired) {
        return NextResponse.json({
          trialStatus: 'expired',
          requiresPasswordChange: false,
        });
      }

      return NextResponse.json({
        trialStatus: 'active',
        requiresPasswordChange: true,
      });
    }

    return NextResponse.json({
      trialStatus: user.isTrialUser ? 'completed' : 'none',
      requiresPasswordChange: false,
    });
  } catch (error: any) {
    console.error('Trial status error:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno' },
      { status: 500 }
    );
  }
}
