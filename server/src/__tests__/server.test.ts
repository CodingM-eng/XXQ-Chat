import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { db } from '../db/index.js';
import { generateDevToken } from '../auth/index.js';

describe('XXQ Chat Server Verification Suite', () => {
  let adminToken: string;
  let whitelistedUserToken: string;
  let blockedUserToken: string;

  const adminEmail = 'admin@xxqchat.com';
  const whitelistedEmail = 'alice@xxqchat.com';
  const blockedEmail = 'eve@outsider.com';

  beforeAll(() => {
    // Generate test tokens
    adminToken = generateDevToken({
      id: 'usr_admin_1',
      email: adminEmail,
      displayName: 'System Admin',
      isAdmin: true,
    });

    whitelistedUserToken = generateDevToken({
      id: 'usr_alice_1',
      email: whitelistedEmail,
      displayName: 'Alice Approved',
      isAdmin: false,
    });

    blockedUserToken = generateDevToken({
      id: 'usr_eve_1',
      email: blockedEmail,
      displayName: 'Eve Blocked',
      isAdmin: false,
    });

    // Ensure whitelist table has alice and admin
    db.prepare(`
      INSERT OR REPLACE INTO whitelist (email, approved_by) VALUES (?, ?)
    `).run(whitelistedEmail, 'admin@xxqchat.com');

    // Ensure users exist in users table
    db.prepare(`
      INSERT OR REPLACE INTO users (id, email, display_name, is_admin)
      VALUES (?, ?, ?, 0)
    `).run('usr_alice_1', whitelistedEmail, 'Alice Approved');

    db.prepare(`
      INSERT OR REPLACE INTO users (id, email, display_name, is_admin)
      VALUES (?, ?, ?, 0)
    `).run('usr_eve_1', blockedEmail, 'Eve Blocked');

    // Ensure eve is NOT in whitelist
    db.prepare('DELETE FROM whitelist WHERE email = ?').run(blockedEmail);

    // Turn whitelist mode ON for testing
    db.prepare(`
      INSERT OR REPLACE INTO system_settings (key, value) VALUES ('whitelist_mode', 'true')
    `).run();
  });

  describe('Health and System Status', () => {
    it('returns 200 with service information and database status on /health', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('xxq-chat-server');
      expect(res.body.database).toBe('connected');
      expect(res.body.whitelistActive).toBe(true);
    });
  });

  describe('Authentication & Session Verification', () => {
    it('rejects unauthenticated requests to protected endpoints with 401', async () => {
      const res = await request(app).get('/api/auth/session');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('UNAUTHORIZED');
    });

    it('rejects invalid or forged bearer tokens with 401', async () => {
      const res = await request(app)
        .get('/api/auth/session')
        .set('Authorization', 'Bearer invalid-token-string-12345');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('INVALID_TOKEN');
    });

    it('authenticates valid token and returns correct profile and whitelist status', async () => {
      const res = await request(app)
        .get('/api/auth/session')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(adminEmail);
      expect(res.body.user.isAdmin).toBe(true);
      expect(res.body.whitelist.canAccessApp).toBe(true);
    });

    it('allows dev login to generate valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/dev-login')
        .send({ email: 'bob@example.com', displayName: 'Bob Tester' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('bob@example.com');
      expect(res.body.user.displayName).toBe('Bob Tester');
    });
  });

  describe('Server-Side Whitelist Access Control Enforcement', () => {
    it('allows an approved whitelisted user to access protected resources', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${whitelistedUserToken}`);
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(whitelistedEmail);
    });

    it('blocks an unapproved user with 403 when whitelist mode is ON', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${blockedUserToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('ACCESS_DENIED_NOT_WHITELISTED');
      expect(res.body.whitelistActive).toBe(true);
    });

    it('allows an unapproved user access when whitelist mode is toggled OFF', async () => {
      // Toggle whitelist mode OFF
      const toggleRes = await request(app)
        .post('/api/admin/whitelist/toggle')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ enabled: false, confirmation: true });
      expect(toggleRes.status).toBe(200);
      expect(toggleRes.body.whitelistMode).toBe(false);

      // Eve should now have access
      const eveRes = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${blockedUserToken}`);
      expect(eveRes.status).toBe(200);

      // Re-enable whitelist mode for subsequent tests
      await request(app)
        .post('/api/admin/whitelist/toggle')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ enabled: true, confirmation: true });
    });
  });

  describe('Administrator Authorization and Audit Logging', () => {
    it('blocks non-admin users from accessing admin endpoints with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/admin/status')
        .set('Authorization', `Bearer ${whitelistedUserToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });

    it('allows verified admin to view admin status and system stats', async () => {
      const res = await request(app)
        .get('/api/admin/status')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.whitelistMode).toBe(true);
      expect(res.body.stats).toBeDefined();
    });

    it('allows admin to approve a new user email and logs the action', async () => {
      const newEmail = 'charlie@company.com';
      const addRes = await request(app)
        .post('/api/admin/whitelist/add')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: newEmail });
      expect(addRes.status).toBe(200);
      expect(addRes.body.success).toBe(true);

      // Verify audit log has recorded the action
      const logsRes = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(logsRes.status).toBe(200);
      const latest = logsRes.body.auditLogs[0];
      expect(latest.action).toBe('USER_WHITELIST_APPROVED');
      expect(latest.target).toBe(newEmail);
      expect(latest.actor_email).toBe(adminEmail);
    });

    it('prevents removing the initial designated administrator account', async () => {
      const res = await request(app)
        .delete(`/api/admin/whitelist/${adminEmail}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('PROTECTED_ACCOUNT');
    });
  });

  describe('Messaging, Idempotency, and Conversations', () => {
    let testConversationId: string;

    it('creates a 1-on-1 direct conversation between two users', async () => {
      const res = await request(app)
        .post('/api/conversations/direct')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ peerEmail: whitelistedEmail });
      expect([200, 201]).toContain(res.status);
      expect(res.body.conversationId).toBeDefined();
      testConversationId = res.body.conversationId;
    });

    it('sends a message and saves it to history', async () => {
      const clientMsgId = 'client_uuid_' + Date.now();
      const res = await request(app)
        .post(`/api/conversations/${testConversationId}/messages`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          content: 'Hello Alice from Admin!',
          clientMessageId: clientMsgId,
        });
      expect(res.status).toBe(201);
      expect(res.body.message.content).toBe('Hello Alice from Admin!');
      expect(res.body.message.client_message_id).toBe(clientMsgId);

      // Verify message is in conversation history
      const historyRes = await request(app)
        .get(`/api/conversations/${testConversationId}/messages`)
        .set('Authorization', `Bearer ${whitelistedUserToken}`);
      expect(historyRes.status).toBe(200);
      expect(historyRes.body.messages.length).toBeGreaterThan(0);
      expect(historyRes.body.messages.some((m: any) => m.clientMessageId === clientMsgId)).toBe(true);
    });

    it('handles message deduplication with clientMessageId gracefully', async () => {
      const clientMsgId = 'dedup_test_' + Date.now();
      // First submission
      await request(app)
        .post(`/api/conversations/${testConversationId}/messages`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          content: 'Idempotency test message',
          clientMessageId: clientMsgId,
        });

      // Second identical submission
      const res2 = await request(app)
        .post(`/api/conversations/${testConversationId}/messages`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          content: 'Idempotency test message',
          clientMessageId: clientMsgId,
        });

      expect(res2.status).toBe(200);
      expect(res2.body.deduplicated).toBe(true);
    });

    it('prevents non-participants from accessing or sending to conversation', async () => {
      // First whitelist eve temporarily to pass whitelist check, then verify conversation access is forbidden
      await request(app)
        .post('/api/admin/whitelist/add')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: blockedEmail });

      const res = await request(app)
        .get(`/api/conversations/${testConversationId}/messages`)
        .set('Authorization', `Bearer ${blockedUserToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');

      // Re-remove eve from whitelist
      await request(app)
        .delete(`/api/admin/whitelist/${blockedEmail}`)
        .set('Authorization', `Bearer ${adminToken}`);
    });
  });
});
