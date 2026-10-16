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
  DbPendingAccessRequest,
  DbMessageReply,
  DbMessageForward,
  DbDriveAccount,
  DbAttachment,
  DbTelegramBot,
  TelegramCommandConfig,
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
        first_name TEXT,
        last_name TEXT,
        display_name TEXT NOT NULL,
        avatar_url TEXT,
        phone_number TEXT,
        is_admin INTEGER NOT NULL DEFAULT 0,
        onboarded INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS pending_access_requests (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        display_name TEXT,
        avatar_url TEXT,
        first_attempt_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_attempt_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        attempt_count INTEGER DEFAULT 1,
        status TEXT DEFAULT 'pending'
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
        avatar_url TEXT,
        creator_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS conversation_participants (
        conversation_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
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
        reply_to TEXT,
        forwarded_from TEXT,
        status TEXT NOT NULL DEFAULT 'sent' CHECK(status IN ('pending', 'sent', 'delivered', 'read')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS message_reactions (
        conversation_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        emoji TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (message_id, user_id, emoji),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS drive_accounts (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        display_name TEXT,
        encrypted_refresh_token TEXT NOT NULL,
        folder_id TEXT,
        space_used INTEGER DEFAULT 0,
        space_total INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        message_id TEXT,
        uploader_id TEXT NOT NULL,
        drive_account_id TEXT NOT NULL,
        drive_account_email TEXT,
        drive_file_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS telegram_bots (
        id TEXT PRIMARY KEY,
        bot_name TEXT NOT NULL,
        username TEXT NOT NULL,
        encrypted_token TEXT NOT NULL,
        webhook_secret_token TEXT NOT NULL,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        custom_commands_json TEXT NOT NULL DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_client_id ON messages(client_message_id);
      CREATE INDEX IF NOT EXISTS idx_participants_user ON conversation_participants(user_id);
      CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions(message_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_attachments_conversation ON attachments(conversation_id, created_at DESC);
    `);

    // Safe schema migrations for existing SQLite databases
    try { sqlite.exec('ALTER TABLE users ADD COLUMN first_name TEXT;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE users ADD COLUMN last_name TEXT;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE users ADD COLUMN phone_number TEXT;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE users ADD COLUMN is_moderator INTEGER DEFAULT 0;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE users ADD COLUMN onboarded INTEGER DEFAULT 1;'); } catch (_) {}
    try { sqlite.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active';"); } catch (_) {}
    try { sqlite.exec('ALTER TABLE whitelist ADD COLUMN is_moderator INTEGER DEFAULT 0;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE conversations ADD COLUMN avatar_url TEXT;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE conversations ADD COLUMN creator_id TEXT;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE conversation_participants ADD COLUMN is_admin INTEGER DEFAULT 0;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE messages ADD COLUMN reply_to TEXT;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE messages ADD COLUMN forwarded_from TEXT;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE messages ADD COLUMN attachments TEXT;'); } catch (_) {}

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
            INSERT INTO users (id, email, display_name, is_admin, onboarded, status)
            VALUES (?, ?, ?, 1, 1, 'active')
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
      } finally {
        this.db = null;
      }
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const row = this.getSqlite().prepare('SELECT 1 as healthy').get() as { healthy: number };
      return row?.healthy === 1;
    } catch {
      return false;
    }
  }

  // System settings
  async isWhitelistModeEnabled(): Promise<boolean> {
    try {
      const row = this.getSqlite()
        .prepare('SELECT value FROM system_settings WHERE key = ?')
        .get('whitelist_mode') as { value: string } | undefined;
      return row ? row.value === 'true' : config.WHITELIST_MODE_DEFAULT;
    } catch (err) {
      console.error('SqliteStore: failed to check whitelist mode:', err);
      return config.WHITELIST_MODE_DEFAULT;
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

  // Whitelist
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
        SELECT w.email, w.approved_by, w.created_at, u.display_name, u.avatar_url, u.is_admin, u.is_moderator
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
      isModerator: row.is_moderator === 1,
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

    // Also resolve any pending request
    await this.resolvePendingAccess(normalized, 'approved');
  }

  async removeFromWhitelist(email: string): Promise<boolean> {
    const normalized = email.toLowerCase().trim();
    const result = this.getSqlite()
      .prepare('DELETE FROM whitelist WHERE LOWER(email) = ?')
      .run(normalized);
    return result.changes > 0;
  }

  // Pending Access Requests
  async recordPendingAccess(email: string, displayName?: string, avatarUrl?: string, ipAddress?: string): Promise<void> {
    const normalized = email.toLowerCase().trim();
    const existing = this.getSqlite()
      .prepare('SELECT id, attempt_count FROM pending_access_requests WHERE LOWER(email) = ?')
      .get(normalized) as any;

    if (existing) {
      this.getSqlite()
        .prepare(`
          UPDATE pending_access_requests
          SET attempt_count = attempt_count + 1,
              last_attempt_at = CURRENT_TIMESTAMP,
              display_name = COALESCE(?, display_name),
              avatar_url = COALESCE(?, avatar_url)
          WHERE id = ?
        `)
        .run(displayName || null, avatarUrl || null, existing.id);
    } else {
      const id = 'pend_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
      this.getSqlite()
        .prepare(`
          INSERT INTO pending_access_requests (id, email, display_name, avatar_url, first_attempt_at, last_attempt_at, attempt_count, status)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'pending')
        `)
        .run(id, normalized, displayName || null, avatarUrl || null);
    }
  }

  async getPendingAccessRequests(): Promise<DbPendingAccessRequest[]> {
    const rows = this.getSqlite()
      .prepare(`
        SELECT id, email, display_name, avatar_url, first_attempt_at, last_attempt_at, attempt_count, status
        FROM pending_access_requests
        ORDER BY last_attempt_at DESC
      `)
      .all() as any[];

    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.display_name || null,
      avatarUrl: r.avatar_url || null,
      firstAttemptAt: r.first_attempt_at,
      lastAttemptAt: r.last_attempt_at,
      attemptCount: r.attempt_count,
      status: r.status as 'pending' | 'approved' | 'rejected',
    }));
  }

  async resolvePendingAccess(email: string, status: 'approved' | 'rejected'): Promise<void> {
    const normalized = email.toLowerCase().trim();
    this.getSqlite()
      .prepare('UPDATE pending_access_requests SET status = ? WHERE LOWER(email) = ?')
      .run(status, normalized);
  }

  // Users
  async getUserById(id: string): Promise<DbUser | null> {
    const row = this.getSqlite()
      .prepare('SELECT id, email, first_name, last_name, display_name, avatar_url, phone_number, is_admin, is_moderator, onboarded, status, created_at, last_active_at FROM users WHERE id = ?')
      .get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      email: row.email,
      firstName: row.first_name || null,
      lastName: row.last_name || null,
      displayName: row.display_name,
      avatarUrl: row.avatar_url || null,
      phoneNumber: row.phone_number || null,
      isAdmin: row.is_admin === 1,
      isModerator: row.is_moderator === 1,
      onboarded: row.onboarded === 1,
      status: row.status || 'active',
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at,
    };
  }

  async getUserByEmail(email: string): Promise<DbUser | null> {
    const normalized = email.toLowerCase().trim();
    const row = this.getSqlite()
      .prepare('SELECT id, email, first_name, last_name, display_name, avatar_url, phone_number, is_admin, is_moderator, onboarded, status, created_at, last_active_at FROM users WHERE LOWER(email) = ?')
      .get(normalized) as any;
    if (!row) return null;

    return {
      id: row.id,
      email: row.email,
      firstName: row.first_name || null,
      lastName: row.last_name || null,
      displayName: row.display_name,
      avatarUrl: row.avatar_url || null,
      phoneNumber: row.phone_number || null,
      isAdmin: row.is_admin === 1,
      isModerator: row.is_moderator === 1,
      onboarded: row.onboarded === 1,
      status: row.status || 'active',
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at,
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

    const existing = this.getSqlite()
      .prepare('SELECT id, email, first_name, last_name, display_name, avatar_url, phone_number, is_admin, is_moderator, onboarded, status, created_at, last_active_at FROM users WHERE LOWER(email) = ?')
      .get(email) as any;

    if (existing) {
      const isAdmin = existing.is_admin === 1 || isInitialAdmin || !!user.isAdmin;
      const effectiveId = existing.id;
      const updates: any[] = [];
      const params: any[] = [];

      if (user.avatarUrl && user.avatarUrl !== existing.avatar_url) {
        updates.push('avatar_url = ?');
        params.push(user.avatarUrl);
      }
      if (user.displayName && user.displayName !== existing.display_name) {
        updates.push('display_name = ?');
        params.push(user.displayName);
      }
      if (user.firstName !== undefined) {
        updates.push('first_name = ?');
        params.push(user.firstName);
      }
      if (user.lastName !== undefined) {
        updates.push('last_name = ?');
        params.push(user.lastName);
      }
      if (user.phoneNumber !== undefined) {
        updates.push('phone_number = ?');
        params.push(user.phoneNumber);
      }
      if (user.onboarded !== undefined) {
        updates.push('onboarded = ?');
        params.push(user.onboarded ? 1 : 0);
      }
      if (user.isModerator !== undefined) {
        updates.push('is_moderator = ?');
        params.push(user.isModerator ? 1 : 0);
      }
      if (user.status !== undefined) {
        updates.push('status = ?');
        params.push(user.status);
      }

      updates.push('last_active_at = CURRENT_TIMESTAMP');
      params.push(effectiveId);

      this.getSqlite()
        .prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`)
        .run(...params);

      return (await this.getUserById(effectiveId))!;
    } else {
      const isAdmin = isInitialAdmin || !!user.isAdmin;
      const isModerator = user.isModerator ? 1 : 0;
      const onboarded = user.onboarded !== undefined ? (user.onboarded ? 1 : 0) : (isAdmin ? 1 : 0);
      const status = user.status || 'active';

      this.getSqlite()
        .prepare(`
          INSERT INTO users (id, email, first_name, last_name, display_name, avatar_url, phone_number, is_admin, is_moderator, onboarded, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          user.id,
          email,
          user.firstName || null,
          user.lastName || null,
          user.displayName,
          user.avatarUrl || null,
          user.phoneNumber || null,
          isAdmin ? 1 : 0,
          isModerator,
          onboarded,
          status
        );

      return (await this.getUserById(user.id))!;
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
    }
  ): Promise<DbUser | null> {
    const updateParts: string[] = [];
    const params: any[] = [];

    if (updates.firstName !== undefined) {
      updateParts.push('first_name = ?');
      params.push(updates.firstName);
    }
    if (updates.lastName !== undefined) {
      updateParts.push('last_name = ?');
      params.push(updates.lastName);
    }
    if (updates.displayName !== undefined) {
      updateParts.push('display_name = ?');
      params.push(updates.displayName);
    }
    if (updates.avatarUrl !== undefined) {
      updateParts.push('avatar_url = ?');
      params.push(updates.avatarUrl);
    }
    if (updates.phoneNumber !== undefined) {
      updateParts.push('phone_number = ?');
      params.push(updates.phoneNumber);
    }

    if (updateParts.length > 0) {
      updateParts.push('last_active_at = CURRENT_TIMESTAMP');
      params.push(id);
      this.getSqlite()
        .prepare(`UPDATE users SET ${updateParts.join(', ')} WHERE id = ?`)
        .run(...params);
    }

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
    this.getSqlite()
      .prepare(`
        UPDATE users
        SET first_name = ?,
            last_name = ?,
            display_name = ?,
            avatar_url = ?,
            phone_number = ?,
            onboarded = 1,
            status = 'active',
            last_active_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(
        data.firstName || null,
        data.lastName || null,
        data.displayName,
        data.avatarUrl || null,
        data.phoneNumber || null,
        userId
      );

    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found after onboarding');
    return user;
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
        SELECT id, email, first_name, last_name, display_name, avatar_url, is_admin, is_moderator, onboarded, status, created_at, last_active_at
        FROM users
        WHERE status = 'active'
        ORDER BY created_at DESC
      `)
      .all() as any[];

    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      firstName: r.first_name || null,
      lastName: r.last_name || null,
      displayName: r.display_name,
      avatarUrl: r.avatar_url || null,
      isAdmin: r.is_admin === 1,
      isModerator: r.is_moderator === 1,
      onboarded: r.onboarded === 1,
      status: r.status,
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
          SELECT id, email, first_name, last_name, display_name, avatar_url, is_admin, is_moderator, onboarded, status, created_at, last_active_at
          FROM users
          WHERE id != ? AND status = 'active' AND (LOWER(display_name) LIKE ? OR LOWER(email) LIKE ?)
          ORDER BY display_name ASC
          LIMIT 30
        `)
        .all(excludeUserId, `%${q}%`, `%${q}%`) as any[];
    } else {
      rows = this.getSqlite()
        .prepare(`
          SELECT id, email, first_name, last_name, display_name, avatar_url, is_admin, is_moderator, onboarded, status, created_at, last_active_at
          FROM users
          WHERE id != ? AND status = 'active'
          ORDER BY last_active_at DESC
          LIMIT 30
        `)
        .all(excludeUserId) as any[];
    }

    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      firstName: r.first_name || null,
      lastName: r.last_name || null,
      displayName: r.display_name,
      avatarUrl: r.avatar_url || null,
      isAdmin: r.is_admin === 1,
      isModerator: r.is_moderator === 1,
      onboarded: r.onboarded === 1,
      status: r.status,
      createdAt: r.created_at,
      lastActiveAt: r.last_active_at,
    }));
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
    this.getSqlite()
      .prepare(`
        INSERT INTO audit_logs (id, actor_id, actor_email, action, target, details, ip_address, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        logId,
        log.actorId || null,
        log.actorEmail,
        log.action,
        log.target || null,
        log.details || null,
        log.ipAddress || null,
        new Date().toISOString()
      );
  }

  async getAuditLogs(limit = 100): Promise<DbAuditLog[]> {
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
      actorId: r.actor_id || null,
      actorEmail: r.actor_email,
      action: r.action,
      target: r.target || null,
      details: r.details || null,
      ipAddress: r.ip_address || null,
      createdAt: r.created_at,
    }));
  }

  // Stats
  async getStats(): Promise<{ totalUsers: number; approvedWhitelistCount: number; adminCount: number; totalMessages: number }> {
    const totalUsers = (this.getSqlite().prepare('SELECT COUNT(*) as count FROM users WHERE status = \'active\'').get() as any)?.count || 0;
    const approvedWhitelistCount = (this.getSqlite().prepare('SELECT COUNT(*) as count FROM whitelist').get() as any)?.count || 0;
    const adminCount = (this.getSqlite().prepare('SELECT COUNT(*) as count FROM users WHERE is_admin = 1').get() as any)?.count || 0;
    const totalMessages = (this.getSqlite().prepare('SELECT COUNT(*) as count FROM messages').get() as any)?.count || 0;

    return { totalUsers, approvedWhitelistCount, adminCount, totalMessages };
  }

  // Conversations & Messages
  async getUserConversations(userId: string): Promise<DbConversationSummary[]> {
    const conversations = this.getSqlite()
      .prepare(`
        SELECT c.id, c.type, c.name, c.avatar_url, c.creator_id, c.updated_at
        FROM conversations c
        JOIN conversation_participants p ON p.conversation_id = c.id
        WHERE p.user_id = ?
        ORDER BY c.updated_at DESC
      `)
      .all(userId) as any[];

    return Promise.all(
      conversations.map(async (conv) => {
        let peer = null;
        let participants: any[] = [];
        const participantCount = (
          this.getSqlite()
            .prepare('SELECT COUNT(*) as count FROM conversation_participants WHERE conversation_id = ?')
            .get(conv.id) as any
        )?.count || 0;

        if (conv.type === 'direct') {
          peer = this.getSqlite()
            .prepare(`
              SELECT u.id, u.email, u.display_name, u.avatar_url, u.last_active_at
              FROM conversation_participants cp
              JOIN users u ON u.id = cp.user_id
              WHERE cp.conversation_id = ? AND cp.user_id != ?
            `)
            .get(conv.id, userId) as any;
        } else {
          // Group participants summary
          const partRows = this.getSqlite()
            .prepare(`
              SELECT u.id, u.email, u.display_name, u.avatar_url, cp.is_admin
              FROM conversation_participants cp
              JOIN users u ON u.id = cp.user_id
              WHERE cp.conversation_id = ?
              ORDER BY cp.is_admin DESC, u.display_name ASC
            `)
            .all(conv.id) as any[];

          participants = partRows.map((p) => ({
            id: p.id,
            email: p.email,
            displayName: p.display_name,
            avatarUrl: p.avatar_url || null,
            isAdmin: p.is_admin === 1,
          }));
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

        const adminRows = this.getSqlite()
          .prepare('SELECT user_id FROM conversation_participants WHERE conversation_id = ? AND is_admin = 1')
          .all(conv.id) as any[];
        const adminIds = adminRows.map((a) => a.user_id);

        return {
          id: conv.id,
          type: conv.type,
          name: conv.type === 'direct' && peer ? peer.display_name : conv.name || 'Chat',
          avatarUrl: conv.avatar_url || null,
          creatorId: conv.creator_id || null,
          adminIds,
          participantCount,
          participants: conv.type === 'group' ? participants : undefined,
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
      })
    );
  }

  async getConversation(conversationId: string, userId: string): Promise<DbConversationSummary | null> {
    const isParticipant = await this.isConversationParticipant(conversationId, userId);
    if (!isParticipant) return null;

    const convs = await this.getUserConversations(userId);
    return convs.find((c) => c.id === conversationId) || null;
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

  async createGroupConversation(creatorId: string, name: string, memberIds: string[], avatarUrl?: string | null): Promise<string> {
    const convId = 'group_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);

    const sqlite = this.getSqlite();
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      sqlite
        .prepare(`
          INSERT INTO conversations (id, type, name, avatar_url, creator_id, created_at, updated_at)
          VALUES (?, 'group', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `)
        .run(convId, name, avatarUrl || null, creatorId);

      // Creator is group admin
      sqlite
        .prepare(`
          INSERT INTO conversation_participants (conversation_id, user_id, is_admin)
          VALUES (?, ?, 1)
        `)
        .run(convId, creatorId);

      // Add other members
      const uniqueMembers = Array.from(new Set(memberIds)).filter((id) => id !== creatorId);
      for (const memberId of uniqueMembers) {
        sqlite
          .prepare(`
            INSERT INTO conversation_participants (conversation_id, user_id, is_admin)
            VALUES (?, ?, 0)
          `)
          .run(convId, memberId);
      }

      sqlite.exec('COMMIT');
      return convId;
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }
  }

  async addConversationParticipants(conversationId: string, userIds: string[]): Promise<void> {
    const sqlite = this.getSqlite();
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      for (const userId of userIds) {
        sqlite
          .prepare(`
            INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, is_admin)
            VALUES (?, ?, 0)
          `)
          .run(conversationId, userId);
      }
      sqlite
        .prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(conversationId);
      sqlite.exec('COMMIT');
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }
  }

  async removeConversationParticipant(conversationId: string, userId: string): Promise<void> {
    const sqlite = this.getSqlite();
    sqlite
      .prepare('DELETE FROM conversation_participants WHERE conversation_id = ? AND user_id = ?')
      .run(conversationId, userId);
    sqlite
      .prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(conversationId);
  }

  async updateConversation(conversationId: string, updates: { name?: string; avatarUrl?: string | null }): Promise<void> {
    const updateParts: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const params: any[] = [];

    if (updates.name !== undefined) {
      updateParts.push('name = ?');
      params.push(updates.name);
    }
    if (updates.avatarUrl !== undefined) {
      updateParts.push('avatar_url = ?');
      params.push(updates.avatarUrl);
    }

    params.push(conversationId);
    this.getSqlite()
      .prepare(`UPDATE conversations SET ${updateParts.join(', ')} WHERE id = ?`)
      .run(...params);
  }

  async isConversationParticipant(conversationId: string, userId: string): Promise<boolean> {
    const row = this.getSqlite()
      .prepare('SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?')
      .get(conversationId, userId);
    return !!row;
  }

  async isConversationAdmin(conversationId: string, userId: string): Promise<boolean> {
    const row = this.getSqlite()
      .prepare(`
        SELECT 1 FROM conversation_participants
        WHERE conversation_id = ? AND user_id = ? AND is_admin = 1
      `)
      .get(conversationId, userId);
    if (row) return true;

    const creator = this.getSqlite()
      .prepare('SELECT creator_id FROM conversations WHERE id = ?')
      .get(conversationId) as any;
    return creator?.creator_id === userId;
  }

  async getConversationParticipantIds(conversationId: string): Promise<string[]> {
    const rows = this.getSqlite()
      .prepare('SELECT user_id FROM conversation_participants WHERE conversation_id = ?')
      .all(conversationId) as any[];
    return rows.map((r) => r.user_id);
  }

  async getConversationMessages(conversationId: string, limit = 50): Promise<DbMessage[]> {
    const boundedLimit = Math.min(Math.max(limit, 1), 100);
    const rows = this.getSqlite()
      .prepare(`
        SELECT id, conversation_id, sender_id, sender_name, sender_avatar, client_message_id, content, reply_to, forwarded_from, attachments, status, created_at
        FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC
        LIMIT ?
      `)
      .all(conversationId, boundedLimit) as any[];

    // Fetch reactions for this conversation's messages
    const reactionsRows = this.getSqlite()
      .prepare(`
        SELECT message_id, user_id, emoji
        FROM message_reactions
        WHERE conversation_id = ?
      `)
      .all(conversationId) as any[];

    const reactionsMap = new Map<string, Record<string, string[]>>();
    for (const r of reactionsRows) {
      if (!reactionsMap.has(r.message_id)) {
        reactionsMap.set(r.message_id, {});
      }
      const msgReactions = reactionsMap.get(r.message_id)!;
      if (!msgReactions[r.emoji]) {
        msgReactions[r.emoji] = [];
      }
      msgReactions[r.emoji].push(r.user_id);
    }

    return rows.map((m) => {
      let replyTo: DbMessageReply | null = null;
      if (m.reply_to) {
        try {
          replyTo = JSON.parse(m.reply_to);
        } catch (_) {}
      }

      let forwardedFrom: DbMessageForward | null = null;
      if (m.forwarded_from) {
        try {
          forwardedFrom = JSON.parse(m.forwarded_from);
        } catch (_) {}
      }

      let attachments: DbAttachment[] | null = null;
      if (m.attachments) {
        try {
          attachments = JSON.parse(m.attachments);
        } catch (_) {}
      }

      return {
        id: m.id,
        conversationId: m.conversation_id,
        senderId: m.sender_id,
        senderName: m.sender_name,
        senderAvatar: m.sender_avatar || null,
        clientMessageId: m.client_message_id || null,
        content: m.content,
        replyTo,
        forwardedFrom,
        attachments,
        reactions: reactionsMap.get(m.id) || undefined,
        status: m.status,
        createdAt: m.created_at,
      };
    });
  }

  async findMessageByClientId(clientMessageId: string, senderId: string): Promise<DbMessage | null> {
    const row = this.getSqlite()
      .prepare(`
        SELECT id, conversation_id, sender_id, sender_name, sender_avatar, client_message_id, content, reply_to, forwarded_from, attachments, status, created_at
        FROM messages
        WHERE client_message_id = ? AND sender_id = ?
      `)
      .get(clientMessageId, senderId) as any;

    if (!row) return null;

    let replyTo: DbMessageReply | null = null;
    if (row.reply_to) {
      try {
        replyTo = JSON.parse(row.reply_to);
      } catch (_) {}
    }

    let forwardedFrom: DbMessageForward | null = null;
    if (row.forwarded_from) {
      try {
        forwardedFrom = JSON.parse(row.forwarded_from);
      } catch (_) {}
    }

    let attachments: DbAttachment[] | null = null;
    if (row.attachments) {
      try {
        attachments = JSON.parse(row.attachments);
      } catch (_) {}
    }

    return {
      id: row.id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      senderName: row.sender_name,
      senderAvatar: row.sender_avatar || null,
      clientMessageId: row.client_message_id || null,
      content: row.content,
      replyTo,
      forwardedFrom,
      attachments,
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
    replyTo?: DbMessageReply | null;
    forwardedFrom?: DbMessageForward | null;
    attachments?: DbAttachment[] | null;
    status?: 'pending' | 'sent' | 'delivered' | 'read';
  }): Promise<DbMessage> {
    const msgId = message.id || 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const status = message.status || 'sent';

    const replyToJson = message.replyTo ? JSON.stringify(message.replyTo) : null;
    const forwardedFromJson = message.forwardedFrom ? JSON.stringify(message.forwardedFrom) : null;
    const attachmentsJson = message.attachments && message.attachments.length > 0 ? JSON.stringify(message.attachments) : null;

    const sqlite = this.getSqlite();
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      sqlite
        .prepare(`
          INSERT INTO messages (id, conversation_id, sender_id, sender_name, sender_avatar, client_message_id, content, reply_to, forwarded_from, attachments, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          msgId,
          message.conversationId,
          message.senderId,
          message.senderName,
          message.senderAvatar || null,
          message.clientMessageId || null,
          message.content,
          replyToJson,
          forwardedFromJson,
          attachmentsJson,
          status
        );

      // If attachments exist, associate them with this messageId in attachments table
      if (message.attachments && message.attachments.length > 0) {
        for (const att of message.attachments) {
          sqlite
            .prepare('UPDATE attachments SET message_id = ? WHERE id = ?')
            .run(msgId, att.id);
        }
      }

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
        SELECT id, conversation_id, sender_id, sender_name, sender_avatar, client_message_id, content, reply_to, forwarded_from, attachments, status, created_at
        FROM messages WHERE id = ?
      `)
      .get(msgId) as any;

    let savedAttachments: DbAttachment[] | null = null;
    if (saved.attachments) {
      try {
        savedAttachments = JSON.parse(saved.attachments);
      } catch (_) {}
    }

    return {
      id: saved.id,
      conversationId: saved.conversation_id,
      senderId: saved.sender_id,
      senderName: saved.sender_name,
      senderAvatar: saved.sender_avatar || null,
      clientMessageId: saved.client_message_id || null,
      content: saved.content,
      replyTo: message.replyTo || null,
      forwardedFrom: message.forwardedFrom || null,
      attachments: savedAttachments || message.attachments || null,
      reactions: {},
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

  async toggleMessageReaction(conversationId: string, messageId: string, userId: string, emoji: string): Promise<Record<string, string[]>> {
    const sqlite = this.getSqlite();
    const existing = sqlite
      .prepare('SELECT 1 FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
      .get(messageId, userId, emoji);

    if (existing) {
      sqlite
        .prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
        .run(messageId, userId, emoji);
    } else {
      sqlite
        .prepare('INSERT INTO message_reactions (conversation_id, message_id, user_id, emoji) VALUES (?, ?, ?, ?)')
        .run(conversationId, messageId, userId, emoji);
    }

    const rows = sqlite
      .prepare('SELECT user_id, emoji FROM message_reactions WHERE message_id = ?')
      .all(messageId) as any[];

    const reactions: Record<string, string[]> = {};
    for (const r of rows) {
      if (!reactions[r.emoji]) {
        reactions[r.emoji] = [];
      }
      reactions[r.emoji].push(r.user_id);
    }

    return reactions;
  }

  async deleteMessage(conversationId: string, messageId: string): Promise<boolean> {
    const sqlite = this.getSqlite();
    const res = sqlite
      .prepare('DELETE FROM messages WHERE id = ? AND conversation_id = ?')
      .run(messageId, conversationId);
    return res.changes > 0;
  }

  // Moderators
  async setModerator(userId: string, isModerator: boolean): Promise<DbUser | null> {
    const sqlite = this.getSqlite();
    sqlite
      .prepare('UPDATE users SET is_moderator = ? WHERE id = ?')
      .run(isModerator ? 1 : 0, userId);

    const user = await this.getUserById(userId);
    if (user) {
      sqlite
        .prepare('UPDATE whitelist SET is_moderator = ? WHERE LOWER(email) = ?')
        .run(isModerator ? 1 : 0, user.email.toLowerCase().trim());
    }
    return user;
  }

  async getModerators(): Promise<DbUser[]> {
    const rows = this.getSqlite()
      .prepare('SELECT id, email, first_name, last_name, display_name, avatar_url, phone_number, is_admin, is_moderator, onboarded, status, created_at, last_active_at FROM users WHERE is_moderator = 1 OR is_admin = 1 ORDER BY display_name ASC')
      .all() as any[];

    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      firstName: r.first_name || null,
      lastName: r.last_name || null,
      displayName: r.display_name,
      avatarUrl: r.avatar_url || null,
      phoneNumber: r.phone_number || null,
      isAdmin: r.is_admin === 1,
      isModerator: r.is_moderator === 1,
      onboarded: r.onboarded === 1,
      status: r.status || 'active',
      createdAt: r.created_at,
      lastActiveAt: r.last_active_at,
    }));
  }

  // Google Drive Storage Accounts
  async addDriveAccount(account: Omit<DbDriveAccount, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<DbDriveAccount> {
    const sqlite = this.getSqlite();
    const id = account.id || 'drive_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();

    sqlite
      .prepare(`
        INSERT INTO drive_accounts (id, email, display_name, encrypted_refresh_token, folder_id, space_used, space_total, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET
          display_name = excluded.display_name,
          encrypted_refresh_token = excluded.encrypted_refresh_token,
          folder_id = excluded.folder_id,
          updated_at = excluded.updated_at
      `)
      .run(
        id,
        account.email.toLowerCase().trim(),
        account.displayName || null,
        account.encryptedRefreshToken,
        account.folderId || null,
        account.spaceUsed || 0,
        account.spaceTotal || 0,
        now,
        now
      );

    return (await this.getDriveAccountById(id)) || {
      id,
      email: account.email.toLowerCase().trim(),
      displayName: account.displayName || null,
      encryptedRefreshToken: account.encryptedRefreshToken,
      folderId: account.folderId || null,
      spaceUsed: account.spaceUsed || 0,
      spaceTotal: account.spaceTotal || 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  async getDriveAccounts(): Promise<DbDriveAccount[]> {
    const rows = this.getSqlite()
      .prepare('SELECT id, email, display_name, encrypted_refresh_token, folder_id, space_used, space_total, created_at, updated_at FROM drive_accounts ORDER BY created_at DESC')
      .all() as any[];

    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.display_name || null,
      encryptedRefreshToken: r.encrypted_refresh_token,
      folderId: r.folder_id || null,
      spaceUsed: r.space_used,
      spaceTotal: r.space_total,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async getDriveAccountById(id: string): Promise<DbDriveAccount | null> {
    const r = this.getSqlite()
      .prepare('SELECT id, email, display_name, encrypted_refresh_token, folder_id, space_used, space_total, created_at, updated_at FROM drive_accounts WHERE id = ?')
      .get(id) as any;

    if (!r) return null;
    return {
      id: r.id,
      email: r.email,
      displayName: r.display_name || null,
      encryptedRefreshToken: r.encrypted_refresh_token,
      folderId: r.folder_id || null,
      spaceUsed: r.space_used,
      spaceTotal: r.space_total,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  async removeDriveAccount(id: string): Promise<boolean> {
    const res = this.getSqlite()
      .prepare('DELETE FROM drive_accounts WHERE id = ?')
      .run(id);
    return res.changes > 0;
  }

  async updateDriveAccountFolder(id: string, folderId: string): Promise<void> {
    this.getSqlite()
      .prepare('UPDATE drive_accounts SET folder_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(folderId, id);
  }

  async updateDriveAccountQuota(id: string, spaceUsed: number, spaceTotal: number): Promise<void> {
    this.getSqlite()
      .prepare('UPDATE drive_accounts SET space_used = ?, space_total = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(spaceUsed, spaceTotal, id);
  }

  // Attachments
  async saveAttachment(attachment: Omit<DbAttachment, 'id' | 'createdAt'> & { id?: string }): Promise<DbAttachment> {
    const id = attachment.id || 'att_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
    const now = new Date().toISOString();

    this.getSqlite()
      .prepare(`
        INSERT INTO attachments (id, conversation_id, message_id, uploader_id, drive_account_id, drive_account_email, drive_file_id, file_name, file_size, mime_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        attachment.conversationId,
        attachment.messageId || null,
        attachment.uploaderId,
        attachment.driveAccountId,
        attachment.driveAccountEmail || null,
        attachment.driveFileId,
        attachment.fileName,
        attachment.fileSize,
        attachment.mimeType,
        now
      );

    return {
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
  }

  async getAttachmentById(id: string): Promise<DbAttachment | null> {
    const r = this.getSqlite()
      .prepare('SELECT id, conversation_id, message_id, uploader_id, drive_account_id, drive_account_email, drive_file_id, file_name, file_size, mime_type, created_at FROM attachments WHERE id = ?')
      .get(id) as any;

    if (!r) return null;
    return {
      id: r.id,
      conversationId: r.conversation_id,
      messageId: r.message_id || null,
      uploaderId: r.uploader_id,
      driveAccountId: r.drive_account_id,
      driveAccountEmail: r.drive_account_email || undefined,
      driveFileId: r.drive_file_id,
      fileName: r.file_name,
      fileSize: r.file_size,
      mimeType: r.mime_type,
      createdAt: r.created_at,
    };
  }

  async getAttachmentsForConversation(conversationId: string): Promise<DbAttachment[]> {
    const rows = this.getSqlite()
      .prepare('SELECT id, conversation_id, message_id, uploader_id, drive_account_id, drive_account_email, drive_file_id, file_name, file_size, mime_type, created_at FROM attachments WHERE conversation_id = ? ORDER BY created_at DESC')
      .all(conversationId) as any[];

    return rows.map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      messageId: r.message_id || null,
      uploaderId: r.uploader_id,
      driveAccountId: r.drive_account_id,
      driveAccountEmail: r.drive_account_email || undefined,
      driveFileId: r.drive_file_id,
      fileName: r.file_name,
      fileSize: r.file_size,
      mimeType: r.mime_type,
      createdAt: r.created_at,
    }));
  }

  async deleteAttachment(id: string): Promise<boolean> {
    const res = this.getSqlite()
      .prepare('DELETE FROM attachments WHERE id = ?')
      .run(id);
    return res.changes > 0;
  }

  // Telegram Bots
  async addTelegramBot(bot: Omit<DbTelegramBot, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<DbTelegramBot> {
    const id = bot.id || 'bot_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();
    const commandsJson = JSON.stringify(bot.customCommands || []);

    this.getSqlite()
      .prepare(`
        INSERT INTO telegram_bots (id, bot_name, username, encrypted_token, webhook_secret_token, is_enabled, custom_commands_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        bot.botName,
        bot.username.replace(/^@/, ''),
        bot.encryptedToken,
        bot.webhookSecretToken,
        bot.isEnabled ? 1 : 0,
        commandsJson,
        now,
        now
      );

    return {
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
  }

  async getTelegramBots(): Promise<DbTelegramBot[]> {
    const rows = this.getSqlite()
      .prepare('SELECT id, bot_name, username, encrypted_token, webhook_secret_token, is_enabled, custom_commands_json, created_at, updated_at FROM telegram_bots ORDER BY created_at DESC')
      .all() as any[];

    return rows.map((r) => {
      let customCommands: TelegramCommandConfig[] = [];
      try {
        customCommands = JSON.parse(r.custom_commands_json || '[]');
      } catch (_) {}

      return {
        id: r.id,
        botName: r.bot_name,
        username: r.username,
        encryptedToken: r.encrypted_token,
        webhookSecretToken: r.webhook_secret_token,
        isEnabled: r.is_enabled === 1,
        customCommands,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });
  }

  async getTelegramBotById(id: string): Promise<DbTelegramBot | null> {
    const r = this.getSqlite()
      .prepare('SELECT id, bot_name, username, encrypted_token, webhook_secret_token, is_enabled, custom_commands_json, created_at, updated_at FROM telegram_bots WHERE id = ?')
      .get(id) as any;

    if (!r) return null;
    let customCommands: TelegramCommandConfig[] = [];
    try {
      customCommands = JSON.parse(r.custom_commands_json || '[]');
    } catch (_) {}

    return {
      id: r.id,
      botName: r.bot_name,
      username: r.username,
      encryptedToken: r.encrypted_token,
      webhookSecretToken: r.webhook_secret_token,
      isEnabled: r.is_enabled === 1,
      customCommands,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  async updateTelegramBot(id: string, updates: Partial<Pick<DbTelegramBot, 'isEnabled' | 'customCommands' | 'encryptedToken' | 'webhookSecretToken'>>): Promise<DbTelegramBot | null> {
    const updateParts: string[] = [];
    const params: any[] = [];

    if (updates.isEnabled !== undefined) {
      updateParts.push('is_enabled = ?');
      params.push(updates.isEnabled ? 1 : 0);
    }
    if (updates.customCommands !== undefined) {
      updateParts.push('custom_commands_json = ?');
      params.push(JSON.stringify(updates.customCommands));
    }
    if (updates.encryptedToken !== undefined) {
      updateParts.push('encrypted_token = ?');
      params.push(updates.encryptedToken);
    }
    if (updates.webhookSecretToken !== undefined) {
      updateParts.push('webhook_secret_token = ?');
      params.push(updates.webhookSecretToken);
    }

    if (updateParts.length > 0) {
      updateParts.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);
      this.getSqlite()
        .prepare(`UPDATE telegram_bots SET ${updateParts.join(', ')} WHERE id = ?`)
        .run(...params);
    }

    return this.getTelegramBotById(id);
  }

  async deleteTelegramBot(id: string): Promise<boolean> {
    const res = this.getSqlite()
      .prepare('DELETE FROM telegram_bots WHERE id = ?')
      .run(id);
    return res.changes > 0;
  }
}
