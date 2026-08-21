import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAdminClient } from '@/lib/supabase/admin';
import { sendActivationEmail } from '@/lib/email';
import { generateTemporaryPassword } from '@/lib/utils';

const allowedOrigins = [
  'https://landing.factumeia.com',
  'https://factumeia.com',
  'http://localhost:3000',
];

function corsHeaders(request: NextRequest) {
  const origin = request.headers.get('origin') || '';
  const allowed = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

const trialRegisterSchema = z.object({
  fullName: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string().email('Correo electrónico inválido'),
  phone: z.string().min(7, 'El teléfono debe tener al menos 7 dígitos'),
  company: z.string().optional(),
});

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = trialRegisterSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
        { status: 400, headers: corsHeaders(request) }
      );
    }

    const { fullName, email, phone, company } = parsed.data;

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'El correo electrónico ya está registrado' },
        { status: 409, headers: corsHeaders(request) }
      );
    }

    const temporaryPassword = generateTemporaryPassword(16);
    const supabaseAdmin = getAdminClient();

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        name: fullName,
        phone,
        company: company || null,
      },
    });

    if (authError) {
      console.error('Supabase admin createUser error:', authError);
      return NextResponse.json(
        { error: 'Error al crear el usuario en el sistema de autenticación' },
        { status: 500, headers: corsHeaders(request) }
      );
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'No se pudo crear el usuario' },
        { status: 500, headers: corsHeaders(request) }
      );
    }

    const trialStartDate = new Date();
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 30);

    const organizationName = company || fullName;

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          authId: authData.user.id,
          email,
          name: fullName,
          phone,
          isTrialUser: true,
          trialStartedAt: trialStartDate,
        },
      });

      const organization = await tx.organization.create({
        data: {
          name: organizationName,
        },
      });

      await tx.organizationMember.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          role: 'ADMIN',
        },
      });

      await tx.subscription.create({
        data: {
          organizationId: organization.id,
          plan: 'STARTER',
          status: 'TRIALING',
          currentPeriodStart: trialStartDate,
          currentPeriodEnd: trialEndDate,
        },
      });
    });

    await sendActivationEmail({
      to: email,
      name: fullName,
      temporaryPassword,
    });

    return NextResponse.json({
      success: true,
      message: 'Usuario creado exitosamente. Se ha enviado un correo de activación.',
    }, { headers: corsHeaders(request) });
  } catch (error: any) {
    console.error('Trial register error:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}
