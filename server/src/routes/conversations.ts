import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/index.js';
import { enforceWhitelist } from '../middleware/whitelist.js';
import { dataStore } from '../db/index.js';
import { getSocketServer } from '../sockets/index.js';

const router = Router();

router.use(requireAuth, enforceWhitelist);

function formatMessage(m: any) {
  return {
    id: m.id,
    conversationId: m.conversationId || m.conversation_id,
    conversation_id: m.conversationId || m.conversation_id,
    senderId: m.senderId || m.sender_id,
    sender_id: m.senderId || m.sender_id,
    senderName: m.senderName || m.sender_name,
    sender_name: m.senderName || m.sender_name,
    senderAvatar: m.senderAvatar || m.sender_avatar || null,
    sender_avatar: m.senderAvatar || m.sender_avatar || null,
    clientMessageId: m.clientMessageId || m.client_message_id || null,
    client_message_id: m.clientMessageId || m.client_message_id || null,
    content: m.content,
    replyTo: m.replyTo || m.reply_to || null,
    reply_to: m.replyTo || m.reply_to || null,
    forwardedFrom: m.forwardedFrom || m.forwarded_from || null,
    forwarded_from: m.forwardedFrom || m.forwarded_from || null,
    reactions: m.reactions || {},
    status: m.status,
    createdAt: m.createdAt || m.created_at,
    created_at: m.createdAt || m.created_at,
  };
}

// GET /api/conversations - list current user's conversations
router.get('/', async (req, res) => {
  const userId = req.user!.id;
  const conversations = await dataStore.getUserConversations(userId);
  res.json({ conversations });
});

// GET /api/conversations/:id - get single conversation summary
router.get('/:id', async (req, res) => {
  const convId = req.params.id;
  const userId = req.user!.id;

  const conv = await dataStore.getConversation(convId, userId);
  if (!conv) {
    res.status(404).json({ error: 'CONVERSATION_NOT_FOUND', message: 'Sohbet bulunamadı veya erişim yetkiniz yok.' });
    return;
  }

  res.json({ conversation: conv });
});

// POST /api/conversations/direct - create or get 1-on-1 direct conversation
const directChatSchema = z.object({
  peerId: z.string().optional(),
  peerEmail: z.string().email().optional(),
}).refine((data) => data.peerId || data.peerEmail, {
  message: 'Either peerId or peerEmail must be provided',
});

router.post('/direct', async (req, res) => {
  const parseResult = directChatSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const currentUserId = req.user!.id;
  const { peerId, peerEmail } = parseResult.data;

  // Find target peer user
  let peer = null;
  if (peerId) {
    peer = await dataStore.getUserById(peerId);
  } else if (peerEmail) {
    peer = await dataStore.getUserByEmail(peerEmail);
  }

  if (!peer) {
    res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Hedef kullanıcı bulunamadı.' });
    return;
  }

  if (peer.id === currentUserId) {
    res.status(400).json({ error: 'INVALID_OPERATION', message: 'Kendinizle sohbet oluşturamazsınız.' });
    return;
  }

  // Check if direct conversation already exists
  const existingConvId = await dataStore.getDirectConversation(currentUserId, peer.id);

  if (existingConvId) {
    const io = getSocketServer();
    if (io) {
      io.in(`user:${currentUserId}`).socketsJoin(`conversation:${existingConvId}`);
      io.in(`user:${peer.id}`).socketsJoin(`conversation:${existingConvId}`);
    }

    res.json({
      conversationId: existingConvId,
      isNew: false,
      peer: {
        id: peer.id,
        email: peer.email,
        displayName: peer.displayName,
        avatarUrl: peer.avatarUrl,
      },
    });
    return;
  }

  // Create new direct conversation
  const convId = await dataStore.createDirectConversation(currentUserId, peer.id);

  // Notify both participants via Socket.IO
  const io = getSocketServer();
  if (io) {
    io.in(`user:${currentUserId}`).socketsJoin(`conversation:${convId}`);
    io.in(`user:${peer.id}`).socketsJoin(`conversation:${convId}`);

    // Emit conversation:new to both user rooms
    const convUser1 = await dataStore.getConversation(convId, currentUserId);
    const convUser2 = await dataStore.getConversation(convId, peer.id);
    if (convUser1) io.to(`user:${currentUserId}`).emit('conversation:new', convUser1);
    if (convUser2) io.to(`user:${peer.id}`).emit('conversation:new', convUser2);
  }

  res.status(201).json({
    conversationId: convId,
    isNew: true,
    peer: {
      id: peer.id,
      email: peer.email,
      displayName: peer.displayName,
      avatarUrl: peer.avatarUrl,
    },
  });
});

