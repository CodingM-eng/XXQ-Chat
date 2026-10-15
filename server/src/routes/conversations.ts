import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/index.js';
import { enforceWhitelist } from '../middleware/whitelist.js';
import { db, runTransaction } from '../db/index.js';
import { getSocketServer } from '../sockets/index.js';

const router = Router();

router.use(requireAuth, enforceWhitelist);

// GET /api/conversations - list current user's conversations
router.get('/', (req, res) => {
  const userId = req.user!.id;

  const conversations = db.prepare(`
    SELECT 
      c.id, c.type, c.name, c.updated_at,
      p.last_read_message_id
    FROM conversations c
    JOIN conversation_participants p ON p.conversation_id = c.id
    WHERE p.user_id = ?
    ORDER BY c.updated_at DESC
  `).all(userId) as any[];

  const detailed = conversations.map((conv) => {
    // For direct chats, find the other participant
    let peer = null;
    if (conv.type === 'direct') {
      peer = db.prepare(`
        SELECT u.id, u.email, u.display_name, u.avatar_url, u.last_active_at
        FROM conversation_participants cp
        JOIN users u ON u.id = cp.user_id
        WHERE cp.conversation_id = ? AND cp.user_id != ?
      `).get(conv.id, userId) as any;
    }

    // Get the last message
    const lastMessage = db.prepare(`
      SELECT id, sender_id, sender_name, content, status, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(conv.id) as any;

    // Get unread count
    const unreadCount = (db.prepare(`
      SELECT COUNT(*) as count
      FROM messages m
      JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
      WHERE m.conversation_id = ?
        AND m.sender_id != ?
        AND (cp.last_read_message_id IS NULL OR m.created_at > (
          SELECT created_at FROM messages WHERE id = cp.last_read_message_id
        ))
        AND cp.user_id = ?
    `).get(conv.id, userId, userId) as any)?.count || 0;

    return {
      id: conv.id,
      type: conv.type,
      name: conv.type === 'direct' && peer ? peer.display_name : conv.name || 'Chat',
      peer: peer ? {
        id: peer.id,
        email: peer.email,
        displayName: peer.display_name,
        avatarUrl: peer.avatar_url,
        lastActiveAt: peer.last_active_at,
      } : null,
      lastMessage: lastMessage ? {
        id: lastMessage.id,
        senderId: lastMessage.sender_id,
        senderName: lastMessage.sender_name,
        content: lastMessage.content,
        status: lastMessage.status,
        createdAt: lastMessage.created_at,
      } : null,
      unreadCount,
      updatedAt: conv.updated_at,
    };
  });

  res.json({ conversations: detailed });
});

// POST /api/conversations/direct - create or get 1-on-1 direct conversation
const directChatSchema = z.object({
  peerId: z.string().optional(),
  peerEmail: z.string().email().optional(),
}).refine((data) => data.peerId || data.peerEmail, {
  message: 'Either peerId or peerEmail must be provided',
});

router.post('/direct', (req, res) => {
  const parseResult = directChatSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const currentUserId = req.user!.id;
  const { peerId, peerEmail } = parseResult.data;

  // Find target peer user
  let peer: any;
  if (peerId) {
    peer = db.prepare('SELECT id, email, display_name, avatar_url FROM users WHERE id = ?').get(peerId);
  } else if (peerEmail) {
    peer = db.prepare('SELECT id, email, display_name, avatar_url FROM users WHERE LOWER(email) = ?').get(peerEmail.toLowerCase().trim());
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
  const existingConv = db.prepare(`
    SELECT c.id
    FROM conversations c
    JOIN conversation_participants p1 ON p1.conversation_id = c.id AND p1.user_id = ?
    JOIN conversation_participants p2 ON p2.conversation_id = c.id AND p2.user_id = ?
    WHERE c.type = 'direct'
  `).get(currentUserId, peer.id) as any;

  if (existingConv) {
    res.json({
      conversationId: existingConv.id,
      isNew: false,
      peer: {
        id: peer.id,
        email: peer.email,
        displayName: peer.display_name,
        avatarUrl: peer.avatar_url,
      },
    });
    return;
  }

  // Create new conversation inside a transaction
  const convId = 'conv_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);

  runTransaction(() => {
    db.prepare(`
      INSERT INTO conversations (id, type, created_at, updated_at)
      VALUES (?, 'direct', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(convId);

    db.prepare(`
      INSERT INTO conversation_participants (conversation_id, user_id)
      VALUES (?, ?)
    `).run(convId, currentUserId);

    db.prepare(`
      INSERT INTO conversation_participants (conversation_id, user_id)
      VALUES (?, ?)
    `).run(convId, peer.id);
  });

  res.status(201).json({
    conversationId: convId,
    isNew: true,
    peer: {
      id: peer.id,
      email: peer.email,
      displayName: peer.display_name,
      avatarUrl: peer.avatar_url,
    },
  });
});

// GET /api/conversations/:id/messages - get conversation message history
router.get('/:id/messages', (req, res) => {
  const convId = req.params.id;
  const userId = req.user!.id;
  const limit = Math.min(Number(req.query.limit) || 50, 100);

  // Check participant authorization
  const isParticipant = db.prepare(`
    SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?
  `).get(convId, userId);

  if (!isParticipant) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You are not a participant in this conversation' });
    return;
  }

  const messages = db.prepare(`
    SELECT id, conversation_id, sender_id, sender_name, sender_avatar, client_message_id, content, status, created_at
    FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC
    LIMIT ?
  `).all(convId, limit) as any[];

  // Update participant's last_read_message_id if messages exist
  if (messages.length > 0) {
    const lastMsg = messages[messages.length - 1];
    db.prepare(`
      UPDATE conversation_participants
      SET last_read_message_id = ?
      WHERE conversation_id = ? AND user_id = ?
    `).run(lastMsg.id, convId, userId);
  }

  res.json({
    messages: messages.map((m) => ({
      id: m.id,
      conversationId: m.conversation_id,
      senderId: m.sender_id,
      senderName: m.sender_name,
      senderAvatar: m.sender_avatar,
      clientMessageId: m.client_message_id,
      content: m.content,
      status: m.status,
      createdAt: m.created_at,
    })),
  });
});

// POST /api/conversations/:id/messages - send a message
const sendMessageSchema = z.object({
  content: z.string().min(1).max(5000),
  clientMessageId: z.string().max(100).optional(),
});

router.post('/:id/messages', (req, res) => {
  const convId = req.params.id;
  const user = req.user!;

  const parseResult = sendMessageSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_MESSAGE', details: parseResult.error.format() });
    return;
  }

  // Check participant authorization
  const isParticipant = db.prepare(`
    SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?
  `).get(convId, user.id);

  if (!isParticipant) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You are not a participant in this conversation' });
    return;
  }

  const { content, clientMessageId } = parseResult.data;

  // Check deduplication if clientMessageId provided
  if (clientMessageId) {
    const existing = db.prepare(`
      SELECT id, conversation_id, sender_id, sender_name, sender_avatar, client_message_id, content, status, created_at
      FROM messages
      WHERE client_message_id = ? AND sender_id = ?
    `).get(clientMessageId, user.id) as any;

    if (existing) {
      res.json({ message: existing, deduplicated: true });
      return;
    }
  }

  const msgId = 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);

  runTransaction(() => {
    db.prepare(`
      INSERT INTO messages (id, conversation_id, sender_id, sender_name, sender_avatar, client_message_id, content, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'sent')
    `).run(msgId, convId, user.id, user.displayName, user.avatarUrl || null, clientMessageId || null, content);

    db.prepare(`
      UPDATE conversations
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(convId);

    db.prepare(`
      UPDATE conversation_participants
      SET last_read_message_id = ?
      WHERE conversation_id = ? AND user_id = ?
    `).run(msgId, convId, user.id);
  });

  const savedMessage = db.prepare(`
    SELECT id, conversation_id, sender_id, sender_name, sender_avatar, client_message_id, content, status, created_at
    FROM messages WHERE id = ?
  `).get(msgId) as any;

  // Broadcast to Socket.IO room if running
  const io = getSocketServer();
  if (io) {
    io.to(`conversation:${convId}`).emit('message:new', savedMessage);
  }

  res.status(201).json({ message: savedMessage });
});

export const conversationsRouter = router;
