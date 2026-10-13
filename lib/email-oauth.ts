import { google } from 'googleapis';

const GMAIL_SCOPES = [
  'https://mail.google.com/',
  'openid',
  'email',
];

function getGmailOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI
  );
}

export function getGmailAuthUrl(): string {
  const client = getGmailOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: GMAIL_SCOPES,
    prompt: 'consent',
  });
}

export async function getGmailTokensFromCode(code: string) {
  const client = getGmailOAuth2Client();
  const { tokens } = await client.getToken(code);
  return tokens;
}

export interface TokenRefreshResult {
  accessToken: string | null;
  expiryDate: Date | null;
  /** True when the refresh failed because access was revoked/expired. */
  isAuthError: boolean;
  error?: string;
}

export async function refreshGmailAccessToken(
  refreshToken: string
): Promise<TokenRefreshResult> {
  const client = getGmailOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });
  try {
    const { credentials } = await client.refreshAccessToken();
    return {
      accessToken: credentials.access_token ?? null,
      expiryDate: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
      isAuthError: false,
    };
  } catch (error: any) {
    const data = error?.response?.data;
    const code = String(data?.error ?? error?.code ?? '');
    const isAuthError =
      code === 'invalid_grant' ||
      code === 'invalid_client' ||
      code === 'unauthorized_client' ||
      /invalid_grant/i.test(String(error?.message ?? ''));
    return {
      accessToken: null,
      expiryDate: null,
      isAuthError,
      error:
        data?.error_description ||
        error?.message ||
        'Error al refrescar el token de Gmail',
    };
  }
}

const OUTLOOK_AUTHORITY = 'https://login.microsoftonline.com/common';
const OUTLOOK_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

export function getOutlookAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.OUTLOOK_CLIENT_ID || '',
    response_type: 'code',
    redirect_uri: process.env.OUTLOOK_REDIRECT_URI || '',
    response_mode: 'query',
    scope: 'openid profile email offline_access https://outlook.office.com/IMAP.AccessAsUser.All',
    state: 'outlook',
  });
  return `${OUTLOOK_AUTHORITY}/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function getOutlookTokensFromCode(code: string) {
  const body = new URLSearchParams({
    client_id: process.env.OUTLOOK_CLIENT_ID || '',
    client_secret: process.env.OUTLOOK_CLIENT_SECRET || '',
    code,
    redirect_uri: process.env.OUTLOOK_REDIRECT_URI || '',
    grant_type: 'authorization_code',
  });

  const res = await fetch(OUTLOOK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Error al obtener tokens de Outlook: ${err}`);
  }

  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    id_token: data.id_token,
    expiry_date: data.expires_in
      ? Date.now() + data.expires_in * 1000
      : undefined,
  };
}

export async function refreshOutlookAccessToken(
  refreshToken: string
): Promise<TokenRefreshResult> {
  const body = new URLSearchParams({
    client_id: process.env.OUTLOOK_CLIENT_ID || '',
    client_secret: process.env.OUTLOOK_CLIENT_SECRET || '',
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: 'offline_access https://outlook.office.com/IMAP.AccessAsUser.All',
  });

  try {
    const res = await fetch(OUTLOOK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      let parsed: any = {};
      try {
        parsed = JSON.parse(errText);
      } catch {
        /* not JSON */
      }
      const code = String(parsed?.error ?? '');
      const isAuthError =
        code === 'invalid_grant' ||
        code === 'invalid_client' ||
        code === 'unauthorized_client' ||
        /invalid_grant/i.test(errText) ||
        /AADSTS70000|AADSTS50173|AADSTS70008|AADSTS50020/.test(errText);
      return {
        accessToken: null,
        expiryDate: null,
        isAuthError,
        error: parsed?.error_description || errText || 'Error al refrescar token de Outlook',
      };
    }

    const data = await res.json();
    return {
      accessToken: data.access_token ?? null,
      expiryDate: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
      isAuthError: false,
    };
  } catch (error: any) {
    return {
      accessToken: null,
      expiryDate: null,
      isAuthError: false,
      error: error?.message || 'Error de red al refrescar token de Outlook',
    };
  }
}
