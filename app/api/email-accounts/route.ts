import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext, requireAdmin } from '@/lib/with-tenant';
import { prisma } from '@/lib/prisma';
import { encryptPassword } from '@/lib/email-imap';

export async function GET() {
  const context = await getTenantContext();
  if (!context) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const accounts = await prisma.emailAccount.findMany({
    where: { organizationId: context.organization.id },
    select: {
      id: true,
      email: true,
      provider: true,
      imapHost: true,
      imapPort: true,
      imapUsername: true,
      useTls: true,
      isActive: true,
      lastCheckedAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ accounts });
}

export async function POST(request: NextRequest) {
  const adminError = await requireAdmin();
  if (adminError) return adminError;

  const context = await getTenantContext();

  try {
    const body = await request.json();
    const { email, imapHost, imapPort, imapUsername, imapPassword, useTls } = body;

    if (!email || !imapHost || !imapPort || !imapUsername || !imapPassword) {
      return NextResponse.json(
        { error: 'Todos los campos son requeridos' },
        { status: 400 }
      );
    }

    const encryptedPassword = encryptPassword(imapPassword);

    const account = await prisma.emailAccount.create({
      data: {
        organizationId: context!.organization.id,
        email,
        imapHost,
        imapPort,
        imapUsername,
        imapPassword: encryptedPassword,
        useTls: useTls !== false,
      },
      select: {
        id: true,
        email: true,
        imapHost: true,
        imapPort: true,
        imapUsername: true,
        useTls: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, account }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al crear cuenta de email';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
