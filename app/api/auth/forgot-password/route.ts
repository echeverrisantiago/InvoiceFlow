import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { sendPasswordResetEmail } from '@/lib/email';

const forgotPasswordSchema = z.object({
  email: z.string().email('Correo electrónico inválido'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = forgotPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Correo electrónico inválido' },
        { status: 400 }
      );
    }

    const { email } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { email: true, name: true },
    });

    if (user) {
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await prisma.passwordResetToken.create({
        data: {
          email,
          token,
          expiresAt,
        },
      });

      const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`;
      await sendPasswordResetEmail({
        to: email,
        name: user.name || email,
        resetUrl,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Forgot password error:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
