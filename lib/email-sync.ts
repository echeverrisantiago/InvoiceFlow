import { fetchNewGmailEmails } from '@/lib/email-gmail';
import { fetchNewGraphEmails } from '@/lib/email-graph';
import type { EmailAccountConfig } from '@/lib/email-file';

export interface FetchEmailsResult {
  success: boolean;
  processed: number;
  skipped: number;
  errors: string[];
}

/**
 * Importa facturas nuevas de una cuenta de correo.
 *
 * - Gmail: Gmail API (solo lectura, `gmail.readonly`).
 * - Outlook: Microsoft Graph (solo lectura, `Mail.Read`).
 */
export async function fetchNewEmails(
  config: EmailAccountConfig
): Promise<FetchEmailsResult> {
  if (config.provider === 'GMAIL') {
    return fetchNewGmailEmails(config);
  }

  if (config.provider === 'OUTLOOK') {
    return fetchNewGraphEmails(config);
  }

  return {
    success: false,
    processed: 0,
    skipped: 0,
    errors: ['Proveedor de correo no soportado'],
  };
}
