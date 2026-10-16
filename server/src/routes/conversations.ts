import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/index.js';
import { enforceWhitelist } from '../middleware/whitelist.js';
import { dataStore } from '../db/index.js';
import { getSocketServer } from '../sockets/index.js';

const router = Router();

router.use(requireAuth, enforceWhitelist);

// GET /api/conversations - list current user's conversations
router.get('/', async (req, res) => {
  const userId = req.user!.id;
  const conversations = await dataStore.getUserConversations(userId);
  res.json({ conversations });
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
    res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Target user does not exist' });
    return;
  }

  if (peer.id === currentUserId) {
    res.status(400).json({ error: 'INVALID_OPERATION', message: 'Cannot create a direct conversation with yourself' });
    return;
  }

  // Check if direct conversation already exists between these two users
  const existingConvId = await dataStore.getDirectConversation(currentUserId, peer.id);

  if (existingConvId) {
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
    status: m.status,
    createdAt: m.createdAt || m.created_at,
    created_at: m.createdAt || m.created_at,
  };
}

// GET /api/conversations/:id/messages - get conversation message history
router.get('/:id/messages', async (req, res) => {
  const convId = req.params.id;
  const userId = req.user!.id;
  const limit = Math.min(Number(req.query.limit) || 50, 100);

  // Check participant authorization
  const isParticipant = await dataStore.isConversationParticipant(convId, userId);

  if (!isParticipant) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You are not a participant in this conversation' });
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

// POST /api/conversations/:id/messages - send a message
const sendMessageSchema = z.object({
  content: z.string().min(1).max(5000),
  clientMessageId: z.string().max(100).optional(),
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
    res.status(403).json({ error: 'FORBIDDEN', message: 'You are not a participant in this conversation' });
    return;
  }

  const { content, clientMessageId } = parseResult.data;

  // Deduplication check
  if (clientMessageId) {
    const existing = await dataStore.findMessageByClientId(clientMessageId, user.id);
    if (existing) {
      res.json({ message: formatMessage(existing), deduplicated: true });
      return;
    }
  }

  const savedMessage = await dataStore.saveMessage({
    conversationId: convId,
    senderId: user.id,
    senderName: user.displayName,
    senderAvatar: user.avatarUrl || null,
    clientMessageId: clientMessageId || null,
    content,
    status: 'sent',
  });

  const formatted = formatMessage(savedMessage);

  // Broadcast to Socket.IO room if running
  const io = getSocketServer();
  if (io) {
    io.to(`conversation:${convId}`).emit('message:new', formatted);
  }

  res.status(201).json({ message: formatted });
});

export const conversationsRouter = router;
