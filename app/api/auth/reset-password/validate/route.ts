import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  enforceRateLimit,
  getClientIp,
  resetPasswordIpLimiter,
} from '@/lib/ratelimit';

export async function GET(request: NextRequest) {
  const limited = await enforceRateLimit(
    resetPasswordIpLimiter,
    `ip:${getClientIp(request)}`
  );
  if (limited) return limited;

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
