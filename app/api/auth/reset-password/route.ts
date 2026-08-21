import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAdminClient } from '@/lib/supabase/admin';

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { token, password } = parsed.data;

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetToken) {
      return NextResponse.json(
        { error: 'Token inválido', reason: 'invalid' },
        { status: 400 }
      );
    }

    if (resetToken.used) {
      return NextResponse.json(
        { error: 'Este enlace ya fue utilizado', reason: 'invalid' },
        { status: 400 }
      );
    }

    if (new Date() > resetToken.expiresAt) {
      return NextResponse.json(
        { error: 'El enlace ha expirado', reason: 'expired' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: resetToken.email },
      select: { id: true, authId: true, email: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Usuario no encontrado', reason: 'invalid' },
        { status: 400 }
      );
    }

    const supabaseAdmin = getAdminClient();
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.authId,
      { password }
    );

    if (updateError) {
      console.error('Supabase updateUserById error:', updateError);
      return NextResponse.json(
        { error: 'Error al actualizar la contraseña' },
        { status: 500 }
      );
    }

    await prisma.$transaction([
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { passwordChangedAt: new Date() },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
