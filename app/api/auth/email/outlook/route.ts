import { NextResponse } from 'next/server';
import { getOutlookAuthUrl } from '@/lib/email-oauth';

export async function GET() {
  const url = getOutlookAuthUrl();
  return NextResponse.redirect(url);
}