// POST /api/conversations/group - create a new group conversation
const groupChatSchema = z.object({
  name: z.string().min(1, 'Grup adı gereklidir.').max(60),
  memberIds: z.array(z.string()).min(1, 'Grup için en az bir üye seçilmelidir.'),
  avatarUrl: z.string().optional(),
});

router.post('/group', async (req, res) => {
  const parseResult = groupChatSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const currentUser = req.user!;
  const { name, memberIds, avatarUrl } = parseResult.data;

  const convId = await dataStore.createGroupConversation(currentUser.id, name.trim(), memberIds, avatarUrl);

  const participantIds = await dataStore.getConversationParticipantIds(convId);

  // Notify all participants via Socket.IO
  const io = getSocketServer();
  if (io) {
    participantIds.forEach((pId) => {
      io.in(`user:${pId}`).socketsJoin(`conversation:${convId}`);
    });

    for (const pId of participantIds) {
      const convSummary = await dataStore.getConversation(convId, pId);
      if (convSummary) {
        io.to(`user:${pId}`).emit('conversation:new', convSummary);
      }
    }
  }

  const createdConv = await dataStore.getConversation(convId, currentUser.id);
  res.status(201).json({ conversation: createdConv });
});

// POST /api/conversations/:id/participants - add members to group
const addParticipantsSchema = z.object({
  userIds: z.array(z.string()).min(1),
});

router.post('/:id/participants', async (req, res) => {
  const convId = req.params.id;
  const user = req.user!;

  const isAdmin = await dataStore.isConversationAdmin(convId, user.id);
  if (!isAdmin) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Yalnızca grup yöneticileri üye ekleyebilir.' });
    return;
  }

  const parseResult = addParticipantsSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const { userIds } = parseResult.data;
  await dataStore.addConversationParticipants(convId, userIds);

  const io = getSocketServer();
  if (io) {
    userIds.forEach((uId) => io.in(`user:${uId}`).socketsJoin(`conversation:${convId}`));
    const participantIds = await dataStore.getConversationParticipantIds(convId);
    for (const pId of participantIds) {
      const summary = await dataStore.getConversation(convId, pId);
      if (summary) io.to(`user:${pId}`).emit('conversation:updated', summary);
    }
  }

  const updatedConv = await dataStore.getConversation(convId, user.id);
  res.json({ conversation: updatedConv });
});

// DELETE /api/conversations/:id/participants/:userId - remove member or leave group
router.delete('/:id/participants/:userId', async (req, res) => {
  const convId = req.params.id;
  const user = req.user!;
  const targetUserId = req.params.userId;

  const isSelf = user.id === targetUserId;
  const isAdmin = await dataStore.isConversationAdmin(convId, user.id);

  if (!isSelf && !isAdmin) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Gruptan üye çıkarma yetkiniz bulunmamaktadır.' });
    return;
  }

  await dataStore.removeConversationParticipant(convId, targetUserId);

  const io = getSocketServer();
  if (io) {
    io.in(`user:${targetUserId}`).socketsLeave(`conversation:${convId}`);
    io.to(`user:${targetUserId}`).emit('conversation:removed', { conversationId: convId });

    const remainingParticipants = await dataStore.getConversationParticipantIds(convId);
    for (const pId of remainingParticipants) {
      const summary = await dataStore.getConversation(convId, pId);
      if (summary) io.to(`user:${pId}`).emit('conversation:updated', summary);
    }
  }

  res.json({ success: true, message: 'Üye gruptan çıkarıldı.' });
});

// PATCH /api/conversations/:id - update group info
const updateGroupSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  avatarUrl: z.string().optional(),
});

router.patch('/:id', async (req, res) => {
  const convId = req.params.id;
  const user = req.user!;

  const isAdmin = await dataStore.isConversationAdmin(convId, user.id);
  if (!isAdmin) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Yalnızca grup yöneticileri grup bilgilerini güncelleyebilir.' });
    return;
  }

  const parseResult = updateGroupSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  await dataStore.updateConversation(convId, parseResult.data);

  const participantIds = await dataStore.getConversationParticipantIds(convId);
  const io = getSocketServer();
  if (io) {
    for (const pId of participantIds) {
      const summary = await dataStore.getConversation(convId, pId);
      if (summary) io.to(`user:${pId}`).emit('conversation:updated', summary);
    }
  }

  const updatedConv = await dataStore.getConversation(convId, user.id);
  res.json({ conversation: updatedConv });
});

