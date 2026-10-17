import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { dataStore, initDb, closeDb } from '../db/index.js';
import { generateDevToken } from '../auth/index.js';

describe('User Reports, Group Roles, Discord Servers & Access Requests Suite', () => {
  const adminUser = {
    id: 'usr_suite_admin',
    email: 'codingdevelopia@gmail.com',
    displayName: 'Platform Admin',
    isAdmin: true,
  };
  const groupOwner = {
    id: 'usr_group_owner',
    email: 'owner@test.com',
    displayName: 'Grup Sahibi',
    isAdmin: false,
  };
  const groupModCandidate = {
    id: 'usr_group_mod',
    email: 'mod@test.com',
    displayName: 'Grup Moderatörü',
    isAdmin: false,
  };
  const memberUser = {
    id: 'usr_normal_member',
    email: 'member@test.com',
    displayName: 'Normal Üye',
    isAdmin: false,
  };
  const externalUser = {
    id: 'usr_external_invitee',
    email: 'external@test.com',
    displayName: 'Davetli Kullanıcı',
    isAdmin: false,
  };

  let adminToken: string;
  let ownerToken: string;
  let modToken: string;
  let memberToken: string;
  let externalToken: string;

  beforeAll(async () => {
    await initDb();
    await dataStore.setWhitelistMode(false);

    await dataStore.upsertUser({ ...adminUser, onboarded: true, status: 'active', isAdmin: true });
    await dataStore.upsertUser({ ...groupOwner, onboarded: true, status: 'active' });
    await dataStore.upsertUser({ ...groupModCandidate, onboarded: true, status: 'active' });
    await dataStore.upsertUser({ ...memberUser, onboarded: true, status: 'active' });
    await dataStore.upsertUser({ ...externalUser, onboarded: true, status: 'active' });

    // Pre-approve users on whitelist
    await dataStore.addToWhitelist(adminUser.email, adminUser.id);
    await dataStore.addToWhitelist(groupOwner.email, groupOwner.id);
    await dataStore.addToWhitelist(groupModCandidate.email, groupModCandidate.id);
    await dataStore.addToWhitelist(memberUser.email, memberUser.id);
    await dataStore.addToWhitelist(externalUser.email, externalUser.id);

    adminToken = generateDevToken(adminUser);
    ownerToken = generateDevToken(groupOwner);
    modToken = generateDevToken(groupModCandidate);
    memberToken = generateDevToken(memberUser);
    externalToken = generateDevToken(externalUser);
  });

  afterAll(async () => {
    await closeDb();
  });

  describe('Part A: Problem Reports Privacy (Display Names only, No Emails)', () => {
    it('creates a support report and omits reporter email from the response', async () => {
      const res = await request(app)
        .post('/api/support/reports')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          title: 'Sesli bağlantı kopuyor',
          description: 'Aramaya katıldığımda 30 saniye sonra ses kesiliyor.',
          diagnostics: { platform: 'Modern Web', appVersion: '1.0.0' },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.report.title).toBe('Sesli bağlantı kopuyor');
      expect(res.body.report.userDisplayName).toBe(memberUser.displayName);
      expect(res.body.report.userEmail).toBeUndefined();
    });

    it('lists support reports for admin and omits userEmail', async () => {
      const res = await request(app)
        .get('/api/support/reports')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.reports)).toBe(true);
      expect(res.body.reports.length).toBeGreaterThan(0);
      for (const report of res.body.reports) {
        expect(report.userDisplayName).toBeDefined();
        expect(report.userEmail).toBeUndefined();
      }
    });
  });

  describe('Part B: Group Moderators, Roles & Custom Display Labels', () => {
    let testGroupId: string;

    it('creates a group with owner and member', async () => {
      const res = await request(app)
        .post('/api/conversations/group')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Oyun Turnuva Ekibi',
          participantIds: [groupModCandidate.id, memberUser.id],
          description: 'Turnuva maçları ve antrenmanlar',
          rules: 'Saygılı iletişim esastır',
          joinPolicy: 'auto',
        });

      expect(res.status).toBe(201);
      expect(res.body.conversation.name).toBe('Oyun Turnuva Ekibi');
      testGroupId = res.body.conversation.id;

      // Check owner has role 'owner'
      const ownerParticipant = res.body.conversation.participants.find((p: any) => p.id === groupOwner.id);
      expect(ownerParticipant.role).toBe('owner');
    });

    it('allows group owner to promote a member to moderator with custom label "Oyun Lideri"', async () => {
      const res = await request(app)
        .patch(`/api/conversations/${testGroupId}/participants/${groupModCandidate.id}/role`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          role: 'moderator',
          customTag: 'Oyun Lideri',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const convRes = await request(app)
        .get(`/api/conversations/${testGroupId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      const modParticipant = convRes.body.conversation.participants.find((p: any) => p.id === groupModCandidate.id);
      expect(modParticipant.role).toBe('moderator');
      expect(modParticipant.customTag).toBe('Oyun Lideri');
    });

    it('prevents group moderator from granting themselves owner or admin permissions', async () => {
      const res = await request(app)
        .patch(`/api/conversations/${testGroupId}/participants/${groupModCandidate.id}/role`)
        .set('Authorization', `Bearer ${modToken}`)
        .send({
          role: 'owner',
        });

      expect(res.status).toBe(403);
    });

    it('ensures group moderator does not have platform-wide administrator rights', async () => {
      const res = await request(app)
        .get('/api/admin/status')
        .set('Authorization', `Bearer ${modToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Part C: Discord-Style Servers with Channels & Purpose', () => {
    let createdServerId: string;
    let announcementChannelId: string;
    let generalChannelId: string;

    it('creates a Discord-style server with purpose "gaming" and auto-initializes channels', async () => {
      const res = await request(app)
        .post('/api/servers')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Pro Gaming Sunucusu',
          purpose: 'gaming',
          description: 'Espor ve turnuvalar',
          rules: '1. Hile yasaktır 2. Spam yasaktır',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.server.name).toBe('Pro Gaming Sunucusu');
      expect(res.body.server.purpose).toBe('gaming');
      expect(res.body.server.channels.length).toBeGreaterThanOrEqual(2);

      createdServerId = res.body.server.id;
      const announcementChannel = res.body.server.channels.find((c: any) => c.isAnnouncementOnly);
      const generalChannel = res.body.server.channels.find((c: any) => !c.isAnnouncementOnly);

      expect(announcementChannel).toBeDefined();
      expect(generalChannel).toBeDefined();

      announcementChannelId = announcementChannel.id;
      generalChannelId = generalChannel.id;
    });

    it('adds regular member to server', async () => {
      const res = await request(app)
        .post(`/api/servers/${createdServerId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ userId: memberUser.id });

      expect(res.status).toBe(200);
    });

    it('restricts ordinary member from sending messages in announcement-only channel', async () => {
      const res = await request(app)
        .post(`/api/conversations/${announcementChannelId}/messages`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ content: 'İzinsiz duyuru denemesi' });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('duyuru kanalıdır');
    });

    it('allows server owner to send message in announcement-only channel', async () => {
      const res = await request(app)
        .post(`/api/conversations/${announcementChannelId}/messages`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ content: 'Resmi Turnuva Duyurusu: Kayıtlar başladı!' });

      expect(res.status).toBe(201);
      expect(res.body.message.content).toBe('Resmi Turnuva Duyurusu: Kayıtlar başladı!');
    });

    it('allows ordinary member to chat in general channel', async () => {
      const res = await request(app)
        .post(`/api/conversations/${generalChannelId}/messages`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ content: 'Merhaba herkese iyi oyunlar!' });

      expect(res.status).toBe(201);
    });
  });

  describe('Part D: Group Settings & Post-Creation Member Adding', () => {
    let settingsGroupId: string;

    it('creates group and updates its settings', async () => {
      const createRes = await request(app)
        .post('/api/conversations/group')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'İlk Grup Adı',
          participantIds: [memberUser.id],
        });
      settingsGroupId = createRes.body.conversation.id;

      const patchRes = await request(app)
        .patch(`/api/conversations/${settingsGroupId}/settings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Güncellenmiş Grup Adı',
          description: 'Yeni grup açıklaması',
          rules: 'Yeni grup kuralları',
          joinPolicy: 'request',
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.conversation.name).toBe('Güncellenmiş Grup Adı');
      expect(patchRes.body.conversation.joinPolicy).toBe('request');
    });

    it('adds a new member after group creation', async () => {
      const res = await request(app)
        .post(`/api/conversations/${settingsGroupId}/participants`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ userIds: [groupModCandidate.id] });

      expect(res.status).toBe(200);

      const convRes = await request(app)
        .get(`/api/conversations/${settingsGroupId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      const ids = convRes.body.conversation.participants.map((p: any) => p.id);
      expect(ids).toContain(groupModCandidate.id);
    });
  });

  describe('Part E: Membership Policies & In-App Invitations', () => {
    let inviteGroupId: string;
    let invitationId: string;

    it('creates group with "invite" policy and sends an invitation', async () => {
      const createRes = await request(app)
        .post('/api/conversations/group')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Davetiyeli Özel Kulüp',
          participantIds: [],
          joinPolicy: 'invite',
        });
      inviteGroupId = createRes.body.conversation.id;

      const inviteRes = await request(app)
        .post(`/api/conversations/${inviteGroupId}/invite`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ userId: externalUser.id });

      expect(inviteRes.status).toBe(200);
      expect(inviteRes.body.success).toBe(true);
      expect(inviteRes.body.invitationId).toBeDefined();
      invitationId = inviteRes.body.invitationId;
    });

    it('allows invited user to view their pending invitations', async () => {
      const res = await request(app)
        .get('/api/invitations/my')
        .set('Authorization', `Bearer ${externalToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.invitations)).toBe(true);
      const myInv = res.body.invitations.find((i: any) => i.id === invitationId);
      expect(myInv).toBeDefined();
      expect(myInv.status).toBe('pending');
      expect(myInv.targetName).toBe('Davetiyeli Özel Kulüp');
    });

    it('allows invited user to accept invitation and become participant', async () => {
      const res = await request(app)
        .post(`/api/invitations/${invitationId}/respond`)
        .set('Authorization', `Bearer ${externalToken}`)
        .send({ response: 'accepted' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.invitation.status).toBe('accepted');

      // Verify user is now participant in the group
      const convRes = await request(app)
        .get(`/api/conversations/${inviteGroupId}`)
        .set('Authorization', `Bearer ${externalToken}`);

      expect(convRes.status).toBe(200);
      const ids = convRes.body.conversation.participants.map((p: any) => p.id);
      expect(ids).toContain(externalUser.id);
    });
  });

  describe('Part F: Platform Admin Controls for Groups and Servers', () => {
    let testGroupId: string;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/conversations/group')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Admin Denetim Grubu', participantIds: [] });
      testGroupId = res.body.conversation.id;
    });

    it('allows platform admin to list all groups and servers across the platform', async () => {
      const groupsRes = await request(app)
        .get('/api/admin/groups')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(groupsRes.status).toBe(200);
      expect(Array.isArray(groupsRes.body.groups)).toBe(true);

      const serversRes = await request(app)
        .get('/api/admin/servers')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(serversRes.status).toBe(200);
      expect(Array.isArray(serversRes.body.servers)).toBe(true);
    });

    it('allows platform admin to force-add an approved user to any group with confirmation & audit log', async () => {
      const res = await request(app)
        .post(`/api/admin/groups/${testGroupId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: memberUser.id, confirmation: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const convRes = await request(app)
        .get(`/api/conversations/${testGroupId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      const ids = convRes.body.conversation.participants.map((p: any) => p.id);
      expect(ids).toContain(memberUser.id);
    });
  });

  describe('Part G: Pending Requests Bug Fix & Separate Onayla/Reddet Controls', () => {
    const unapprovedEmail = `pending_${Date.now()}@company.com`;

    it('records an unapproved access request as pending', async () => {
      await dataStore.recordPendingAccess(unapprovedEmail, 'Pending Applicant');

      const res = await request(app)
        .get('/api/admin/pending')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const pendingItem = res.body.pendingRequests.find((r: any) => r.email === unapprovedEmail);
      expect(pendingItem).toBeDefined();
      expect(pendingItem.status).toBe('pending');
    });

    it('rejects the pending access request and removes it from pending list', async () => {
      const rejectRes = await request(app)
        .post('/api/admin/whitelist/reject')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: unapprovedEmail });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.success).toBe(true);

      // Verify it is NO LONGER in pending requests list
      const pendingRes = await request(app)
        .get('/api/admin/pending')
        .set('Authorization', `Bearer ${adminToken}`);

      const pendingStillThere = pendingRes.body.pendingRequests.find((r: any) => r.email === unapprovedEmail);
      expect(pendingStillThere).toBeUndefined();
    });

    it('keeps rejected request in request history with "rejected" status', async () => {
      const historyRes = await request(app)
        .get('/api/admin/pending/history')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(historyRes.status).toBe(200);
      const resolvedItem = historyRes.body.resolvedRequests.find((r: any) => r.email === unapprovedEmail);
      expect(resolvedItem).toBeDefined();
      expect(resolvedItem.status).toBe('rejected');
      expect(resolvedItem.resolvedAt).toBeDefined();
    });
  });
});
