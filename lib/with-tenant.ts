import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { cache } from 'react';

export interface TenantSubscription {
  status: string;
  plan: string;
  currentPeriodEnd: Date | null;
  isActive: boolean;
  isTrial: boolean;
  requiresRenewal: boolean;
}

export interface TenantContext {
  user: {
    id: string;
    authId: string;
    email: string;
    name: string | null;
  };
  organization: {
    id: string;
    name: string;
    role: 'ADMIN' | 'MEMBER';
  };
  subscription: TenantSubscription;
}

/**
 * Validates that the user is authenticated and belongs to an organization.
 * Also blocks trial users who haven't changed their temporary password.
 * Cached per-request with React cache() — only executes once per request
 * even if called multiple times (middleware, page, API route).
 */
export const getTenantContext = cache(async (): Promise<TenantContext | null> => {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { authId: authUser.id },
    include: {
      memberships: {
        include: { organization: true },
        take: 1,
      },
    },
  });

  if (!user || user.memberships.length === 0) {
    await supabase.auth.signOut();
    return null;
  }

  if (user.isTrialUser && !user.passwordChangedAt) {
    if (user.trialStartedAt) {
      const trialEnd = new Date(user.trialStartedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
      if (new Date() <= trialEnd) {
        return null;
      }
    }
  }

  const membership = user.memberships[0];

  const subscription = await prisma.subscription.findUnique({
    where: { organizationId: membership.organization.id },
  });

  const now = new Date();
  const isTrial = subscription?.status === 'TRIALING';
  const expired =
    !!subscription?.currentPeriodEnd && subscription.currentPeriodEnd < now;
  const isActive = subscription?.status === 'ACTIVE' || (isTrial && !expired);

  return {
    user: {
      id: user.id,
      authId: user.authId,
      email: user.email,
      name: user.name,
    },
    organization: {
      id: membership.organization.id,
      name: membership.organization.name,
      role: membership.role,
    },
    subscription: {
      status: subscription?.status ?? 'NONE',
      plan: subscription?.plan ?? 'STARTER',
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      isActive,
      isTrial,
      requiresRenewal: !isActive,
    },
  };
});

/**
 * Wrapper for API routes that require tenant context.
 * Automatically validates authentication and organization membership.
 */
export async function withTenant<T>(
  handler: (context: TenantContext) => Promise<NextResponse<T>>
): Promise<NextResponse<T | { error: string }>> {
  const context = await getTenantContext();

  if (!context) {
    return NextResponse.json(
      { error: 'No autenticado o sin organización' },
      { status: 401 }
    );
  }

  return handler(context);
}

/**
 * Check if the user has admin role in their organization
 */
export function isAdmin(context: TenantContext): boolean {
  return context.organization.role === 'ADMIN';
}

/**
 * Require admin role for a specific action
 */
export async function requireAdmin(): Promise<
  NextResponse<{ error: string }> | null
> {
  const context = await getTenantContext();

  if (!context) {
    return NextResponse.json(
      { error: 'No autenticado' },
      { status: 401 }
    );
  }

  if (!isAdmin(context)) {
    return NextResponse.json(
      { error: 'Se requieren permisos de administrador' },
      { status: 403 }
    );
  }

  return null;
}
