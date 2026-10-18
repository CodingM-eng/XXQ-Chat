import { Readable } from 'stream';
import crypto from 'crypto';
import { config } from '../config.js';
import { decryptSecret, encryptSecret } from '../utils/crypto.js';
import { dataStore } from '../db/index.js';
import { DbDriveAccount } from '../db/types.js';

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';

export type DriveSetupStage =
  | 'token_exchange'
  | 'scope_verification'
  | 'folder_search'
  | 'folder_creation'
  | 'drive_api'
  | 'config';

export class DriveSetupError extends Error {
  public code: string;
  public stage: DriveSetupStage;
  public userMessageTr: string;
  public details?: any;

  constructor(
    code: string,
    userMessageTr: string,
    stage: DriveSetupStage,
    details?: any
  ) {
    super(userMessageTr);
    this.name = 'DriveSetupError';
    this.code = code;
    this.stage = stage;
    this.userMessageTr = userMessageTr;
    this.details = details;
  }
}

export interface ProcessedCodeEntry {
  timestamp: number;
  status: 'pending' | 'success' | 'code_exchange_failed' | 'folder_creation_failed' | 'failed';
  email?: string;
  error?: string;
  stage?: DriveSetupStage;
  accountId?: string;
}

export interface StateEntry {
  createdAt: number;
  userId?: string;
  redirectUri: string;
}

