import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyAuthToken, AuthUser } from '../auth/index.js';
import { dataStore, isWhitelistModeEnabled, isEmailWhitelisted } from '../db/index.js';
import { config } from '../config.js';
import { isAllowedOrigin } from '../utils/cors.js';
import { formatMessage } from '../utils/format.js';

let ioInstance: Server | null = null;

export function getSocketServer(): Server | null {
  return ioInstance;
}

// Track active connections per user
const activeUsers = new Map<string, Set<string>>();
// Track active 1-to-1 WebRTC calls per user
const activeCalls = new Map<string, { conversationId: string; peerId: string }>();

export async function onWhitelistRevoked(email: string): Promise<void> {
  if (!ioInstance) return;
  const normalized = email.toLowerCase().trim();
  try {
    const sockets = await ioInstance.fetchSockets();
    for (const s of sockets) {
      const sUser = s.data?.user as AuthUser | undefined;
      if (sUser && sUser.email.toLowerCase().trim() === normalized && !sUser.isAdmin) {
        s.emit('auth:revoked', { message: 'Beyaz liste onayınız kaldırıldı.' });
        s.disconnect(true);
      }
    }
  } catch (err) {
    console.error('Error disconnecting revoked user sockets:', err);
  }
}

export async function onWhitelistModeChanged(enabled: boolean): Promise<void> {
  if (!ioInstance || !enabled) return;
  try {
    const sockets = await ioInstance.fetchSockets();
    for (const s of sockets) {
      const sUser = s.data?.user as AuthUser | undefined;
      if (sUser && !sUser.isAdmin) {
        const approved = await isEmailWhitelisted(sUser.email);
        if (!approved) {
          s.emit('auth:revoked', { message: 'Kısıtlı beyaz liste modu etkinleştirildi.' });
          s.disconnect(true);
        }
      }
    }
  } catch (err) {
    console.error('Error disconnecting non-whitelisted sockets after mode change:', err);
  }
}

