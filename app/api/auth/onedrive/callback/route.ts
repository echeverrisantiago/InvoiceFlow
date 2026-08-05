import { NextRequest, NextResponse } from 'next/server';
import { getOneDriveTokensFromCode } from '@/lib/onedrive';
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
          `/dashboard/settings?error=onedrive_auth_failed&message=${error}`,
          request.url
        )
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL(
          '/dashboard/settings?error=onedrive_auth_failed&message=No code provided',
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

    const tokens = await getOneDriveTokensFromCode(code);

    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        new URL(
          '/dashboard/settings?error=onedrive_auth_failed&message=No refresh token received',
          request.url
        )
      );
    }

    await prisma.organization.update({
      where: {
        id: context.organization.id,
      },
      data: {
        onedriveRefreshToken: tokens.refresh_token,
        onedriveTokenExpiry: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : null,
      },
    });

    return NextResponse.redirect(
      new URL(
        '/dashboard/settings?success=onedrive_connected',
        request.url
      )
    );
  } catch (error: any) {
    console.error('OneDrive callback error:', error);
    return NextResponse.redirect(
      new URL(
        `/dashboard/settings?error=onedrive_auth_failed&message=${encodeURIComponent(
          error.message
        )}`,
        request.url
      )
    );
  }
}
