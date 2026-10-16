import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { dataStore, initDb, closeDb } from '../db/index.js';
import { generateDevToken, authorizeUser } from '../auth/index.js';

describe('XXQ Chat Features & Fixes Verification Suite', () => {
  const adminUser = {
    id: 'usr_feat_admin',
    email: 'admin@company.com',
    displayName: 'Admin User',
    isAdmin: true,
  };
  const normalUser = {
    id: 'usr_feat_user1',
    email: 'user1@company.com',
    displayName: 'Normal User',
    isAdmin: false,
  };
  const secretUser = {
    id: 'usr_feat_user2',
    email: 'user2@company.com',
    displayName: 'Secret User',
    isAdmin: false,
  };

  let adminToken: string;
  let userToken: string;
  let secretToken: string;
  let conversationId: string;
  let reportId: string;

  beforeAll(async () => {
    await initDb();
    await dataStore.setWhitelistMode(false);

    await dataStore.upsertUser({
      ...adminUser,
      onboarded: true,
      status: 'active',
      isAdmin: true,
    });
    await dataStore.upsertUser({
      ...normalUser,
      onboarded: true,
      status: 'active',
      avatarUrl: 'https://example.com/initial_avatar.png',
    });
    await dataStore.upsertUser({
      ...secretUser,
      onboarded: true,
      status: 'active',
    });

    adminToken = generateDevToken(adminUser);
    userToken = generateDevToken(normalUser);
    secretToken = generateDevToken(secretUser);
  });

  afterAll(async () => {
    await closeDb();
  });

  describe('Profile Avatar & Theme Preference', () => {
    it('updates user avatar via URL or data URI and persists it', async () => {
      const res = await request(app)
        .post('/api/users/avatar')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ avatarUrl: 'https://example.com/custom_avatar.png' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.avatarUrl).toBe('https://example.com/custom_avatar.png');

      const meRes = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${userToken}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.user.avatarUrl).toBe('https://example.com/custom_avatar.png');
    });

    it('does not overwrite custom avatar with default provider picture on re-authorization', async () => {
      // Simulate OAuth login where provider sends a standard Google picture
      const authResult = await authorizeUser({
        id: normalUser.id,
        email: normalUser.email,
        displayName: 'Normal User Updated',
        avatarUrl: 'https://lh3.googleusercontent.com/default-google-pic.jpg',
      });

      expect(authResult).toBeDefined();
      expect(authResult.id).toBe(normalUser.id);
      // Must retain existing custom avatar, NOT overwrite with Google photo
      expect(authResult.avatarUrl).toBe('https://example.com/custom_avatar.png');
    });

    it('updates and retrieves user theme preference (dark/light)', async () => {
      const patchRes = await request(app)
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ themePreference: 'light' });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.user.themePreference).toBe('light');

      const meRes = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${userToken}`);

      expect(meRes.body.user.themePreference).toBe('light');
    });
  });

  describe('Group Logo Management', () => {
    it('creates a group and allows admin to set and remove group logo', async () => {
      const createRes = await request(app)
        .post('/api/conversations/group')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Tasarım Ekibi',
          memberIds: [secretUser.id],
        });

      expect(createRes.status).toBe(201);
      conversationId = createRes.body.conversation.id;

      // User 1 (group admin) updates avatar
      const avatarRes = await request(app)
        .post(`/api/conversations/${conversationId}/avatar`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ avatarUrl: 'https://example.com/group-logo.png' });

      expect(avatarRes.status).toBe(200);
      expect(avatarRes.body.success).toBe(true);
      expect(avatarRes.body.avatarUrl).toBe('https://example.com/group-logo.png');

      // Secret user (non-admin participant) cannot change group logo
      const forbiddenRes = await request(app)
        .post(`/api/conversations/${conversationId}/avatar`)
        .set('Authorization', `Bearer ${secretToken}`)
        .send({ avatarUrl: 'https://example.com/hacker-logo.png' });

      expect(forbiddenRes.status).toBe(403);

      // User 1 removes group avatar
      const deleteRes = await request(app)
        .delete(`/api/conversations/${conversationId}/avatar`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);
    });
  });

  describe('Scoped Turkish Search (Arama)', () => {
    beforeAll(async () => {
      // Send a test message in conversationId (participants: normalUser, secretUser)
      await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ content: 'Gizli proje toplantı notları XXQ' });
    });

    it('returns messages and conversations matching search query for authorized participant', async () => {
      const res = await request(app)
        .get('/api/search?q=toplantı')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.messages).toBeDefined();
      expect(res.body.messages.length).toBeGreaterThan(0);
      expect(res.body.messages[0].content).toContain('Gizli proje toplantı');
    });

    it('isolates search results so unauthorized users cannot find conversation messages', async () => {
      // adminUser is not in the private group conversationId
      const res = await request(app)
        .get('/api/search?q=toplantı')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      // Should not see the private message from conversationId
      const found = res.body.messages.some((m: any) => m.content.includes('Gizli proje toplantı'));
      expect(found).toBe(false);
    });
  });

  describe('Contact Us / Report Problem ("Sorun Bildir")', () => {
    it('creates a support report with sanitized system diagnostics', async () => {
      const res = await request(app)
        .post('/api/support/reports')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Ekran paylaşımı bağlantı sorunu',
          description: 'Toplantı sırasında ekran paylaşımı başlatılamadı.',
          diagnostics: {
            appVersion: '1.0.0',
            platform: 'web',
            userAgent: 'Mozilla/5.0 Chrome/120.0',
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.report).toBeDefined();
      expect(res.body.report.id).toBeDefined();
      expect(res.body.report.title).toBe('Ekran paylaşımı bağlantı sorunu');
      expect(res.body.report.status).toBe('open');

      reportId = res.body.report.id;
    });

    it('allows administrators to list and update report status', async () => {
      const listRes = await request(app)
        .get('/api/support/reports')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.reports).toBeDefined();
      expect(listRes.body.reports.length).toBeGreaterThan(0);

      const updateRes = await request(app)
        .patch(`/api/support/reports/${reportId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'resolved' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);
    });

    it('denies non-administrators from accessing or updating support reports', async () => {
      const listRes = await request(app)
        .get('/api/support/reports')
        .set('Authorization', `Bearer ${userToken}`);

      expect(listRes.status).toBe(403);

      const updateRes = await request(app)
        .patch(`/api/support/reports/${reportId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ status: 'closed' });

      expect(updateRes.status).toBe(403);
    });
  });

  describe('Google Drive Status and Callback', () => {
    it('returns drive configuration status to admins and denies non-admins', async () => {
      const forbiddenRes = await request(app)
        .get('/api/drive/status')
        .set('Authorization', `Bearer ${userToken}`);

      expect(forbiddenRes.status).toBe(403);

      const adminRes = await request(app)
        .get('/api/drive/status')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(adminRes.status).toBe(200);
      expect(typeof adminRes.body.isConfigured).toBe('boolean');
    });

    it('renders Turkish callback message on /api/drive/callback', async () => {
      const res = await request(app).get('/api/drive/callback?code=mock_code&state=mock_state');

      expect(res.status).toBe(200);
      expect(res.text).toContain('Google Drive Bağlantısı');
      expect(res.text).toContain('Pencere birkaç saniye içinde otomatik olarak kapanacaktır');
    });
  });
});
