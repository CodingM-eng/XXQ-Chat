import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyAuthToken, AuthUser } from '../auth/index.js';
import { dataStore, isWhitelistModeEnabled, isEmailWhitelisted } from '../db/index.js';
import { config } from '../config.js';

let ioInstance: Server | null = null;

export function getSocketServer(): Server | null {
  return ioInstance;
}

// Track active connections per user
const activeUsers = new Map<string, Set<string>>();

export function setupSocketServer(httpServer: HttpServer): Server {
  const allowedOrigins = config.CORS_ORIGIN === '*' ? '*' : config.CORS_ORIGIN.split(',').map((o) => o.trim());

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  ioInstance = io;

  // Socket.IO authentication and whitelist handshake middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');

      if (!token) {
        return next(new Error('AUTHENTICATION_REQUIRED'));
      }

      const user = await verifyAuthToken(token);
      if (!user) {
        return next(new Error('INVALID_TOKEN'));
      }

      // Check whitelist access control
      const whitelistActive = await isWhitelistModeEnabled();
      if (whitelistActive && !user.isAdmin) {
        const approved = await isEmailWhitelisted(user.email);
        if (!approved) {
          return next(new Error('ACCESS_DENIED_NOT_WHITELISTED'));
        }
      }

      socket.data.user = user;
      next();
    } catch (err) {
      console.error('Socket authentication handshake error:', err);
      next(new Error('HANDSHAKE_ERROR'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const user: AuthUser = socket.data.user;

    // Track active socket
    if (!activeUsers.has(user.id)) {
      activeUsers.set(user.id, new Set());
    }
    activeUsers.get(user.id)!.add(socket.id);

    // Join user's personal room
    socket.join(`user:${user.id}`);

    // Join all conversations the user is a participant of
    let userConvs: { id: string }[] = [];
    try {
      const conversations = await dataStore.getUserConversations(user.id);
      userConvs = conversations.map((c) => ({ id: c.id }));
      userConvs.forEach((c) => {
        socket.join(`conversation:${c.id}`);
        // Notify other participants that user is online
        socket.to(`conversation:${c.id}`).emit('presence:online', {
          userId: user.id,
          email: user.email,
          lastActiveAt: new Date().toISOString(),
        });
      });
    } catch (err) {
      console.error('Failed to join user conversations on socket connect:', err);
    }

    // Handle sending a message
    socket.on('message:send', async (data: { conversationId: string; content: string; clientMessageId?: string }, callback) => {
      try {
        // Enforce whitelist on every real-time message event: fail closed
        const whitelistActive = await isWhitelistModeEnabled();
        if (whitelistActive && !user.isAdmin) {
          const approved = await isEmailWhitelisted(user.email);
          if (!approved) {
            if (typeof callback === 'function') {
              callback({ error: 'ACCESS_DENIED_NOT_WHITELISTED' });
            }
            return;
          }
        }

        const { conversationId, content, clientMessageId } = data;
        if (!conversationId || !content || typeof content !== 'string') {
          if (typeof callback === 'function') callback({ error: 'INVALID_DATA' });
          return;
        }

        const trimmedContent = content.trim();
        if (!trimmedContent || trimmedContent.length > 5000) {
          if (typeof callback === 'function') callback({ error: 'INVALID_LENGTH' });
          return;
        }

        // Verify participant
        const isParticipant = await dataStore.isConversationParticipant(conversationId, user.id);
        if (!isParticipant) {
          if (typeof callback === 'function') callback({ error: 'FORBIDDEN' });
          return;
        }

        // Deduplication check
        if (clientMessageId) {
          const existing = await dataStore.findMessageByClientId(clientMessageId, user.id);
          if (existing) {
            if (typeof callback === 'function') callback({ success: true, message: existing, deduplicated: true });
            return;
          }
        }

        const savedMessage = await dataStore.saveMessage({
          conversationId,
          senderId: user.id,
          senderName: user.displayName,
          senderAvatar: user.avatarUrl || null,
          clientMessageId: clientMessageId || null,
          content: trimmedContent,
          status: 'sent',
        });

        // Broadcast to conversation room (including sender)
        io.to(`conversation:${conversationId}`).emit('message:new', savedMessage);

        if (typeof callback === 'function') {
          callback({ success: true, message: savedMessage });
        }
      } catch (err: any) {
        console.error('Socket message:send error:', err);
        if (typeof callback === 'function') {
          callback({ error: 'SERVER_ERROR', message: err.message });
        }
      }
    });

    // Handle read receipt
    socket.on('message:read', async (data: { conversationId: string; messageId: string }) => {
      try {
        const { conversationId, messageId } = data;
        if (!conversationId || !messageId) return;

        await dataStore.markConversationRead(conversationId, user.id, messageId);

        // Notify conversation room
        socket.to(`conversation:${conversationId}`).emit('message:read_receipt', {
          conversationId,
          messageId,
          readByUserId: user.id,
        });
      } catch (err) {
        console.error('Socket message:read error:', err);
      }
    });

    // Handle typing indicators
    socket.on('typing:start', (data: { conversationId: string }) => {
      if (!data?.conversationId) return;
      socket.to(`conversation:${data.conversationId}`).emit('typing:status', {
        conversationId: data.conversationId,
        userId: user.id,
        userName: user.displayName,
        isTyping: true,
      });
    });

    socket.on('typing:stop', (data: { conversationId: string }) => {
      if (!data?.conversationId) return;
      socket.to(`conversation:${data.conversationId}`).emit('typing:status', {
        conversationId: data.conversationId,
        userId: user.id,
        userName: user.displayName,
        isTyping: false,
      });
    });

    // Disconnect
    socket.on('disconnect', async () => {
      const userSockets = activeUsers.get(user.id);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          activeUsers.delete(user.id);

          // Update last_active_at in DB
          await dataStore.updateUserLastActive(user.id);

          // Notify rooms that user went offline
          userConvs.forEach((c) => {
            socket.to(`conversation:${c.id}`).emit('presence:offline', {
              userId: user.id,
              lastActiveAt: new Date().toISOString(),
            });
          });
        }
      }
    });
  });

  return io;
}
