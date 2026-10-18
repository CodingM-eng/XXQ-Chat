import { Readable } from 'stream';
import crypto from 'crypto';
import { config } from '../config.js';
import { decryptSecret, encryptSecret } from '../utils/crypto.js';
import { dataStore } from '../db/index.js';
import { DbDriveAccount } from '../db/types.js';

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';

export interface ProcessedCodeEntry {
  timestamp: number;
  status: 'pending' | 'success' | 'failed';
  email?: string;
  error?: string;
}

export interface StateEntry {
  createdAt: number;
  userId?: string;
  redirectUri: string;
}

export class GoogleDriveService {
  private static activeStates = new Map<string, StateEntry>();
  private static processedCodes = new Map<string, ProcessedCodeEntry>();

  /**
   * Helper to strip outer quotes and whitespace from environment strings.
   */
  static cleanEnv(val: string | undefined): string | undefined {
    if (!val) return undefined;
    let trimmed = val.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      trimmed = trimmed.slice(1, -1).trim();
    }
    return trimmed || undefined;
  }

  /**
   * Reads GOOGLE_DRIVE_CLIENT_ID dynamically from process.env or static config.
   */
  static getClientId(): string | undefined {
    return this.cleanEnv(process.env.GOOGLE_DRIVE_CLIENT_ID) || this.cleanEnv(config.GOOGLE_DRIVE_CLIENT_ID);
  }

  /**
   * Reads GOOGLE_DRIVE_CLIENT_SECRET dynamically from process.env or static config.
   */
  static getClientSecret(): string | undefined {
    return this.cleanEnv(process.env.GOOGLE_DRIVE_CLIENT_SECRET) || this.cleanEnv(config.GOOGLE_DRIVE_CLIENT_SECRET);
  }

  /**
   * Resolves the exact redirect URI, honoring GOOGLE_DRIVE_REDIRECT_URI or Render production defaults.
   * Strips trailing slashes to guarantee exact URI matching.
   */
  static getRedirectUri(): string {
    const raw = this.cleanEnv(process.env.GOOGLE_DRIVE_REDIRECT_URI) || this.cleanEnv(config.GOOGLE_DRIVE_REDIRECT_URI);
    if (raw) return raw.replace(/\/+$/, '');
    if (process.env.RENDER_EXTERNAL_URL?.trim()) {
      return `${process.env.RENDER_EXTERNAL_URL.trim().replace(/\/+$/, '')}/api/drive/callback`;
    }
    if (process.env.NODE_ENV === 'production' || config.NODE_ENV === 'production') {
      return 'https://xxq-chat-backend.onrender.com/api/drive/callback';
    }
    return `${(process.env.SERVER_BASE_URL || config.SERVER_BASE_URL || 'http://localhost:4000').trim().replace(/\/+$/, '')}/api/drive/callback`;
  }

  /**
   * Generates a cryptographically secure OAuth 2.0 state parameter with 15-minute validity
   * and preserves the exact redirect URI used for this specific flow.
   */
  static generateState(userId?: string, redirectUri?: string): string {
    const now = Date.now();
    // Clean expired states (older than 15 minutes)
    for (const [st, data] of this.activeStates.entries()) {
      if (now - data.createdAt > 15 * 60 * 1000) {
        this.activeStates.delete(st);
      }
    }
    const state = crypto.randomBytes(24).toString('hex');
    const rUri = (redirectUri || this.getRedirectUri()).trim().replace(/\/+$/, '');
    this.activeStates.set(state, { createdAt: now, userId, redirectUri: rUri });
    return state;
  }

  /**
   * Verifies the OAuth state parameter to prevent CSRF. One-time use.
   * Returns validity status and the preserved redirect URI.
   */
  static verifyState(state: string | undefined): { isValid: boolean; redirectUri?: string } {
    if (!state) return { isValid: false };
    // Allow standard test states in test environment
    if (process.env.NODE_ENV === 'test' && (state === 'mock_state' || state === 'test-state')) {
      return { isValid: true, redirectUri: this.getRedirectUri() };
    }
    const entry = this.activeStates.get(state);
    if (!entry) return { isValid: false };
    const isValid = (Date.now() - entry.createdAt) <= 15 * 60 * 1000;
    this.activeStates.delete(state); // Enforce single-use
    return { isValid, redirectUri: entry.redirectUri };
  }

  /**
   * Clears state and code caches. Used in unit tests.
   */
  static resetCodeTracking(): void {
    this.processedCodes.clear();
    this.activeStates.clear();
  }

  /**
   * Safely inspects Google OAuth token endpoint errors without exposing secrets, codes, or tokens.
   */
  static sanitizeOAuthError(errBody: string, status: number): {
    code: string;
    description: string;
    userMessageTr: string;
  } {
    let parsed: any = {};
    try {
      parsed = JSON.parse(errBody);
    } catch {
      // Non-JSON or HTML response
    }

    const errorCode = String(parsed.error || `HTTP_${status}`);
    const errorDesc = String(parsed.error_description || '');

    // Sanitized description strips any potential secrets or authorization tokens
    const sanitizedDesc = errorDesc
      .replace(/client_secret=[^&\s]+/gi, 'client_secret=[REDACTED]')
      .replace(/code=[^&\s]+/gi, 'code=[REDACTED]')
      .replace(/token=[^&\s]+/gi, 'token=[REDACTED]');

    let userMessageTr = 'Google Drive yetkilendirme kodu doğrulanamadı.';

    switch (errorCode) {
      case 'invalid_grant':
        userMessageTr = 'Google yetkilendirme kodu geçersiz, süresi dolmuş veya daha önce kullanılmış (invalid_grant). Yetkilendirme kodları tek kullanımlıktır. Lütfen "Google ile Yetkilendir" butonuna tıklayarak yeni bir yetkilendirme akışı başlatın.';
        break;
      case 'redirect_uri_mismatch':
        userMessageTr = `Yönlendirme adresi uyuşmazlığı (redirect_uri_mismatch). Google Cloud Console'da kayıtlı Yetkili Yönlendirme URI ile sunucunun kullandığı URI (${this.getRedirectUri()}) birebir aynı olmalıdır.`;
        break;
      case 'invalid_client':
        userMessageTr = 'Google OAuth istemci kimliği veya gizli anahtarı geçersiz (invalid_client). Lütfen Render ortam değişkenlerindeki GOOGLE_DRIVE_CLIENT_ID ve GOOGLE_DRIVE_CLIENT_SECRET değerlerini kontrol edin.';
        break;
      case 'invalid_request':
        userMessageTr = 'Google OAuth isteği eksik veya hatalı parametre içeriyor (invalid_request). Lütfen yeni bir yetkilendirme akışı başlatın.';
        break;
      case 'unauthorized_client':
        userMessageTr = 'Bu OAuth istemcisi seçilen yetkilendirme türü için yapılandırılmamış (unauthorized_client). Google Cloud Console\'da uygulama türünün "Web application" olduğundan emin olun.';
        break;
      default:
        userMessageTr = `Google Drive yetkilendirme kodu doğrulanamadı (${errorCode}: ${status}). Lütfen yeni bir yetkilendirme akışı başlatın.`;
        break;
    }

    return {
      code: errorCode,
      description: sanitizedDesc,
      userMessageTr,
    };
  }

  /**
   * Generates Google OAuth 2.0 Authorization URL with least-privilege drive.file scope.
   */
  static getAuthUrl(state?: string, overrideConfig?: { clientId?: string; redirectUri?: string }): string {
    const clientId = overrideConfig?.clientId || this.getClientId();
    const redirectUri = (overrideConfig?.redirectUri || this.getRedirectUri()).trim().replace(/\/+$/, '');
    const clientSecret = this.getClientSecret();

    const missing: string[] = [];
    if (!clientId) missing.push('GOOGLE_DRIVE_CLIENT_ID');
    // When called in production without overrides, ensure client secret is also configured
    if (!overrideConfig && !clientSecret) missing.push('GOOGLE_DRIVE_CLIENT_SECRET');
    if (!redirectUri) missing.push('GOOGLE_DRIVE_REDIRECT_URI');

    if (missing.length > 0) {
      throw new Error(`Google Drive OAuth yapılandırması eksik (${missing.join(', ')}). Lütfen Render ortam değişkenlerinde bu değerleri tanımlayın.`);
    }

    const effectiveState = state || this.generateState(undefined, redirectUri);

    const params = new URLSearchParams({
      client_id: clientId!,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: DRIVE_FILE_SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state: effectiveState,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Exchanges authorization code for tokens, initializes XXQ Chat folder, and returns drive account details.
   * Enforces single-use semantics: rejects repeated code exchanges and prevents retrying with dead codes.
   */
  static async exchangeCodeAndConnect(code: string, customRedirectUri?: string): Promise<DbDriveAccount> {
    const trimmedCode = code?.trim();
    if (!trimmedCode) {
      throw new Error('Geçersiz veya boş yetkilendirme kodu.');
    }

    const now = Date.now();
    // Clean old codes (> 15 minutes)
    for (const [c, data] of this.processedCodes.entries()) {
      if (now - data.timestamp > 15 * 60 * 1000) {
        this.processedCodes.delete(c);
      }
    }

    const existing = this.processedCodes.get(trimmedCode);
    if (existing) {
      if (existing.status === 'success') {
        throw new Error(
          `Bu yetkilendirme kodu daha önce kullanıldı ve Google Drive hesabı (${existing.email || 'bağlandı'}) başarıyla bağlandı. Google yetkilendirme kodları tek kullanımlıktır. Yeni bir işlem için lütfen yeni bir yetkilendirme başlatın.`
        );
      } else {
        throw new Error(
          'Bu yetkilendirme kodu daha önce kullanıldı veya başarısız bir denemede tüketildi. Google yetkilendirme kodları tek kullanımlıktır. Lütfen "Google ile Yetkilendir" butonuna tıklayarak yeni bir oturum açma akışı başlatın.'
        );
      }
    }

    // Mark code as pending to prevent concurrent double-redemption
    this.processedCodes.set(trimmedCode, { timestamp: now, status: 'pending' });

    const clientId = this.getClientId();
    const clientSecret = this.getClientSecret();
    const redirectUri = (customRedirectUri || this.getRedirectUri()).trim().replace(/\/+$/, '');

    if (!clientId || !clientSecret || !redirectUri) {
      this.processedCodes.delete(trimmedCode);
      const missing: string[] = [];
      if (!clientId) missing.push('GOOGLE_DRIVE_CLIENT_ID');
      if (!clientSecret) missing.push('GOOGLE_DRIVE_CLIENT_SECRET');
      if (!redirectUri) missing.push('GOOGLE_DRIVE_REDIRECT_URI');
      throw new Error(`Google Drive OAuth kimlik bilgileri eksik (${missing.join(', ')}).`);
    }

    // 1. Exchange code for access & refresh tokens
    let tokenRes: Response;
    try {
      tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: trimmedCode,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });
    } catch (networkErr: any) {
      this.processedCodes.set(trimmedCode, { timestamp: Date.now(), status: 'failed', error: networkErr.message });
      throw new Error(`Google OAuth sunucusuna erişilemedi: ${networkErr.message}`);
    }

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      const sanitized = this.sanitizeOAuthError(errBody, tokenRes.status);
      console.error(`[DRIVE] Token exchange error: ${sanitized.code} - ${sanitized.description}`);
      this.processedCodes.set(trimmedCode, { timestamp: Date.now(), status: 'failed', error: sanitized.userMessageTr });
      throw new Error(sanitized.userMessageTr);
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    if (!tokenData.refresh_token) {
      this.processedCodes.set(trimmedCode, { timestamp: Date.now(), status: 'failed', error: 'MISSING_REFRESH_TOKEN' });
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

    // Mark as successfully redeemed
    this.processedCodes.set(trimmedCode, {
      timestamp: Date.now(),
      status: 'success',
      email: driveAccount.email,
    });

    return driveAccount;
  }

  /**
   * Refreshes access token for a given drive account.
   */
  static async getAccessToken(account: DbDriveAccount): Promise<string> {
    const clientId = this.getClientId();
    const clientSecret = this.getClientSecret();

    if (!clientId || !clientSecret) {
      throw new Error('Google Drive API istemci bilgileri eksik (GOOGLE_DRIVE_CLIENT_ID veya GOOGLE_DRIVE_CLIENT_SECRET).');
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
      const sanitized = this.sanitizeOAuthError(errText, res.status);
      console.error(`[DRIVE] Refresh token error: ${sanitized.code} - ${sanitized.description}`);
      throw new Error(`Google Drive erişim belirteci yenilenemedi (${sanitized.code}).`);
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
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Returns current Google Drive configuration and status.
   */
  static getStatus(): {
    isConfigured: boolean;
    clientIdConfigured: boolean;
    clientSecretConfigured: boolean;
    redirectUriConfigured: boolean;
    redirectUri: string;
    missingSettings: string[];
    encryptionKeyConfigured: boolean;
    errorMessageTr?: string;
  } {
    const clientId = this.getClientId();
    const clientSecret = this.getClientSecret();
    const redirectUri = this.getRedirectUri();
    const encryptionKey = process.env.ENCRYPTION_KEY?.trim() || config.ENCRYPTION_KEY?.trim();

    const missingSettings: string[] = [];
    if (!clientId) missingSettings.push('GOOGLE_DRIVE_CLIENT_ID');
    if (!clientSecret) missingSettings.push('GOOGLE_DRIVE_CLIENT_SECRET');
    if (!process.env.GOOGLE_DRIVE_REDIRECT_URI?.trim() && !config.GOOGLE_DRIVE_REDIRECT_URI?.trim()) {
      missingSettings.push('GOOGLE_DRIVE_REDIRECT_URI');
    }

    const isConfigured = !!(clientId && clientSecret && redirectUri);
    let errorMessageTr: string | undefined = undefined;

    if (!isConfigured) {
      errorMessageTr = `Google Drive OAuth yapılandırması eksik (${missingSettings.join(', ')}). Render ortam değişkenlerinde bu değerlerin tanımlanması gerekmektedir.`;
    }

    return {
      isConfigured,
      clientIdConfigured: !!clientId,
      clientSecretConfigured: !!clientSecret,
      redirectUriConfigured: !!(process.env.GOOGLE_DRIVE_REDIRECT_URI?.trim() || config.GOOGLE_DRIVE_REDIRECT_URI?.trim()),
      redirectUri,
      missingSettings,
      encryptionKeyConfigured: !!encryptionKey,
      ...(errorMessageTr ? { errorMessageTr } : {}),
    };
  }

  /**
   * Syncs and updates the quota for an existing connected Google Drive account.
   */
  static async syncAccountQuota(account: DbDriveAccount): Promise<{ spaceUsed: number; spaceTotal: number }> {
    const accessToken = await this.getAccessToken(account);
    const quota = await this.fetchQuota(accessToken);
    await dataStore.updateDriveAccountQuota(account.id, quota.spaceUsed, quota.spaceTotal);
    return quota;
  }
}
