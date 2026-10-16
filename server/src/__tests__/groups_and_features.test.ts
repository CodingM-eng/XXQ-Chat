import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { dataStore, initDb, closeDb } from '../db/index.js';
import { generateDevToken } from '../auth/index.js';

describe('XXQ Chat Group Chats & Advanced Messaging Features Suite', () => {
  const member1 = { id: 'usr_grp_1', email: 'grp1@company.com', displayName: 'Group Creator' };
  const member2 = { id: 'usr_grp_2', email: 'grp2@company.com', displayName: 'Member Two' };
  const member3 = { id: 'usr_grp_3', email: 'grp3@company.com', displayName: 'Member Three' };
  const outsider = { id: 'usr_grp_4', email: 'grp4@company.com', displayName: 'Outsider' };

  let token1: string;
  let token2: string;
  let tokenOutsider: string;

  beforeAll(async () => {
    await initDb();
    await dataStore.setWhitelistMode(false);

    await dataStore.upsertUser({ ...member1, onboarded: true, status: 'active' });
    await dataStore.upsertUser({ ...member2, onboarded: true, status: 'active' });
    await dataStore.upsertUser({ ...member3, onboarded: true, status: 'active' });
    await dataStore.upsertUser({ ...outsider, onboarded: true, status: 'active' });

    token1 = generateDevToken(member1);
    token2 = generateDevToken(member2);
    tokenOutsider = generateDevToken(outsider);
  });

  afterAll(async () => {
    await closeDb();
  });

  let groupId: string;

  it('creates a new group conversation with creator designated as admin', async () => {
    const res = await request(app)
      .post('/api/conversations/group')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        name: 'Geliştirme Ekibi',
        memberIds: [member2.id],
      });

    expect(res.status).toBe(201);
    expect(res.body.conversation).toBeDefined();
    expect(res.body.conversation.name).toBe('Geliştirme Ekibi');
    expect(res.body.conversation.type).toBe('group');
    expect(res.body.conversation.participantCount).toBe(2);

    groupId = res.body.conversation.id;
  });

  it('allows group admin to add a new member', async () => {
    const res = await request(app)
      .post(`/api/conversations/${groupId}/participants`)
      .set('Authorization', `Bearer ${token1}`)
      .send({ userIds: [member3.id] });

    expect(res.status).toBe(200);
    expect(res.body.conversation.participantCount).toBe(3);
  });

  it('blocks non-admin members from adding participants', async () => {
    const res = await request(app)
      .post(`/api/conversations/${groupId}/participants`)
      .set('Authorization', `Bearer ${token2}`)
      .send({ userIds: [outsider.id] });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('sends message to group and supports message forwarding indicator', async () => {
    // 1. Send normal group message
    const msgRes = await request(app)
      .post(`/api/conversations/${groupId}/messages`)
      .set('Authorization', `Bearer ${token2}`)
      .send({ content: 'Grup üyelerine selamlar!' });

    expect(msgRes.status).toBe(201);
    expect(msgRes.body.message.content).toBe('Grup üyelerine selamlar!');

    // 2. Forward message with forwardedFrom indicator
    const forwardRes = await request(app)
      .post(`/api/conversations/${groupId}/messages`)
      .set('Authorization', `Bearer ${token1}`)
      .send({
        content: 'Önemli duyuru iletildi.',
        forwardedFrom: { senderName: 'Yönetici' },
      });

    expect(forwardRes.status).toBe(201);
    expect(forwardRes.body.message.forwardedFrom).toBeDefined();
    expect(forwardRes.body.message.forwardedFrom.senderName).toBe('Yönetici');
  });

  it('allows member to leave the group', async () => {
    const leaveRes = await request(app)
      .delete(`/api/conversations/${groupId}/participants/${member3.id}`)
      .set('Authorization', `Bearer ${token2}`) // member 3 leaves or admin removes
      .send();

    // Member 2 is not admin and not member 3 -> 403
    expect(leaveRes.status).toBe(403);

    // Group admin removes member 3
    const adminRemoveRes = await request(app)
      .delete(`/api/conversations/${groupId}/participants/${member3.id}`)
      .set('Authorization', `Bearer ${token1}`);

    expect(adminRemoveRes.status).toBe(200);
    expect(adminRemoveRes.body.success).toBe(true);
  });
});
