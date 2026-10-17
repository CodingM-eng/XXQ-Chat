import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { dataStore, initDb, closeDb } from '../db/index.js';
import { generateDevToken } from '../auth/index.js';

describe('Calling, Profile Bio, Aile Role & Advanced Features Suite', () => {
  const platformAdmin = {
    id: 'usr_adv_admin',
    email: 'codingdevelopia@gmail.com',
    displayName: 'Platform Admin',
    isAdmin: true,
  };
  const familyUser = {
    id: 'usr_adv_family',
    email: 'family@test.com',
    displayName: 'Aile Üyesi',
    isAdmin: false,
    isFamily: true,
  };
  const regularUser1 = {
    id: 'usr_adv_reg1',
    email: 'regular1@test.com',
    displayName: 'Normal Kullanıcı 1',
    isAdmin: false,
  };
  const regularUser2 = {
    id: 'usr_adv_reg2',
    email: 'regular2@test.com',
    displayName: 'Normal Kullanıcı 2',
    isAdmin: false,
  };
  const moderatorUser = {
    id: 'usr_adv_mod',
    email: 'moderator@test.com',
    displayName: 'Platform Moderatörü',
    isAdmin: false,
    isModerator: true,
  };

  let adminToken: string;
  let familyToken: string;
  let reg1Token: string;
  let reg2Token: string;
  let modToken: string;

  beforeAll(async () => {
    await initDb();
    await dataStore.setWhitelistMode(false);

    await dataStore.upsertUser({ ...platformAdmin, onboarded: true, status: 'active', isAdmin: true });
    await dataStore.upsertUser({ ...familyUser, onboarded: true, status: 'active' });
    await dataStore.upsertUser({ ...regularUser1, onboarded: true, status: 'active' });
    await dataStore.upsertUser({ ...regularUser2, onboarded: true, status: 'active' });
    await dataStore.upsertUser({ ...moderatorUser, onboarded: true, status: 'active' });

    await dataStore.addToWhitelist(platformAdmin.email, platformAdmin.id);
    await dataStore.addToWhitelist(familyUser.email, familyUser.id);
    await dataStore.addToWhitelist(regularUser1.email, regularUser1.id);
    await dataStore.addToWhitelist(regularUser2.email, regularUser2.id);
    await dataStore.addToWhitelist(moderatorUser.email, moderatorUser.id);

    await dataStore.setUserFamily(familyUser.id, true);
    await dataStore.setModerator(moderatorUser.id, true);

    await dataStore.removeFriend(regularUser1.id, regularUser2.id);
    await dataStore.removeFriend(regularUser2.id, regularUser1.id);
    try {
      (dataStore as any).getSqlite?.()?.prepare('DELETE FROM friend_requests WHERE sender_id IN (?, ?) OR receiver_id IN (?, ?)').run(regularUser1.id, regularUser2.id, regularUser1.id, regularUser2.id);
    } catch {}

    adminToken = generateDevToken(platformAdmin);
    familyToken = generateDevToken(familyUser);
    reg1Token = generateDevToken(regularUser1);
    reg2Token = generateDevToken(regularUser2);
    modToken = generateDevToken(moderatorUser);
  });

  afterAll(async () => {
    await closeDb();
  });

  describe('1. Platform Roles: Platform Admin & Aile Role DM Protection', () => {
    it('Platform Admin codingdevelopia@gmail.com is strictly excluded from moderators list', async () => {
      const res = await request(app)
        .get('/api/admin/moderators')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const mods = res.body.moderators || [];
      const adminInMods = mods.some((m: any) => m.email?.toLowerCase() === 'codingdevelopia@gmail.com');
      expect(adminInMods).toBe(false);
    });

    it('Non-admin users are strictly blocked from initiating direct messages to Aile users', async () => {
      const res = await request(app)
        .post('/api/conversations/direct')
        .set('Authorization', `Bearer ${reg1Token}`)
        .send({
          targetUserId: familyUser.id,
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FAMILY_ROLE_PROTECTED');
    });

    it('Platform Admin can initiate direct messages with Aile users without restriction', async () => {
      const res = await request(app)
        .post('/api/conversations/direct')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          targetUserId: familyUser.id,
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.conversationId).toBeDefined();
    });

    it('Admin can toggle family status via POST /api/admin/users/:userId/family', async () => {
      // Toggle reg2 to family
      const res1 = await request(app)
        .post(`/api/admin/users/${regularUser2.id}/family`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isFamily: true });

      expect(res1.status).toBe(200);
      expect(res1.body.user.isFamily).toBe(true);

      // Now reg1 cannot DM reg2
      const res2 = await request(app)
        .post('/api/conversations/direct')
        .set('Authorization', `Bearer ${reg1Token}`)
        .send({ targetUserId: regularUser2.id });

      expect(res2.status).toBe(403);
      expect(res2.body.error).toBe('FAMILY_ROLE_PROTECTED');

      // Toggle reg2 back
      await request(app)
        .post(`/api/admin/users/${regularUser2.id}/family`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isFamily: false });
    });
  });

  describe('2. Profile Bio ("Hakkımda") & Group Privacy Settings', () => {
    it('User can update their bio and group privacy via PATCH /api/users/me', async () => {
      const res = await request(app)
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${reg1Token}`)
        .send({
          bio: 'XXQ Chat üzerinde yazılım ve yapay zeka geliştiricisi.',
          groupAddPrivacy: 'friends',
        });

      expect(res.status).toBe(200);
      expect(res.body.user.bio).toBe('XXQ Chat üzerinde yazılım ve yapay zeka geliştiricisi.');
      expect(res.body.user.groupAddPrivacy).toBe('friends');
    });

    it('Public profile inspection exposes bio and roles but conceals email and phone number', async () => {
      const res = await request(app)
        .get(`/api/users/${regularUser1.id}`)
        .set('Authorization', `Bearer ${reg2Token}`);

      expect(res.status).toBe(200);
      expect(res.body.user.displayName).toBe(regularUser1.displayName);
      expect(res.body.user.bio).toBe('XXQ Chat üzerinde yazılım ve yapay zeka geliştiricisi.');
      expect(res.body.user.email).toBeUndefined();
      expect(res.body.user.phoneNumber).toBeUndefined();
    });
  });

  describe('3. Group Ownership Transfer Requirement & System Messages', () => {
    let testGroupId: string;

    it('Creates group and welcomes members with system messages', async () => {
      const res = await request(app)
        .post('/api/conversations/groups')
        .set('Authorization', `Bearer ${reg1Token}`)
        .send({
          name: 'Geliştirici Topluluğu',
          participantIds: [regularUser2.id],
        });

      expect(res.status).toBe(201);
      testGroupId = res.body.conversation.id;

      // Check messages for welcome system message
      const msgRes = await request(app)
        .get(`/api/conversations/${testGroupId}/messages`)
        .set('Authorization', `Bearer ${reg1Token}`);

      expect(msgRes.status).toBe(200);
      const systemMsgs = (msgRes.body.messages || []).filter((m: any) => m.isSystem || m.type === 'system');
      expect(systemMsgs.length).toBeGreaterThan(0);
      expect(systemMsgs.some((m: any) => m.content.includes('hoş geldin') || m.content.includes('oluşturuldu'))).toBe(true);
    });

    it('Owner cannot leave group if other members remain without transferring ownership', async () => {
      const res = await request(app)
        .post(`/api/conversations/${testGroupId}/leave`)
        .set('Authorization', `Bearer ${reg1Token}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('OWNERSHIP_TRANSFER_REQUIRED');
    });

    it('Member can leave group freely and leave system message is published', async () => {
      const res = await request(app)
        .post(`/api/conversations/${testGroupId}/leave`)
        .set('Authorization', `Bearer ${reg2Token}`);

      expect(res.status).toBe(200);

      const msgRes = await request(app)
        .get(`/api/conversations/${testGroupId}/messages`)
        .set('Authorization', `Bearer ${reg1Token}`);

      expect(msgRes.status).toBe(200);
      const leaveMsg = (msgRes.body.messages || []).find((m: any) => m.content.includes('ayrıldı. Seni özleyeceğiz.'));
      expect(leaveMsg).toBeDefined();
    });

    it('Discoverable groups search returns matching public groups', async () => {
      const res = await request(app)
        .get('/api/conversations/groups/search?q=Geliştirici')
        .set('Authorization', `Bearer ${reg2Token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.groups)).toBe(true);
    });
  });

  describe('4. Friends System & Friend Requests', () => {
    it('User sends a friend request to another user', async () => {
      const res = await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${reg1Token}`)
        .send({
          recipientEmail: regularUser2.email,
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.request).toBeDefined();
      expect(res.body.request.status).toBe('pending');
    });

    it('Recipient views incoming friend requests and accepts', async () => {
      const listRes = await request(app)
        .get('/api/friends/requests')
        .set('Authorization', `Bearer ${reg2Token}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.incoming.length).toBeGreaterThan(0);
      const targetReq = listRes.body.incoming.find((r: any) => r.senderId === regularUser1.id);
      expect(targetReq).toBeDefined();

      const acceptRes = await request(app)
        .post('/api/friends/respond')
        .set('Authorization', `Bearer ${reg2Token}`)
        .send({
          requestId: targetReq.id,
          response: 'accepted',
        });

      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.success).toBe(true);
    });

    it('Both users now appear in each other friends list', async () => {
      const res1 = await request(app)
        .get('/api/friends')
        .set('Authorization', `Bearer ${reg1Token}`);

      expect(res1.status).toBe(200);
      expect(res1.body.friends.some((f: any) => f.id === regularUser2.id)).toBe(true);

      const res2 = await request(app)
        .get('/api/friends')
        .set('Authorization', `Bearer ${reg2Token}`);

      expect(res2.status).toBe(200);
      expect(res2.body.friends.some((f: any) => f.id === regularUser1.id)).toBe(true);
    });
  });

  describe('5. Discord Servers & Server Invites', () => {
    let testServerId: string;
    let inviteCode: string;

    it('Creates a multi-channel server and generates an invite link', async () => {
      const srvRes = await request(app)
        .post('/api/servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'XXQ Mühendislik Sunucusu',
          purpose: 'community',
          description: 'Açık kaynak ve yazılım topluluğu',
        });

      expect(srvRes.status).toBe(201);
      testServerId = srvRes.body.server.id;

      const invRes = await request(app)
        .post(`/api/servers/${testServerId}/invites`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          expiresInHours: 48,
          maxUses: 10,
        });

      expect(invRes.status).toBe(201);
      expect(invRes.body.invite.code).toBeDefined();
      inviteCode = invRes.body.invite.code;
    });

    it('Non-member joins server via invite code', async () => {
      const joinRes = await request(app)
        .post(`/api/servers/join/${inviteCode}`)
        .set('Authorization', `Bearer ${reg1Token}`);

      expect([200, 201]).toContain(joinRes.status);
      expect(joinRes.body.success).toBe(true);
      expect(joinRes.body.server.id).toBe(testServerId);
    });
  });

  describe('6. Telegram Bot Pool & Gemini AI Settings (Admin)', () => {
    it('Non-admin users cannot access Bot Pool or Gemini AI endpoints', async () => {
      const res1 = await request(app)
        .get('/api/admin/bot-pool')
        .set('Authorization', `Bearer ${reg1Token}`);
      expect(res1.status).toBe(403);

      const res2 = await request(app)
        .get('/api/admin/gemini')
        .set('Authorization', `Bearer ${reg1Token}`);
      expect(res2.status).toBe(403);
    });

    it('Admin can view bot pool', async () => {
      const res = await request(app)
        .get('/api/admin/bot-pool')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.botPool)).toBe(true);
    });

    it('Admin can configure Gemini AI settings safely', async () => {
      const saveRes = await request(app)
        .post('/api/admin/gemini')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          isEnabled: true,
          model: 'gemini-1.5-flash',
          defaultPrompt: 'Sen XXQ Chat yapay zeka asistanısın. Türkçe yanıt ver.',
        });

      expect(saveRes.status).toBe(200);
      expect(saveRes.body.config.isEnabled).toBe(true);
      expect(saveRes.body.config.model).toBe('gemini-1.5-flash');

      const getRes = await request(app)
        .get('/api/admin/gemini')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.config.defaultPrompt).toContain('XXQ Chat yapay zeka');
    });
  });
});
