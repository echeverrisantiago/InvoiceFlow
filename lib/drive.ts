import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_DRIVE_CLIENT_ID,
  process.env.GOOGLE_DRIVE_CLIENT_SECRET,
  process.env.GOOGLE_DRIVE_REDIRECT_URI
);

interface UploadParams {
  fileUrl: string;
  fileName: string;
  refreshToken: string;
}

/**
 * Upload a file to Google Drive
 */
export async function uploadToDrive({
  fileUrl,
  fileName,
  refreshToken,
}: UploadParams): Promise<string> {
  try {
    // Set credentials
    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Fetch file from URL
    const response = await fetch(fileUrl);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Create folder if doesn't exist
    const folderName = 'InvoiceFlow';
    let folderId: string | undefined;

    const folderSearch = await drive.files.list({
      q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
    });

    if (folderSearch.data.files && folderSearch.data.files.length > 0) {
      folderId = folderSearch.data.files[0].id!;
    } else {
      const folder = await drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id',
      });
      folderId = folder.data.id!;
    }

    // Upload file
    const file = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType: response.headers.get('content-type') || 'application/pdf',
        body: buffer,
      },
      fields: 'id',
    });

    if (!file.data.id) {
      throw new Error('No se obtuvo ID del archivo de Drive');
    }

    return file.data.id;
  } catch (error: any) {
    console.error('Google Drive upload error:', error);
    throw new Error(`Error al subir a Drive: ${error.message}`);
  }
}

/**
 * Generate OAuth URL for user authorization
 */
export function getAuthUrl(): string {
  const scopes = ['https://www.googleapis.com/auth/drive.file'];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function getTokensFromCode(code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}
