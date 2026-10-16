import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { dataStore } from '../db/index.js';
import { generateDevToken } from '../auth/index.js';
import { GoogleDriveService } from '../services/drive.js';
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
});
