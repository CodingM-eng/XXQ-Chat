import { Readable } from 'stream';
import { config } from '../config.js';
import { decryptSecret, encryptSecret } from '../utils/crypto.js';
import { dataStore } from '../db/index.js';
import { DbDriveAccount } from '../db/types.js';

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';

export class GoogleDriveService {
  /**
   * Generates Google OAuth 2.0 Authorization URL with least-privilege drive.file scope.
   */
  static getAuthUrl(state?: string, overrideConfig?: { clientId?: string; redirectUri?: string }): string {
    const clientId = overrideConfig?.clientId || config.GOOGLE_DRIVE_CLIENT_ID;
    const redirectUri = overrideConfig?.redirectUri || config.GOOGLE_DRIVE_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      throw new Error('Google Drive API istemci kimliği (CLIENT_ID) veya yönlendirme adresi (REDIRECT_URI) yapılandırılmamış.');
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: DRIVE_FILE_SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      ...(state ? { state } : {}),
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Exchanges authorization code for tokens, initializes XXQ Chat folder, and returns drive account details.
   */
  static async exchangeCodeAndConnect(code: string): Promise<DbDriveAccount> {
    const clientId = config.GOOGLE_DRIVE_CLIENT_ID;
    const clientSecret = config.GOOGLE_DRIVE_CLIENT_SECRET;
    const redirectUri = config.GOOGLE_DRIVE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Google Drive OAuth kimlik bilgileri eksik.');
    }

    // 1. Exchange code for access & refresh tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('[DRIVE] Token exchange error:', errBody);
      throw new Error(`Google Drive yetkilendirme kodu doğrulanamadı: ${tokenRes.status}`);
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    if (!tokenData.refresh_token) {
      throw new Error('Google Drive yenileme belirteci (refresh_token) alınamadı. Lütfen erişim iznini kaldırıp tekrar deneyin.');
    }

    // 2. Fetch user email for this Google account
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    let email = 'bilinmeyen-drive@gmail.com';
    let displayName = 'Google Drive';

    if (userRes.ok) {
      const userData = (await userRes.json()) as any;
      if (userData.email) email = userData.email;
      if (userData.name) displayName = userData.name;
    }

    // 3. Encrypt refresh token
    const encryptedRefreshToken = encryptSecret(tokenData.refresh_token);

    // 4. Create or locate dedicated 'XXQ Chat' folder in Drive
    const folderId = await this.ensureAppFolder(tokenData.access_token);

    // 5. Get storage quota
    const quota = await this.fetchQuota(tokenData.access_token);

    // 6. Save in database
    const driveAccount = await dataStore.addDriveAccount({
      email,
      displayName,
      encryptedRefreshToken,
      folderId,
      spaceUsed: quota.spaceUsed,
      spaceTotal: quota.spaceTotal,
    });

    return driveAccount;
  }

  /**
   * Refreshes access token for a given drive account.
   */
  static async getAccessToken(account: DbDriveAccount): Promise<string> {
    const clientId = config.GOOGLE_DRIVE_CLIENT_ID;
    const clientSecret = config.GOOGLE_DRIVE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Google Drive API istemci bilgileri eksik.');
    }

