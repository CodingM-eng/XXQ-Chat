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
  DbPendingAccessRequest,
  DbMessageReply,
  DbMessageForward,
  DbDriveAccount,
  DbAttachment,
  DbTelegramBot,
  TelegramCommandConfig,
  DbSupportReport,
  DbServer,
  ServerPurpose,
  DbMembershipInvitation,
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
          onboarded: true,
          status: 'active',
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

      // Check if user is an existing admin
      const userSnap = await this.getFirestore().collection('users').where('email', '==', normalized).limit(1).get();
      if (!userSnap.empty) {
        const u = userSnap.docs[0].data();
        if (u.isAdmin === true || u.is_admin === 1) {
          return true;
        }
      }

      const doc = await this.getFirestore().collection('whitelist').doc(normalized).get();
      return doc.exists;
    } catch (err) {
      console.error('FirestoreStore: failed to check whitelist status:', err);
      return false;
    }
  }

  async getWhitelist(): Promise<DbWhitelistEntry[]> {
    const whitelistSnap = await this.getFirestore().collection('whitelist').get();
    const usersSnap = await this.getFirestore().collection('users').get();

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
        isModerator: user?.isModerator === true,
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

    await this.resolvePendingAccess(normalized, 'approved');
  }

  async removeFromWhitelist(email: string): Promise<boolean> {
    const normalized = email.toLowerCase().trim();
    const docRef = this.getFirestore().collection('whitelist').doc(normalized);
    const doc = await docRef.get();
    if (!doc.exists) return false;
    await docRef.delete();
    return true;
  }

  // Pending Access Requests
  async recordPendingAccess(email: string, displayName?: string, avatarUrl?: string, ipAddress?: string): Promise<void> {
    const normalized = email.toLowerCase().trim();
    const ref = this.getFirestore().collection('pending_access_requests').doc(normalized);
    const doc = await ref.get();
    const now = new Date().toISOString();

    if (doc.exists) {
      const d = doc.data()!;
      await ref.set(
        {
          attemptCount: (d.attemptCount || 1) + 1,
          lastAttemptAt: now,
          status: 'pending',
          displayName: displayName || d.displayName || null,
          avatarUrl: avatarUrl || d.avatarUrl || null,
        },
        { merge: true }
      );
    } else {
      await ref.set({
        id: 'pend_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
        email: normalized,
        displayName: displayName || null,
        avatarUrl: avatarUrl || null,
        firstAttemptAt: now,
        lastAttemptAt: now,
        attemptCount: 1,
        status: 'pending',
      });
    }
  }

  async getPendingAccessRequests(): Promise<DbPendingAccessRequest[]> {
    const snap = await this.getFirestore().collection('pending_access_requests').get();
    const requests: DbPendingAccessRequest[] = [];
    snap.forEach((doc) => {
      const d = doc.data();
      const status = (d.status || 'pending') as 'pending' | 'approved' | 'rejected';
      if (status === 'pending') {
        requests.push({
          id: d.id || doc.id,
          email: d.email || doc.id,
          displayName: d.displayName || null,
          avatarUrl: d.avatarUrl || null,
          firstAttemptAt: d.firstAttemptAt || new Date().toISOString(),
          lastAttemptAt: d.lastAttemptAt || new Date().toISOString(),
          attemptCount: d.attemptCount || 1,
          status,
        });
      }
    });

    return requests.sort((a, b) => b.lastAttemptAt.localeCompare(a.lastAttemptAt));
  }

  async getResolvedAccessRequests(limit = 50): Promise<DbPendingAccessRequest[]> {
    const snap = await this.getFirestore().collection('pending_access_requests').get();
    const requests: DbPendingAccessRequest[] = [];
    snap.forEach((doc) => {
      const d = doc.data();
      const status = (d.status || 'pending') as 'pending' | 'approved' | 'rejected';
      if (status === 'approved' || status === 'rejected') {
        requests.push({
          id: d.id || doc.id,
          email: d.email || doc.id,
          displayName: d.displayName || null,
          avatarUrl: d.avatarUrl || null,
          firstAttemptAt: d.firstAttemptAt || new Date().toISOString(),
          lastAttemptAt: d.lastAttemptAt || new Date().toISOString(),
          attemptCount: d.attemptCount || 1,
          status,
          resolvedAt: d.resolvedAt || d.lastAttemptAt || null,
        });
      }
    });

    return requests
      .sort((a, b) => b.lastAttemptAt.localeCompare(a.lastAttemptAt))
      .slice(0, Math.min(Math.max(limit, 1), 100));
  }

  async resolvePendingAccess(email: string, status: 'approved' | 'rejected'): Promise<void> {
    const normalized = email.toLowerCase().trim();
    const ref = this.getFirestore().collection('pending_access_requests').doc(normalized);
    const doc = await ref.get();
    if (doc.exists) {
      await ref.set({ status, resolvedAt: new Date().toISOString() }, { merge: true });
    }
  }

  async rejectPendingAccess(email: string): Promise<void> {
    await this.resolvePendingAccess(email, 'rejected');
  }

  // Users
  async getUserById(id: string): Promise<DbUser | null> {
    const doc = await this.getFirestore().collection('users').doc(id).get();
    if (!doc.exists) return null;
    const d = doc.data()!;
    return {
      id: d.id || doc.id,
      email: d.email,
      firstName: d.firstName || d.first_name || null,
      lastName: d.lastName || d.last_name || null,
      displayName: d.displayName || d.display_name,
      avatarUrl: d.avatarUrl || d.avatar_url || null,
      phoneNumber: d.phoneNumber || d.phone_number || null,
      isAdmin: d.isAdmin === true || d.is_admin === 1,
      isModerator: d.isModerator === true || d.is_moderator === 1,
      themePreference: d.themePreference === 'light' || d.theme_preference === 'light' ? 'light' : 'dark',
      onboarded: d.onboarded !== undefined ? !!d.onboarded : true,
      status: d.status || 'active',
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
      firstName: d.firstName || d.first_name || null,
      lastName: d.lastName || d.last_name || null,
      displayName: d.displayName || d.display_name,
      avatarUrl: d.avatarUrl || d.avatar_url || null,
      phoneNumber: d.phoneNumber || d.phone_number || null,
      isAdmin: d.isAdmin === true || d.is_admin === 1,
      isModerator: d.isModerator === true || d.is_moderator === 1,
      themePreference: d.themePreference === 'light' || d.theme_preference === 'light' ? 'light' : 'dark',
      onboarded: d.onboarded !== undefined ? !!d.onboarded : true,
      status: d.status || 'active',
      createdAt: d.createdAt || d.created_at || new Date().toISOString(),
      lastActiveAt: d.lastActiveAt || d.last_active_at || new Date().toISOString(),
    };
  }

  async upsertUser(user: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    displayName: string;
    avatarUrl?: string | null;
    phoneNumber?: string | null;
    isAdmin?: boolean;
    isModerator?: boolean;
    onboarded?: boolean;
    status?: 'active' | 'pending' | 'blocked';
  }): Promise<DbUser> {
    const email = user.email.toLowerCase().trim();
    const isInitialAdmin = email === config.INITIAL_ADMIN_EMAIL.toLowerCase().trim();
    const existing = await this.getUserByEmail(email);

    const now = new Date().toISOString();

    if (existing) {
      const isAdmin = existing.isAdmin || isInitialAdmin || !!user.isAdmin;
      const isModerator = user.isModerator !== undefined ? user.isModerator : (existing.isModerator || false);
      const effectiveId = existing.id;
      const updates: any = {
        lastActiveAt: now,
        isAdmin,
        isModerator,
      };
      if (user.avatarUrl && !existing.avatarUrl) updates.avatarUrl = user.avatarUrl;
      if (user.displayName && user.displayName !== existing.displayName) updates.displayName = user.displayName;
      if (user.firstName !== undefined) updates.firstName = user.firstName;
      if (user.lastName !== undefined) updates.lastName = user.lastName;
      if (user.phoneNumber !== undefined) updates.phoneNumber = user.phoneNumber;
      if (user.onboarded !== undefined) updates.onboarded = user.onboarded;
      if (user.status !== undefined) updates.status = user.status;

      await this.getFirestore().collection('users').doc(effectiveId).set(updates, { merge: true });
      return (await this.getUserById(effectiveId))!;
    } else {
      const isAdmin = isInitialAdmin || !!user.isAdmin;
      const isModerator = !!user.isModerator;
      const onboarded = user.onboarded !== undefined ? user.onboarded : isAdmin;
      const status = user.status || 'active';

      const newUser: DbUser = {
        id: user.id,
        email,
        firstName: user.firstName || null,
        lastName: user.lastName || null,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl || null,
        phoneNumber: user.phoneNumber || null,
        isAdmin,
        isModerator,
        themePreference: 'dark',
        onboarded,
        status,
        createdAt: now,
        lastActiveAt: now,
      };

      await this.getFirestore().collection('users').doc(user.id).set(newUser);
      return newUser;
    }
  }

  async updateUserProfile(
    id: string,
    updates: {
      firstName?: string | null;
      lastName?: string | null;
      displayName?: string;
      avatarUrl?: string | null;
      phoneNumber?: string | null;
      themePreference?: 'dark' | 'light';
    }
  ): Promise<DbUser | null> {
    const docRef = this.getFirestore().collection('users').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return null;

    const dataToUpdate: any = { lastActiveAt: new Date().toISOString() };
    if (updates.firstName !== undefined) dataToUpdate.firstName = updates.firstName;
    if (updates.lastName !== undefined) dataToUpdate.lastName = updates.lastName;
    if (updates.displayName !== undefined) dataToUpdate.displayName = updates.displayName;
    if (updates.avatarUrl !== undefined) dataToUpdate.avatarUrl = updates.avatarUrl;
    if (updates.phoneNumber !== undefined) dataToUpdate.phoneNumber = updates.phoneNumber;
    if (updates.themePreference !== undefined) dataToUpdate.themePreference = updates.themePreference;

    await docRef.set(dataToUpdate, { merge: true });
    return this.getUserById(id);
  }

  async completeOnboarding(
    userId: string,
    data: {
      firstName?: string | null;
      lastName?: string | null;
      displayName: string;
      avatarUrl?: string | null;
      phoneNumber?: string | null;
    }
  ): Promise<DbUser> {
    const docRef = this.getFirestore().collection('users').doc(userId);
    await docRef.set(
      {
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        displayName: data.displayName,
        avatarUrl: data.avatarUrl || null,
        phoneNumber: data.phoneNumber || null,
        onboarded: true,
        status: 'active',
        lastActiveAt: new Date().toISOString(),
      },
      { merge: true }
    );

    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found after onboarding');
    return user;
  }

  async updateUserLastActive(id: string): Promise<void> {
    try {
      await this.getFirestore().collection('users').doc(id).set(
        {
          lastActiveAt: new Date().toISOString(),
        },
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
      if (d.status === 'active' || !d.status) {
        users.push({
          id: d.id || doc.id,
          email: d.email,
          firstName: d.firstName || null,
          lastName: d.lastName || null,
          displayName: d.displayName || d.display_name,
          avatarUrl: d.avatarUrl || d.avatar_url || null,
          isAdmin: d.isAdmin === true || d.is_admin === 1,
          isModerator: d.isModerator === true || d.is_moderator === 1,
          onboarded: d.onboarded !== undefined ? !!d.onboarded : true,
          status: 'active',
          createdAt: d.createdAt || d.created_at || new Date().toISOString(),
          lastActiveAt: d.lastActiveAt || d.last_active_at || new Date().toISOString(),
        });
      }
    });

    return users.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async searchUsers(excludeUserId: string, query?: string): Promise<DbUser[]> {
    const all = await this.getAllUsers();
    const q = (query || '').toLowerCase().trim();

    return all.filter((u) => {
      if (u.id === excludeUserId) return false;
      if (u.status !== 'active') return false;
      if (!q) return true;
      return u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    });
  }

  // Audit Logs
  async recordAuditLog(log: {
    id?: string;
    actorId?: string | null;
    actorEmail: string;
    action: string;
    target?: string | null;
    details?: string | null;
    ipAddress?: string | null;
  }): Promise<void> {
    const logId = log.id || 'audit_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    await this.getFirestore().collection('audit_logs').doc(logId).set({
      id: logId,
      actorId: log.actorId || null,
      actorEmail: log.actorEmail,
      action: log.action,
      target: log.target || null,
      details: log.details || null,
      ipAddress: log.ipAddress || null,
      createdAt: new Date().toISOString(),
    });
  }

  async getAuditLogs(limit = 100): Promise<DbAuditLog[]> {
    const boundedLimit = Math.min(Math.max(limit, 1), 200);
    const snap = await this.getFirestore().collection('audit_logs').orderBy('createdAt', 'desc').limit(boundedLimit).get();
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

    return logs;
  }

  // Stats
  async getStats(): Promise<{ totalUsers: number; approvedWhitelistCount: number; adminCount: number; totalMessages: number }> {
    const usersSnap = await this.getFirestore().collection('users').get();
    const whitelistSnap = await this.getFirestore().collection('whitelist').get();

    let totalUsers = 0;
    let adminCount = 0;
    usersSnap.forEach((doc) => {
      const d = doc.data();
      if (d.status === 'active' || !d.status) {
        totalUsers++;
        if (d.isAdmin === true || d.is_admin === 1) adminCount++;
      }
    });

    const approvedWhitelistCount = whitelistSnap.size;

    let totalMessages = 0;
    const convSnap = await this.getFirestore().collection('conversations').get();
    convSnap.forEach((doc) => {
      totalMessages += doc.data()?.messageCount || 0;
    });

    return { totalUsers, approvedWhitelistCount, adminCount, totalMessages };
  }

  // Conversations & Messages
  async getUserConversations(userId: string): Promise<DbConversationSummary[]> {
    const snap = await this.getFirestore()
      .collection('conversations')
      .where('participantIds', 'array-contains', userId)
      .get();

    const summaries: DbConversationSummary[] = [];

    for (const doc of snap.docs) {
      const data = doc.data();
      const participants = (data.participantIds as string[]) || [];

      let peer = null;
      let participantList: any[] = [];

      if (data.type === 'direct') {
        const peerId = participants.find((id) => id !== userId);
        if (peerId) {
          const peerUser = await this.getUserById(peerId);
          if (peerUser) {
            peer = {
              id: peerUser.id,
              email: peerUser.email,
              displayName: peerUser.displayName,
              avatarUrl: peerUser.avatarUrl,
              lastActiveAt: peerUser.lastActiveAt,
            };
          }
        }
      } else {
        // Group or channel participants
        for (const pid of participants) {
          const pUser = await this.getUserById(pid);
          if (pUser) {
            const role = (data.roles?.[pid] || (data.adminIds?.includes(pid) ? 'admin' : (data.creatorId === pid ? 'owner' : 'member'))) as 'owner' | 'admin' | 'moderator' | 'member';
            participantList.push({
              id: pUser.id,
              email: pUser.email,
              displayName: pUser.displayName,
              avatarUrl: pUser.avatarUrl,
              isAdmin: (data.adminIds as string[])?.includes(pid) || data.creatorId === pid || role === 'owner' || role === 'admin',
              role,
              customTag: data.customTags?.[pid] || null,
              joinedAt: data.joinedAts?.[pid] || undefined,
            });
          }
        }
      }

      // Query latest message
      let lastMessage = null;
      const lastMsgSnap = await this.getFirestore()
        .collection('conversations')
        .doc(doc.id)
        .collection('messages')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      if (!lastMsgSnap.empty) {
        const d = lastMsgSnap.docs[0].data();
        lastMessage = {
          id: d.id || lastMsgSnap.docs[0].id,
          senderId: d.senderId || d.sender_id,
          senderName: d.senderName || d.sender_name,
          content: d.content,
          status: d.status || 'sent',
          createdAt: d.createdAt || d.created_at || new Date().toISOString(),
        };
      }

      const unreadCount = data.unreadCounts?.[userId] || 0;

      summaries.push({
        id: doc.id,
        type: data.type || 'direct',
        name: data.type === 'direct' && peer ? peer.displayName : data.name || (data.type === 'channel' ? 'Kanal' : 'Chat'),
        description: data.description || null,
        rules: data.rules || null,
        joinPolicy: data.joinPolicy || 'auto',
        avatarUrl: data.avatarUrl || null,
        creatorId: data.creatorId || null,
        serverId: data.serverId || null,
        isAnnouncementOnly: !!data.isAnnouncementOnly,
        adminIds: data.adminIds || [],
        participantCount: participants.length,
        participants: data.type === 'group' || data.type === 'channel' ? participantList : undefined,
        peer,
        lastMessage,
        unreadCount,
        updatedAt: data.updatedAt || new Date().toISOString(),
      });
    }

    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getConversation(conversationId: string, userId: string): Promise<DbConversationSummary | null> {
    const isParticipant = await this.isConversationParticipant(conversationId, userId);
    if (!isParticipant) {
      const user = await this.getUserById(userId);
      if (user?.isAdmin) {
        const allGroups = await this.getAllGroups();
        const match = allGroups.find((g) => g.id === conversationId);
        if (match) return match;
      }
      return null;
    }

    const convs = await this.getUserConversations(userId);
    return convs.find((c) => c.id === conversationId) || null;
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

  async createGroupConversation(creatorId: string, name: string, memberIds: string[], avatarUrl?: string | null): Promise<string> {
    const convId = 'group_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();
    const uniqueParticipants = Array.from(new Set([creatorId, ...memberIds]));

    const unreadCounts: Record<string, number> = {};
    const roles: Record<string, string> = { [creatorId]: 'owner' };
    const joinedAts: Record<string, string> = { [creatorId]: now };

    for (const pid of uniqueParticipants) {
      unreadCounts[pid] = 0;
      if (pid !== creatorId) {
        roles[pid] = 'member';
        joinedAts[pid] = now;
      }
    }

    const convData = {
      id: convId,
      type: 'group',
      name,
      avatarUrl: avatarUrl || null,
      creatorId,
      adminIds: [creatorId],
      participantIds: uniqueParticipants,
      roles,
      joinedAts,
      customTags: {},
      joinPolicy: 'auto',
      unreadCounts,
      lastReadMessageIds: {},
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
    };

    await this.getFirestore().collection('conversations').doc(convId).set(convData);
    return convId;
  }

  async addConversationParticipants(conversationId: string, userIds: string[]): Promise<void> {
    const convRef = this.getFirestore().collection('conversations').doc(conversationId);
    const now = new Date().toISOString();
    const rolesUpdates: Record<string, string> = {};
    const joinedUpdates: Record<string, string> = {};
    for (const uid of userIds) {
      rolesUpdates[`roles.${uid}`] = 'member';
      joinedUpdates[`joinedAts.${uid}`] = now;
    }

    await convRef.set(
      {
        participantIds: FieldValue.arrayUnion(...userIds),
        ...rolesUpdates,
        ...joinedUpdates,
        updatedAt: now,
      },
      { merge: true }
    );
  }

  async removeConversationParticipant(conversationId: string, userId: string): Promise<void> {
    const convRef = this.getFirestore().collection('conversations').doc(conversationId);
    await convRef.set(
      {
        participantIds: FieldValue.arrayRemove(userId),
        adminIds: FieldValue.arrayRemove(userId),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }

  async updateConversation(conversationId: string, updates: { name?: string; avatarUrl?: string | null }): Promise<void> {
    const convRef = this.getFirestore().collection('conversations').doc(conversationId);
    const data: any = { updatedAt: new Date().toISOString() };
    if (updates.name !== undefined) data.name = updates.name;
    if (updates.avatarUrl !== undefined) data.avatarUrl = updates.avatarUrl;
    await convRef.set(data, { merge: true });
  }

  async isConversationParticipant(conversationId: string, userId: string): Promise<boolean> {
    const doc = await this.getFirestore().collection('conversations').doc(conversationId).get();
    if (!doc.exists) return false;
    const data = doc.data();
    return Array.isArray(data?.participantIds) && data.participantIds.includes(userId);
  }

  async isConversationAdmin(conversationId: string, userId: string): Promise<boolean> {
    const doc = await this.getFirestore().collection('conversations').doc(conversationId).get();
    if (!doc.exists) return false;
    const data = doc.data();
    if (data?.creatorId === userId) return true;
    if (data?.roles?.[userId] === 'owner' || data?.roles?.[userId] === 'admin') return true;
    return Array.isArray(data?.adminIds) && data.adminIds.includes(userId);
  }

  async getConversationParticipantIds(conversationId: string): Promise<string[]> {
    const doc = await this.getFirestore().collection('conversations').doc(conversationId).get();
    if (!doc.exists) return [];
    const data = doc.data();
    return Array.isArray(data?.participantIds) ? data.participantIds : [];
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
        replyTo: d.replyTo || null,
        forwardedFrom: d.forwardedFrom || null,
        attachments: d.attachments || null,
        reactions: d.reactions || {},
        status: d.status || 'sent',
        createdAt: d.createdAt || d.created_at || new Date().toISOString(),
      });
    });

    return messages;
  }

  async findMessageByClientId(clientMessageId: string, senderId: string, conversationId?: string): Promise<DbMessage | null> {
    try {
      if (conversationId) {
        const snap = await this.getFirestore()
          .collection('conversations')
          .doc(conversationId)
          .collection('messages')
          .where('clientMessageId', '==', clientMessageId)
          .limit(1)
          .get();

        if (!snap.empty) {
          const doc = snap.docs[0];
          const d = doc.data();
          if (d.senderId && d.senderId !== senderId) return null;
          return {
            id: d.id || doc.id,
            conversationId: d.conversationId || conversationId,
            senderId: d.senderId || d.sender_id,
            senderName: d.senderName || d.sender_name,
            senderAvatar: d.senderAvatar || d.sender_avatar || null,
            clientMessageId: d.clientMessageId || d.client_message_id || null,
            content: d.content,
            replyTo: d.replyTo || null,
            forwardedFrom: d.forwardedFrom || null,
            attachments: d.attachments || null,
            reactions: d.reactions || {},
            status: d.status || 'sent',
            createdAt: d.createdAt || d.created_at || new Date().toISOString(),
          };
        }
      }

      // Fallback single-field query across collectionGroup without composite index requirement
      const snap = await this.getFirestore()
        .collectionGroup('messages')
        .where('clientMessageId', '==', clientMessageId)
        .limit(1)
        .get();

      if (snap.empty) return null;
      const doc = snap.docs[0];
      const d = doc.data();
      if (d.senderId && d.senderId !== senderId) return null;
      return {
        id: d.id || doc.id,
        conversationId: d.conversationId || d.conversation_id,
        senderId: d.senderId || d.sender_id,
        senderName: d.senderName || d.sender_name,
        senderAvatar: d.senderAvatar || d.sender_avatar || null,
        clientMessageId: d.clientMessageId || d.client_message_id || null,
        content: d.content,
        replyTo: d.replyTo || null,
        forwardedFrom: d.forwardedFrom || null,
        attachments: d.attachments || null,
        reactions: d.reactions || {},
        status: d.status || 'sent',
        createdAt: d.createdAt || d.created_at || new Date().toISOString(),
      };
    } catch (err) {
      console.warn('[FIRESTORE] findMessageByClientId lookup warning (bypassing deduplication):', err);
      return null;
    }
  }

  async saveMessage(message: {
    id?: string;
    conversationId: string;
    senderId: string;
    senderName: string;
    senderAvatar?: string | null;
    clientMessageId?: string | null;
    content: string;
    replyTo?: DbMessageReply | null;
    forwardedFrom?: DbMessageForward | null;
    attachments?: DbAttachment[] | null;
    status?: 'pending' | 'sent' | 'delivered' | 'read';
  }): Promise<DbMessage> {
    const msgId = message.id || 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();
    const status = message.status || 'sent';

    const msgData: any = {
      id: msgId,
      conversationId: message.conversationId,
      senderId: message.senderId,
      senderName: message.senderName,
      senderAvatar: message.senderAvatar || null,
      clientMessageId: message.clientMessageId || null,
      content: message.content,
      replyTo: message.replyTo || null,
      forwardedFrom: message.forwardedFrom || null,
      attachments: message.attachments || null,
      reactions: {},
      status,
      createdAt: now,
    };

    const convRef = this.getFirestore().collection('conversations').doc(message.conversationId);
    await convRef.collection('messages').doc(msgId).set(msgData);

    // If attachments were included, associate them with this message in attachments collection
    if (message.attachments && message.attachments.length > 0) {
      for (const att of message.attachments) {
        await this.getFirestore().collection('attachments').doc(att.id).set(
          { messageId: msgId },
          { merge: true }
        );
      }
    }

    // Update conversation metadata safely without failing message persistence
    try {
      const convDoc = await convRef.get();
      if (convDoc.exists) {
        const convData = convDoc.data()!;
        const participants = (convData.participantIds as string[]) || [];
        const existingUnreads = (convData.unreadCounts as Record<string, number>) || {};
        const newUnreads: Record<string, number> = { ...existingUnreads };

        for (const p of participants) {
          if (p !== message.senderId) {
            newUnreads[p] = (newUnreads[p] || 0) + 1;
          }
        }

        await convRef.set(
          {
            updatedAt: now,
            messageCount: FieldValue.increment(1),
            lastReadMessageIds: {
              ...(convData.lastReadMessageIds || {}),
              [message.senderId]: msgId,
            },
            unreadCounts: newUnreads,
          },
          { merge: true }
        );
      }
    } catch (metaErr) {
      console.warn('[FIRESTORE] update conversation metadata warning (non-fatal):', metaErr);
    }

    return msgData;
  }

  async markConversationRead(conversationId: string, userId: string, messageId: string): Promise<void> {
    const convRef = this.getFirestore().collection('conversations').doc(conversationId);
    await convRef.update({
      [`unreadCounts.${userId}`]: 0,
      [`lastReadMessageIds.${userId}`]: messageId,
    });

    const msgRef = convRef.collection('messages').doc(messageId);
    const msgDoc = await msgRef.get();
    if (msgDoc.exists && msgDoc.data()?.senderId !== userId) {
      await msgRef.update({ status: 'read' });
    }
  }

  async toggleMessageReaction(conversationId: string, messageId: string, userId: string, emoji: string): Promise<Record<string, string[]>> {
    const msgRef = this.getFirestore()
      .collection('conversations')
      .doc(conversationId)
      .collection('messages')
      .doc(messageId);

    const doc = await msgRef.get();
    if (!doc.exists) return {};

    const d = doc.data()!;
    const reactions: Record<string, string[]> = d.reactions || {};
    const existingList: string[] = reactions[emoji] || [];

    if (existingList.includes(userId)) {
      reactions[emoji] = existingList.filter((id) => id !== userId);
      if (reactions[emoji].length === 0) {
        delete reactions[emoji];
      }
    } else {
      reactions[emoji] = [...existingList, userId];
    }

    await msgRef.update({ reactions });
    return reactions;
  }

  async deleteMessage(conversationId: string, messageId: string): Promise<boolean> {
    const msgRef = this.getFirestore()
      .collection('conversations')
      .doc(conversationId)
      .collection('messages')
      .doc(messageId);
    const doc = await msgRef.get();
    if (!doc.exists) return false;
    await msgRef.delete();
    return true;
  }

  // Moderators
  async setModerator(userId: string, isModerator: boolean): Promise<DbUser | null> {
    const userRef = this.getFirestore().collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return null;

    await userRef.set({ isModerator }, { merge: true });
    const user = await this.getUserById(userId);

    if (user) {
      const email = user.email.toLowerCase().trim();
      const wlRef = this.getFirestore().collection('whitelist').doc(email);
      const wlDoc = await wlRef.get();
      if (wlDoc.exists) {
        await wlRef.set({ isModerator }, { merge: true });
      }
    }
    return user;
  }

  async getModerators(): Promise<DbUser[]> {
    const all = await this.getAllUsers();
    return all.filter((u) => u.isAdmin || u.isModerator);
  }

  // Google Drive Accounts
  async addDriveAccount(account: Omit<DbDriveAccount, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<DbDriveAccount> {
    const id = account.id || 'drive_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();
    const email = account.email.toLowerCase().trim();

    const data: DbDriveAccount = {
      id,
      email,
      displayName: account.displayName || null,
      encryptedRefreshToken: account.encryptedRefreshToken,
      folderId: account.folderId || null,
      spaceUsed: account.spaceUsed || 0,
      spaceTotal: account.spaceTotal || 0,
      createdAt: now,
      updatedAt: now,
    };

    await this.getFirestore().collection('drive_accounts').doc(id).set(data);
    return data;
  }

  async getDriveAccounts(): Promise<DbDriveAccount[]> {
    const snap = await this.getFirestore().collection('drive_accounts').get();
    const accounts: DbDriveAccount[] = [];
    snap.forEach((doc) => {
      const d = doc.data();
      accounts.push({
        id: d.id || doc.id,
        email: d.email,
        displayName: d.displayName || null,
        encryptedRefreshToken: d.encryptedRefreshToken,
        folderId: d.folderId || null,
        spaceUsed: d.spaceUsed || 0,
        spaceTotal: d.spaceTotal || 0,
        createdAt: d.createdAt || new Date().toISOString(),
        updatedAt: d.updatedAt || new Date().toISOString(),
      });
    });
    return accounts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getDriveAccountById(id: string): Promise<DbDriveAccount | null> {
    const doc = await this.getFirestore().collection('drive_accounts').doc(id).get();
    if (!doc.exists) return null;
    const d = doc.data()!;
    return {
      id: d.id || doc.id,
      email: d.email,
      displayName: d.displayName || null,
      encryptedRefreshToken: d.encryptedRefreshToken,
      folderId: d.folderId || null,
      spaceUsed: d.spaceUsed || 0,
      spaceTotal: d.spaceTotal || 0,
      createdAt: d.createdAt || new Date().toISOString(),
      updatedAt: d.updatedAt || new Date().toISOString(),
    };
  }

  async removeDriveAccount(id: string): Promise<boolean> {
    const ref = this.getFirestore().collection('drive_accounts').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return false;
    await ref.delete();
    return true;
  }

  async updateDriveAccountFolder(id: string, folderId: string): Promise<void> {
    await this.getFirestore().collection('drive_accounts').doc(id).set(
      { folderId, updatedAt: new Date().toISOString() },
      { merge: true }
    );
  }

  async updateDriveAccountQuota(id: string, spaceUsed: number, spaceTotal: number): Promise<void> {
    await this.getFirestore().collection('drive_accounts').doc(id).set(
      { spaceUsed, spaceTotal, updatedAt: new Date().toISOString() },
      { merge: true }
    );
  }

  // Attachments
  async saveAttachment(attachment: Omit<DbAttachment, 'id' | 'createdAt'> & { id?: string }): Promise<DbAttachment> {
    const id = attachment.id || 'att_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
    const now = new Date().toISOString();

    const data: DbAttachment = {
      id,
      conversationId: attachment.conversationId,
      messageId: attachment.messageId || null,
      uploaderId: attachment.uploaderId,
      driveAccountId: attachment.driveAccountId,
      driveAccountEmail: attachment.driveAccountEmail,
      driveFileId: attachment.driveFileId,
      fileName: attachment.fileName,
      fileSize: attachment.fileSize,
      mimeType: attachment.mimeType,
      createdAt: now,
    };

    await this.getFirestore().collection('attachments').doc(id).set(data);
    return data;
  }

  async getAttachmentById(id: string): Promise<DbAttachment | null> {
    const doc = await this.getFirestore().collection('attachments').doc(id).get();
    if (!doc.exists) return null;
    const d = doc.data()!;
    return {
      id: d.id || doc.id,
      conversationId: d.conversationId,
      messageId: d.messageId || null,
      uploaderId: d.uploaderId,
      driveAccountId: d.driveAccountId,
      driveAccountEmail: d.driveAccountEmail,
      driveFileId: d.driveFileId,
      fileName: d.fileName,
      fileSize: d.fileSize,
      mimeType: d.mimeType,
      createdAt: d.createdAt || new Date().toISOString(),
    };
  }

  async getAttachmentsForConversation(conversationId: string): Promise<DbAttachment[]> {
    const snap = await this.getFirestore()
      .collection('attachments')
      .where('conversationId', '==', conversationId)
      .get();

    const list: DbAttachment[] = [];
    snap.forEach((doc) => {
      const d = doc.data();
      list.push({
        id: d.id || doc.id,
        conversationId: d.conversationId,
        messageId: d.messageId || null,
        uploaderId: d.uploaderId,
        driveAccountId: d.driveAccountId,
        driveAccountEmail: d.driveAccountEmail,
        driveFileId: d.driveFileId,
        fileName: d.fileName,
        fileSize: d.fileSize,
        mimeType: d.mimeType,
        createdAt: d.createdAt || new Date().toISOString(),
      });
    });

    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async deleteAttachment(id: string): Promise<boolean> {
    const ref = this.getFirestore().collection('attachments').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return false;
    await ref.delete();
    return true;
  }

  // Telegram Bots
  async addTelegramBot(bot: Omit<DbTelegramBot, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<DbTelegramBot> {
    const id = bot.id || 'bot_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();

    const data: DbTelegramBot = {
      id,
      botName: bot.botName,
      username: bot.username.replace(/^@/, ''),
      encryptedToken: bot.encryptedToken,
      webhookSecretToken: bot.webhookSecretToken,
      isEnabled: bot.isEnabled,
      customCommands: bot.customCommands || [],
      createdAt: now,
      updatedAt: now,
    };

    await this.getFirestore().collection('telegram_bots').doc(id).set(data);
    return data;
  }

  async getTelegramBots(): Promise<DbTelegramBot[]> {
    const snap = await this.getFirestore().collection('telegram_bots').get();
    const list: DbTelegramBot[] = [];
    snap.forEach((doc) => {
      const d = doc.data();
      list.push({
        id: d.id || doc.id,
        botName: d.botName,
        username: d.username,
        encryptedToken: d.encryptedToken,
        webhookSecretToken: d.webhookSecretToken,
        isEnabled: d.isEnabled !== false,
        customCommands: d.customCommands || [],
        createdAt: d.createdAt || new Date().toISOString(),
        updatedAt: d.updatedAt || new Date().toISOString(),
      });
    });
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getTelegramBotById(id: string): Promise<DbTelegramBot | null> {
    const doc = await this.getFirestore().collection('telegram_bots').doc(id).get();
    if (!doc.exists) return null;
    const d = doc.data()!;
    return {
      id: d.id || doc.id,
      botName: d.botName,
      username: d.username,
      encryptedToken: d.encryptedToken,
      webhookSecretToken: d.webhookSecretToken,
      isEnabled: d.isEnabled !== false,
      customCommands: d.customCommands || [],
      createdAt: d.createdAt || new Date().toISOString(),
      updatedAt: d.updatedAt || new Date().toISOString(),
    };
  }

  async updateTelegramBot(id: string, updates: Partial<Pick<DbTelegramBot, 'isEnabled' | 'customCommands' | 'encryptedToken' | 'webhookSecretToken' | 'botName' | 'username'>>): Promise<DbTelegramBot | null> {
    const ref = this.getFirestore().collection('telegram_bots').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return null;

    const toUpdate: any = { updatedAt: new Date().toISOString() };
    if (updates.isEnabled !== undefined) toUpdate.isEnabled = updates.isEnabled;
    if (updates.customCommands !== undefined) toUpdate.customCommands = updates.customCommands;
    if (updates.encryptedToken !== undefined) toUpdate.encryptedToken = updates.encryptedToken;
    if (updates.webhookSecretToken !== undefined) toUpdate.webhookSecretToken = updates.webhookSecretToken;
    if (updates.botName !== undefined) toUpdate.botName = updates.botName;
    if (updates.username !== undefined) toUpdate.username = updates.username;

    await ref.set(toUpdate, { merge: true });
    return this.getTelegramBotById(id);
  }

  async deleteTelegramBot(id: string): Promise<boolean> {
    const ref = this.getFirestore().collection('telegram_bots').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return false;
    await ref.delete();
    return true;
  }

  // Support & Problem Reports
  async createSupportReport(report: {
    userId: string;
    userEmail: string;
    userDisplayName: string;
    title: string;
    description: string;
    diagnostics: any;
  }): Promise<DbSupportReport> {
    const id = 'rep_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const now = new Date().toISOString();
    const docData: DbSupportReport = {
      id,
      userId: report.userId,
      userEmail: report.userEmail,
      userDisplayName: report.userDisplayName,
      title: report.title,
      description: report.description,
      diagnostics: report.diagnostics || {},
      status: 'open',
      createdAt: now,
      resolvedAt: null,
    };
    await this.getFirestore().collection('support_reports').doc(id).set(docData);
    return docData;
  }

  async getSupportReports(limit: number = 50): Promise<DbSupportReport[]> {
    const snap = await this.getFirestore().collection('support_reports').orderBy('createdAt', 'desc').limit(limit).get();
    const list: DbSupportReport[] = [];
    snap.forEach((doc) => {
      const d = doc.data() as DbSupportReport;
      list.push({ ...d, id: doc.id });
    });
    return list;
  }

  async updateSupportReportStatus(id: string, status: 'open' | 'investigating' | 'resolved'): Promise<boolean> {
    const ref = this.getFirestore().collection('support_reports').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return false;
    const resolvedAt = status === 'resolved' ? new Date().toISOString() : null;
    await ref.set({ status, resolvedAt }, { merge: true });
    return true;
  }

  // Authorized Message Search
  async searchMessages(userId: string, query: string, conversationId?: string): Promise<Array<DbMessage & { conversationName?: string }>> {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];

    let targetConvIds: string[] = [];
    const convMap = new Map<string, string>();

    if (conversationId) {
      const isParticipant = await this.isConversationParticipant(conversationId, userId);
      if (!isParticipant) return [];
      targetConvIds = [conversationId];
      const conv = await this.getConversation(conversationId, userId);
      if (conv) {
        convMap.set(conversationId, conv.name || (conv.type === 'direct' ? 'Direkt Mesaj' : 'Grup'));
      }
    } else {
      const userConvs = await this.getUserConversations(userId);
      targetConvIds = userConvs.map((c) => {
        convMap.set(c.id, c.name || (c.type === 'direct' ? 'Direkt Mesaj' : 'Grup'));
        return c.id;
      });
    }

    if (targetConvIds.length === 0) return [];

    const results: Array<DbMessage & { conversationName?: string }> = [];

    // Search across user's conversations
    for (const cId of targetConvIds) {
      const messages = await this.getConversationMessages(cId, 100);
      for (const msg of messages) {
        if (msg.content && msg.content.toLowerCase().includes(trimmed)) {
          results.push({
            ...msg,
            conversationName: convMap.get(cId) || 'Sohbet',
          });
        }
      }
    }

    results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return results.slice(0, 50);
  }

  // Groups Management & Roles
  async getAllGroups(): Promise<DbConversationSummary[]> {
    const snap = await this.getFirestore()
      .collection('conversations')
      .where('type', '==', 'group')
      .get();

    const groups: DbConversationSummary[] = [];
    for (const doc of snap.docs) {
      const data = doc.data();
      const participants = (data.participantIds as string[]) || [];
      const participantList: any[] = [];

      for (const pid of participants) {
        const pUser = await this.getUserById(pid);
        if (pUser) {
          const role = (data.roles?.[pid] || (data.adminIds?.includes(pid) ? 'admin' : (data.creatorId === pid ? 'owner' : 'member'))) as 'owner' | 'admin' | 'moderator' | 'member';
          participantList.push({
            id: pUser.id,
            email: pUser.email,
            displayName: pUser.displayName,
            avatarUrl: pUser.avatarUrl,
            isAdmin: role === 'owner' || role === 'admin' || (data.adminIds as string[])?.includes(pid),
            role,
            customTag: data.customTags?.[pid] || null,
            joinedAt: data.joinedAts?.[pid] || undefined,
          });
        }
      }

      groups.push({
        id: doc.id,
        type: 'group',
        name: data.name || 'Grup',
        description: data.description || null,
        rules: data.rules || null,
        joinPolicy: data.joinPolicy || 'auto',
        avatarUrl: data.avatarUrl || null,
        creatorId: data.creatorId || null,
        serverId: null,
        isAnnouncementOnly: false,
        adminIds: data.adminIds || [],
        participantCount: participants.length,
        participants: participantList,
        peer: null,
        lastMessage: null,
        unreadCount: 0,
        updatedAt: data.updatedAt || new Date().toISOString(),
      });
    }

    return groups.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async updateGroupSettings(conversationId: string, settings: { name?: string; description?: string | null; rules?: string | null; avatarUrl?: string | null; joinPolicy?: 'auto' | 'invite' | 'request' }): Promise<void> {
    const convRef = this.getFirestore().collection('conversations').doc(conversationId);
    const data: any = { updatedAt: new Date().toISOString() };
    if (settings.name !== undefined) data.name = settings.name;
    if (settings.description !== undefined) data.description = settings.description;
    if (settings.rules !== undefined) data.rules = settings.rules;
    if (settings.avatarUrl !== undefined) data.avatarUrl = settings.avatarUrl;
    if (settings.joinPolicy !== undefined) data.joinPolicy = settings.joinPolicy;
    await convRef.set(data, { merge: true });
  }

  async updateParticipantRole(conversationId: string, userId: string, role: 'owner' | 'admin' | 'moderator' | 'member', customTag?: string | null): Promise<void> {
    const convRef = this.getFirestore().collection('conversations').doc(conversationId);
    const doc = await convRef.get();
    if (!doc.exists) return;
    const data = doc.data()!;
    const adminIds = new Set<string>(data.adminIds || []);
    if (role === 'owner' || role === 'admin') {
      adminIds.add(userId);
    } else {
      adminIds.delete(userId);
    }
    const updatePayload: any = {
      adminIds: Array.from(adminIds),
      [`roles.${userId}`]: role,
      updatedAt: new Date().toISOString(),
    };
    if (customTag !== undefined) {
      updatePayload[`customTags.${userId}`] = customTag;
    }
    await convRef.update(updatePayload);
  }

  async getConversationRole(conversationId: string, userId: string): Promise<'owner' | 'admin' | 'moderator' | 'member' | null> {
    const doc = await this.getFirestore().collection('conversations').doc(conversationId).get();
    if (!doc.exists) return null;
    const data = doc.data()!;
    if (data.roles?.[userId]) return data.roles[userId];
    if (data.creatorId === userId) return 'owner';
    if (Array.isArray(data.adminIds) && data.adminIds.includes(userId)) return 'admin';
    if (Array.isArray(data.participantIds) && data.participantIds.includes(userId)) return 'member';
    return null;
  }

  // Servers & Channels
  async createServer(ownerId: string, data: { name: string; description?: string | null; purpose: ServerPurpose; avatarUrl?: string | null; rules?: string | null }): Promise<{ server: DbServer; channels: DbConversationSummary[] }> {
    const serverId = 'srv_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();

    const serverDoc = {
      id: serverId,
      name: data.name,
      description: data.description || null,
      purpose: data.purpose || 'chat',
      avatarUrl: data.avatarUrl || null,
      rules: data.rules || null,
      ownerId,
      memberIds: [ownerId],
      roles: { [ownerId]: 'owner' },
      customTags: {},
      joinedAts: { [ownerId]: now },
      createdAt: now,
      updatedAt: now,
    };

    await this.getFirestore().collection('servers').doc(serverId).set(serverDoc);

    const defaultChannels = [
      { name: 'genel-sohbet', isAnnouncement: false },
      { name: 'duyurular', isAnnouncement: true },
      { name: 'kurallar', isAnnouncement: true },
    ];

    const channels: DbConversationSummary[] = [];

    for (const ch of defaultChannels) {
      const chId = 'chan_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
      const chDoc = {
        id: chId,
        type: 'channel',
        name: ch.name,
        creatorId: ownerId,
        serverId,
        isAnnouncementOnly: ch.isAnnouncement,
        participantIds: [ownerId],
        adminIds: [ownerId],
        roles: { [ownerId]: 'owner' },
        customTags: {},
        joinedAts: { [ownerId]: now },
        unreadCounts: { [ownerId]: 0 },
        lastReadMessageIds: {},
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
      };

      await this.getFirestore().collection('conversations').doc(chId).set(chDoc);

      channels.push({
        id: chId,
        type: 'channel',
        name: ch.name,
        creatorId: ownerId,
        serverId,
        isAnnouncementOnly: ch.isAnnouncement,
        adminIds: [ownerId],
        participantCount: 1,
        peer: null,
        lastMessage: null,
        unreadCount: 0,
        updatedAt: now,
      });
    }

    const ownerUser = await this.getUserById(ownerId);
    const server: DbServer = {
      id: serverId,
      name: data.name,
      description: data.description || null,
      purpose: data.purpose,
      avatarUrl: data.avatarUrl || null,
      rules: data.rules || null,
      ownerId,
      memberIds: [ownerId],
      members: ownerUser ? [{
        id: ownerUser.id,
        displayName: ownerUser.displayName,
        avatarUrl: ownerUser.avatarUrl,
        role: 'owner',
        customTag: null,
        joinedAt: now,
      }] : [],
      channels,
      createdAt: now,
      updatedAt: now,
    };

    return { server, channels };
  }

  async getServer(serverId: string, userId: string): Promise<DbServer | null> {
    const sDoc = await this.getFirestore().collection('servers').doc(serverId).get();
    if (!sDoc.exists) return null;
    const data = sDoc.data()!;

    const memberIds = (data.memberIds as string[]) || [];
    const members: any[] = [];
    for (const mid of memberIds) {
      const u = await this.getUserById(mid);
      if (u) {
        members.push({
          id: u.id,
          displayName: u.displayName,
          avatarUrl: u.avatarUrl,
          role: data.roles?.[mid] || (data.ownerId === mid ? 'owner' : 'member'),
          customTag: data.customTags?.[mid] || null,
          joinedAt: data.joinedAts?.[mid] || data.createdAt,
        });
      }
    }

    const chanSnap = await this.getFirestore().collection('conversations')
      .where('serverId', '==', serverId)
      .get();

    const channels: DbConversationSummary[] = [];
    for (const c of chanSnap.docs) {
      const cd = c.data();
      channels.push({
        id: c.id,
        type: 'channel',
        name: cd.name,
        serverId,
        creatorId: cd.creatorId,
        isAnnouncementOnly: !!cd.isAnnouncementOnly,
        adminIds: cd.adminIds || [data.ownerId],
        participantCount: memberIds.length,
        peer: null,
        lastMessage: null,
        unreadCount: 0,
        updatedAt: cd.updatedAt || data.updatedAt,
      });
    }

    return {
      id: sDoc.id,
      name: data.name,
      description: data.description || null,
      purpose: data.purpose || 'chat',
      avatarUrl: data.avatarUrl || null,
      rules: data.rules || null,
      ownerId: data.ownerId,
      memberIds,
      members,
      channels: channels.sort((a, b) => a.name.localeCompare(b.name)),
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }

  async getUserServers(userId: string): Promise<DbServer[]> {
    const snap = await this.getFirestore().collection('servers')
      .where('memberIds', 'array-contains', userId)
      .get();

    const servers: DbServer[] = [];
    for (const doc of snap.docs) {
      const s = await this.getServer(doc.id, userId);
      if (s) servers.push(s);
    }
    return servers.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getAllServers(): Promise<DbServer[]> {
    const snap = await this.getFirestore().collection('servers').get();
    const servers: DbServer[] = [];
    for (const doc of snap.docs) {
      const s = await this.getServer(doc.id, doc.data()?.ownerId || '');
      if (s) servers.push(s);
    }
    return servers.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createServerChannel(serverId: string, actorId: string, data: { name: string; isAnnouncementOnly?: boolean }): Promise<DbConversationSummary> {
    const sDoc = await this.getFirestore().collection('servers').doc(serverId).get();
    if (!sDoc.exists) throw new Error('Server not found');
    const sData = sDoc.data()!;
    const memberIds = (sData.memberIds as string[]) || [];

    const chId = 'chan_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const cleanName = data.name.replace(/^#/, '').trim();
    const now = new Date().toISOString();

    const roles: Record<string, string> = {};
    const customTags: Record<string, string> = {};
    const joinedAts: Record<string, string> = {};
    const unreadCounts: Record<string, number> = {};

    for (const mid of memberIds) {
      roles[mid] = sData.roles?.[mid] || (sData.ownerId === mid ? 'owner' : 'member');
      if (sData.customTags?.[mid]) customTags[mid] = sData.customTags[mid];
      joinedAts[mid] = now;
      unreadCounts[mid] = 0;
    }

    const chDoc = {
      id: chId,
      type: 'channel',
      name: cleanName,
      creatorId: actorId,
      serverId,
      isAnnouncementOnly: !!data.isAnnouncementOnly,
      participantIds: memberIds,
      adminIds: memberIds.filter((mid) => roles[mid] === 'owner' || roles[mid] === 'admin'),
      roles,
      customTags,
      joinedAts,
      unreadCounts,
      lastReadMessageIds: {},
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
    };

    await this.getFirestore().collection('conversations').doc(chId).set(chDoc);
    await this.getFirestore().collection('servers').doc(serverId).update({ updatedAt: now });

    return {
      id: chId,
      type: 'channel',
      name: cleanName,
      serverId,
      creatorId: actorId,
      isAnnouncementOnly: !!data.isAnnouncementOnly,
      adminIds: chDoc.adminIds,
      participantCount: memberIds.length,
      peer: null,
      lastMessage: null,
      unreadCount: 0,
      updatedAt: now,
    };
  }

  async addServerMember(serverId: string, userId: string, role: 'admin' | 'moderator' | 'member' = 'member'): Promise<void> {
    const sRef = this.getFirestore().collection('servers').doc(serverId);
    const now = new Date().toISOString();

    await sRef.set(
      {
        memberIds: FieldValue.arrayUnion(userId),
        [`roles.${userId}`]: role,
        [`joinedAts.${userId}`]: now,
        updatedAt: now,
      },
      { merge: true }
    );

    const chanSnap = await this.getFirestore().collection('conversations')
      .where('serverId', '==', serverId)
      .get();

    for (const c of chanSnap.docs) {
      const cRef = this.getFirestore().collection('conversations').doc(c.id);
      const updateData: any = {
        participantIds: FieldValue.arrayUnion(userId),
        [`roles.${userId}`]: role,
        [`joinedAts.${userId}`]: now,
        [`unreadCounts.${userId}`]: 0,
        updatedAt: now,
      };
      if (role === 'admin') {
        updateData.adminIds = FieldValue.arrayUnion(userId);
      }
      await cRef.set(updateData, { merge: true });
    }
  }

  async removeServerMember(serverId: string, userId: string): Promise<void> {
    const sRef = this.getFirestore().collection('servers').doc(serverId);
    const now = new Date().toISOString();

    await sRef.update({
      memberIds: FieldValue.arrayRemove(userId),
      [`roles.${userId}`]: FieldValue.delete(),
      [`customTags.${userId}`]: FieldValue.delete(),
      [`joinedAts.${userId}`]: FieldValue.delete(),
      updatedAt: now,
    });

    const chanSnap = await this.getFirestore().collection('conversations')
      .where('serverId', '==', serverId)
      .get();

    for (const c of chanSnap.docs) {
      await this.getFirestore().collection('conversations').doc(c.id).update({
        participantIds: FieldValue.arrayRemove(userId),
        adminIds: FieldValue.arrayRemove(userId),
        [`roles.${userId}`]: FieldValue.delete(),
        [`customTags.${userId}`]: FieldValue.delete(),
        [`joinedAts.${userId}`]: FieldValue.delete(),
        [`unreadCounts.${userId}`]: FieldValue.delete(),
        updatedAt: now,
      });
    }
  }

  async updateServerMemberRole(serverId: string, userId: string, role: 'owner' | 'admin' | 'moderator' | 'member', customTag?: string | null): Promise<void> {
    const sRef = this.getFirestore().collection('servers').doc(serverId);
    const now = new Date().toISOString();
    const updateData: any = {
      [`roles.${userId}`]: role,
      updatedAt: now,
    };
    if (customTag !== undefined) {
      updateData[`customTags.${userId}`] = customTag;
    }
    await sRef.update(updateData);

    const chanSnap = await this.getFirestore().collection('conversations')
      .where('serverId', '==', serverId)
      .get();

    for (const c of chanSnap.docs) {
      const cRef = this.getFirestore().collection('conversations').doc(c.id);
      const cUpdate: any = {
        [`roles.${userId}`]: role,
        updatedAt: now,
      };
      if (role === 'owner' || role === 'admin') {
        cUpdate.adminIds = FieldValue.arrayUnion(userId);
      } else {
        cUpdate.adminIds = FieldValue.arrayRemove(userId);
      }
      if (customTag !== undefined) {
        cUpdate[`customTags.${userId}`] = customTag;
      }
      await cRef.update(cUpdate);
    }
  }

  async updateServerSettings(serverId: string, updates: { name?: string; description?: string | null; rules?: string | null; avatarUrl?: string | null; purpose?: ServerPurpose }): Promise<void> {
    const sRef = this.getFirestore().collection('servers').doc(serverId);
    const data: any = { updatedAt: new Date().toISOString() };
    if (updates.name !== undefined) data.name = updates.name;
    if (updates.description !== undefined) data.description = updates.description;
    if (updates.rules !== undefined) data.rules = updates.rules;
    if (updates.avatarUrl !== undefined) data.avatarUrl = updates.avatarUrl;
    if (updates.purpose !== undefined) data.purpose = updates.purpose;
    await sRef.set(data, { merge: true });
  }

  async isServerMember(serverId: string, userId: string): Promise<boolean> {
    const sDoc = await this.getFirestore().collection('servers').doc(serverId).get();
    if (!sDoc.exists) return false;
    const data = sDoc.data()!;
    return Array.isArray(data.memberIds) && data.memberIds.includes(userId);
  }

  async isServerAdmin(serverId: string, userId: string): Promise<boolean> {
    const sDoc = await this.getFirestore().collection('servers').doc(serverId).get();
    if (!sDoc.exists) return false;
    const data = sDoc.data()!;
    if (data.ownerId === userId) return true;
    return data.roles?.[userId] === 'owner' || data.roles?.[userId] === 'admin';
  }

  // Membership Invitations & Join Requests
  async createMembershipInvitation(invitation: Omit<DbMembershipInvitation, 'id' | 'createdAt' | 'status'> & { id?: string }): Promise<DbMembershipInvitation> {
    const id = invitation.id || 'inv_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();

    const data: DbMembershipInvitation = {
      id,
      targetType: invitation.targetType,
      targetId: invitation.targetId,
      targetName: invitation.targetName,
      userId: invitation.userId,
      userDisplayName: invitation.userDisplayName,
      type: invitation.type,
      status: 'pending',
      createdById: invitation.createdById,
      createdAt: now,
      resolvedAt: null,
      resolvedById: null,
    };

    await this.getFirestore().collection('membership_invitations').doc(id).set(data);
    return data;
  }

  async getUserInvitations(userId: string): Promise<DbMembershipInvitation[]> {
    const snap = await this.getFirestore().collection('membership_invitations')
      .where('userId', '==', userId)
      .where('type', '==', 'invite')
      .where('status', '==', 'pending')
      .get();

    const list: DbMembershipInvitation[] = [];
    snap.forEach((doc) => {
      list.push(doc.data() as DbMembershipInvitation);
    });

    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getTargetJoinRequests(targetType: 'group' | 'server', targetId: string): Promise<DbMembershipInvitation[]> {
    const snap = await this.getFirestore().collection('membership_invitations')
      .where('targetId', '==', targetId)
      .where('type', '==', 'request')
      .where('status', '==', 'pending')
      .get();

    const list: DbMembershipInvitation[] = [];
    snap.forEach((doc) => {
      list.push(doc.data() as DbMembershipInvitation);
    });

    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async resolveMembershipInvitation(id: string, status: 'accepted' | 'declined' | 'approved' | 'rejected', actorId: string): Promise<DbMembershipInvitation | null> {
    const ref = this.getFirestore().collection('membership_invitations').doc(id);
    const doc = await ref.get();
    if (!doc.exists) return null;

    const now = new Date().toISOString();
    await ref.set({
      status,
      resolvedAt: now,
      resolvedById: actorId,
    }, { merge: true });

    const updated = await ref.get();
    return updated.data() as DbMembershipInvitation;
  }

  async hasActiveInvitationOrRequest(targetId: string, userId: string): Promise<boolean> {
    const snap = await this.getFirestore().collection('membership_invitations')
      .where('targetId', '==', targetId)
      .where('userId', '==', userId)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    return !snap.empty;
  }
}
