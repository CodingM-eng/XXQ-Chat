import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { dataStore } from '../db/index.js';
import { generateDevToken } from '../auth/index.js';

describe('XXQ Chat Moderator Role & RBAC Suite', () => {
  const adminEmail = 'codingdevelopia@gmail.com';
  const candidateEmail = 'candidate@xxq.internal';
  const regularUserEmail = 'regular@xxq.internal';

  let adminToken: string;
  let candidateToken: string;
  let regularToken: string;
  let candidateId: string;
  let regularUserId: string;

  beforeEach(async () => {
    adminToken = generateDevToken({ id: 'adm_1', email: adminEmail, displayName: 'Sistem Yöneticisi', isAdmin: true });
    candidateId = 'usr_cand_1';
    regularUserId = 'usr_reg_1';

    await dataStore.addToWhitelist(adminEmail, 'system');
    await dataStore.addToWhitelist(candidateEmail, adminEmail);
    await dataStore.addToWhitelist(regularUserEmail, adminEmail);

    await dataStore.upsertUser({
      id: candidateId,
      email: candidateEmail,
      displayName: 'Aday Moderatör',
      isAdmin: false,
      isModerator: false,
      status: 'active',
      onboarded: true,
    });

    await dataStore.upsertUser({
      id: regularUserId,
      email: regularUserEmail,
      displayName: 'Normal Kullanıcı',
      isAdmin: false,
      isModerator: false,
      status: 'active',
      onboarded: true,
    });

    candidateToken = generateDevToken({ id: candidateId, email: candidateEmail, displayName: 'Aday Moderatör' });
    regularToken = generateDevToken({ id: regularUserId, email: regularUserEmail, displayName: 'Normal Kullanıcı' });
  });

  it('allows administrators to assign moderator role and records MODERATOR_GRANTED audit log', async () => {
    const res = await request(app)
      .post(`/api/admin/moderators/${candidateId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.isModerator).toBe(true);

    const userInDb = await dataStore.getUserById(candidateId);
    expect(userInDb?.isModerator).toBe(true);

    const logs = await dataStore.getAuditLogs(10);
    const modLog = logs.find((l) => l.action === 'MODERATOR_GRANTED');
    expect(modLog).toBeDefined();
    expect(modLog?.target).toBe(candidateEmail);
  });

  it('lists active moderators in GET /api/admin/moderators', async () => {
    await dataStore.setModerator(candidateId, true);

    const res = await request(app)
      .get('/api/admin/moderators')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.moderators).toBeInstanceOf(Array);
    const found = res.body.moderators.find((m: any) => m.id === candidateId);
    expect(found).toBeDefined();
    expect(found.email).toBe(candidateEmail);
  });

  it('allows moderators to moderate (delete) messages in conversations', async () => {
    // 1. Create a conversation between candidate and regular user
    const convId = await dataStore.createDirectConversation(candidateId, regularUserId);

    // 2. Regular user sends a message
    const msg = await dataStore.saveMessage({
      conversationId: convId,
      senderId: regularUserId,
      senderName: 'Normal Kullanıcı',
      content: 'Uygunsuz veya silinmesi gereken mesaj',
      status: 'sent',
    });

    // 3. Before becoming moderator, candidate cannot delete another user's message
    const unauthorizedRes = await request(app)
      .delete(`/api/conversations/${convId}/messages/${msg.id}`)
      .set('Authorization', `Bearer ${candidateToken}`);

    expect(unauthorizedRes.status).toBe(403);

    // 4. Promote candidate to moderator
    await dataStore.setModerator(candidateId, true);

    // 5. As moderator, candidate can delete the message
    const authorizedRes = await request(app)
      .delete(`/api/conversations/${convId}/messages/${msg.id}`)
      .set('Authorization', `Bearer ${candidateToken}`);

    expect(authorizedRes.status).toBe(200);
    expect(authorizedRes.body.success).toBe(true);

    const messagesRemaining = await dataStore.getConversationMessages(convId);
    expect(messagesRemaining.find((m) => m.id === msg.id)).toBeUndefined();
  });

  it('strictly forbids moderators from accessing admin-only actions (like whitelist toggling)', async () => {
    await dataStore.setModerator(candidateId, true);

    const res = await request(app)
      .post('/api/admin/whitelist/toggle')
      .set('Authorization', `Bearer ${candidateToken}`)
      .send({ enabled: false, confirmation: true });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('allows administrators to revoke moderator role and records MODERATOR_REVOKED audit log', async () => {
    await dataStore.setModerator(candidateId, true);

    const res = await request(app)
      .delete(`/api/admin/moderators/${candidateId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.isModerator).toBe(false);

    const logs = await dataStore.getAuditLogs(10);
    const modLog = logs.find((l) => l.action === 'MODERATOR_REVOKED');
    expect(modLog).toBeDefined();
    expect(modLog?.target).toBe(candidateEmail);
  });
});