// GET /api/conversations/:id/messages - get conversation message history
router.get('/:id/messages', async (req, res) => {
  const convId = req.params.id;
  const userId = req.user!.id;
  const limit = Math.min(Number(req.query.limit) || 50, 100);

  // Check participant authorization
  const isParticipant = await dataStore.isConversationParticipant(convId, userId);

  if (!isParticipant) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Bu sohbete erişim yetkiniz yok.' });
    return;
  }

  const messages = await dataStore.getConversationMessages(convId, limit);

  // Update participant's read receipt
  if (messages.length > 0) {
    const lastMsg = messages[messages.length - 1];
    await dataStore.markConversationRead(convId, userId, lastMsg.id);
  }

  res.json({
    messages: messages.map(formatMessage),
  });
});

// POST /api/conversations/:id/messages - send a message (supporting reply & forward)
const sendMessageSchema = z.object({
  content: z.string().min(1).max(5000),
  clientMessageId: z.string().max(100).optional(),
  replyToMessageId: z.string().optional(),
  forwardedFrom: z.object({ senderName: z.string() }).optional(),
});

router.post('/:id/messages', async (req, res) => {
  const convId = req.params.id;
  const user = req.user!;

  const parseResult = sendMessageSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_MESSAGE', details: parseResult.error.format() });
    return;
  }

  // Check participant authorization
  const isParticipant = await dataStore.isConversationParticipant(convId, user.id);

  if (!isParticipant) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Bu sohbete mesaj gönderme yetkiniz yok.' });
    return;
  }

  const { content, clientMessageId, replyToMessageId, forwardedFrom } = parseResult.data;

  // Deduplication check
  if (clientMessageId) {
    const existing = await dataStore.findMessageByClientId(clientMessageId, user.id);
    if (existing) {
      res.json({ message: formatMessage(existing), deduplicated: true });
      return;
    }
  }

  let replyTo = null;
  if (replyToMessageId) {
    const convMessages = await dataStore.getConversationMessages(convId, 100);
    const parentMsg = convMessages.find((m) => m.id === replyToMessageId);
    if (parentMsg) {
      replyTo = {
        id: parentMsg.id,
        senderId: parentMsg.senderId,
        senderName: parentMsg.senderName,
        content: parentMsg.content,
      };
    }
  }

  const savedMessage = await dataStore.saveMessage({
    conversationId: convId,
    senderId: user.id,
    senderName: user.displayName,
    senderAvatar: user.avatarUrl || null,
    clientMessageId: clientMessageId || null,
    content,
    replyTo,
    forwardedFrom: forwardedFrom || null,
    status: 'sent',
  });

  const formatted = formatMessage(savedMessage);

  // Broadcast to Socket.IO room if running
  const io = getSocketServer();
  if (io) {
    const participantIds = await dataStore.getConversationParticipantIds(convId);
    await Promise.all(
      participantIds.map((pId) => io.in(`user:${pId}`).socketsJoin(`conversation:${convId}`))
    );
    const targetRooms = [`conversation:${convId}`, ...participantIds.map((pId) => `user:${pId}`)];
    io.to(targetRooms).emit('message:new', formatted);
  }

  res.status(201).json({ message: formatted });
});

// POST /api/conversations/:id/messages/:messageId/reactions - toggle emoji reaction
const reactionSchema = z.object({
  emoji: z.string().min(1).max(10),
});

router.post('/:id/messages/:messageId/reactions', async (req, res) => {
  const convId = req.params.id;
  const messageId = req.params.messageId;
  const user = req.user!;

  const isParticipant = await dataStore.isConversationParticipant(convId, user.id);
  if (!isParticipant) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Tepki verme yetkiniz yok.' });
    return;
  }

  const parseResult = reactionSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const { emoji } = parseResult.data;
  const reactions = await dataStore.toggleMessageReaction(convId, messageId, user.id, emoji);

  const io = getSocketServer();
  if (io) {
    const participantIds = await dataStore.getConversationParticipantIds(convId);
    const targetRooms = [`conversation:${convId}`, ...participantIds.map((pId) => `user:${pId}`)];
    io.to(targetRooms).emit('message:reaction', {
      conversationId: convId,
      messageId,
      reactions,
    });
  }

  res.json({ success: true, reactions });
});

export const conversationsRouter = router;