    const refreshToken = decryptSecret(account.encryptedRefreshToken);

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[DRIVE] Refresh token error:', errText);
      throw new Error('Google Drive erişim belirteci yenilenemedi.');
    }

    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  }

  /**
   * Ensures the 'XXQ Chat' folder exists on Google Drive.
   */
  static async ensureAppFolder(accessToken: string): Promise<string> {
    // Search for existing 'XXQ Chat' folder
    const searchParams = new URLSearchParams({
      q: "name = 'XXQ Chat' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: 'files(id, name)',
    });

    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?${searchParams.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (searchRes.ok) {
      const data = (await searchRes.json()) as { files?: Array<{ id: string; name: string }> };
      if (data.files && data.files.length > 0) {
        return data.files[0].id;
      }
    }

    // Create folder if not found
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'XXQ Chat',
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });

    if (!createRes.ok) {
      throw new Error('XXQ Chat Google Drive klasörü oluşturulamadı.');
    }

    const folderData = (await createRes.json()) as { id: string };
    return folderData.id;
  }

  /**
   * Fetches storage quota for the drive account.
   */
  static async fetchQuota(accessToken: string): Promise<{ spaceUsed: number; spaceTotal: number }> {
    try {
      const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        const usage = Number(data?.storageQuota?.usage || 0);
        const limit = Number(data?.storageQuota?.limit || 0);
        return { spaceUsed: usage, spaceTotal: limit };
      }
    } catch (err) {
      console.warn('[DRIVE] Could not fetch storage quota:', err);
    }
    return { spaceUsed: 0, spaceTotal: 0 };
  }

  /**
   * Uploads a file to Google Drive using multipart upload.
   */
  static async uploadFile(
    account: DbDriveAccount,
    file: {
      buffer: Buffer;
      fileName: string;
      mimeType: string;
    }
  ): Promise<{ driveFileId: string; size: number }> {
    const accessToken = await this.getAccessToken(account);

    const folderId = account.folderId || (await this.ensureAppFolder(accessToken));

    const metadata = {
      name: file.fileName,
      parents: [folderId],
    };

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadataHeader = delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata);

    const fileHeader = delimiter +
      `Content-Type: ${file.mimeType || 'application/octet-stream'}\r\n\r\n`;

    const body = Buffer.concat([
      Buffer.from(metadataHeader, 'utf8'),
      Buffer.from(fileHeader, 'utf8'),
      file.buffer,
      Buffer.from(closeDelimiter, 'utf8'),
    ]);

    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(body.length),
      },
      body,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error('[DRIVE] Upload failed:', errText);
      throw new Error(`Google Drive dosyası yüklenemedi: ${uploadRes.status}`);
    }

    const uploaded = (await uploadRes.json()) as { id: string; size?: string };
    const size = uploaded.size ? Number(uploaded.size) : file.buffer.length;

    // Refresh quota in background
    this.fetchQuota(accessToken).then((q) => {
      dataStore.updateDriveAccountQuota(account.id, q.spaceUsed, q.spaceTotal).catch(() => {});
    }).catch(() => {});

    return {
      driveFileId: uploaded.id,
      size,
    };
  }

  /**
   * Streams a file from Google Drive.
   */
  static async getFileStream(
    account: DbDriveAccount,
    driveFileId: string
  ): Promise<{ stream: Readable; mimeType: string; fileName: string; size?: number }> {
    const accessToken = await this.getAccessToken(account);

    // 1. Get file metadata
    const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?fields=id,name,mimeType,size`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!metaRes.ok) {
      throw new Error('Drive dosya bilgisi alınamadı.');
    }

    const meta = (await metaRes.json()) as { name: string; mimeType: string; size?: string };

    // 2. Get file content
    const contentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!contentRes.ok) {
      throw new Error('Drive dosya içeriği indirilemedi.');
    }

    if (!contentRes.body) {
      throw new Error('Dosya içeriği boş.');
    }

    // Convert web ReadableStream to node Readable
    const nodeStream = Readable.fromWeb(contentRes.body as any);

    return {
      stream: nodeStream,
      mimeType: meta.mimeType || 'application/octet-stream',
      fileName: meta.name || 'dosya',
      size: meta.size ? Number(meta.size) : undefined,
    };
  }

  /**
   * Deletes a file from Google Drive.
   */
  static async deleteFile(account: DbDriveAccount, driveFileId: string): Promise<boolean> {
    try {
      const accessToken = await this.getAccessToken(account);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return res.ok || res.status === 404;
    } catch (err) {
      console.error('[DRIVE] Delete file error:', err);
      return false;
    }
  }
}
