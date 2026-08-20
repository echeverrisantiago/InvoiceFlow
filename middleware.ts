import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/change-password',
    '/login',
    '/register',
    '/api/invoices/:path*',
    '/api/subscriptions/:path*',
    '/api/organization/:path*',
    '/api/email-accounts/:path*',
    '/api/cron/:path*',
  ],
};
