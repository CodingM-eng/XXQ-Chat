import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Firestore, FieldValue } from 'firebase-admin/firestore';
import { config } from '../config.js';
import {
  DataStore,
  DbUser,
  DbWhitelistEntry,
  DbAuditLog,
  DbConversationSummary,
  DbMessage,
} from './types.js';

export class FirestoreStore implements DataStore {
  readonly driverName = 'firestore' as const;
  private db: Firestore | null = null;

  // In-memory cache for whitelist mode to minimize Firestore reads under free Spark quota
  private cachedWhitelistMode: { value: boolean; timestamp: number } | null = null;
  private readonly CACHE_TTL_MS = 30000; // 30 seconds cache

  constructor(injectedFirestore?: Firestore) {
    if (injectedFirestore) {
      this.db = injectedFirestore;
    }
  }

  async init(): Promise<void> {
    if (!this.db) {
      if (!getApps().length) {
        if (config.FIREBASE_PROJECT_ID && config.FIREBASE_CLIENT_EMAIL && config.FIREBASE_PRIVATE_KEY) {
          initializeApp({
            credential: cert({
              projectId: config.FIREBASE_PROJECT_ID,
              clientEmail: config.FIREBASE_CLIENT_EMAIL,
              privateKey: config.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }),
          });
        } else if (config.FIREBASE_PROJECT_ID) {
          initializeApp({
            projectId: config.FIREBASE_PROJECT_ID,
          });
        } else {
          initializeApp();
        }
      }

      this.db = getFirestore();
      try {
        this.db.settings({ ignoreUndefinedProperties: true });
      } catch {
        // Settings may already be locked if initialized elsewhere
      }
    }

    const firestore = this.db;

    // Bootstrap system_settings
    const settingDoc = await firestore.collection('system_settings').doc('whitelist_mode').get();
    if (!settingDoc.exists) {
      await firestore.collection('system_settings').doc('whitelist_mode').set({
        value: config.WHITELIST_MODE_DEFAULT ? 'true' : 'false',
        updatedAt: new Date().toISOString(),
      });
    }

    // Bootstrap initial administrator if configured
    if (config.INITIAL_ADMIN_EMAIL) {
      const adminEmail = config.INITIAL_ADMIN_EMAIL.toLowerCase().trim();
      const adminWhitelistRef = firestore.collection('whitelist').doc(adminEmail);
      const whitelistSnap = await adminWhitelistRef.get();
      if (!whitelistSnap.exists) {
        await adminWhitelistRef.set({
          email: adminEmail,
          approvedBy: 'system_bootstrap',
          createdAt: new Date().toISOString(),
        });
      }

      // Check if user document exists for initial admin
      const usersQuery = await firestore.collection('users').where('email', '==', adminEmail).limit(1).get();
      if (usersQuery.empty) {
        const adminId = 'user_admin_bootstrap';
        await firestore.collection('users').doc(adminId).set({
          id: adminId,
          email: adminEmail,
          displayName: 'Initial Admin',
          isAdmin: true,
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
        });

        const auditId = 'audit_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        await firestore.collection('audit_logs').doc(auditId).set({
          id: auditId,
          actorId: 'system',
          actorEmail: 'system',
          action: 'SYSTEM_BOOTSTRAP_ADMIN',
          target: adminEmail,
          details: 'Initial administrator designated via server environment in Firestore',
          ipAddress: 'bootstrap',
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  private getFirestore(): Firestore {
    if (!this.db) {
      throw new Error('FirestoreStore has not been initialized. Call init() first.');
    }
    return this.db;
  }

  async close(): Promise<void> {
    if (this.db) {
      try {
        await this.db.terminate();
      } catch (err) {
        // Safe to ignore in test or server shutdown
      }
      this.db = null;
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const doc = await this.getFirestore().collection('system_settings').doc('whitelist_mode').get();
      return doc.exists || true;
    } catch {
      return false;
    }
  }

  async isWhitelistModeEnabled(): Promise<boolean> {
    const now = Date.now();
    if (this.cachedWhitelistMode && now - this.cachedWhitelistMode.timestamp < this.CACHE_TTL_MS) {
      return this.cachedWhitelistMode.value;
    }

    try {
      const doc = await this.getFirestore().collection('system_settings').doc('whitelist_mode').get();
      if (!doc.exists) {
        this.cachedWhitelistMode = { value: config.WHITELIST_MODE_DEFAULT, timestamp: now };
        return config.WHITELIST_MODE_DEFAULT;
      }
      const val = doc.data()?.value === 'true';
      this.cachedWhitelistMode = { value: val, timestamp: now };
      return val;
    } catch (err) {
      console.error('FirestoreStore: failed to query whitelist mode:', err);
      return true; // Fail closed
    }
  }

  async setWhitelistMode(enabled: boolean): Promise<void> {
    this.cachedWhitelistMode = { value: enabled, timestamp: Date.now() };
    await this.getFirestore().collection('system_settings').doc('whitelist_mode').set(
      {
        value: enabled ? 'true' : 'false',
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }

  async isEmailWhitelisted(email: string): Promise<boolean> {
    try {
      const normalized = email.toLowerCase().trim();
      if (config.INITIAL_ADMIN_EMAIL && normalized === config.INITIAL_ADMIN_EMAIL.toLowerCase().trim()) {
        return true;
      }

      // Check users collection for admin status
      const userSnap = await this.getFirestore().collection('users').where('email', '==', normalized).limit(1).get();
      if (!userSnap.empty) {
        const u = userSnap.docs[0].data();
        if (u.isAdmin === true || u.is_admin === 1) {
          return true;
        }
      }

      // Check whitelist document
      const doc = await this.getFirestore().collection('whitelist').doc(normalized).get();
      return doc.exists;
    } catch (err) {
      console.error('FirestoreStore: failed to check whitelist status:', err);
      return false;
    }
  }

  async getWhitelist(): Promise<DbWhitelistEntry[]> {
    const firestore = this.getFirestore();
    const whitelistSnap = await firestore.collection('whitelist').get();
    const usersSnap = await firestore.collection('users').get();

    const userMap = new Map<string, any>();
    usersSnap.forEach((doc) => {
      const data = doc.data();
      if (data.email) {
        userMap.set(data.email.toLowerCase().trim(), data);
      }
    });

    const entries: DbWhitelistEntry[] = [];
    whitelistSnap.forEach((doc) => {
      const data = doc.data();
      const email = (data.email || doc.id).toLowerCase().trim();
      const user = userMap.get(email);
      entries.push({
        email,
        approvedBy: data.approvedBy || data.approved_by || 'admin',
        createdAt: data.createdAt || data.created_at || new Date().toISOString(),
        displayName: user?.displayName || user?.display_name,
        avatarUrl: user?.avatarUrl || user?.avatar_url || null,
        isAdmin: user?.isAdmin || user?.is_admin === 1,
      });
    });

    return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async addToWhitelist(email: string, approvedBy: string): Promise<void> {
    const normalized = email.toLowerCase().trim();
    await this.getFirestore().collection('whitelist').doc(normalized).set({
      email: normalized,
      approvedBy,
      createdAt: new Date().toISOString(),
    });
  }

  async removeFromWhitelist(email: string): Promise<boolean> {
    const normalized = email.toLowerCase().trim();
    const docRef = this.getFirestore().collection('whitelist').doc(normalized);
    const doc = await docRef.get();
    if (!doc.exists) return false;
    await docRef.delete();
    return true;
  }

  async getUserById(id: string): Promise<DbUser | null> {
    const doc = await this.getFirestore().collection('users').doc(id).get();
    if (!doc.exists) return null;
    const d = doc.data()!;
    return {
      id: d.id || doc.id,
      email: d.email,
      displayName: d.displayName || d.display_name,
      avatarUrl: d.avatarUrl || d.avatar_url || null,
      isAdmin: d.isAdmin === true || d.is_admin === 1,
      createdAt: d.createdAt || d.created_at || new Date().toISOString(),
      lastActiveAt: d.lastActiveAt || d.last_active_at || new Date().toISOString(),
    };
  }

  async getUserByEmail(email: string): Promise<DbUser | null> {
    const normalized = email.toLowerCase().trim();
    const snap = await this.getFirestore().collection('users').where('email', '==', normalized).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    const d = doc.data();
    return {
      id: d.id || doc.id,
      email: d.email,
      displayName: d.displayName || d.display_name,
      avatarUrl: d.avatarUrl || d.avatar_url || null,
      isAdmin: d.isAdmin === true || d.is_admin === 1,
      createdAt: d.createdAt || d.created_at || new Date().toISOString(),
      lastActiveAt: d.lastActiveAt || d.last_active_at || new Date().toISOString(),
    };
  }

  async upsertUser(user: { id: string; email: string; displayName: string; avatarUrl?: string | null; isAdmin?: boolean }): Promise<DbUser> {
    const email = user.email.toLowerCase().trim();
    const isInitialAdmin = email === config.INITIAL_ADMIN_EMAIL.toLowerCase().trim();
    const existing = await this.getUserByEmail(email);

    const now = new Date().toISOString();

    if (existing) {
      const isAdmin = existing.isAdmin || isInitialAdmin || !!user.isAdmin;
      const effectiveId = existing.id;
      const updates: any = {
        lastActiveAt: now,
        isAdmin,
      };
      if (user.avatarUrl && user.avatarUrl !== existing.avatarUrl) {
        updates.avatarUrl = user.avatarUrl;
      }
      if (user.displayName && user.displayName !== existing.displayName) {
        updates.displayName = user.displayName;
      }

      await this.getFirestore().collection('users').doc(effectiveId).set(updates, { merge: true });

      return {
        id: effectiveId,
        email,
        displayName: updates.displayName || existing.displayName,
        avatarUrl: updates.avatarUrl || existing.avatarUrl || null,
        isAdmin,
        createdAt: existing.createdAt,
        lastActiveAt: now,
      };
    } else {
      const isAdmin = isInitialAdmin || !!user.isAdmin;
      const newUser: DbUser = {
        id: user.id,
        email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl || null,
        isAdmin,
        createdAt: now,
        lastActiveAt: now,
      };

      await this.getFirestore().collection('users').doc(user.id).set(newUser);
      return newUser;
    }
  }

  async updateUserProfile(id: string, updates: { displayName?: string; avatarUrl?: string }): Promise<DbUser | null> {
    const docRef = this.getFirestore().collection('users').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return null;

    const dataToUpdate: any = {
      lastActiveAt: new Date().toISOString(),
    };
    if (updates.displayName !== undefined) dataToUpdate.displayName = updates.displayName;
    if (updates.avatarUrl !== undefined) dataToUpdate.avatarUrl = updates.avatarUrl;

    await docRef.set(dataToUpdate, { merge: true });
    return this.getUserById(id);
  }

  async updateUserLastActive(id: string): Promise<void> {
    try {
      await this.getFirestore().collection('users').doc(id).set(
        { lastActiveAt: new Date().toISOString() },
        { merge: true }
      );
    } catch (err) {
      console.error('FirestoreStore: failed to update lastActiveAt:', err);
    }
  }

  async getAllUsers(): Promise<DbUser[]> {
    const snap = await this.getFirestore().collection('users').get();
    const users: DbUser[] = [];
    snap.forEach((doc) => {
      const d = doc.data();
      users.push({
        id: d.id || doc.id,
        email: d.email,
        displayName: d.displayName || d.display_name,
        avatarUrl: d.avatarUrl || d.avatar_url || null,
        isAdmin: d.isAdmin === true || d.is_admin === 1,
        createdAt: d.createdAt || d.created_at || new Date().toISOString(),
        lastActiveAt: d.lastActiveAt || d.last_active_at || new Date().toISOString(),
      });
    });
    return users.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async searchUsers(excludeUserId: string, query?: string): Promise<DbUser[]> {
    const all = await this.getAllUsers();
    const q = (query || '').toLowerCase().trim();

    return all
      .filter((u) => u.id !== excludeUserId)
      .filter((u) => {
        if (!q) return true;
        return u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      })
      .slice(0, 30);
  }

  async recordAuditLog(log: {
    id?: string;
    actorId?: string | null;
    actorEmail: string;
    action: string;
    target?: string | null;
    details?: string | null;
    ipAddress?: string | null;
  }): Promise<void> {
    const id = log.id || 'audit_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const entry: DbAuditLog = {
      id,
      actorId: log.actorId || null,
      actorEmail: log.actorEmail,
      action: log.action,
      target: log.target || null,
      details: log.details || null,
      ipAddress: log.ipAddress || 'unknown',
      createdAt: new Date().toISOString(),
    };

    await this.getFirestore().collection('audit_logs').doc(id).set(entry);
  }

  async getAuditLogs(limit = 50): Promise<DbAuditLog[]> {
    const boundedLimit = Math.min(Math.max(limit, 1), 200);
    const snap = await this.getFirestore().collection('audit_logs').get();
    const logs: DbAuditLog[] = [];
    snap.forEach((doc) => {
      const d = doc.data();
      logs.push({
        id: d.id || doc.id,
        actorId: d.actorId || d.actor_id || null,
        actorEmail: d.actorEmail || d.actor_email,
        action: d.action,
        target: d.target || null,
        details: d.details || null,
        ipAddress: d.ipAddress || d.ip_address || null,
        createdAt: d.createdAt || d.created_at || new Date().toISOString(),
      });
    });

    return logs
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, boundedLimit);
  }

  async getStats(): Promise<{ totalUsers: number; approvedWhitelistCount: number; adminCount: number; totalMessages: number }> {
    const firestore = this.getFirestore();
    const usersSnap = await firestore.collection('users').get();
    let adminCount = 0;
    usersSnap.forEach((doc) => {
      const d = doc.data();
      if (d.isAdmin === true || d.is_admin === 1) adminCount++;
    });

    const whitelistSnap = await firestore.collection('whitelist').get();
    const conversationsSnap = await firestore.collection('conversations').get();

    // Sum messages count across conversations
    let totalMessages = 0;
    conversationsSnap.forEach((doc) => {
      const d = doc.data();
      if (typeof d.messageCount === 'number') {
        totalMessages += d.messageCount;
      } else if (d.lastMessage) {
        totalMessages += 1;
      }
    });

    return {
      totalUsers: usersSnap.size,
      approvedWhitelistCount: whitelistSnap.size,
      adminCount,
      totalMessages,
    };
  }

  async getUserConversations(userId: string): Promise<DbConversationSummary[]> {
    const firestore = this.getFirestore();
    const snap = await firestore
      .collection('conversations')
      .where('participantIds', 'array-contains', userId)
      .get();

    const usersSnap = await firestore.collection('users').get();
    const userMap = new Map<string, any>();
    usersSnap.forEach((doc) => {
      userMap.set(doc.id, doc.data());
    });

    const results: DbConversationSummary[] = [];

    snap.forEach((doc) => {
      const conv = doc.data();
      const peerId = (conv.participantIds as string[]).find((id) => id !== userId);
      const peerUser = peerId ? userMap.get(peerId) : null;

      results.push({
        id: conv.id || doc.id,
        type: conv.type || 'direct',
        name: conv.type === 'direct' && peerUser ? peerUser.displayName || peerUser.display_name : conv.name || 'Chat',
        peer: peerUser
          ? {
              id: peerUser.id || peerId,
              email: peerUser.email,
              displayName: peerUser.displayName || peerUser.display_name,
              avatarUrl: peerUser.avatarUrl || peerUser.avatar_url || null,
              lastActiveAt: peerUser.lastActiveAt || peerUser.last_active_at || null,
            }
          : null,
        lastMessage: conv.lastMessage || null,
        unreadCount: conv.unreadCounts?.[userId] || 0,
        updatedAt: conv.updatedAt || new Date().toISOString(),
      });
    });

    return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getDirectConversation(userId1: string, userId2: string): Promise<string | null> {
    const snap = await this.getFirestore()
      .collection('conversations')
      .where('type', '==', 'direct')
      .where('participantIds', 'array-contains', userId1)
      .get();

    for (const doc of snap.docs) {
      const data = doc.data();
      const participants = data.participantIds as string[];
      if (participants && participants.includes(userId2)) {
        return doc.id;
      }
    }

    return null;
  }

  async createDirectConversation(userId1: string, userId2: string): Promise<string> {
    const convId = 'conv_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();

    const convData = {
      id: convId,
      type: 'direct',
      name: 'Chat',
      participantIds: [userId1, userId2],
      unreadCounts: {
        [userId1]: 0,
        [userId2]: 0,
      },
      lastReadMessageIds: {},
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
    };

    await this.getFirestore().collection('conversations').doc(convId).set(convData);
    return convId;
  }

  async isConversationParticipant(conversationId: string, userId: string): Promise<boolean> {
    const doc = await this.getFirestore().collection('conversations').doc(conversationId).get();
    if (!doc.exists) return false;
    const data = doc.data();
    return Array.isArray(data?.participantIds) && data.participantIds.includes(userId);
  }

  async getConversationMessages(conversationId: string, limit = 50): Promise<DbMessage[]> {
    const boundedLimit = Math.min(Math.max(limit, 1), 100);
    const snap = await this.getFirestore()
      .collection('conversations')
      .doc(conversationId)
      .collection('messages')
      .orderBy('createdAt', 'asc')
      .limitToLast(boundedLimit)
      .get();

    const messages: DbMessage[] = [];
    snap.forEach((doc) => {
      const d = doc.data();
      messages.push({
        id: d.id || doc.id,
        conversationId,
        senderId: d.senderId || d.sender_id,
        senderName: d.senderName || d.sender_name,
        senderAvatar: d.senderAvatar || d.sender_avatar || null,
        clientMessageId: d.clientMessageId || d.client_message_id || null,
        content: d.content,
        status: d.status || 'sent',
        createdAt: d.createdAt || d.created_at || new Date().toISOString(),
      });
    });

    return messages;
  }

  async findMessageByClientId(clientMessageId: string, senderId: string): Promise<DbMessage | null> {
    const snap = await this.getFirestore()
      .collectionGroup('messages')
      .where('clientMessageId', '==', clientMessageId)
      .where('senderId', '==', senderId)
      .limit(1)
      .get();

    if (snap.empty) return null;
    const doc = snap.docs[0];
    const d = doc.data();
    return {
      id: d.id || doc.id,
      conversationId: d.conversationId || d.conversation_id,
      senderId: d.senderId || d.sender_id,
      senderName: d.senderName || d.sender_name,
      senderAvatar: d.senderAvatar || d.sender_avatar || null,
      clientMessageId: d.clientMessageId || d.client_message_id || null,
      content: d.content,
      status: d.status || 'sent',
      createdAt: d.createdAt || d.created_at || new Date().toISOString(),
    };
  }

  async saveMessage(message: {
    id?: string;
    conversationId: string;
    senderId: string;
    senderName: string;
    senderAvatar?: string | null;
    clientMessageId?: string | null;
    content: string;
    status?: 'pending' | 'sent' | 'delivered' | 'read';
  }): Promise<DbMessage> {
    const msgId = message.id || 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();
    const status = message.status || 'sent';

    const savedMsg: DbMessage = {
      id: msgId,
      conversationId: message.conversationId,
      senderId: message.senderId,
      senderName: message.senderName,
      senderAvatar: message.senderAvatar || null,
      clientMessageId: message.clientMessageId || null,
      content: message.content,
      status,
      createdAt: now,
    };

    const firestore = this.getFirestore();
    const convRef = firestore.collection('conversations').doc(message.conversationId);
    const msgRef = convRef.collection('messages').doc(msgId);

    // Get current conversation to increment unread counts
    const convDoc = await convRef.get();
    const convData = convDoc.data();
    const unreadCounts = { ...(convData?.unreadCounts || {}) };

    if (Array.isArray(convData?.participantIds)) {
      for (const participant of convData.participantIds) {
        if (participant !== message.senderId) {
          unreadCounts[participant] = (unreadCounts[participant] || 0) + 1;
        } else {
          unreadCounts[participant] = 0;
        }
      }
    }

    const batch = firestore.batch();
    batch.set(msgRef, savedMsg);
    batch.set(
      convRef,
      {
        updatedAt: now,
        lastMessage: {
          id: msgId,
          senderId: message.senderId,
          senderName: message.senderName,
          content: message.content,
          status,
          createdAt: now,
        },
        unreadCounts,
        [`lastReadMessageIds.${message.senderId}`]: msgId,
        messageCount: FieldValue.increment(1),
      },
      { merge: true }
    );

    await batch.commit();
    return savedMsg;
  }

  async markConversationRead(conversationId: string, userId: string, messageId: string): Promise<void> {
    const convRef = this.getFirestore().collection('conversations').doc(conversationId);
    await convRef.set(
      {
        [`lastReadMessageIds.${userId}`]: messageId,
        [`unreadCounts.${userId}`]: 0,
      },
      { merge: true }
    );
  }
}