export function setupSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: (requestOrigin, callback) => {
        callback(null, isAllowedOrigin(requestOrigin));
      },
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

      if (user.status === 'pending') {
        return next(new Error('ACCESS_DENIED_NOT_WHITELISTED'));
      }

      // Check whitelist access control
      const whitelistActive = await isWhitelistModeEnabled();
      if (whitelistActive && !user.isAdmin) {
        const approved = await isEmailWhitelisted(user.email);
        if (!approved) {
          await dataStore.recordPendingAccess(user.email, user.displayName, user.avatarUrl);
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

    // Explicitly join a conversation room
    socket.on('conversation:join', async (data: { conversationId: string }, callback) => {
      try {
        const { conversationId } = data || {};
        if (!conversationId) {
          if (typeof callback === 'function') callback({ error: 'INVALID_DATA' });
          return;
        }

        const isParticipant = await dataStore.isConversationParticipant(conversationId, user.id);
        if (!isParticipant) {
          if (typeof callback === 'function') callback({ error: 'FORBIDDEN' });
          return;
        }

        socket.join(`conversation:${conversationId}`);
        if (typeof callback === 'function') callback({ success: true, conversationId });
      } catch (err: any) {
        if (typeof callback === 'function') callback({ error: 'SERVER_ERROR', message: err.message });
      }
    });

    // Handle sending a message
    socket.on(
      'message:send',
      async (
        data: {
          conversationId: string;
          content: string;
          clientMessageId?: string;
          replyTo?: { id: string; senderId: string; senderName: string; content: string };
          forwardedFrom?: { senderName: string };
        },
        callback
      ) => {
        try {
          // Enforce whitelist on every real-time message event: fail closed
          const whitelistActive = await isWhitelistModeEnabled();
          if (whitelistActive && !user.isAdmin) {
            const approved = await isEmailWhitelisted(user.email);
            if (!approved) {
              socket.emit('auth:revoked', { message: 'Beyaz liste onayınız bulunmuyor.' });
              socket.disconnect(true);
              if (typeof callback === 'function') callback({ error: 'ACCESS_DENIED_NOT_WHITELISTED' });
              return;
            }
          }

          const { conversationId, content, clientMessageId, replyTo: directReplyTo, replyToMessageId, forwardedFrom, attachments } = data as any;
          if (!conversationId) {
            if (typeof callback === 'function') callback({ error: 'INVALID_DATA' });
            return;
          }

          const trimmedContent = typeof content === 'string' ? content.trim() : '';
          const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
          if (!trimmedContent && !hasAttachments) {
            if (typeof callback === 'function') callback({ error: 'EMPTY_MESSAGE' });
            return;
          }

          if (trimmedContent.length > 5000) {
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
            const existing = await dataStore.findMessageByClientId(clientMessageId, user.id, conversationId);
            if (existing) {
              const formattedExisting = formatMessage(existing);
              if (typeof callback === 'function') callback({ success: true, message: formattedExisting, deduplicated: true });
              return;
            }
          }

          let replyTo = directReplyTo || null;
          if (!replyTo && replyToMessageId) {
            const convMessages = await dataStore.getConversationMessages(conversationId, 100);
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
            conversationId,
            senderId: user.id,
            senderName: user.displayName,
            senderAvatar: user.avatarUrl || null,
            clientMessageId: clientMessageId || null,
            content: trimmedContent,
            replyTo: replyTo || null,
            forwardedFrom: forwardedFrom || null,
            attachments: attachments || null,
            status: 'sent',
          });

          const formattedMessage = formatMessage(savedMessage);

          // Dynamically join all participant sockets to this conversation room
          const participantIds = await dataStore.getConversationParticipantIds(conversationId);
          await Promise.all(
            participantIds.map((pId) => io.in(`user:${pId}`).socketsJoin(`conversation:${conversationId}`))
          );

          // Broadcast to conversation room AND all participant user rooms deduplicated
          const targetRooms = [`conversation:${conversationId}`, ...participantIds.map((pId) => `user:${pId}`)];
          io.to(targetRooms).emit('message:new', formattedMessage);

          if (typeof callback === 'function') {
            callback({ success: true, message: formattedMessage });
          }
        } catch (err: any) {
          console.error('Socket message:send error:', err);
          if (typeof callback === 'function') {
            callback({ error: 'SERVER_ERROR', message: err.message });
          }
        }
      }
    );

    // Handle message deletion (Author, Admin, or Moderator)
    socket.on('message:delete', async (data: { conversationId: string; messageId: string }, callback) => {
      try {
        const { conversationId, messageId } = data;
        if (!conversationId || !messageId) {
          if (typeof callback === 'function') callback({ error: 'INVALID_DATA' });
          return;
        }

        const isParticipant = await dataStore.isConversationParticipant(conversationId, user.id);
        if (!isParticipant) {
          if (typeof callback === 'function') callback({ error: 'FORBIDDEN' });
          return;
        }

        const messages = await dataStore.getConversationMessages(conversationId, 100);
        const targetMsg = messages.find((m) => m.id === messageId);
        if (!targetMsg) {
          if (typeof callback === 'function') callback({ error: 'NOT_FOUND' });
          return;
        }

        const isAuthor = targetMsg.senderId === user.id;
        const isModOrAdmin = user.isAdmin || user.isModerator;
        if (!isAuthor && !isModOrAdmin) {
          if (typeof callback === 'function') callback({ error: 'FORBIDDEN' });
          return;
        }

        await dataStore.deleteMessage(conversationId, messageId);

        const participantIds = await dataStore.getConversationParticipantIds(conversationId);
        const targetRooms = [`conversation:${conversationId}`, ...participantIds.map((pId) => `user:${pId}`)];
        io.to(targetRooms).emit('message:deleted', { conversationId, messageId });

        if (typeof callback === 'function') callback({ success: true, messageId });
      } catch (err: any) {
        if (typeof callback === 'function') callback({ error: 'SERVER_ERROR', message: err.message });
      }
    });

    // Handle emoji reaction
    socket.on('message:reaction', async (data: { conversationId: string; messageId: string; emoji: string }, callback) => {
      try {
        const { conversationId, messageId, emoji } = data;
        if (!conversationId || !messageId || !emoji) {
          if (typeof callback === 'function') callback({ error: 'INVALID_DATA' });
          return;
        }

        const isParticipant = await dataStore.isConversationParticipant(conversationId, user.id);
        if (!isParticipant) {
          if (typeof callback === 'function') callback({ error: 'FORBIDDEN' });
          return;
        }

        const reactions = await dataStore.toggleMessageReaction(conversationId, messageId, user.id, emoji);

        const participantIds = await dataStore.getConversationParticipantIds(conversationId);
        const targetRooms = [`conversation:${conversationId}`, ...participantIds.map((pId) => `user:${pId}`)];
        io.to(targetRooms).emit('message:reaction', {
          conversationId,
          messageId,
          reactions,
        });

        if (typeof callback === 'function') {
          callback({ success: true, reactions });
        }
      } catch (err: any) {
        console.error('Socket message:reaction error:', err);
        if (typeof callback === 'function') callback({ error: 'SERVER_ERROR', message: err.message });
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

    // =========================================================================
    // One-to-One Call Signaling (Audio, Video, Screen Sharing)
    // =========================================================================
    socket.on(
      'call:initiate',
      async (
        data: {
          conversationId: string;
          mode: 'audio' | 'video' | 'screen';
          targetUserId?: string;
        },
        callback
      ) => {
        try {
          const { conversationId, mode, targetUserId } = data || {};
          if (!conversationId || !mode || !['audio', 'video', 'screen'].includes(mode)) {
            if (typeof callback === 'function') callback({ error: 'INVALID_DATA', message: 'Geçersiz arama parametreleri.' });
            return;
          }

          // Authorize: caller must be a conversation participant
          const isParticipant = await dataStore.isConversationParticipant(conversationId, user.id);
          if (!isParticipant) {
            if (typeof callback === 'function') callback({ error: 'FORBIDDEN', message: 'Bu sohbette arama yapma yetkiniz yok.' });
            return;
          }

          // Determine recipient
          const participantIds = await dataStore.getConversationParticipantIds(conversationId);
          let peerId = targetUserId;
          if (!peerId) {
            peerId = participantIds.find((id) => id !== user.id);
          }

          if (!peerId) {
            if (typeof callback === 'function') callback({ error: 'NO_PEER', message: 'Arama yapılacak katılımcı bulunamadı.' });
            return;
          }

          // Check if peer is online
          const isPeerOnline = activeUsers.has(peerId) && activeUsers.get(peerId)!.size > 0;
          if (!isPeerOnline) {
            if (typeof callback === 'function') {
              callback({ error: 'USER_OFFLINE', message: 'Kullanıcı şu anda çevrimdışı.' });
            }
            return;
          }

          // Check if peer is already in an active call
          if (activeCalls.has(peerId)) {
            if (typeof callback === 'function') {
              callback({ error: 'USER_BUSY', message: 'Kullanıcı şu anda başka bir aramada meşgul.' });
            }
            return;
          }

          // Record call state
          activeCalls.set(user.id, { conversationId, peerId });

          // Emit incoming call to the recipient's user room
          io.to(`user:${peerId}`).emit('call:incoming', {
            conversationId,
            callerId: user.id,
            callerName: user.displayName,
            callerAvatar: user.avatarUrl || null,
            mode,
            createdAt: new Date().toISOString(),
          });

          if (typeof callback === 'function') {
            callback({ success: true, targetUserId: peerId });
          }
        } catch (err: any) {
          console.error('Socket call:initiate error:', err);
          if (typeof callback === 'function') callback({ error: 'SERVER_ERROR', message: err.message });
        }
      }
    );

    socket.on(
      'call:accept',
      async (
        data: {
          conversationId: string;
          callerId: string;
          mode: 'audio' | 'video' | 'screen';
        },
        callback
      ) => {
        try {
          const { conversationId, callerId, mode } = data || {};
          if (!conversationId || !callerId) {
            if (typeof callback === 'function') callback({ error: 'INVALID_DATA' });
            return;
          }

          const isParticipant = await dataStore.isConversationParticipant(conversationId, user.id);
          if (!isParticipant) {
            if (typeof callback === 'function') callback({ error: 'FORBIDDEN' });
            return;
          }

          activeCalls.set(user.id, { conversationId, peerId: callerId });
          activeCalls.set(callerId, { conversationId, peerId: user.id });

          // Notify caller that call was accepted
          io.to(`user:${callerId}`).emit('call:accepted', {
            conversationId,
            responderId: user.id,
            responderName: user.displayName,
            responderAvatar: user.avatarUrl || null,
            mode,
          });

          if (typeof callback === 'function') callback({ success: true });
        } catch (err: any) {
          console.error('Socket call:accept error:', err);
          if (typeof callback === 'function') callback({ error: 'SERVER_ERROR', message: err.message });
        }
      }
    );

    socket.on(
      'call:reject',
      async (
        data: {
          conversationId: string;
          callerId: string;
          reason?: string;
        },
        callback
      ) => {
        try {
          const { conversationId, callerId, reason } = data || {};
          if (!conversationId || !callerId) return;

          activeCalls.delete(user.id);
          activeCalls.delete(callerId);

          io.to(`user:${callerId}`).emit('call:rejected', {
            conversationId,
            responderId: user.id,
            reason: reason || 'declined',
          });

          if (typeof callback === 'function') callback({ success: true });
        } catch (err: any) {
          console.error('Socket call:reject error:', err);
          if (typeof callback === 'function') callback({ error: 'SERVER_ERROR', message: err.message });
        }
      }
    );

    socket.on(
      'call:end',
      async (
        data: {
          conversationId: string;
          targetUserId?: string;
        },
        callback
      ) => {
        try {
          const { conversationId, targetUserId } = data || {};
          const currentCall = activeCalls.get(user.id);
          const peerId = targetUserId || currentCall?.peerId;

          activeCalls.delete(user.id);
          if (peerId) {
            activeCalls.delete(peerId);
            io.to(`user:${peerId}`).emit('call:ended', {
              conversationId,
              senderId: user.id,
              reason: 'ended_by_user',
            });
          }

          if (conversationId) {
            socket.to(`conversation:${conversationId}`).emit('call:ended', {
              conversationId,
              senderId: user.id,
              reason: 'ended_by_user',
            });
          }

          if (typeof callback === 'function') callback({ success: true });
        } catch (err: any) {
          console.error('Socket call:end error:', err);
          if (typeof callback === 'function') callback({ error: 'SERVER_ERROR', message: err.message });
        }
      }
    );

    socket.on(
      'call:mode-change',
      async (data: {
        conversationId: string;
        targetUserId?: string;
        mode: 'audio' | 'video' | 'screen';
        isScreenSharing?: boolean;
        isVideoMuted?: boolean;
        isAudioMuted?: boolean;
      }) => {
        try {
          const { conversationId, targetUserId, mode, isScreenSharing, isVideoMuted, isAudioMuted } = data || {};
          if (!conversationId) return;

          const isParticipant = await dataStore.isConversationParticipant(conversationId, user.id);
          if (!isParticipant) return;

          const payload = {
            conversationId,
            senderId: user.id,
            mode,
            isScreenSharing: !!isScreenSharing,
            isVideoMuted: !!isVideoMuted,
            isAudioMuted: !!isAudioMuted,
          };

          if (targetUserId) {
            io.to(`user:${targetUserId}`).emit('call:mode-changed', payload);
          } else {
            socket.to(`conversation:${conversationId}`).emit('call:mode-changed', payload);
          }
        } catch (err) {
          console.error('Socket call:mode-change error:', err);
        }
      }
    );

    // =========================================================================
    // WebRTC Screen Sharing & Call Media Signaling Handlers
    // =========================================================================
    socket.on('screen:start', async (data: { conversationId: string }, callback) => {
      try {
        const { conversationId } = data || {};
        if (!conversationId) {
          if (typeof callback === 'function') callback({ error: 'INVALID_DATA' });
          return;
        }

        const isParticipant = await dataStore.isConversationParticipant(conversationId, user.id);
        if (!isParticipant) {
          if (typeof callback === 'function') callback({ error: 'FORBIDDEN' });
          return;
        }

        socket.to(`conversation:${conversationId}`).emit('screen:started', {
          conversationId,
          userId: user.id,
          userName: user.displayName,
          userAvatar: user.avatarUrl,
        });

        if (typeof callback === 'function') callback({ success: true });
      } catch (err: any) {
        if (typeof callback === 'function') callback({ error: 'SERVER_ERROR', message: err.message });
      }
    });

    socket.on('screen:stop', async (data: { conversationId: string }) => {
      try {
        const { conversationId } = data || {};
        if (!conversationId) return;

        socket.to(`conversation:${conversationId}`).emit('screen:stopped', {
          conversationId,
          userId: user.id,
        });
      } catch (err) {
        console.error('Socket screen:stop error:', err);
      }
    });

    socket.on('webrtc:offer', async (data: { conversationId: string; sdp: any; targetUserId?: string }) => {
      try {
        const { conversationId, sdp, targetUserId } = data || {};
        if (!conversationId || !sdp) return;

        const isParticipant = await dataStore.isConversationParticipant(conversationId, user.id);
        if (!isParticipant) return;

        const payload = {
          conversationId,
          sdp,
          senderId: user.id,
          senderName: user.displayName,
        };

        if (targetUserId) {
          io.to(`user:${targetUserId}`).emit('webrtc:offer', payload);
        } else {
          socket.to(`conversation:${conversationId}`).emit('webrtc:offer', payload);
        }
      } catch (err) {
        console.error('Socket webrtc:offer error:', err);
      }
    });

    socket.on('webrtc:answer', async (data: { conversationId: string; sdp: any; targetUserId: string }) => {
      try {
        const { conversationId, sdp, targetUserId } = data || {};
        if (!conversationId || !sdp || !targetUserId) return;

        const isParticipant = await dataStore.isConversationParticipant(conversationId, user.id);
        if (!isParticipant) return;

        io.to(`user:${targetUserId}`).emit('webrtc:answer', {
          conversationId,
          sdp,
          senderId: user.id,
          senderName: user.displayName,
        });
      } catch (err) {
        console.error('Socket webrtc:answer error:', err);
      }
    });

    socket.on('webrtc:ice-candidate', async (data: { conversationId: string; candidate: any; targetUserId?: string }) => {
      try {
        const { conversationId, candidate, targetUserId } = data || {};
        if (!conversationId || !candidate) return;

        const isParticipant = await dataStore.isConversationParticipant(conversationId, user.id);
        if (!isParticipant) return;

        const payload = {
          conversationId,
          candidate,
          senderId: user.id,
        };

        if (targetUserId) {
          io.to(`user:${targetUserId}`).emit('webrtc:ice-candidate', payload);
        } else {
          socket.to(`conversation:${conversationId}`).emit('webrtc:ice-candidate', payload);
        }
      } catch (err) {
        console.error('Socket webrtc:ice-candidate error:', err);
      }
    });

    // Disconnect
    socket.on('disconnect', async () => {
      // Clean up any active call that this user was engaged in
      if (activeCalls.has(user.id)) {
        const callInfo = activeCalls.get(user.id);
        activeCalls.delete(user.id);
        if (callInfo) {
          activeCalls.delete(callInfo.peerId);
          io.to(`user:${callInfo.peerId}`).emit('call:ended', {
            conversationId: callInfo.conversationId,
            senderId: user.id,
            reason: 'disconnected',
          });
        }
      }

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
