import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import {
  DataStore,
  DbUser,
  DbWhitelistEntry,
  DbAuditLog,
  DbConversationSummary,
  DbMessage,
} from './types.js';

export class SqliteStore implements DataStore {
  readonly driverName = 'sqlite' as const;
  private db: DatabaseSync | null = null;

  async init(): Promise<void> {
    if (this.db) return;

    const dbPath = path.resolve(process.cwd(), config.DB_PATH);
    const dbDir = path.dirname(dbPath);

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const sqlite = new DatabaseSync(dbPath);
    sqlite.exec('PRAGMA journal_mode = WAL;');
    sqlite.exec('PRAGMA foreign_keys = ON;');

    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        avatar_url TEXT,
        is_admin INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS whitelist (
        email TEXT PRIMARY KEY,
        approved_by TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        actor_id TEXT,
        actor_email TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT,
        details TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('direct', 'group')),
        name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS conversation_participants (
        conversation_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_read_message_id TEXT,
        PRIMARY KEY (conversation_id, user_id),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        sender_avatar TEXT,
        client_message_id TEXT,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'sent' CHECK(status IN ('pending', 'sent', 'delivered', 'read')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_client_id ON messages(client_message_id);
      CREATE INDEX IF NOT EXISTS idx_participants_user ON conversation_participants(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
    `);

    // Whitelist mode setting initialization
    const existingSetting = sqlite
      .prepare('SELECT value FROM system_settings WHERE key = ?')
      .get('whitelist_mode') as { value: string } | undefined;

    if (!existingSetting) {
      sqlite
        .prepare('INSERT INTO system_settings (key, value) VALUES (?, ?)')
        .run('whitelist_mode', config.WHITELIST_MODE_DEFAULT ? 'true' : 'false');
    }

    // Pre-seed initial administrator if configured
    if (config.INITIAL_ADMIN_EMAIL) {
      const adminEmail = config.INITIAL_ADMIN_EMAIL.toLowerCase().trim();
      const checkWhitelist = sqlite.prepare('SELECT email FROM whitelist WHERE LOWER(email) = ?').get(adminEmail);
      if (!checkWhitelist) {
        sqlite
          .prepare('INSERT INTO whitelist (email, approved_by) VALUES (?, ?)')
          .run(adminEmail, 'system_bootstrap');
      }

      const checkUser = sqlite.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(adminEmail);
      if (!checkUser) {
        const adminId = 'user_admin_bootstrap';
        sqlite
          .prepare(`
            INSERT INTO users (id, email, display_name, is_admin)
            VALUES (?, ?, ?, 1)
          `)
          .run(adminId, adminEmail, 'Initial Admin');

        sqlite
          .prepare(`
            INSERT INTO audit_logs (id, actor_id, actor_email, action, target, details)
            VALUES (?, ?, ?, ?, ?, ?)
          `)
          .run(
            'audit_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            'system',
            'system',
            'SYSTEM_BOOTSTRAP_ADMIN',
            adminEmail,
            'Initial administrator designated via server environment'
          );
      }
    }

    this.db = sqlite;
  }

  private getSqlite(): DatabaseSync {
    if (!this.db) {
      throw new Error('SqliteStore has not been initialized. Call init() first.');
    }
    return this.db;
  }

  async close(): Promise<void> {
    if (this.db) {
      try {
        this.db.close();
      } catch (err) {
        console.error('Error closing SQLite DB:', err);
      }
      this.db = null;
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const row = this.getSqlite().prepare('SELECT 1 as alive').get() as { alive: number } | undefined;
      return row?.alive === 1;
    } catch {
      return false;
    }
  }

  async isWhitelistModeEnabled(): Promise<boolean> {
    try {
      const row = this.getSqlite()
        .prepare("SELECT value FROM system_settings WHERE key = 'whitelist_mode'")
        .get() as { value: string } | undefined;
      if (!row) return true;
      return row.value === 'true';
    } catch (err) {
      console.error('SqliteStore: failed to query whitelist mode:', err);
      return true; // Fail closed
    }
  }

  async setWhitelistMode(enabled: boolean): Promise<void> {
    this.getSqlite()
      .prepare(`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES ('whitelist_mode', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `)
      .run(enabled ? 'true' : 'false');
  }

  async isEmailWhitelisted(email: string): Promise<boolean> {
    try {
      const normalized = email.toLowerCase().trim();
      if (config.INITIAL_ADMIN_EMAIL && normalized === config.INITIAL_ADMIN_EMAIL.toLowerCase().trim()) {
        return true;
      }

      const userRow = this.getSqlite()
        .prepare('SELECT is_admin FROM users WHERE LOWER(email) = ?')
        .get(normalized) as { is_admin: number } | undefined;
      if (userRow && userRow.is_admin === 1) {
        return true;
      }

      const whitelistRow = this.getSqlite()
        .prepare('SELECT email FROM whitelist WHERE LOWER(email) = ?')
        .get(normalized);
      return !!whitelistRow;
    } catch (err) {
      console.error('SqliteStore: failed to check whitelist status:', err);
      return false;
    }
  }

  async getWhitelist(): Promise<DbWhitelistEntry[]> {
    const items = this.getSqlite()
      .prepare(`
        SELECT w.email, w.approved_by, w.created_at, u.display_name, u.avatar_url, u.is_admin
        FROM whitelist w
        LEFT JOIN users u ON LOWER(u.email) = LOWER(w.email)
        ORDER BY w.created_at DESC
      `)
      .all() as any[];

    return items.map((row) => ({
      email: row.email,
      approvedBy: row.approved_by,
      createdAt: row.created_at,
      displayName: row.display_name || undefined,
      avatarUrl: row.avatar_url || null,
      isAdmin: row.is_admin === 1,
    }));
  }

  async addToWhitelist(email: string, approvedBy: string): Promise<void> {
    const normalized = email.toLowerCase().trim();
    this.getSqlite()
      .prepare(`
        INSERT INTO whitelist (email, approved_by, created_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(email) DO UPDATE SET approved_by = excluded.approved_by
      `)
      .run(normalized, approvedBy);
  }

  async removeFromWhitelist(email: string): Promise<boolean> {
    const normalized = email.toLowerCase().trim();
    const result = this.getSqlite()
      .prepare('DELETE FROM whitelist WHERE LOWER(email) = ?')
      .run(normalized);
    return result.changes > 0;
  }

  async getUserById(id: string): Promise<DbUser | null> {
    const row = this.getSqlite()
      .prepare('SELECT id, email, display_name, avatar_url, is_admin, created_at, last_active_at FROM users WHERE id = ?')
      .get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      avatarUrl: row.avatar_url || null,
      isAdmin: row.is_admin === 1,
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at,
    };
  }

  async getUserByEmail(email: string): Promise<DbUser | null> {
    const normalized = email.toLowerCase().trim();
    const row = this.getSqlite()
      .prepare('SELECT id, email, display_name, avatar_url, is_admin, created_at, last_active_at FROM users WHERE LOWER(email) = ?')
      .get(normalized) as any;
    if (!row) return null;

    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      avatarUrl: row.avatar_url || null,
      isAdmin: row.is_admin === 1,
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at,
    };
  }

  async upsertUser(user: { id: string; email: string; displayName: string; avatarUrl?: string | null; isAdmin?: boolean }): Promise<DbUser> {
    const email = user.email.toLowerCase().trim();
    const isInitialAdmin = email === config.INITIAL_ADMIN_EMAIL.toLowerCase().trim();

    const existing = this.getSqlite()
      .prepare('SELECT id, email, display_name, avatar_url, is_admin, created_at, last_active_at FROM users WHERE LOWER(email) = ?')
      .get(email) as any;

    if (existing) {
      const isAdmin = existing.is_admin === 1 || isInitialAdmin || !!user.isAdmin;
      const effectiveId = existing.id;
      if (user.avatarUrl && user.avatarUrl !== existing.avatar_url) {
        this.getSqlite()
          .prepare('UPDATE users SET avatar_url = ?, last_active_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(user.avatarUrl, effectiveId);
      } else {
        this.getSqlite()
          .prepare('UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(effectiveId);
      }

      return {
        id: effectiveId,
        email,
        displayName: existing.display_name,
        avatarUrl: user.avatarUrl || existing.avatar_url || null,
        isAdmin,
        createdAt: existing.created_at,
        lastActiveAt: new Date().toISOString(),
      };
    } else {
      const isAdmin = isInitialAdmin || !!user.isAdmin;
      this.getSqlite()
        .prepare(`
          INSERT INTO users (id, email, display_name, avatar_url, is_admin)
          VALUES (?, ?, ?, ?, ?)
        `)
        .run(user.id, email, user.displayName, user.avatarUrl || null, isAdmin ? 1 : 0);

      const created = this.getSqlite()
        .prepare('SELECT id, email, display_name, avatar_url, is_admin, created_at, last_active_at FROM users WHERE id = ?')
        .get(user.id) as any;

      return {
        id: user.id,
        email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl || null,
        isAdmin,
        createdAt: created?.created_at || new Date().toISOString(),
        lastActiveAt: created?.last_active_at || new Date().toISOString(),
      };
    }
  }

  async updateUserProfile(id: string, updates: { displayName?: string; avatarUrl?: string }): Promise<DbUser | null> {
    if (updates.displayName !== undefined && updates.avatarUrl !== undefined) {
      this.getSqlite()
        .prepare('UPDATE users SET display_name = ?, avatar_url = ?, last_active_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(updates.displayName, updates.avatarUrl, id);
    } else if (updates.displayName !== undefined) {
      this.getSqlite()
        .prepare('UPDATE users SET display_name = ?, last_active_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(updates.displayName, id);
    } else if (updates.avatarUrl !== undefined) {
      this.getSqlite()
        .prepare('UPDATE users SET avatar_url = ?, last_active_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(updates.avatarUrl, id);
    }

    return this.getUserById(id);
  }

  async updateUserLastActive(id: string): Promise<void> {
    try {
      this.getSqlite()
        .prepare('UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(id);
    } catch (err) {
      console.error('SqliteStore: failed to update last_active_at:', err);
    }
  }

  async getAllUsers(): Promise<DbUser[]> {
    const rows = this.getSqlite()
      .prepare(`
        SELECT id, email, display_name, avatar_url, is_admin, created_at, last_active_at
        FROM users
        ORDER BY created_at DESC
      `)
      .all() as any[];

    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.display_name,
      avatarUrl: r.avatar_url || null,
      isAdmin: r.is_admin === 1,
      createdAt: r.created_at,
      lastActiveAt: r.last_active_at,
    }));
  }

  async searchUsers(excludeUserId: string, query?: string): Promise<DbUser[]> {
    const q = (query || '').toLowerCase().trim();
    let rows: any[];

    if (q) {
      rows = this.getSqlite()
        .prepare(`
          SELECT id, email, display_name, avatar_url, is_admin, created_at, last_active_at
          FROM users
          WHERE id != ? AND (LOWER(display_name) LIKE ? OR LOWER(email) LIKE ?)
          ORDER BY display_name ASC
          LIMIT 30
        `)
        .all(excludeUserId, `%${q}%`, `%${q}%`) as any[];
    } else {
      rows = this.getSqlite()
        .prepare(`
          SELECT id, email, display_name, avatar_url, is_admin, created_at, last_active_at
          FROM users
          WHERE id != ?
          ORDER BY last_active_at DESC
          LIMIT 30
        `)
        .all(excludeUserId) as any[];
    }

    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.display_name,
      avatarUrl: r.avatar_url || null,
      isAdmin: r.is_admin === 1,
      createdAt: r.created_at,
      lastActiveAt: r.last_active_at,
    }));
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
    this.getSqlite()
      .prepare(`
        INSERT INTO audit_logs (id, actor_id, actor_email, action, target, details, ip_address)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(id, log.actorId || null, log.actorEmail, log.action, log.target || null, log.details || null, log.ipAddress || 'unknown');
  }

  async getAuditLogs(limit = 50): Promise<DbAuditLog[]> {
    const boundedLimit = Math.min(Math.max(limit, 1), 200);
    const rows = this.getSqlite()
      .prepare(`
        SELECT id, actor_id, actor_email, action, target, details, ip_address, created_at
        FROM audit_logs
        ORDER BY created_at DESC, rowid DESC
        LIMIT ?
      `)
      .all(boundedLimit) as any[];

    return rows.map((r) => ({
      id: r.id,
      actorId: r.actor_id,
      actorEmail: r.actor_email,
      action: r.action,
      target: r.target,
      details: r.details,
      ipAddress: r.ip_address,
      createdAt: r.created_at,
    }));
  }

  async getStats(): Promise<{ totalUsers: number; approvedWhitelistCount: number; adminCount: number; totalMessages: number }> {
    const totalUsers = (this.getSqlite().prepare('SELECT COUNT(*) as count FROM users').get() as any).count || 0;
    const approvedWhitelistCount = (this.getSqlite().prepare('SELECT COUNT(*) as count FROM whitelist').get() as any).count || 0;
    const adminCount = (this.getSqlite().prepare('SELECT COUNT(*) as count FROM users WHERE is_admin = 1').get() as any).count || 0;
    const totalMessages = (this.getSqlite().prepare('SELECT COUNT(*) as count FROM messages').get() as any).count || 0;

    return { totalUsers, approvedWhitelistCount, adminCount, totalMessages };
  }

  async getUserConversations(userId: string): Promise<DbConversationSummary[]> {
    const conversations = this.getSqlite()
      .prepare(`
        SELECT 
          c.id, c.type, c.name, c.updated_at,
          p.last_read_message_id
        FROM conversations c
        JOIN conversation_participants p ON p.conversation_id = c.id
        WHERE p.user_id = ?
        ORDER BY c.updated_at DESC
      `)
      .all(userId) as any[];

    return conversations.map((conv) => {
      let peer = null;
      if (conv.type === 'direct') {
        peer = this.getSqlite()
          .prepare(`
            SELECT u.id, u.email, u.display_name, u.avatar_url, u.last_active_at
            FROM conversation_participants cp
            JOIN users u ON u.id = cp.user_id
            WHERE cp.conversation_id = ? AND cp.user_id != ?
          `)
          .get(conv.id, userId) as any;
      }

      const lastMessage = this.getSqlite()
        .prepare(`
          SELECT id, sender_id, sender_name, content, status, created_at
          FROM messages
          WHERE conversation_id = ?
          ORDER BY created_at DESC
          LIMIT 1
        `)
        .get(conv.id) as any;

      const unreadCount =
        (
          this.getSqlite()
            .prepare(`
              SELECT COUNT(*) as count
              FROM messages m
              JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
              WHERE m.conversation_id = ?
                AND m.sender_id != ?
                AND (cp.last_read_message_id IS NULL OR m.created_at > (
                  SELECT created_at FROM messages WHERE id = cp.last_read_message_id
                ))
                AND cp.user_id = ?
            `)
            .get(conv.id, userId, userId) as any
        )?.count || 0;

      return {
        id: conv.id,
        type: conv.type,
        name: conv.type === 'direct' && peer ? peer.display_name : conv.name || 'Chat',
        peer: peer
          ? {
              id: peer.id,
              email: peer.email,
              displayName: peer.display_name,
              avatarUrl: peer.avatar_url || null,
              lastActiveAt: peer.last_active_at || null,
            }
          : null,
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              senderId: lastMessage.sender_id,
              senderName: lastMessage.sender_name,
              content: lastMessage.content,
              status: lastMessage.status,
              createdAt: lastMessage.created_at,
            }
          : null,
        unreadCount,
        updatedAt: conv.updated_at,
      };
    });
  }

  async getDirectConversation(userId1: string, userId2: string): Promise<string | null> {
    const existingConv = this.getSqlite()
      .prepare(`
        SELECT c.id
        FROM conversations c
        JOIN conversation_participants p1 ON p1.conversation_id = c.id AND p1.user_id = ?
        JOIN conversation_participants p2 ON p2.conversation_id = c.id AND p2.user_id = ?
        WHERE c.type = 'direct'
      `)
      .get(userId1, userId2) as any;

    return existingConv ? existingConv.id : null;
  }

  async createDirectConversation(userId1: string, userId2: string): Promise<string> {
    const convId = 'conv_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);

    const sqlite = this.getSqlite();
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      sqlite
        .prepare(`
          INSERT INTO conversations (id, type, created_at, updated_at)
          VALUES (?, 'direct', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `)
        .run(convId);

      sqlite
        .prepare(`
          INSERT INTO conversation_participants (conversation_id, user_id)
          VALUES (?, ?)
        `)
        .run(convId, userId1);

      sqlite
        .prepare(`
          INSERT INTO conversation_participants (conversation_id, user_id)
          VALUES (?, ?)
        `)
        .run(convId, userId2);

      sqlite.exec('COMMIT');
      return convId;
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }
  }

  async isConversationParticipant(conversationId: string, userId: string): Promise<boolean> {
    const row = this.getSqlite()
      .prepare('SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?')
      .get(conversationId, userId);
    return !!row;
  }

  async getConversationMessages(conversationId: string, limit = 50): Promise<DbMessage[]> {
    const boundedLimit = Math.min(Math.max(limit, 1), 100);
    const rows = this.getSqlite()
      .prepare(`
        SELECT id, conversation_id, sender_id, sender_name, sender_avatar, client_message_id, content, status, created_at
        FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC
        LIMIT ?
      `)
      .all(conversationId, boundedLimit) as any[];

    return rows.map((m) => ({
      id: m.id,
      conversationId: m.conversation_id,
      senderId: m.sender_id,
      senderName: m.sender_name,
      senderAvatar: m.sender_avatar || null,
      clientMessageId: m.client_message_id || null,
      content: m.content,
      status: m.status,
      createdAt: m.created_at,
    }));
  }

  async findMessageByClientId(clientMessageId: string, senderId: string): Promise<DbMessage | null> {
    const row = this.getSqlite()
      .prepare(`
        SELECT id, conversation_id, sender_id, sender_name, sender_avatar, client_message_id, content, status, created_at
        FROM messages
        WHERE client_message_id = ? AND sender_id = ?
      `)
      .get(clientMessageId, senderId) as any;

    if (!row) return null;

    return {
      id: row.id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      senderName: row.sender_name,
      senderAvatar: row.sender_avatar || null,
      clientMessageId: row.client_message_id || null,
      content: row.content,
      status: row.status,
      createdAt: row.created_at,
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
    const status = message.status || 'sent';

    const sqlite = this.getSqlite();
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      sqlite
        .prepare(`
          INSERT INTO messages (id, conversation_id, sender_id, sender_name, sender_avatar, client_message_id, content, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          msgId,
          message.conversationId,
          message.senderId,
          message.senderName,
          message.senderAvatar || null,
          message.clientMessageId || null,
          message.content,
          status
        );

      sqlite
        .prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(message.conversationId);

      sqlite
        .prepare('UPDATE conversation_participants SET last_read_message_id = ? WHERE conversation_id = ? AND user_id = ?')
        .run(msgId, message.conversationId, message.senderId);

      sqlite.exec('COMMIT');
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }

    const saved = this.getSqlite()
      .prepare(`
        SELECT id, conversation_id, sender_id, sender_name, sender_avatar, client_message_id, content, status, created_at
        FROM messages WHERE id = ?
      `)
      .get(msgId) as any;

    return {
      id: saved.id,
      conversationId: saved.conversation_id,
      senderId: saved.sender_id,
      senderName: saved.sender_name,
      senderAvatar: saved.sender_avatar || null,
      clientMessageId: saved.client_message_id || null,
      content: saved.content,
      status: saved.status,
      createdAt: saved.created_at,
    };
  }

  async markConversationRead(conversationId: string, userId: string, messageId: string): Promise<void> {
    const sqlite = this.getSqlite();
    sqlite
      .prepare(`
        UPDATE conversation_participants
        SET last_read_message_id = ?
        WHERE conversation_id = ? AND user_id = ?
      `)
      .run(messageId, conversationId, userId);

    sqlite
      .prepare(`
        UPDATE messages
        SET status = 'read'
        WHERE conversation_id = ? AND sender_id != ? AND id = ?
      `)
      .run(conversationId, userId, messageId);
  }
}
