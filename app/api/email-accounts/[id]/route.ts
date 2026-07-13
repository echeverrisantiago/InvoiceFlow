import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext, requireAdmin } from '@/lib/with-tenant';
import { prisma } from '@/lib/prisma';
import { encryptPassword } from '@/lib/email-imap';

async function getAccount(id: string, organizationId: string) {
  return prisma.emailAccount.findUnique({
    where: { id, organizationId },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminError = await requireAdmin();
  if (adminError) return adminError;

  const context = await getTenantContext();
  const { id } = await params;

  const existing = await getAccount(id, context!.organization.id);
  if (!existing) {
    return NextResponse.json(
      { error: 'Cuenta de email no encontrada' },
      { status: 404 }
    );
  }

  try {
    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.email !== undefined) updateData.email = body.email;
    if (body.imapHost !== undefined) updateData.imapHost = body.imapHost;
    if (body.imapPort !== undefined) updateData.imapPort = body.imapPort;
    if (body.imapUsername !== undefined) updateData.imapUsername = body.imapUsername;
    if (body.useTls !== undefined) updateData.useTls = body.useTls;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    if (body.imapPassword) {
      updateData.imapPassword = encryptPassword(body.imapPassword);
    }

    const account = await prisma.emailAccount.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        imapHost: true,
        imapPort: true,
        imapUsername: true,
        useTls: true,
        isActive: true,
        lastCheckedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, account });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al actualizar cuenta de email';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminError = await requireAdmin();
  if (adminError) return adminError;

  const context = await getTenantContext();
  const { id } = await params;

  const existing = await getAccount(id, context!.organization.id);
  if (!existing) {
    return NextResponse.json(
      { error: 'Cuenta de email no encontrada' },
      { status: 404 }
    );
  }

  await prisma.emailAccount.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
