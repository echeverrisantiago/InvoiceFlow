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

export async function refreshGmailAccessToken(refreshToken: string) {
  const client = getGmailOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await client.refreshAccessToken();
  return {
    accessToken: credentials.access_token,
    expiryDate: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
  };
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

export async function refreshOutlookAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: process.env.OUTLOOK_CLIENT_ID || '',
    client_secret: process.env.OUTLOOK_CLIENT_SECRET || '',
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: 'offline_access https://outlook.office.com/IMAP.AccessAsUser.All',
  });

  const res = await fetch(OUTLOOK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Error al refrescar token de Outlook: ${err}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    expiryDate: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : null,
  };
}
