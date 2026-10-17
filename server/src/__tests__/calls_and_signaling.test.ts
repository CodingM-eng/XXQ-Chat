import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { app } from '../app.js';
import { setupSocketServer } from '../sockets/index.js';
import { dataStore, initDb, closeDb } from '../db/index.js';
import { generateDevToken } from '../auth/index.js';

describe('XXQ Chat One-to-One Call & WebRTC Signaling Suite', () => {
  let server: http.Server;
  let serverUrl: string;

  const testSuffix = Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);

  const userA = {
    id: `usr_call_a_${testSuffix}`,
    email: `caller_a_${testSuffix}@company.com`,
    displayName: 'Caller Alice',
  };

  const userB = {
    id: `usr_call_b_${testSuffix}`,
    email: `caller_b_${testSuffix}@company.com`,
    displayName: 'Caller Bob',
  };

  const userC = {
    id: `usr_call_c_${testSuffix}`,
    email: `caller_c_${testSuffix}@company.com`,
    displayName: 'Intruder Charlie',
  };

  let tokenA: string;
  let tokenB: string;
  let tokenC: string;

  let socketA: ClientSocketType;
  let socketB: ClientSocketType;
  let socketC: ClientSocketType;

  let sharedConversationId: string;

  beforeAll(async () => {
    await initDb();
    await dataStore.setWhitelistMode(false);

    // Seed test users
    const dbA = await dataStore.upsertUser({
      id: userA.id,
      email: userA.email,
      displayName: userA.displayName,
      onboarded: true,
      status: 'active',
    });

    const dbB = await dataStore.upsertUser({
      id: userB.id,
      email: userB.email,
      displayName: userB.displayName,
      onboarded: true,
      status: 'active',
    });

    const dbC = await dataStore.upsertUser({
      id: userC.id,
      email: userC.email,
      displayName: userC.displayName,
      onboarded: true,
      status: 'active',
    });

    tokenA = generateDevToken(dbA);
    tokenB = generateDevToken(dbB);
    tokenC = generateDevToken(dbC);

    // Create 1-to-1 conversation between userA and userB
    sharedConversationId = await dataStore.createDirectConversation(dbA.id, dbB.id);

    server = http.createServer(app);
    setupSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address() as any;
        serverUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    socketA = ClientSocket(serverUrl, { auth: { token: tokenA } });
    socketB = ClientSocket(serverUrl, { auth: { token: tokenB } });
    socketC = ClientSocket(serverUrl, { auth: { token: tokenC } });

    await Promise.all([
      new Promise<void>((resolve) => socketA.on('connect', () => resolve())),
      new Promise<void>((resolve) => socketB.on('connect', () => resolve())),
      new Promise<void>((resolve) => socketC.on('connect', () => resolve())),
    ]);
  });

  afterAll(async () => {
    socketA?.disconnect();
    socketB?.disconnect();
    socketC?.disconnect();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await closeDb();
  });

  it('rejects call initiation if caller is not a participant in the conversation', async () => {
    const res: any = await new Promise((resolve) => {
      socketC.emit(
        'call:initiate',
        {
          conversationId: sharedConversationId,
          mode: 'video',
          targetUserId: userB.id,
        },
        resolve
      );
    });

    expect(res.error).toBe('FORBIDDEN');
  });

  it('successfully delivers incoming call alert to peer with correct mode and caller info', async () => {
    const incomingPromise = new Promise<any>((resolve) => {
      socketB.once('call:incoming', (data) => resolve(data));
    });

    const initRes: any = await new Promise((resolve) => {
      socketA.emit(
        'call:initiate',
        {
          conversationId: sharedConversationId,
          mode: 'screen',
          targetUserId: userB.id,
        },
        resolve
      );
    });

    expect(initRes.success).toBe(true);

    const incoming = await incomingPromise;
    expect(incoming.conversationId).toBe(sharedConversationId);
    expect(incoming.callerId).toBe(userA.id);
    expect(incoming.callerName).toBe(userA.displayName);
    expect(incoming.mode).toBe('screen');
  });

  it('handles call rejection properly and cleans up call state', async () => {
    const rejectedPromise = new Promise<any>((resolve) => {
      socketA.once('call:rejected', (data) => resolve(data));
    });

    await new Promise<void>((resolve) => {
      socketB.emit(
        'call:reject',
        {
          conversationId: sharedConversationId,
          callerId: userA.id,
          reason: 'declined',
        },
        () => resolve()
      );
    });

    const rejected = await rejectedPromise;
    expect(rejected.conversationId).toBe(sharedConversationId);
    expect(rejected.responderId).toBe(userB.id);
    expect(rejected.reason).toBe('declined');
  });

  it('supports voice-only call acceptance and bidirectional WebRTC signaling relay', async () => {
    // 1. User A initiates voice call
    const incomingPromise = new Promise<any>((resolve) => {
      socketB.once('call:incoming', resolve);
    });

    await new Promise((resolve) => {
      socketA.emit(
        'call:initiate',
        {
          conversationId: sharedConversationId,
          mode: 'audio',
          targetUserId: userB.id,
        },
        resolve
      );
    });

    await incomingPromise;

    // 2. User B accepts call
    const acceptedPromise = new Promise<any>((resolve) => {
      socketA.once('call:accepted', resolve);
    });

    await new Promise((resolve) => {
      socketB.emit(
        'call:accept',
        {
          conversationId: sharedConversationId,
          callerId: userA.id,
          mode: 'audio',
        },
        resolve
      );
    });

    const accepted = await acceptedPromise;
    expect(accepted.conversationId).toBe(sharedConversationId);
    expect(accepted.responderId).toBe(userB.id);
    expect(accepted.mode).toBe('audio');

    // 3. User A sends WebRTC Offer -> relayed to User B
    const offerPromise = new Promise<any>((resolve) => {
      socketB.once('webrtc:offer', resolve);
    });

    socketA.emit('webrtc:offer', {
      conversationId: sharedConversationId,
      targetUserId: userB.id,
      sdp: { type: 'offer', sdp: 'fake-sdp-offer' },
    });

    const receivedOffer = await offerPromise;
    expect(receivedOffer.senderId).toBe(userA.id);
    expect(receivedOffer.sdp.sdp).toBe('fake-sdp-offer');

    // 4. User B sends WebRTC Answer -> relayed to User A
    const answerPromise = new Promise<any>((resolve) => {
      socketA.once('webrtc:answer', resolve);
    });

    socketB.emit('webrtc:answer', {
      conversationId: sharedConversationId,
      targetUserId: userA.id,
      sdp: { type: 'answer', sdp: 'fake-sdp-answer' },
    });

    const receivedAnswer = await answerPromise;
    expect(receivedAnswer.senderId).toBe(userB.id);
    expect(receivedAnswer.sdp.sdp).toBe('fake-sdp-answer');

    // 5. ICE Candidate relay
    const icePromise = new Promise<any>((resolve) => {
      socketB.once('webrtc:ice-candidate', resolve);
    });

    socketA.emit('webrtc:ice-candidate', {
      conversationId: sharedConversationId,
      targetUserId: userB.id,
      candidate: { candidate: 'candidate:1 1 UDP 2122260223 192.168.1.1 50000 typ host' },
    });

    const receivedIce = await icePromise;
    expect(receivedIce.candidate.candidate).toContain('192.168.1.1');

    // 6. Mode Change relay (e.g. toggling camera or screen share)
    const modeChangePromise = new Promise<any>((resolve) => {
      socketB.once('call:mode-changed', resolve);
    });

    socketA.emit('call:mode-change', {
      conversationId: sharedConversationId,
      targetUserId: userB.id,
      mode: 'screen',
      isScreenSharing: true,
    });

    const receivedMode = await modeChangePromise;
    expect(receivedMode.mode).toBe('screen');
    expect(receivedMode.isScreenSharing).toBe(true);

    // 7. User A ends the call -> User B receives call:ended
    const endedPromise = new Promise<any>((resolve) => {
      socketB.once('call:ended', resolve);
    });

    socketA.emit('call:end', {
      conversationId: sharedConversationId,
      targetUserId: userB.id,
    });

    const ended = await endedPromise;
    expect(ended.conversationId).toBe(sharedConversationId);
  });
});
