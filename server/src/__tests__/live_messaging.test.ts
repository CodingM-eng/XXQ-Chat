import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { app } from '../app.js';
import { setupSocketServer } from '../sockets/index.js';
import { dataStore, initDb, closeDb } from '../db/index.js';
import { generateDevToken } from '../auth/index.js';

describe('XXQ Chat Real-Time Live Messaging & Room Isolation Suite', () => {
  let server: http.Server;
  let serverUrl: string;

  const testSuffix = Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);

  const userA = {
    id: `usr_alice_${testSuffix}`,
    email: `alice_${testSuffix}@company.com`,
    displayName: 'Alice Live',
  };

  const userB = {
    id: `usr_bob_${testSuffix}`,
    email: `bob_${testSuffix}@company.com`,
    displayName: 'Bob Live',
  };

  const userC = {
    id: `usr_charlie_${testSuffix}`,
    email: `charlie_${testSuffix}@company.com`,
    displayName: 'Charlie Outsider',
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
    await dataStore.setWhitelistMode(false); // Mode OFF to allow active users

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

    // Create a 1-on-1 direct conversation between Alice and Bob
    sharedConversationId = await dataStore.createDirectConversation(dbA.id, dbB.id);

    // Start live server on random available port
    server = http.createServer(app);
    setupSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address() as any;
        serverUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    // Connect socket clients
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
    if (socketA?.connected) socketA.disconnect();
    if (socketB?.connected) socketB.disconnect();
    if (socketC?.connected) socketC.disconnect();

    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await closeDb();
  });

  it('delivers live message from User A to User B in real time without refreshing', async () => {
    const messageContent = 'Merhaba Bob! XXQ Chat canlı mesaj testi.';
    const clientMessageId = `client_msg_${Date.now()}_${Math.random()}`;

    let receivedByC: any = null;
    socketC.on('message:new', (msg) => {
      receivedByC = msg;
    });

    const receivedByBPromise = new Promise<any>((resolve) => {
      socketB.once('message:new', (msg) => resolve(msg));
    });

    // User A sends message
    const sendAck = await new Promise<any>((resolve) => {
      socketA.emit(
        'message:send',
        {
          conversationId: sharedConversationId,
          content: messageContent,
          clientMessageId,
        },
        (ack: any) => resolve(ack)
      );
    });

    expect(sendAck.success).toBe(true);
    expect(sendAck.message.content).toBe(messageContent);
    expect(sendAck.message.senderId).toBe(userA.id);

    const receivedByB = await receivedByBPromise;

    expect(receivedByB).toBeDefined();
    expect(receivedByB.content).toBe(messageContent);
    expect(receivedByB.senderId).toBe(userA.id);
    expect(receivedByB.conversationId).toBe(sharedConversationId);

    // Verify non-participant User C DID NOT receive the message!
    expect(receivedByC).toBeNull();
  });

  it('delivers live message from User B to User A (reverse flow) in real time', async () => {
    const replyContent = 'Harika Alice, mesajın anında geldi!';
    const receivedByAPromise = new Promise<any>((resolve) => {
      socketA.once('message:new', (msg) => resolve(msg));
    });

    const sendAck = await new Promise<any>((resolve) => {
      socketB.emit(
        'message:send',
        {
          conversationId: sharedConversationId,
          content: replyContent,
        },
        (ack: any) => resolve(ack)
      );
    });

    expect(sendAck.success).toBe(true);

    const receivedByA = await receivedByAPromise;
    expect(receivedByA).toBeDefined();
    expect(receivedByA.content).toBe(replyContent);
    expect(receivedByA.senderId).toBe(userB.id);
  });

  it('delivers message reply with quoted parent reference', async () => {
    const replyText = 'Bu cevabı alıntıladım.';
    const receivedReplyPromise = new Promise<any>((resolve) => {
      socketB.once('message:new', (msg) => resolve(msg));
    });

    const sendAck = await new Promise<any>((resolve) => {
      socketA.emit(
        'message:send',
        {
          conversationId: sharedConversationId,
          content: replyText,
          replyTo: {
            id: 'msg_parent_123',
            senderId: userB.id,
            senderName: userB.displayName,
            content: 'Önceki mesaj içeriği',
          },
        },
        (ack: any) => resolve(ack)
      );
    });

    expect(sendAck.success).toBe(true);
    const receivedReply = await receivedReplyPromise;

    expect(receivedReply).toBeDefined();
    expect(receivedReply.replyTo).toBeDefined();
    expect(receivedReply.replyTo.content).toBe('Önceki mesaj içeriği');
  });

  it('handles emoji reactions live across conversation participants', async () => {
    // Send a message first
    const sendAck = await new Promise<any>((resolve) => {
      socketA.emit(
        'message:send',
        {
          conversationId: sharedConversationId,
          content: 'Tepki verilecek mesaj',
        },
        (ack: any) => resolve(ack)
      );
    });

    const targetMessageId = sendAck.message.id;
    const reactionReceivedPromise = new Promise<any>((resolve) => {
      socketA.once('message:reaction', (reactionData) => resolve(reactionData));
    });

    // User B reacts with 👍
    const reactionAck = await new Promise<any>((resolve) => {
      socketB.emit(
        'message:reaction',
        {
          conversationId: sharedConversationId,
          messageId: targetMessageId,
          emoji: '👍',
        },
        (ack: any) => resolve(ack)
      );
    });

    expect(reactionAck.success).toBe(true);
    expect(reactionAck.reactions['👍']).toContain(userB.id);

    const reactionReceivedByA = await reactionReceivedPromise;
    expect(reactionReceivedByA).toBeDefined();
    expect(reactionReceivedByA.messageId).toBe(targetMessageId);
    expect(reactionReceivedByA.reactions['👍']).toContain(userB.id);
  });

  it('blocks unauthorized outsider from sending messages to a conversation', async () => {
    const errorAck = await new Promise<any>((resolve) => {
      socketC.emit(
        'message:send',
        {
          conversationId: sharedConversationId,
          content: 'Yetkisiz mesaj denemesi',
        },
        (ack: any) => resolve(ack)
      );
    });

    expect(errorAck.error).toBe('FORBIDDEN');
  });
});
