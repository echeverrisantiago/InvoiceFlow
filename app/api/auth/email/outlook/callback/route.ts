import { NextRequest, NextResponse } from 'next/server';
import { getOutlookTokensFromCode } from '@/lib/email-oauth';
import { getTenantContext } from '@/lib/with-tenant';
import { getEmailAccountQuota } from '@/lib/plans';
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

    const tokens = await getOutlookTokensFromCode(code);

    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        new URL(
          '/dashboard/settings?error=email_auth_failed&message=No+refresh+token+received',
          request.url
        )
      );
    }

    const emailFromToken = tokens.id_token
      ? JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64').toString()).email
      : null;

    const organizationId = context.organization.id;

    // Reconnecting an already linked mailbox just refreshes its tokens.
    const existing = emailFromToken
      ? await prisma.emailAccount.findFirst({
          where: { organizationId, email: emailFromToken },
        })
      : null;

    if (existing) {
      await prisma.emailAccount.update({
        where: { id: existing.id },
        data: {
          provider: 'OUTLOOK',
          oauthRefreshToken: tokens.refresh_token,
          oauthAccessToken: tokens.access_token || null,
          oauthTokenExpiry: tokens.expiry_date
            ? new Date(tokens.expiry_date)
            : null,
          isActive: true,
        },
      });
    } else {
      const quota = await getEmailAccountQuota(organizationId);
      if (!quota.allowed) {
        return NextResponse.redirect(
          new URL(
            '/dashboard/settings?error=email_limit_reached&limit=' + quota.limit,
            request.url
          )
        );
      }

      await prisma.emailAccount.create({
        data: {
          organizationId,
          email: emailFromToken || 'outlook-user@unknown.com',
          provider: 'OUTLOOK',
          oauthRefreshToken: tokens.refresh_token,
          oauthAccessToken: tokens.access_token || null,
          oauthTokenExpiry: tokens.expiry_date
            ? new Date(tokens.expiry_date)
            : null,
          isActive: true,
        },
      });
    }

    return NextResponse.redirect(
      new URL('/dashboard/settings?success=email_connected&provider=outlook', request.url)
    );
  } catch (error: any) {
    console.error('Outlook callback error:', error);
    return NextResponse.redirect(
      new URL(
        `/dashboard/settings?error=email_auth_failed&message=${encodeURIComponent(error.message)}`,
        request.url
      )
    );
  }
}
