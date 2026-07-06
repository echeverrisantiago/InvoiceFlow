import { NextRequest, NextResponse } from 'next/server';
import { getTokensFromCode } from '@/lib/drive';
import { getTenantContext } from '@/lib/with-tenant';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(
        new URL(
          `/dashboard/settings?error=drive_auth_failed&message=${error}`,
          request.url
        )
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL(
          '/dashboard/settings?error=drive_auth_failed&message=No code provided',
          request.url
        )
      );
    }

    const context = await getTenantContext();

    if (!context) {
      return NextResponse.redirect(
        new URL('/login', request.url)
      );
    }

    // Exchange code for tokens
    const tokens = await getTokensFromCode(code);

    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        new URL(
          '/dashboard/settings?error=drive_auth_failed&message=No refresh token received',
          request.url
        )
      );
    }

    // Save refresh token to organization
    await prisma.organization.update({
      where: {
        id: context.organization.id,
      },
      data: {
        driveRefreshToken: tokens.refresh_token,
        driveTokenExpiry: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : null,
      },
    });

    return NextResponse.redirect(
      new URL(
        '/dashboard/settings?success=drive_connected',
        request.url
      )
    );
  } catch (error: any) {
    console.error('Drive callback error:', error);
    return NextResponse.redirect(
      new URL(
        `/dashboard/settings?error=drive_auth_failed&message=${encodeURIComponent(
          error.message
        )}`,
        request.url
      )
    );
  }
}