export class GoogleDriveService {
  private static activeStates = new Map<string, StateEntry>();
  private static processedCodes = new Map<string, ProcessedCodeEntry>();
  private static folderCreationPromises = new Map<string, Promise<string>>();

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
    this.folderCreationPromises.clear();
  }

  /**
   * Safely inspects Google Drive API v3 errors without exposing secrets, tokens, or private paths.
   */
  static sanitizeDriveApiError(
    errBody: string,
    status: number,
    stage: 'folder_search' | 'folder_creation' | 'drive_api'
  ): {
    code: string;
    description: string;
    userMessageTr: string;
    projectNumber?: string;
  } {
    let parsed: any = {};
    try {
      parsed = JSON.parse(errBody);
    } catch {
      // Non-JSON response
    }

    const errorObj = parsed.error || {};
    const errorCode = String(errorObj.code || status || 'UNKNOWN');
    const rawMessage = String(errorObj.message || errBody || '');
    const firstError = Array.isArray(errorObj.errors) && errorObj.errors.length > 0 ? errorObj.errors[0] : {};
    const firstDetail = Array.isArray(errorObj.details) && errorObj.details.length > 0 ? errorObj.details[0] : {};

    const reason = String(firstError.reason || firstDetail.reason || errorObj.status || '');

    // Extract project number / ID if present
    let projectNumber: string | undefined = undefined;
    if (firstDetail.metadata && firstDetail.metadata.consumer) {
      projectNumber = String(firstDetail.metadata.consumer).replace(/^projects\//, '');
    } else {
      const match = rawMessage.match(/project\s+(\d+|[a-z0-9\-_]+)/i);
      if (match) {
        projectNumber = match[1];
      }
    }

    // Sanitize any secrets/tokens from description
    const sanitizedDesc = rawMessage
      .replace(/client_secret=[^&\s]+/gi, 'client_secret=[REDACTED]')
      .replace(/code=[^&\s]+/gi, 'code=[REDACTED]')
      .replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED]')
      .replace(/token=[^&\s]+/gi, 'token=[REDACTED]');

    let userMessageTr: string;

    const isServiceDisabled =
      reason === 'SERVICE_DISABLED' ||
      reason === 'accessNotConfigured' ||
      rawMessage.toLowerCase().includes('has not been used in project') ||
      rawMessage.toLowerCase().includes('is disabled');

    const isScopeInsufficient =
      reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' ||
      reason === 'insufficientPermissions' ||
      reason === 'insufficientFilePermissions' ||
      rawMessage.toLowerCase().includes('insufficient authentication scopes');

    const isQuotaExceeded =
      reason === 'storageQuotaExceeded' ||
      reason === 'quotaExceeded' ||
      rawMessage.toLowerCase().includes('storage quota');

    const isRateLimit =
      reason === 'rateLimitExceeded' ||
      reason === 'userRateLimitExceeded';

    const isUnauthenticated =
      status === 401 ||
      reason === 'authError' ||
      reason === 'UNAUTHENTICATED' ||
      rawMessage.toLowerCase().includes('invalid credentials');

    if (isServiceDisabled) {
      const projText = projectNumber ? ` (Google Cloud Proje No: ${projectNumber})` : '';
      userMessageTr = `Google Drive API bu projede etkinleştirilmemiş${projText} (SERVICE_DISABLED). Lütfen Google Cloud Console -> "APIs & Services" -> "Library" bölümünden "Google Drive API"yi etkinleştirin ve OAuth istemci kimliği ile projenin eşleştiğinden emin olun.`;
    } else if (isScopeInsufficient) {
      userMessageTr = `Google Drive izin kapsamı yetersiz (ACCESS_TOKEN_SCOPE_INSUFFICIENT). XXQ Chat'in klasör ve dosya oluşturabilmesi için 'drive.file' izni gereklidir. Lütfen Google onay ekranında "Google Drive" kutucuğunu işaretleyerek yeni bir onay akışı başlatın.`;
    } else if (isQuotaExceeded) {
      userMessageTr = `Google Drive depolama alanı kotası aşıldı (storageQuotaExceeded). Hesabınızda 'XXQ Chat' klasörü oluşturmak veya dosya yüklemek için yeterli alan bulunmuyor.`;
    } else if (isRateLimit) {
      userMessageTr = `Google Drive API istek limiti aşıldı (rateLimitExceeded). Lütfen birkaç dakika sonra tekrar deneyin.`;
    } else if (isUnauthenticated) {
      userMessageTr = `Google Drive erişim belirteci geçersiz veya süresi dolmuş (UNAUTHENTICATED). Lütfen yeni bir yetkilendirme akışı başlatın.`;
    } else {
      userMessageTr = `Google Drive ${stage === 'folder_creation' ? 'klasörü oluşturulurken' : 'klasör araması yapılırken'} hata oluştu (${reason || errorCode}: ${status}).`;
    }

    return {
      code: reason || errorCode,
      description: sanitizedDesc,
      userMessageTr,
      projectNumber,
    };
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
   * Correctly separates OAuth code errors from Google Drive API folder creation errors.
   */
  static async exchangeCodeAndConnect(code: string, customRedirectUri?: string): Promise<DbDriveAccount> {
    const trimmedCode = code?.trim();
    if (!trimmedCode) {
      throw new DriveSetupError('INVALID_CODE', 'Geçersiz veya boş yetkilendirme kodu.', 'token_exchange');
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
        throw new DriveSetupError(
          'CODE_ALREADY_REDEEMED',
          `Bu yetkilendirme kodu daha önce kullanıldı ve Google Drive hesabı (${existing.email || 'bağlandı'}) başarıyla bağlandı. Google yetkilendirme kodları tek kullanımlıktır. Yeni bir işlem için lütfen yeni bir yetkilendirme başlatın.`,
          'token_exchange'
        );
      } else if (existing.status === 'folder_creation_failed') {
        throw new DriveSetupError(
          'FOLDER_CREATION_FAILED_PREVIOUSLY',
          `Bu yetkilendirme kodu Google ile başarıyla doğrulandı ancak 'XXQ Chat' klasörü oluşturulurken bir hata oluştu: ${existing.error || 'Klasör hatası'}. Google yetkilendirme kodları tek kullanımlık olduğundan bu kod tekrar takas edilemez. Lütfen belirtilen sorunu giderdikten sonra "Google ile Yetkilendir" butonuna tıklayarak yeni bir onay akışı başlatın veya mevcut hesabı eşitleyin.`,
          existing.stage || 'folder_creation'
        );
      } else if (existing.status === 'pending') {
        throw new DriveSetupError(
          'CODE_EXCHANGE_IN_PROGRESS',
          'Bu yetkilendirme kodu için şu anda devam eden bir yetkilendirme işlemi bulunmaktadır.',
          'token_exchange'
        );
      } else {
        throw new DriveSetupError(
          'CODE_ALREADY_USED',
          'Bu yetkilendirme kodu daha önce kullanıldı veya başarısız bir denemede tüketildi. Google yetkilendirme kodları tek kullanımlıktır. Lütfen "Google ile Yetkilendir" butonuna tıklayarak yeni bir oturum açma akışı başlatın.',
          'token_exchange'
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
      throw new DriveSetupError('CONFIG_ERROR', `Google Drive OAuth kimlik bilgileri eksik (${missing.join(', ')}).`, 'config');
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
      this.processedCodes.set(trimmedCode, { timestamp: Date.now(), status: 'code_exchange_failed', error: networkErr.message });
      throw new DriveSetupError('NETWORK_ERROR', `Google OAuth sunucusuna erişilemedi: ${networkErr.message}`, 'token_exchange');
    }

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      const sanitized = this.sanitizeOAuthError(errBody, tokenRes.status);
      console.error(`[DRIVE] Token exchange error: ${sanitized.code} - ${sanitized.description}`);
      this.processedCodes.set(trimmedCode, { timestamp: Date.now(), status: 'code_exchange_failed', error: sanitized.userMessageTr });
      throw new DriveSetupError(sanitized.code, sanitized.userMessageTr, 'token_exchange');
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
    };

    // 2. Validate granted scopes (least-privilege drive.file check)
    const grantedScopes = (tokenData.scope || '').split(/\s+/).filter(Boolean);
    const hasDriveFileScope = grantedScopes.some(
      (s) => s.includes('drive.file') || s.includes('/auth/drive')
    );

    if (tokenData.scope && !hasDriveFileScope) {
      const scopeErr =
        'Google Drive erişim izni onaylanmadı (drive.file kapsamı eksik). XXQ Chat sohbet eklerini kaydedebilmek için dosya oluşturma iznine ihtiyaç duyar. Lütfen Google onay ekranında "Google Drive" kutucuğunu işaretleyerek yeni bir onay akışı başlatın.';
      this.processedCodes.set(trimmedCode, {
        timestamp: Date.now(),
        status: 'folder_creation_failed',
        error: scopeErr,
        stage: 'scope_verification',
      });
      throw new DriveSetupError('ACCESS_TOKEN_SCOPE_INSUFFICIENT', scopeErr, 'scope_verification');
    }

    // 3. Verify refresh_token presence
    if (!tokenData.refresh_token) {
      const refErr =
        'Google Drive yenileme belirteci (refresh_token) alınamadı. Lütfen https://myaccount.google.com/permissions adresinden XXQ Chat erişimini kaldırıp tekrar deneyin.';
      this.processedCodes.set(trimmedCode, {
        timestamp: Date.now(),
        status: 'folder_creation_failed',
        error: refErr,
        stage: 'token_exchange',
      });
      throw new DriveSetupError('MISSING_REFRESH_TOKEN', refErr, 'token_exchange');
    }

    // 4. Fetch user email for this Google account
    let email = 'bilinmeyen-drive@gmail.com';
    let displayName = 'Google Drive';
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userRes.ok) {
        const userData = (await userRes.json()) as any;
        if (userData.email) email = userData.email;
        if (userData.name) displayName = userData.name;
      }
    } catch (uErr) {
      console.warn('[DRIVE] Could not fetch user profile details:', uErr);
    }

    // 5. Encrypt and persist refresh token first so credentials are never lost if folder creation is interrupted
    const encryptedRefreshToken = encryptSecret(tokenData.refresh_token);

    let driveAccount = await dataStore.addDriveAccount({
      email,
      displayName,
      encryptedRefreshToken,
      folderId: null,
      spaceUsed: 0,
      spaceTotal: 0,
    });

    // 6. Create or locate dedicated 'XXQ Chat' folder in Drive
    let folderId: string;
    try {
      folderId = await this.ensureAppFolder(tokenData.access_token);
    } catch (folderErr: any) {
      const stage = folderErr instanceof DriveSetupError ? folderErr.stage : 'folder_creation';
      const code = folderErr instanceof DriveSetupError ? folderErr.code : 'FOLDER_CREATION_FAILED';
      const msg = folderErr.userMessageTr || folderErr.message || 'Google Drive klasörü oluşturulamadı.';

      this.processedCodes.set(trimmedCode, {
        timestamp: Date.now(),
        status: 'folder_creation_failed',
        email,
        error: msg,
        stage,
        accountId: driveAccount.id,
      });

      console.error(`[DRIVE] Folder creation error during connect flow: ${code} - ${msg}`);
      throw new DriveSetupError(code, msg, stage);
    }

    // 7. Get storage quota & attach folderId
    const quota = await this.fetchQuota(tokenData.access_token);
    driveAccount = await dataStore.addDriveAccount({
      id: driveAccount.id,
      email,
      displayName,
      encryptedRefreshToken,
      folderId,
      spaceUsed: quota.spaceUsed,
      spaceTotal: quota.spaceTotal,
    });

    // 8. Mark as completely successfully redeemed
    this.processedCodes.set(trimmedCode, {
      timestamp: Date.now(),
      status: 'success',
      email: driveAccount.email,
      accountId: driveAccount.id,
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
      throw new DriveSetupError('CONFIG_ERROR', 'Google Drive API istemci bilgileri eksik (GOOGLE_DRIVE_CLIENT_ID veya GOOGLE_DRIVE_CLIENT_SECRET).', 'config');
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
      throw new DriveSetupError(sanitized.code, `Google Drive erişim belirteci yenilenemedi (${sanitized.code}).`, 'token_exchange');
    }

    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  }

  /**
   * Ensures the 'XXQ Chat' folder exists on Google Drive.
   * Safe for concurrent calls and retries:
   * 1. Searches for existing 'XXQ Chat' folder created by this app.
   * 2. If found, reuses existing folder rather than creating duplicates.
   * 3. Handles concurrent calls using in-flight promise caching.
   * 4. Accurately sanitizes and reports Drive API errors (disabled API, quota, scopes, etc.).
   */
  static async ensureAppFolder(accessToken: string): Promise<string> {
    const trimmedToken = accessToken?.trim();
    if (!trimmedToken) {
      throw new DriveSetupError(
        'INVALID_TOKEN',
        'Google Drive erişim belirteci eksik veya geçersiz.',
        'folder_creation'
      );
    }

    // Deduplicate concurrent in-flight requests for the same token
    const inFlight = this.folderCreationPromises.get(trimmedToken);
    if (inFlight) {
      return inFlight;
    }

    const promise = (async () => {
      // 1. Search for existing 'XXQ Chat' folder created by this app
      const searchParams = new URLSearchParams({
        q: "name = 'XXQ Chat' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        fields: 'files(id, name, createdTime)',
        spaces: 'drive',
      });

      let searchRes: Response;
      try {
        searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?${searchParams.toString()}`, {
          headers: { Authorization: `Bearer ${trimmedToken}` },
        });
      } catch (netErr: any) {
        throw new DriveSetupError(
          'NETWORK_ERROR',
          `Google Drive API sunucusuna bağlanılamadı: ${netErr.message}`,
          'folder_search'
        );
      }

      if (!searchRes.ok) {
        const errText = await searchRes.text();
        const sanitized = this.sanitizeDriveApiError(errText, searchRes.status, 'folder_search');
        console.error(`[DRIVE] Folder search failed: ${sanitized.code} - ${sanitized.description}`);
        throw new DriveSetupError(sanitized.code, sanitized.userMessageTr, 'folder_search', { projectNumber: sanitized.projectNumber });
      }

      const searchData = (await searchRes.json()) as { files?: Array<{ id: string; name: string }> };
      if (searchData.files && searchData.files.length > 0) {
        // Reuse existing folder
        return searchData.files[0].id;
      }

      // 2. Folder does not exist, create it with appProperties for reliable ownership
      let createRes: Response;
      try {
        createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${trimmedToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'XXQ Chat',
            mimeType: 'application/vnd.google-apps.folder',
            description: 'XXQ Chat sohbet ekleri ve medya dosyaları klasörü',
            appProperties: {
              app: 'xxq-chat',
              purpose: 'chat-attachments',
            },
          }),
        });
      } catch (netErr: any) {
        throw new DriveSetupError(
          'NETWORK_ERROR',
          `Google Drive API sunucusuna bağlanılamadı: ${netErr.message}`,
          'folder_creation'
        );
      }

      if (!createRes.ok) {
        const errText = await createRes.text();
        const sanitized = this.sanitizeDriveApiError(errText, createRes.status, 'folder_creation');
        console.error(`[DRIVE] Folder creation failed: ${sanitized.code} - ${sanitized.description}`);
        throw new DriveSetupError(sanitized.code, sanitized.userMessageTr, 'folder_creation', { projectNumber: sanitized.projectNumber });
      }

      const folderData = (await createRes.json()) as { id: string };
      if (!folderData.id) {
        throw new DriveSetupError(
          'INVALID_RESPONSE',
          'Google Drive klasör oluşturma yanıtında klasör kimliği (ID) bulunamadı.',
          'folder_creation'
        );
      }

      return folderData.id;
    })().finally(() => {
      this.folderCreationPromises.delete(trimmedToken);
    });

    this.folderCreationPromises.set(trimmedToken, promise);
    return promise;
  }

  /**
   * Initializes or re-attaches the 'XXQ Chat' folder for an existing connected account using its refresh token.
   * Does NOT require an authorization code.
   */
  static async initAccountFolder(account: DbDriveAccount): Promise<string> {
    const accessToken = await this.getAccessToken(account);
    const folderId = await this.ensureAppFolder(accessToken);
    await dataStore.updateDriveAccountFolder(account.id, folderId);
    return folderId;
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
   * Syncs and updates the quota and folder connection for an existing connected Google Drive account.
   */
  static async syncAccountQuota(account: DbDriveAccount): Promise<{ spaceUsed: number; spaceTotal: number; folderId?: string }> {
    const accessToken = await this.getAccessToken(account);
    let folderId = account.folderId;
    if (!folderId) {
      try {
        folderId = await this.ensureAppFolder(accessToken);
        await dataStore.updateDriveAccountFolder(account.id, folderId);
      } catch (fErr) {
        console.warn(`[DRIVE] Could not initialize missing folder for account ${account.email} during sync:`, fErr);
      }
    }
    const quota = await this.fetchQuota(accessToken);
    await dataStore.updateDriveAccountQuota(account.id, quota.spaceUsed, quota.spaceTotal);
    return { ...quota, folderId: folderId || undefined };
  }
}
