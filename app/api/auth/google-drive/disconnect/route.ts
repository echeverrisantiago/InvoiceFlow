import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/with-tenant';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const context = await getTenantContext();

    if (!context) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    await prisma.organization.update({
      where: { id: context.organization.id },
      data: {
        driveRefreshToken: null,
        driveTokenExpiry: null,
      },
    });

    return NextResponse.redirect(
      new URL('/dashboard/settings?success=drive_disconnected', request.url)
    );
  } catch (error: any) {
    console.error('Drive disconnect error:', error);
    return NextResponse.redirect(
      new URL(
        `/dashboard/settings?error=drive_disconnect_failed&message=${encodeURIComponent(error.message)}`,
        request.url
      )
    );
  }
}
