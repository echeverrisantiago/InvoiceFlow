import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/with-tenant';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const context = await getTenantContext();
    if (!context) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    await prisma.emailAccount.deleteMany({
      where: {
        organizationId: context.organization.id,
        provider: { in: ['GMAIL', 'OUTLOOK'] },
      },
    });

    return NextResponse.redirect(
      new URL('/dashboard/settings?success=email_disconnected', request.url)
    );
  } catch (error: any) {
    return NextResponse.redirect(
      new URL(
        `/dashboard/settings?error=email_disconnect_failed&message=${encodeURIComponent(error.message)}`,
        request.url
      )
    );
  }
}
