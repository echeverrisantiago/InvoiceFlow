import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext, requireAdmin } from '@/lib/with-tenant';
import { prisma } from '@/lib/prisma';
import { decryptPassword, testImapConnection } from '@/lib/email-imap';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminError = await requireAdmin();
  if (adminError) return adminError;

  const context = await getTenantContext();
  const { id } = await params;

  const account = await prisma.emailAccount.findUnique({
    where: { id, organizationId: context!.organization.id },
  });

  if (!account) {
    return NextResponse.json(
      { error: 'Cuenta de email no encontrada' },
      { status: 404 }
    );
  }

  if (!account.imapPassword) {
    return NextResponse.json(
      { error: 'Esta cuenta no tiene contraseña IMAP configurada' },
      { status: 400 }
    );
  }

  if (account.provider === 'GMAIL' || account.provider === 'OUTLOOK') {
    const { testImapConnection: testOAuth } = await import('@/lib/email-imap');
    const result = await testOAuth({
      provider: account.provider,
      email: account.email,
      accessToken: account.oauthAccessToken || undefined,
    });
    if (result.success) {
      return NextResponse.json({ success: true, message: 'Conexión exitosa' });
    } else {
      return NextResponse.json(
        { success: false, error: result.error || 'Error de conexión' },
        { status: 400 }
      );
    }
  }

  const password = decryptPassword(account.imapPassword);

  const result = await testImapConnection({
    imapHost: account.imapHost || undefined,
    imapPort: account.imapPort || undefined,
    imapUsername: account.imapUsername || undefined,
    imapPassword: password,
    useTls: account.useTls,
  });

  if (result.success) {
    return NextResponse.json({ success: true, message: 'Conexión exitosa' });
  } else {
    return NextResponse.json(
      { success: false, error: result.error || 'Error de conexión' },
      { status: 400 }
    );
  }
}
