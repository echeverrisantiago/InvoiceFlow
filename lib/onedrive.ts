const ONEDRIVE_AUTHORITY = 'https://login.microsoftonline.com/common';
const ONEDRIVE_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

const SCOPES = [
  'Files.ReadWrite',
  'offline_access',
].join(' ');

export function getOneDriveAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.OUTLOOK_CLIENT_ID || '',
    response_type: 'code',
    redirect_uri: process.env.OUTLOOK_ONEDRIVE_REDIRECT_URI || '',
    response_mode: 'query',
    scope: SCOPES,
  });
  return `${ONEDRIVE_AUTHORITY}/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function getOneDriveTokensFromCode(code: string) {
  const body = new URLSearchParams({
    client_id: process.env.OUTLOOK_CLIENT_ID || '',
    client_secret: process.env.OUTLOOK_CLIENT_SECRET || '',
    code,
    redirect_uri: process.env.OUTLOOK_ONEDRIVE_REDIRECT_URI || '',
    grant_type: 'authorization_code',
  });

  const res = await fetch(ONEDRIVE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Error al obtener tokens de OneDrive: ${err}`);
  }

  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry_date: data.expires_in
      ? Date.now() + data.expires_in * 1000
      : undefined,
  };
}

export async function refreshOneDriveAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: process.env.OUTLOOK_CLIENT_ID || '',
    client_secret: process.env.OUTLOOK_CLIENT_SECRET || '',
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: 'Files.ReadWrite offline_access',
  });

  const res = await fetch(ONEDRIVE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Error al refrescar token de OneDrive: ${err}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    expiryDate: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : null,
  };
}

interface UploadParams {
  fileUrl: string;
  fileName: string;
  refreshToken: string;
}

export async function uploadToOneDrive({
  fileUrl,
  fileName,
  refreshToken,
}: UploadParams): Promise<string> {
  const tokenData = await refreshOneDriveAccessToken(refreshToken);
  const accessToken = tokenData.accessToken;

  const response = await fetch(fileUrl);
  const arrayBuffer = await response.arrayBuffer();

  const folderName = 'FactuMeIA';
  const folderId = await ensureFolderExists(accessToken, folderName);

  const fileBuffer = Buffer.from(arrayBuffer);
  const uploadUrl = `${GRAPH_API_BASE}/me/drive/items/${folderId}:/${fileName}:/content`;

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': response.headers.get('content-type') || 'application/pdf',
    },
    body: fileBuffer,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Error al subir a OneDrive: ${err}`);
  }

  const data = await uploadRes.json();
  return data.id;
}

async function ensureFolderExists(accessToken: string, folderName: string): Promise<string> {
  const searchRes = await fetch(
    `${GRAPH_API_BASE}/me/drive/root/children?$filter=name eq '${folderName}' and folder ne null`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (searchRes.ok) {
    const data = await searchRes.json();
    if (data.value && data.value.length > 0) {
      return data.value[0].id;
    }
  }

  const createRes = await fetch(`${GRAPH_API_BASE}/me/drive/root/children`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'rename',
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Error al crear carpeta en OneDrive: ${err}`);
  }

  const data = await createRes.json();
  return data.id;
}
