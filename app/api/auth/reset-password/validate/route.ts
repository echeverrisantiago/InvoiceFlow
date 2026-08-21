import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');

    if (!token) {
      return NextResponse.json({ valid: false, reason: 'invalid' });
    }

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetToken) {
      return NextResponse.json({ valid: false, reason: 'invalid' });
    }

    if (resetToken.used) {
      return NextResponse.json({ valid: false, reason: 'invalid' });
    }

    if (new Date() > resetToken.expiresAt) {
      return NextResponse.json({ valid: false, reason: 'expired' });
    }

    return NextResponse.json({ valid: true });
  } catch (error: any) {
    console.error('Validate reset token error:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno' },
      { status: 500 }
    );
  }
}
