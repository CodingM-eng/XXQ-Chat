import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { dataStore, initDb, closeDb } from '../db/index.js';
import { generateDevToken } from '../auth/index.js';

describe('XXQ Chat Community Setup, Roles, DM Friend/Block Actions & Personalization Suite', () => {
  const serverOwner = {
    id: 'usr_comm_owner',
    email: 'owner@xxq.chat',
    displayName: 'Sunucu Sahibi',
    isAdmin: false,
  };
  const applicantUser = {
    id: 'usr_comm_applicant',
    email: 'applicant@xxq.chat',
    displayName: 'Aday Üye',
    isAdmin: false,
  };
  const otherUser = {
    id: 'usr_comm_other',
    email: 'other@xxq.chat',
    displayName: 'Diğer Kullanıcı',
    isAdmin: false,
  };

  let ownerToken: string;
  let applicantToken: string;
  let otherToken: string;
  let serverId: string;
  let inviteCode: string;
  let joinRequestId: string;
  let roleId: string;

  beforeAll(async () => {
    await initDb();
    await dataStore.setWhitelistMode(false);

    await dataStore.upsertUser({
      ...serverOwner,
      onboarded: true,
      status: 'active',
      bio: 'Topluluk kurucusu',
    });
    await dataStore.upsertUser({
      ...applicantUser,
      onboarded: true,
      status: 'active',
    });
    await dataStore.upsertUser({
      ...otherUser,
      onboarded: true,
      status: 'active',
    });

    await dataStore.unblockUser(serverOwner.id, otherUser.id).catch(() => {});

    ownerToken = generateDevToken(serverOwner);
    applicantToken = generateDevToken(applicantUser);
    otherToken = generateDevToken(otherUser);
  });

  afterAll(async () => {
    await closeDb();
  });

  describe('Part 1: Community Identity & Setup Questions', () => {
    it('creates a new server with purpose, welcome message, rules, and join questions', async () => {
      const res = await request(app)
        .post('/api/servers')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Türkiye Oyun Topluluğu',
          purpose: 'gaming',
          description: 'E-spor ve oyun meraklıları',
          welcomeMessage: 'Hoş geldiniz! Kuralları okuyup tanışma kanalına yazabilirsiniz.',
          rules: '1. Saygılı olun. 2. Spam yapmayın.',
          requiresApproval: true,
          joinQuestions: [
            { id: 'q1', question: 'Topluluğumuza katılma amacınız nedir?', required: true, order: 0 },
            { id: 'q2', question: 'Hangi oyunları oynuyorsunuz?', required: false, order: 1 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.server).toBeDefined();
      expect(res.body.server.name).toBe('Türkiye Oyun Topluluğu');
      expect(res.body.server.requiresApproval).toBe(true);
      expect(res.body.server.joinQuestions).toHaveLength(2);
      serverId = res.body.server.id;
    });

    it('updates community logo and banner via URL and allows removal', async () => {
      // 1. Update logo
      const logoRes = await request(app)
        .post(`/api/servers/${serverId}/logo`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ logoUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=200' });
      expect(logoRes.status).toBe(200);
      expect(logoRes.body.server.avatarUrl).toContain('images.unsplash.com');

      // 2. Update banner
      const bannerRes = await request(app)
        .post(`/api/servers/${serverId}/banner`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ bannerUrl: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800' });
      expect(bannerRes.status).toBe(200);
      expect(bannerRes.body.server.bannerUrl).toContain('images.unsplash.com');

      // 3. Remove logo
      const delLogoRes = await request(app)
        .delete(`/api/servers/${serverId}/logo`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(delLogoRes.status).toBe(200);
      expect(delLogoRes.body.server.avatarUrl).toBeNull();
    });

    it('creates an invite link and allows prospective member to preview server and questions', async () => {
      const invRes = await request(app)
        .post(`/api/servers/${serverId}/invites`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ expiresInHours: 24 });
      expect(invRes.status).toBe(201);
      expect(invRes.body.invite.code).toBeDefined();
      inviteCode = invRes.body.invite.code;

      // Preview invite
      const previewRes = await request(app)
        .get(`/api/servers/invite/${inviteCode}`)
        .set('Authorization', `Bearer ${applicantToken}`);
      expect(previewRes.status).toBe(200);
      expect(previewRes.body.invite.serverName).toBe('Türkiye Oyun Topluluğu');
      expect(previewRes.body.invite.requiresApproval).toBe(true);
      expect(previewRes.body.invite.joinQuestions).toHaveLength(2);
    });

    it('enforces required question answers when accepting invite', async () => {
      // Missing required question q1
      const failRes = await request(app)
        .post(`/api/servers/invite/${inviteCode}/accept`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ answers: { q2: 'Yalnızca CS2' } });
      expect(failRes.status).toBe(400);
      expect(failRes.body.message).toContain('sorusunun yanıtlanması zorunludur');

      // Submit with all required answers -> creates pending request
      const passRes = await request(app)
        .post(`/api/servers/invite/${inviteCode}/accept`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({
          answers: {
            q1: 'Turnuvalara katılmak ve takım arkadaşı bulmak istiyorum.',
            q2: 'CS2 ve Valorant',
          },
        });
      expect(passRes.status).toBe(200);
      expect(passRes.body.pendingApproval).toBe(true);
      expect(passRes.body.message).toContain('iletildi');
    });

    it('lets authorized admins view join requests with private answers and approve them', async () => {
      // Non-member cannot view join requests
      const forbiddenRes = await request(app)
        .get(`/api/servers/${serverId}/join-requests`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(forbiddenRes.status).toBe(403);

      // Owner views join requests
      const reqRes = await request(app)
        .get(`/api/servers/${serverId}/join-requests`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(reqRes.status).toBe(200);
      expect(reqRes.body.requests.length).toBeGreaterThan(0);

      const reqItem = reqRes.body.requests.find((r: any) => r.userId === applicantUser.id);
      expect(reqItem).toBeDefined();
      expect(reqItem.answers).toBeDefined();
      expect(reqItem.answers.q1).toContain('Turnuvalara katılmak');
      joinRequestId = reqItem.id;

      // Admin approves request
      const approveRes = await request(app)
        .post(`/api/servers/${serverId}/join-requests/${joinRequestId}/resolve`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ action: 'approve' });
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.success).toBe(true);

      // Verify applicant is now a member
      const serverCheck = await request(app)
        .get(`/api/servers/${serverId}`)
        .set('Authorization', `Bearer ${applicantToken}`);
      expect(serverCheck.status).toBe(200);
      expect(serverCheck.body.server.memberIds).toContain(applicantUser.id);
    });
  });

  describe('Part 2: Community Custom Roles & Permissions', () => {
    it('creates a custom role with permissions (send_announcements, manage_messages)', async () => {
      const res = await request(app)
        .post(`/api/servers/${serverId}/roles`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Moderatör Lideri',
          color: '#3b82f6',
          permissions: ['send_announcements', 'manage_messages'],
          order: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.role.name).toBe('Moderatör Lideri');
      expect(res.body.role.permissions).toContain('send_announcements');
      roleId = res.body.role.id;
    });

    it('assigns custom role to member and verifies permissions', async () => {
      const assignRes = await request(app)
        .post(`/api/servers/${serverId}/members/${applicantUser.id}/roles`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ roleIds: [roleId] });
      expect(assignRes.status).toBe(200);

      // Verify custom roles listed on server
      const rolesRes = await request(app)
        .get(`/api/servers/${serverId}/roles`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(rolesRes.status).toBe(200);
      expect(rolesRes.body.roles.some((r: any) => r.id === roleId)).toBe(true);
    });

    it('enforces announcement permission on announcement channels', async () => {
      // 1. Create announcement channel
      const chRes = await request(app)
        .post(`/api/servers/${serverId}/channels`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'duyurular-vip', isAnnouncementOnly: true });
      expect(chRes.status).toBe(201);
      const channelId = chRes.body.channel.id;

      // 2. Member WITH send_announcements role CAN post
      const allowedPost = await request(app)
        .post(`/api/conversations/${channelId}/messages`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ content: 'VIP Turnuva başladı!' });
      expect(allowedPost.status).toBe(201);

      // 3. User WITHOUT permission CANNOT post
      // Add otherUser as regular member without role
      await request(app)
        .post(`/api/servers/${serverId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ userId: otherUser.id, role: 'member' });

      const blockedPost = await request(app)
        .post(`/api/conversations/${channelId}/messages`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ content: 'İzinsiz mesaj denemesi' });
      expect(blockedPost.status).toBe(403);
      expect(blockedPost.body.message).toContain('salt okunur duyuru');
    });
  });

  describe('Part 3: User Blocking & DM Friend Actions', () => {
    it('allows blocking a user, updates relationship, and prevents DM message exchange', async () => {
      // Check initial relationship
      const relBefore = await request(app)
        .get(`/api/users/${otherUser.id}/relationship`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(relBefore.status).toBe(200);
      expect(relBefore.body.relationship.isBlocked).toBe(false);

      // Block otherUser
      const blockRes = await request(app)
        .post(`/api/users/${otherUser.id}/block`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(blockRes.status).toBe(200);
      expect(blockRes.body.success).toBe(true);

      // Check updated relationship
      const relAfter = await request(app)
        .get(`/api/users/${otherUser.id}/relationship`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(relAfter.status).toBe(200);
      expect(relAfter.body.relationship.isBlocked).toBe(true);

      // List blocked users
      const blockedList = await request(app)
        .get('/api/users/me/blocked')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(blockedList.status).toBe(200);
      expect(blockedList.body.blockedUsers.some((u: any) => u.id === otherUser.id)).toBe(true);

      // Sending friend request to a blocked user is prevented
      const friendReq = await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ recipientId: otherUser.id });
      expect(friendReq.status).toBe(400);
      expect(friendReq.body.message).toContain('Engellenen');

      // Unblock user
      const unblockRes = await request(app)
        .post(`/api/users/${otherUser.id}/unblock`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(unblockRes.status).toBe(200);
      expect(unblockRes.body.success).toBe(true);
    });
  });

  describe('Part 4: 100% Free Personalization for Every User', () => {
    it('allows updating profile banner and custom accent color without paid tiers', async () => {
      const updateRes = await request(app)
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({
          bannerUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800',
          accentColor: '#ec4899',
          bio: 'XXQ Chat ücretsiz kişiselleştirme harika!',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.user.bannerUrl).toContain('images.unsplash.com');
      expect(updateRes.body.user.accentColor).toBe('#ec4899');
      expect(updateRes.body.user.bio).toBe('XXQ Chat ücretsiz kişiselleştirme harika!');

      // Check profile endpoint exposes accentColor and bannerUrl
      const profRes = await request(app)
        .get(`/api/users/${applicantUser.id}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(profRes.status).toBe(200);
      expect(profRes.body.user.bannerUrl).toContain('images.unsplash.com');
      expect(profRes.body.user.accentColor).toBe('#ec4899');
    });

    it('allows uploading and removing profile banner via dedicated banner endpoint', async () => {
      const bannerRes = await request(app)
        .post('/api/users/banner')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ bannerUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800' });
      expect(bannerRes.status).toBe(200);
      expect(bannerRes.body.bannerUrl).toContain('images.unsplash.com');

      const delBanner = await request(app)
        .delete('/api/users/banner')
        .set('Authorization', `Bearer ${applicantToken}`);
      expect(delBanner.status).toBe(200);
      expect(delBanner.body.user.bannerUrl).toBeNull();
    });
  });
});
