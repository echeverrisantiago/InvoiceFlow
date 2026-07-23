import { NextRequest, NextResponse } from 'next/server';
import { getGmailTokensFromCode } from '@/lib/email-oauth';
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
          `/dashboard/settings?error=email_auth_failed&message=${error}`,
          request.url
        )
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL(
          '/dashboard/settings?error=email_auth_failed&message=No+code+provided',
          request.url
        )
      );
    }

    const context = await getTenantContext();
    if (!context) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const tokens = await getGmailTokensFromCode(code);

    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        new URL(
          '/dashboard/settings?error=email_auth_failed&message=No+refresh+token+received',
          request.url
        )
      );
    }

    const email = tokens.id_token
      ? JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64').toString()).email
      : null;

    await prisma.emailAccount.deleteMany({
      where: {
        organizationId: context.organization.id,
        provider: { in: ['GMAIL', 'OUTLOOK'] },
      },
    });

    await prisma.emailAccount.create({
      data: {
        organizationId: context.organization.id,
        email: email || 'gmail-user@unknown.com',
        provider: 'GMAIL',
        oauthRefreshToken: tokens.refresh_token,
        oauthAccessToken: tokens.access_token || null,
        oauthTokenExpiry: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : null,
        isActive: true,
      },
    });

    return NextResponse.redirect(
      new URL('/dashboard/settings?success=email_connected&provider=gmail', request.url)
    );
  } catch (error: any) {
    console.error('Gmail callback error:', error);
    return NextResponse.redirect(
      new URL(
        `/dashboard/settings?error=email_auth_failed&message=${encodeURIComponent(error.message)}`,
        request.url
      )
    );
  }
}
