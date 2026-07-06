import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

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
}

/**
 * Validates that the user is authenticated and belongs to an organization.
 * Returns the tenant context with user and organization info.
 */
export async function getTenantContext(): Promise<TenantContext | null> {
  const supabase = await createClient();

  // Check authentication
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return null;
  }

  // Get user from database
  const user = await prisma.user.findUnique({
    where: { authId: authUser.id },
    include: {
      memberships: {
        include: {
          organization: true,
        },
        take: 1, // For MVP, we only support one organization per user
      },
    },
  });

  if (!user || user.memberships.length === 0) {
    // If the user is authenticated in Supabase but has no DB record,
    // sign them out to prevent redirect loops (dashboard → login → dashboard...)
    if (authUser) {
      await supabase.auth.signOut();
    }
    return null;
  }

  const membership = user.memberships[0];

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
  };
}

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
