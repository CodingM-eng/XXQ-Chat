import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { dataStore } from '../db/index.js';
import { generateDevToken } from '../auth/index.js';
import { GoogleDriveService, DriveSetupError } from '../services/drive.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';

describe('XXQ Chat Google Drive & Attachments Suite', () => {
  const adminEmail = 'codingdevelopia@gmail.com';
  const user1Email = 'driveuser1@xxq.internal';
  const user2Email = 'driveuser2@xxq.internal';
  const outsiderEmail = 'driveoutsider@xxq.internal';

  let adminToken: string;
  let user1Token: string;
  let user2Token: string;
  let outsiderToken: string;
  let conversationId: string;

  beforeEach(async () => {
    adminToken = generateDevToken({ id: 'adm_1', email: adminEmail, displayName: 'Sistem Yöneticisi', isAdmin: true });
    user1Token = generateDevToken({ id: 'usr_d1', email: user1Email, displayName: 'Drive Katılımcı 1' });
    user2Token = generateDevToken({ id: 'usr_d2', email: user2Email, displayName: 'Drive Katılımcı 2' });
    outsiderToken = generateDevToken({ id: 'usr_d3', email: outsiderEmail, displayName: 'Dış Kullanıcı' });

    await dataStore.addToWhitelist(adminEmail, 'system');
    await dataStore.addToWhitelist(user1Email, adminEmail);
    await dataStore.addToWhitelist(user2Email, adminEmail);
    await dataStore.addToWhitelist(outsiderEmail, adminEmail);

    await dataStore.upsertUser({ id: 'adm_1', email: adminEmail, displayName: 'Sistem Yöneticisi', isAdmin: true, status: 'active', onboarded: true });
    await dataStore.upsertUser({ id: 'usr_d1', email: user1Email, displayName: 'Drive Katılımcı 1', isAdmin: false, status: 'active', onboarded: true });
    await dataStore.upsertUser({ id: 'usr_d2', email: user2Email, displayName: 'Drive Katılımcı 2', isAdmin: false, status: 'active', onboarded: true });
    await dataStore.upsertUser({ id: 'usr_d3', email: outsiderEmail, displayName: 'Dış Kullanıcı', isAdmin: false, status: 'active', onboarded: true });

    const existingAccounts = await dataStore.getDriveAccounts();
    for (const acc of existingAccounts) {
      await dataStore.removeDriveAccount(acc.id);
    }

    conversationId = await dataStore.createDirectConversation('usr_d1', 'usr_d2');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('guarantees least-privilege drive.file scope in Google OAuth URL', () => {
    // Temporarily mock client ID & redirect URI
    vi.stubEnv('GOOGLE_DRIVE_CLIENT_ID', 'test-client-id.apps.googleusercontent.com');
    vi.stubEnv('GOOGLE_DRIVE_REDIRECT_URI', 'https://xxq-chat.onrender.com/api/drive/callback');

    const authUrl = GoogleDriveService.getAuthUrl('test-state', {
      clientId: 'test-client-id.apps.googleusercontent.com',
      redirectUri: 'https://xxq-chat.onrender.com/api/drive/callback',
    });
    expect(authUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(authUrl).toContain('https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file');
    expect(authUrl).toContain('access_type=offline');
    expect(authUrl).toContain('prompt=consent');
  });

  it('securely encrypts and decrypts OAuth refresh tokens using AES-256-GCM', () => {
    const rawRefreshToken = '1//0gX_test_refresh_token_very_secret_12345';
    const encrypted = encryptSecret(rawRefreshToken);

    expect(encrypted).not.toEqual(rawRefreshToken);
    expect(encrypted.split(':')).toHaveLength(3); // iv:authTag:ciphertext

    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(rawRefreshToken);
  });

  it('denies attachment upload if no Google Drive account is connected', async () => {
    const res = await request(app)
      .post(`/api/conversations/${conversationId}/attachments`)
      .set('Authorization', `Bearer ${user1Token}`)
      .attach('file', Buffer.from('Deneme dosya icerigi'), 'test.txt');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('NO_DRIVE_ACCOUNT');
    expect(res.body.message).toContain('Google Drive');
  });

  it('denies attachment upload if user is not a conversation participant', async () => {
    // Add dummy drive account first
    await dataStore.addDriveAccount({
      email: 'storage@gmail.com',
      displayName: 'XXQ Storage',
      encryptedRefreshToken: encryptSecret('dummy_token'),
    });

    const res = await request(app)
      .post(`/api/conversations/${conversationId}/attachments`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .attach('file', Buffer.from('Icerik'), 'gizli.txt');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('uploads file to connected Google Drive account and saves attachment metadata', async () => {
    // Mock uploadFile on GoogleDriveService
    vi.spyOn(GoogleDriveService, 'uploadFile').mockResolvedValueOnce({
      driveFileId: 'drive_file_987654321',
      size: 1024,
    });

    const driveAccount = await dataStore.addDriveAccount({
      email: 'corp-storage@gmail.com',
      displayName: 'Kurumsal Drive',
      encryptedRefreshToken: encryptSecret('valid_refresh_token'),
    });

    const res = await request(app)
      .post(`/api/conversations/${conversationId}/attachments`)
      .set('Authorization', `Bearer ${user1Token}`)
      .attach('file', Buffer.from('Test resim veya metin'), 'rapor.pdf');

    expect(res.status).toBe(201);
    expect(res.body.attachment).toBeDefined();
    expect(res.body.attachment.fileName).toBe('rapor.pdf');
    expect(res.body.attachment.driveFileId).toBe('drive_file_987654321');
    expect(res.body.attachment.conversationId).toBe(conversationId);
  });

  it('enforces conversation membership when streaming/downloading attachments', async () => {
    const driveAccount = await dataStore.addDriveAccount({
      email: 'stream-drive@gmail.com',
      encryptedRefreshToken: encryptSecret('tok'),
    });

    const attachment = await dataStore.saveAttachment({
      conversationId,
      uploaderId: 'usr_d1',
      driveAccountId: driveAccount.id,
      driveFileId: 'drv_stream_file',
      fileName: 'ozel_belge.pdf',
      fileSize: 500,
      mimeType: 'application/pdf',
    });

    // Outsider must be denied
    const deniedRes = await request(app)
      .get(`/api/conversations/${conversationId}/attachments/${attachment.id}`)
      .set('Authorization', `Bearer ${outsiderToken}`);

    expect(deniedRes.status).toBe(403);
    expect(deniedRes.body.error).toBe('FORBIDDEN');
  });

  it('allows admins to list and disconnect connected Drive accounts', async () => {
    const acc = await dataStore.addDriveAccount({
      email: 'admin-test@gmail.com',
      displayName: 'Admin Drive',
      encryptedRefreshToken: encryptSecret('refresh'),
      spaceUsed: 5000000,
      spaceTotal: 15000000000,
    });

    const listRes = await request(app)
      .get('/api/drive/accounts')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.accounts).toBeInstanceOf(Array);
    // Ensure encrypted token is strictly NOT exposed in response
    const listed = listRes.body.accounts.find((a: any) => a.id === acc.id);
    expect(listed).toBeDefined();
    expect(listed.encryptedRefreshToken).toBeUndefined();

    // Disconnect drive account
    const delRes = await request(app)
      .delete(`/api/drive/accounts/${acc.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    const recheck = await dataStore.getDriveAccountById(acc.id);
    expect(recheck).toBeNull();
  });

  it('reports Drive OAuth configuration status and missing settings clearly without revealing secrets', async () => {
    // When environment variables are missing
    vi.stubEnv('GOOGLE_DRIVE_CLIENT_ID', '');
    vi.stubEnv('GOOGLE_DRIVE_CLIENT_SECRET', '');

    const res = await request(app)
      .get('/api/drive/status')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.isConfigured).toBe(false);
    expect(res.body.clientIdConfigured).toBe(false);
    expect(res.body.clientSecretConfigured).toBe(false);
    expect(res.body.missingSettings).toContain('GOOGLE_DRIVE_CLIENT_ID');
    expect(res.body.missingSettings).toContain('GOOGLE_DRIVE_CLIENT_SECRET');
    expect(res.body.errorMessageTr).toContain('Google Drive OAuth yapılandırması eksik');
    // Ensure no secrets or tokens exist in response
    expect(res.body.clientSecret).toBeUndefined();
    expect(res.body.refreshToken).toBeUndefined();
  });

  it('rejects /api/drive/auth-url with 400 and Turkish explanation when OAuth is unconfigured', async () => {
    vi.stubEnv('GOOGLE_DRIVE_CLIENT_ID', '');
    vi.stubEnv('GOOGLE_DRIVE_CLIENT_SECRET', '');

    const res = await request(app)
      .get('/api/drive/auth-url')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CONFIG_ERROR');
    expect(res.body.message).toContain('Google Drive OAuth yapılandırması eksik');
    expect(res.body.missingSettings).toContain('GOOGLE_DRIVE_CLIENT_ID');
  });

  it('generates secure OAuth URL with valid state when configured', async () => {
    vi.stubEnv('GOOGLE_DRIVE_CLIENT_ID', 'test-client.apps.googleusercontent.com');
    vi.stubEnv('GOOGLE_DRIVE_CLIENT_SECRET', 'test-client-secret-12345');
    vi.stubEnv('GOOGLE_DRIVE_REDIRECT_URI', 'https://xxq-chat-backend.onrender.com/api/drive/callback');

    const res = await request(app)
      .get('/api/drive/auth-url')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.authUrl).toBeDefined();
    expect(res.body.state).toBeDefined();
    expect(res.body.redirectUri).toBe('https://xxq-chat-backend.onrender.com/api/drive/callback');
    expect(res.body.authUrl).toContain('client_id=test-client.apps.googleusercontent.com');
    expect(res.body.authUrl).toContain('redirect_uri=https%3A%2F%2Fxxq-chat-backend.onrender.com%2Fapi%2Fdrive%2Fcallback');
  });

  it('rejects /api/drive/connect with 400 when OAuth is unconfigured', async () => {
    vi.stubEnv('GOOGLE_DRIVE_CLIENT_ID', '');
    vi.stubEnv('GOOGLE_DRIVE_CLIENT_SECRET', '');

    const res = await request(app)
      .post('/api/drive/connect')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: '4/0AWtgFakeCode123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CONFIG_ERROR');
    expect(res.body.message).toContain('Google Drive OAuth yapılandırması eksik');
  });

  it('rejects /api/drive/callback when state is missing or invalid (CSRF prevention)', async () => {
    // Missing state
    const missingRes = await request(app)
      .get('/api/drive/callback?code=some-code');

    expect(missingRes.status).toBe(400);
    expect(missingRes.text).toContain('Güvenlik Doğrulaması Başarısız');
    expect(missingRes.text).toContain('state');

    // Invalid/tampered state
    const forgedRes = await request(app)
      .get('/api/drive/callback?code=some-code&state=malicious-forged-state');

    expect(forgedRes.status).toBe(400);
    expect(forgedRes.text).toContain('Güvenlik Doğrulaması Başarısız');
  });

  it('validates state and enforces single-use in GoogleDriveService.verifyState', () => {
    const state = GoogleDriveService.generateState('test_user', 'https://xxq-chat-backend.onrender.com/api/drive/callback');
    expect(state).toHaveLength(48); // 24 bytes in hex

    // First verification should pass and return the exact redirectUri
    const firstCheck = GoogleDriveService.verifyState(state);
    expect(firstCheck.isValid).toBe(true);
    expect(firstCheck.redirectUri).toBe('https://xxq-chat-backend.onrender.com/api/drive/callback');

    // Replay attack / second check should fail (single use)
    const secondCheck = GoogleDriveService.verifyState(state);
    expect(secondCheck.isValid).toBe(false);
  });

  it('guarantees redirect URI consistency and strips trailing slashes', () => {
    // Test with trailing slash and extra whitespace
    vi.stubEnv('GOOGLE_DRIVE_REDIRECT_URI', 'https://xxq-chat-backend.onrender.com/api/drive/callback/// ');
    expect(GoogleDriveService.getRedirectUri()).toBe('https://xxq-chat-backend.onrender.com/api/drive/callback');

    // Test cleanEnv with quotes
    expect(GoogleDriveService.cleanEnv('"test-client-id"')).toBe('test-client-id');
    expect(GoogleDriveService.cleanEnv("'test-secret'")).toBe('test-secret');
  });

  it('safely inspects Google token endpoint error responses without leaking credentials', () => {
    // 1. invalid_grant
    const grantErr = GoogleDriveService.sanitizeOAuthError(
      JSON.stringify({ error: 'invalid_grant', error_description: 'Code was already redeemed client_secret=very_secret_key' }),
      400
    );
    expect(grantErr.code).toBe('invalid_grant');
    expect(grantErr.description).not.toContain('very_secret_key');
    expect(grantErr.description).toContain('[REDACTED]');
    expect(grantErr.userMessageTr).toContain('Google yetkilendirme kodu geçersiz, süresi dolmuş veya daha önce kullanılmış');

    // 2. redirect_uri_mismatch
    const redirectErr = GoogleDriveService.sanitizeOAuthError(
      JSON.stringify({ error: 'redirect_uri_mismatch', error_description: 'Bad Request' }),
      400
    );
    expect(redirectErr.code).toBe('redirect_uri_mismatch');
    expect(redirectErr.userMessageTr).toContain('Yönlendirme adresi uyuşmazlığı');

    // 3. invalid_client
    const clientErr = GoogleDriveService.sanitizeOAuthError(
      JSON.stringify({ error: 'invalid_client', error_description: 'Unauthorized' }),
      401
    );
    expect(clientErr.code).toBe('invalid_client');
    expect(clientErr.userMessageTr).toContain('Google OAuth istemci kimliği veya gizli anahtarı geçersiz');
  });

  it('enforces single-use authorization code and prevents repeated or failed code reuse', async () => {
    GoogleDriveService.resetCodeTracking();

    vi.stubEnv('GOOGLE_DRIVE_CLIENT_ID', 'client-id-123');
    vi.stubEnv('GOOGLE_DRIVE_CLIENT_SECRET', 'secret-456');
    vi.stubEnv('GOOGLE_DRIVE_REDIRECT_URI', 'https://xxq-chat-backend.onrender.com/api/drive/callback');

    // Mock fetch for token exchange: simulate Google invalid_grant 400
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Bad Request' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200 });
    });

    const testCode = '4/0AWtgSingleUseCode123';

    // First attempt fails at Google
    await expect(GoogleDriveService.exchangeCodeAndConnect(testCode)).rejects.toThrow(
      /Google yetkilendirme kodu geçersiz, süresi dolmuş veya daha önce kullanılmış/
    );

    // Second attempt with the SAME code must be rejected locally without even contacting Google!
    fetchMock.mockClear();
    await expect(GoogleDriveService.exchangeCodeAndConnect(testCode)).rejects.toThrow(
      /Bu yetkilendirme kodu daha önce kullanıldı veya başarısız bir denemede tüketildi/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('handles callback via both GET and POST with single-use state verification', async () => {
    GoogleDriveService.resetCodeTracking();

    const stateGet = GoogleDriveService.generateState('admin_1');
    const getRes = await request(app)
      .get(`/api/drive/callback?code=test-code-1&state=${stateGet}`);

    // State is consumed on first check
    expect(GoogleDriveService.verifyState(stateGet).isValid).toBe(false);

    // Replay attack with same state fails
    const replayRes = await request(app)
      .get(`/api/drive/callback?code=test-code-1&state=${stateGet}`);
    expect(replayRes.status).toBe(400);
    expect(replayRes.text).toContain('Güvenlik Doğrulaması Başarısız');

    // POST method support
    const statePost = GoogleDriveService.generateState('admin_2');
    const postRes = await request(app)
      .post('/api/drive/callback')
      .send({ code: 'test-code-post', state: statePost });

    expect(postRes.status).toBe(400); // 400 because test-code-post exchange fails without mocking, but state was accepted
    expect(postRes.text).not.toContain('Güvenlik Doğrulaması Başarısız');
    // Ensure dead code is NOT rendered in a copyable code-box
    expect(postRes.text).not.toContain('class="code-box"');
  });

  describe('Google Drive Folder Creation, Reuse & Error Resilience', () => {
    it('creates XXQ Chat folder successfully during connect flow and returns fully configured drive account', async () => {
      GoogleDriveService.resetCodeTracking();

      vi.stubEnv('GOOGLE_DRIVE_CLIENT_ID', 'client-id-123');
      vi.stubEnv('GOOGLE_DRIVE_CLIENT_SECRET', 'secret-456');
      vi.stubEnv('GOOGLE_DRIVE_REDIRECT_URI', 'https://xxq-chat-backend.onrender.com/api/drive/callback');

      vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('oauth2.googleapis.com/token')) {
          return new Response(JSON.stringify({
            access_token: 'fresh_access_token_123',
            refresh_token: '1//fresh_refresh_token_456',
            expires_in: 3600,
            scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.includes('userinfo')) {
          return new Response(JSON.stringify({
            email: 'drive-owner@company.com',
            name: 'Drive Owner',
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.includes('files?') && decodeURIComponent(urlStr.replace(/\+/g, ' ')).includes("name = 'XXQ Chat'")) {
          return new Response(JSON.stringify({ files: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.includes('drive/v3/files') && !urlStr.includes('?')) {
          return new Response(JSON.stringify({ id: 'fld_new_xxq_123' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.includes('about')) {
          return new Response(JSON.stringify({ storageQuota: { usage: '1048576', limit: '10737418240' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('{}', { status: 200 });
      });

      const account = await GoogleDriveService.exchangeCodeAndConnect('valid-google-code-123');
      expect(account.email).toBe('drive-owner@company.com');
      expect(account.folderId).toBe('fld_new_xxq_123');
      expect(account.spaceUsed).toBe(1048576);
      expect(account.spaceTotal).toBe(10737418240);

      // Verify in DB
      const dbAccount = await dataStore.getDriveAccountById(account.id);
      expect(dbAccount).toBeDefined();
      expect(dbAccount?.folderId).toBe('fld_new_xxq_123');
    });

    it('reuses existing XXQ Chat folder rather than creating a duplicate', async () => {
      GoogleDriveService.resetCodeTracking();

      let postCreateCalled = false;
      vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init?: any) => {
        const urlStr = String(url);
        if (urlStr.includes('files?') && decodeURIComponent(urlStr.replace(/\+/g, ' ')).includes("name = 'XXQ Chat'")) {
          return new Response(JSON.stringify({
            files: [{ id: 'fld_existing_999', name: 'XXQ Chat' }],
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.endsWith('drive/v3/files') && init?.method === 'POST') {
          postCreateCalled = true;
          return new Response(JSON.stringify({ id: 'duplicate_folder' }), { status: 200 });
        }
        return new Response('{}', { status: 200 });
      });

      const folderId = await GoogleDriveService.ensureAppFolder('access_token_abc');
      expect(folderId).toBe('fld_existing_999');
      expect(postCreateCalled).toBe(false); // Must NOT create duplicate
    });

    it('deduplicates concurrent in-flight ensureAppFolder calls for the same token', async () => {
      GoogleDriveService.resetCodeTracking();

      let searchCount = 0;
      vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('files?') && decodeURIComponent(urlStr.replace(/\+/g, ' ')).includes("name = 'XXQ Chat'")) {
          searchCount++;
          // simulate async latency
          await new Promise((r) => setTimeout(r, 20));
          return new Response(JSON.stringify({
            files: [{ id: 'fld_concurrent_dedup', name: 'XXQ Chat' }],
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('{}', { status: 200 });
      });

      const [f1, f2, f3] = await Promise.all([
        GoogleDriveService.ensureAppFolder('same_token_123'),
        GoogleDriveService.ensureAppFolder('same_token_123'),
        GoogleDriveService.ensureAppFolder('same_token_123'),
      ]);

      expect(f1).toBe('fld_concurrent_dedup');
      expect(f2).toBe('fld_concurrent_dedup');
      expect(f3).toBe('fld_concurrent_dedup');
      expect(searchCount).toBe(1); // Deduped to exactly 1 request
    });

    it('detects missing drive.file scope and throws DriveSetupError with stage scope_verification without claiming code error', async () => {
      GoogleDriveService.resetCodeTracking();

      vi.stubEnv('GOOGLE_DRIVE_CLIENT_ID', 'client-id-123');
      vi.stubEnv('GOOGLE_DRIVE_CLIENT_SECRET', 'secret-456');
      vi.stubEnv('GOOGLE_DRIVE_REDIRECT_URI', 'https://xxq-chat-backend.onrender.com/api/drive/callback');

      vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('oauth2.googleapis.com/token')) {
          // Token response without drive.file scope (user unchecked Drive permission on consent screen)
          return new Response(JSON.stringify({
            access_token: 'scope_lacking_token',
            refresh_token: '1//refresh_token_no_scope',
            expires_in: 3600,
            scope: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('{}', { status: 200 });
      });

      try {
        await GoogleDriveService.exchangeCodeAndConnect('test-code-lacking-scope');
        expect.unreachable('Should have thrown DriveSetupError');
      } catch (err: any) {
        expect(err).toBeInstanceOf(DriveSetupError);
        expect(err.stage).toBe('scope_verification');
        expect(err.code).toBe('ACCESS_TOKEN_SCOPE_INSUFFICIENT');
        expect(err.userMessageTr).toContain('Google Drive erişim izni onaylanmadı (drive.file kapsamı eksik)');
        expect(err.userMessageTr).not.toContain('Yetkilendirme kodu geçersiz');
      }
    });

    it('handles Google Drive API disabled (SERVICE_DISABLED / 403) and identifies folder_search stage', async () => {
      GoogleDriveService.resetCodeTracking();

      vi.stubEnv('GOOGLE_DRIVE_CLIENT_ID', 'client-id-123');
      vi.stubEnv('GOOGLE_DRIVE_CLIENT_SECRET', 'secret-456');
      vi.stubEnv('GOOGLE_DRIVE_REDIRECT_URI', 'https://xxq-chat-backend.onrender.com/api/drive/callback');

      vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('oauth2.googleapis.com/token')) {
          return new Response(JSON.stringify({
            access_token: 'valid_token_disabled_api',
            refresh_token: '1//refresh_token_valid',
            expires_in: 3600,
            scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.includes('userinfo')) {
          return new Response(JSON.stringify({ email: 'disabled-api-user@gmail.com' }), { status: 200 });
        }
        if (urlStr.includes('drive/v3/files')) {
          // Google Drive API not enabled in Google Cloud Console
          return new Response(JSON.stringify({
            error: {
              code: 403,
              message: 'Google Drive API has not been used in project 123456789 before or it is disabled.',
              status: 'PERMISSION_DENIED',
              details: [
                {
                  '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
                  reason: 'SERVICE_DISABLED',
                  metadata: {
                    service: 'drive.googleapis.com',
                    consumer: 'projects/123456789',
                  },
                },
              ],
            },
          }), { status: 403, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('{}', { status: 200 });
      });

      try {
        await GoogleDriveService.exchangeCodeAndConnect('test-code-service-disabled');
        expect.unreachable('Should have thrown DriveSetupError');
      } catch (err: any) {
        expect(err).toBeInstanceOf(DriveSetupError);
        expect(err.stage).toBe('folder_search');
        expect(err.code).toBe('SERVICE_DISABLED');
        expect(err.userMessageTr).toContain('Google Drive API bu projede etkinleştirilmemiş (Google Cloud Proje No: 123456789)');
        expect(err.userMessageTr).toContain('SERVICE_DISABLED');
      }

      // Crucially, the account credentials were encrypted and saved in DB so they are not lost!
      const accounts = await dataStore.getDriveAccounts();
      const saved = accounts.find((a) => a.email === 'disabled-api-user@gmail.com');
      expect(saved).toBeDefined();
      expect(saved?.folderId).toBeNull();
    });

    it('handles storage quota exceeded (storageQuotaExceeded / 403) during folder creation', async () => {
      GoogleDriveService.resetCodeTracking();

      vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init?: any) => {
        const urlStr = String(url);
        if (urlStr.includes('files?') && decodeURIComponent(urlStr.replace(/\+/g, ' ')).includes("name = 'XXQ Chat'")) {
          return new Response(JSON.stringify({ files: [] }), { status: 200 });
        }
        if (urlStr.endsWith('drive/v3/files') && init?.method === 'POST') {
          return new Response(JSON.stringify({
            error: {
              code: 403,
              message: "The user's Drive storage quota has been exceeded.",
              errors: [{ reason: 'storageQuotaExceeded' }],
            },
          }), { status: 403, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('{}', { status: 200 });
      });

      try {
        await GoogleDriveService.ensureAppFolder('token_quota_full');
        expect.unreachable('Should have thrown DriveSetupError');
      } catch (err: any) {
        expect(err).toBeInstanceOf(DriveSetupError);
        expect(err.stage).toBe('folder_creation');
        expect(err.userMessageTr).toContain('Google Drive depolama alanı kotası aşıldı');
      }
    });

    it('handles revoked or unauthenticated credentials (UNAUTHENTICATED / 401)', async () => {
      GoogleDriveService.resetCodeTracking();

      vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('drive/v3/files')) {
          return new Response(JSON.stringify({
            error: {
              code: 401,
              message: 'Invalid Credentials',
              errors: [{ reason: 'authError' }],
              status: 'UNAUTHENTICATED',
            },
          }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('{}', { status: 200 });
      });

      try {
        await GoogleDriveService.ensureAppFolder('revoked_token_123');
        expect.unreachable('Should have thrown DriveSetupError');
      } catch (err: any) {
        expect(err).toBeInstanceOf(DriveSetupError);
        expect(err.stage).toBe('folder_search');
        expect(err.userMessageTr).toContain('Google Drive erişim belirteci geçersiz veya süresi dolmuş');
      }
    });

    it('heals missing folder via syncAccountQuota or initAccountFolder using stored refresh token without needing an authorization code', async () => {
      GoogleDriveService.resetCodeTracking();

      vi.stubEnv('GOOGLE_DRIVE_CLIENT_ID', 'client-id-123');
      vi.stubEnv('GOOGLE_DRIVE_CLIENT_SECRET', 'secret-456');

      // Create an account with folderId null in DB
      const account = await dataStore.addDriveAccount({
        email: 'heal-test@company.com',
        displayName: 'Heal Test',
        encryptedRefreshToken: encryptSecret('saved_refresh_token_healer'),
        folderId: null,
      });

      vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init?: any) => {
        const urlStr = String(url);
        if (urlStr.includes('oauth2.googleapis.com/token')) {
          return new Response(JSON.stringify({
            access_token: 'refreshed_access_token_999',
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.includes('files?') && decodeURIComponent(urlStr.replace(/\+/g, ' ')).includes("name = 'XXQ Chat'")) {
          return new Response(JSON.stringify({ files: [] }), { status: 200 });
        }
        if (urlStr.endsWith('drive/v3/files') && init?.method === 'POST') {
          return new Response(JSON.stringify({ id: 'fld_healed_success_456' }), { status: 200 });
        }
        if (urlStr.includes('about')) {
          return new Response(JSON.stringify({ storageQuota: { usage: '2048', limit: '100000' } }), { status: 200 });
        }
        return new Response('{}', { status: 200 });
      });

      // Sync heals the folder
      const syncResult = await GoogleDriveService.syncAccountQuota(account);
      expect(syncResult.folderId).toBe('fld_healed_success_456');

      // Verify DB was updated
      const updatedAccount = await dataStore.getDriveAccountById(account.id);
      expect(updatedAccount?.folderId).toBe('fld_healed_success_456');

      // initAccountFolder direct invocation test
      const initFolderRes = await GoogleDriveService.initAccountFolder(updatedAccount!);
      expect(initFolderRes).toBe('fld_healed_success_456');
    });

    it('callback endpoint renders Google Drive Klasörü Oluşturulamadı and informs user of folder failure instead of code error', async () => {
      GoogleDriveService.resetCodeTracking();

      const state = GoogleDriveService.generateState('admin_user_folder_test');

      vi.spyOn(GoogleDriveService, 'exchangeCodeAndConnect').mockRejectedValueOnce(
        new DriveSetupError(
          'SERVICE_DISABLED',
          'Google Drive API bu projede etkinleştirilmemiş (Google Cloud Proje No: 123456789) (SERVICE_DISABLED). Lütfen Google Cloud Console üzerinden Google Drive APIyi etkinleştirin.',
          'folder_creation'
        )
      );

      const res = await request(app).get(`/api/drive/callback?code=fresh-code-123&state=${state}`);
      expect(res.status).toBe(400);
      expect(res.text).toContain('Google Drive Klasörü Oluşturulamadı');
      expect(res.text).toContain('Google hesap yetkilendirmesi başarıyla tamamlandı, ancak Google Drive API üzerinde "XXQ Chat" klasörü oluşturulurken veya aranırken bir hata oluştu');
      expect(res.text).toContain('SERVICE_DISABLED');
      // Must not display misleading authorization code error text
      expect(res.text).not.toContain('Google yetkilendirme kodu doğrulanamadı: 400');
    });

    it('re-submitting an authorization code that failed at folder creation explains code was consumed and folder creation failed', async () => {
      GoogleDriveService.resetCodeTracking();

      vi.stubEnv('GOOGLE_DRIVE_CLIENT_ID', 'client-id-123');
      vi.stubEnv('GOOGLE_DRIVE_CLIENT_SECRET', 'secret-456');
      vi.stubEnv('GOOGLE_DRIVE_REDIRECT_URI', 'https://xxq-chat-backend.onrender.com/api/drive/callback');

      vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('oauth2.googleapis.com/token')) {
          return new Response(JSON.stringify({
            access_token: 'token_exchange_ok',
            refresh_token: '1//refresh_ok',
            expires_in: 3600,
            scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (urlStr.includes('userinfo')) {
          return new Response(JSON.stringify({ email: 'retry-test@company.com' }), { status: 200 });
        }
        if (urlStr.includes('drive/v3/files')) {
          return new Response(JSON.stringify({
            error: { code: 403, message: 'Drive API disabled', status: 'PERMISSION_DENIED', details: [{ reason: 'SERVICE_DISABLED' }] },
          }), { status: 403, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('{}', { status: 200 });
      });

      const testCode = 'code_consumed_folder_failed_123';

      // First run: folder creation fails
      await expect(GoogleDriveService.exchangeCodeAndConnect(testCode)).rejects.toThrow(
        /Google Drive API bu projede etkinleştirilmemiş/
      );

      // Second run with SAME code: accurately explains that code was consumed and folder creation failed
      await expect(GoogleDriveService.exchangeCodeAndConnect(testCode)).rejects.toThrow(
        /Bu yetkilendirme kodu Google ile başarıyla doğrulandı ancak 'XXQ Chat' klasörü oluşturulurken bir hata oluştu/
      );
    });
  });
});

