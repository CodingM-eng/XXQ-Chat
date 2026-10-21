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
  DbSupportReport,
  DbServer,
  ServerPurpose,
  ServerPermission,
  ServerCustomRole,
  ServerJoinQuestion,
  DbMembershipInvitation,
  DbServerInvite,
  DbFriendRequest,
  DbBotPoolItem,
  DbGeminiConfig,
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
        type TEXT NOT NULL CHECK(type IN ('direct', 'group', 'channel')),
        name TEXT,
        avatar_url TEXT,
        creator_id TEXT,
        description TEXT,
        rules TEXT,
        join_policy TEXT DEFAULT 'auto',
        server_id TEXT,
        is_announcement_only INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS conversation_participants (
        conversation_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        role TEXT NOT NULL DEFAULT 'member',
        custom_tag TEXT,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_read_message_id TEXT,
        PRIMARY KEY (conversation_id, user_id),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        purpose TEXT NOT NULL,
        avatar_url TEXT,
        rules TEXT,
        owner_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS server_members (
        server_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        custom_tag TEXT,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (server_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS membership_invitations (
        id TEXT PRIMARY KEY,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        target_name TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_display_name TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_by_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME,
        resolved_by_id TEXT
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

      CREATE TABLE IF NOT EXISTS support_reports (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        user_email TEXT NOT NULL,
        user_display_name TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        diagnostics_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS server_invites (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        created_by_id TEXT NOT NULL,
        max_uses INTEGER,
        used_count INTEGER NOT NULL DEFAULT 0,
        expires_at DATETIME,
        is_revoked INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS friend_requests (
        id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        receiver_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'declined')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS user_friends (
        user_id TEXT NOT NULL,
        friend_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, friend_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS message_reads (
        message_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (message_id, user_id),
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS bot_pool (
        id TEXT PRIMARY KEY,
        token_encrypted TEXT NOT NULL,
        bot_name TEXT NOT NULL,
        username TEXT NOT NULL,
        is_assigned INTEGER NOT NULL DEFAULT 0,
        assigned_name TEXT,
        assigned_conversation_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS gemini_config (
        id TEXT PRIMARY KEY DEFAULT 'default',
        api_key_encrypted TEXT NOT NULL,
        is_enabled INTEGER NOT NULL DEFAULT 0,
        default_prompt TEXT,
        model TEXT NOT NULL DEFAULT 'gemini-1.5-flash',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_blocks (
        blocker_id TEXT NOT NULL,
        blocked_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (blocker_id, blocked_id),
        FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS server_roles (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        permissions_json TEXT NOT NULL DEFAULT '[]',
        order_index INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS server_member_roles (
        server_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (server_id, user_id, role_id),
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (role_id) REFERENCES server_roles(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_client_id ON messages(client_message_id);
      CREATE INDEX IF NOT EXISTS idx_participants_user ON conversation_participants(user_id);
      CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions(message_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_attachments_conversation ON attachments(conversation_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_support_reports_created ON support_reports(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_server_invites_code ON server_invites(code);
      CREATE INDEX IF NOT EXISTS idx_friend_requests_user ON friend_requests(sender_id, receiver_id);
      CREATE INDEX IF NOT EXISTS idx_message_reads_msg ON message_reads(message_id);
      CREATE INDEX IF NOT EXISTS idx_server_roles_server ON server_roles(server_id, order_index ASC);
      CREATE INDEX IF NOT EXISTS idx_user_blocks ON user_blocks(blocker_id, blocked_id);
    `);

    // Safe schema migrations for existing SQLite databases
    try { sqlite.exec('ALTER TABLE users ADD COLUMN first_name TEXT;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE users ADD COLUMN last_name TEXT;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE users ADD COLUMN phone_number TEXT;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE users ADD COLUMN is_moderator INTEGER DEFAULT 0;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE users ADD COLUMN onboarded INTEGER DEFAULT 1;'); } catch (_) {}
    try { sqlite.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active';"); } catch (_) {}
    try { sqlite.exec("ALTER TABLE users ADD COLUMN theme_preference TEXT DEFAULT 'dark';"); } catch (_) {}
    try { sqlite.exec('ALTER TABLE users ADD COLUMN bio TEXT;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE users ADD COLUMN is_family INTEGER DEFAULT 0;'); } catch (_) {}
    try { sqlite.exec("ALTER TABLE users ADD COLUMN group_add_privacy TEXT DEFAULT 'everyone';"); } catch (_) {}
    try { sqlite.exec("ALTER TABLE messages ADD COLUMN type TEXT DEFAULT 'text';"); } catch (_) {}
    try { sqlite.exec('ALTER TABLE messages ADD COLUMN is_system INTEGER DEFAULT 0;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE whitelist ADD COLUMN is_moderator INTEGER DEFAULT 0;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE conversations ADD COLUMN avatar_url TEXT;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE conversations ADD COLUMN creator_id TEXT;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE conversations ADD COLUMN description TEXT;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE conversations ADD COLUMN rules TEXT;'); } catch (_) {}
    try { sqlite.exec("ALTER TABLE conversations ADD COLUMN join_policy TEXT DEFAULT 'auto';"); } catch (_) {}
    try { sqlite.exec('ALTER TABLE conversations ADD COLUMN server_id TEXT;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE conversations ADD COLUMN is_announcement_only INTEGER DEFAULT 0;'); } catch (_) {}

    // Migrate conversations check constraint if 'channel' is not permitted in existing table
    try {
      const convTableSql = sqlite.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='conversations'").get() as any;
      if (convTableSql && convTableSql.sql && !convTableSql.sql.includes("'channel'")) {
        sqlite.exec(`
          PRAGMA foreign_keys = OFF;
          CREATE TABLE conversations_migrated (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL CHECK(type IN ('direct', 'group', 'channel')),
            name TEXT,
            avatar_url TEXT,
            creator_id TEXT,
            description TEXT,
            rules TEXT,
            join_policy TEXT DEFAULT 'auto',
            server_id TEXT,
            is_announcement_only INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          INSERT INTO conversations_migrated (id, type, name, avatar_url, creator_id, description, rules, join_policy, server_id, is_announcement_only, created_at, updated_at)
            SELECT id, type, name, avatar_url, creator_id, description, rules, join_policy, server_id, is_announcement_only, created_at, updated_at FROM conversations;
          DROP TABLE conversations;
          ALTER TABLE conversations_migrated RENAME TO conversations;
          PRAGMA foreign_keys = ON;
        `);
      }
    } catch (_) {}
    try { sqlite.exec('ALTER TABLE conversation_participants ADD COLUMN is_admin INTEGER DEFAULT 0;'); } catch (_) {}
    try { sqlite.exec("ALTER TABLE conversation_participants ADD COLUMN role TEXT DEFAULT 'member';"); } catch (_) {}
    try { sqlite.exec('ALTER TABLE conversation_participants ADD COLUMN custom_tag TEXT;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE pending_access_requests ADD COLUMN resolved_at DATETIME;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE pending_access_requests ADD COLUMN resolved_by TEXT;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE messages ADD COLUMN reply_to TEXT;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE messages ADD COLUMN forwarded_from TEXT;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE messages ADD COLUMN attachments TEXT;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE servers ADD COLUMN banner_url TEXT;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE servers ADD COLUMN welcome_message TEXT;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE servers ADD COLUMN requires_approval INTEGER DEFAULT 0;'); } catch (_) {}
    try { sqlite.exec("ALTER TABLE servers ADD COLUMN join_questions_json TEXT DEFAULT '[]';"); } catch (_) {}
    try { sqlite.exec('ALTER TABLE membership_invitations ADD COLUMN answers_json TEXT;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE users ADD COLUMN banner_url TEXT;'); } catch (_) {}
    try { sqlite.exec('ALTER TABLE users ADD COLUMN accent_color TEXT;'); } catch (_) {}

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
        SELECT w.email, w.approved_by, w.created_at, u.id as user_id, u.display_name, u.avatar_url, u.is_admin, u.is_moderator, u.is_family
        FROM whitelist w
        LEFT JOIN users u ON LOWER(u.email) = LOWER(w.email)
        ORDER BY w.created_at DESC
      `)
      .all() as any[];

    return items.map((row) => ({
      email: row.email,
      approvedBy: row.approved_by,
      createdAt: row.created_at,
      userId: row.user_id || null,
      displayName: row.display_name || undefined,
      avatarUrl: row.avatar_url || null,
      isAdmin: row.is_admin === 1,
      isModerator: row.is_moderator === 1,
      isFamily: row.is_family === 1,
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
      .prepare('SELECT id, attempt_count, status FROM pending_access_requests WHERE LOWER(email) = ?')
      .get(normalized) as any;

    if (existing) {
      // Preserve explicit rejection or approval; do not reset rejected users back to pending
      const preservedStatus = (existing.status === 'rejected' || existing.status === 'approved') ? existing.status : 'pending';
      this.getSqlite()
        .prepare(`
          UPDATE pending_access_requests
          SET attempt_count = attempt_count + 1,
              status = ?,
              last_attempt_at = CURRENT_TIMESTAMP,
              display_name = COALESCE(?, display_name),
              avatar_url = COALESCE(?, avatar_url)
          WHERE id = ?
        `)
        .run(preservedStatus, displayName || null, avatarUrl || null, existing.id);
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

  async getPendingAccessRequestByEmail(email: string): Promise<DbPendingAccessRequest | null> {
    const normalized = email.toLowerCase().trim();
    const r = this.getSqlite()
      .prepare(`
        SELECT id, email, display_name, avatar_url, first_attempt_at, last_attempt_at, attempt_count, status, resolved_at
        FROM pending_access_requests
        WHERE LOWER(email) = ?
      `)
      .get(normalized) as any;

    if (!r) return null;
    return {
      id: r.id,
      email: r.email,
      displayName: r.display_name || null,
      avatarUrl: r.avatar_url || null,
      firstAttemptAt: r.first_attempt_at,
      lastAttemptAt: r.last_attempt_at,
      attemptCount: r.attempt_count,
      status: r.status as 'pending' | 'approved' | 'rejected',
      resolvedAt: r.resolved_at || null,
    };
  }

  async getPendingAccessRequests(): Promise<DbPendingAccessRequest[]> {
    const rows = this.getSqlite()
      .prepare(`
        SELECT id, email, display_name, avatar_url, first_attempt_at, last_attempt_at, attempt_count, status
        FROM pending_access_requests
        WHERE status = 'pending'
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

  async getResolvedAccessRequests(limit: number = 50): Promise<DbPendingAccessRequest[]> {
    const rows = this.getSqlite()
      .prepare(`
        SELECT id, email, display_name, avatar_url, first_attempt_at, last_attempt_at, attempt_count, status, resolved_at
        FROM pending_access_requests
        WHERE status IN ('approved', 'rejected')
        ORDER BY COALESCE(resolved_at, last_attempt_at) DESC
        LIMIT ?
      `)
      .all(limit) as any[];

    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.display_name || null,
      avatarUrl: r.avatar_url || null,
      firstAttemptAt: r.first_attempt_at,
      lastAttemptAt: r.last_attempt_at,
      attemptCount: r.attempt_count,
      status: r.status as 'pending' | 'approved' | 'rejected',
      resolvedAt: r.resolved_at || r.last_attempt_at || null,
    }));
  }

  async resolvePendingAccess(email: string, status: 'approved' | 'rejected'): Promise<void> {
    const normalized = email.toLowerCase().trim();
    this.getSqlite()
      .prepare("UPDATE pending_access_requests SET status = ?, resolved_at = CURRENT_TIMESTAMP WHERE LOWER(email) = ?")
      .run(status, normalized);
  }

  async rejectPendingAccess(email: string): Promise<void> {
    await this.resolvePendingAccess(email, 'rejected');
  }

  // Users
  async getUserById(id: string): Promise<DbUser | null> {
    const row = this.getSqlite()
      .prepare('SELECT id, email, first_name, last_name, display_name, avatar_url, banner_url, accent_color, phone_number, is_admin, is_moderator, onboarded, status, theme_preference, bio, is_family, group_add_privacy, created_at, last_active_at FROM users WHERE id = ?')
      .get(id) as any;
    if (!row) return null;

    const isAdmin = row.is_admin === 1 || (!!config.INITIAL_ADMIN_EMAIL && row.email.toLowerCase() === config.INITIAL_ADMIN_EMAIL.toLowerCase().trim());
    const isModerator = !isAdmin && row.is_moderator === 1;

    return {
      id: row.id,
      email: row.email,
      firstName: row.first_name || null,
      lastName: row.last_name || null,
      displayName: row.display_name,
      avatarUrl: row.avatar_url || null,
      bannerUrl: row.banner_url || null,
      accentColor: row.accent_color || null,
      phoneNumber: row.phone_number || null,
      isAdmin,
      isModerator,
      bio: row.bio || null,
      isFamily: row.is_family === 1,
      groupAddPrivacy: row.group_add_privacy || 'everyone',
      themePreference: row.theme_preference === 'light' ? 'light' : 'dark',
      onboarded: row.onboarded === 1,
      status: row.status || 'active',
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at,
    };
  }

  async getUserByEmail(email: string): Promise<DbUser | null> {
    const normalized = email.toLowerCase().trim();
    const row = this.getSqlite()
      .prepare('SELECT id, email, first_name, last_name, display_name, avatar_url, banner_url, accent_color, phone_number, is_admin, is_moderator, onboarded, status, theme_preference, bio, is_family, group_add_privacy, created_at, last_active_at FROM users WHERE LOWER(email) = ?')
      .get(normalized) as any;
    if (!row) return null;

    const isAdmin = row.is_admin === 1 || (!!config.INITIAL_ADMIN_EMAIL && row.email.toLowerCase() === config.INITIAL_ADMIN_EMAIL.toLowerCase().trim());
    const isModerator = !isAdmin && row.is_moderator === 1;

    return {
      id: row.id,
      email: row.email,
      firstName: row.first_name || null,
      lastName: row.last_name || null,
      displayName: row.display_name,
      avatarUrl: row.avatar_url || null,
      bannerUrl: row.banner_url || null,
      accentColor: row.accent_color || null,
      phoneNumber: row.phone_number || null,
      isAdmin,
      isModerator,
      bio: row.bio || null,
      isFamily: row.is_family === 1,
      groupAddPrivacy: row.group_add_privacy || 'everyone',
      themePreference: row.theme_preference === 'light' ? 'light' : 'dark',
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

      updates.push('is_admin = ?');
      params.push(isAdmin ? 1 : 0);

      if (user.avatarUrl && !existing.avatar_url) {
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
      bannerUrl?: string | null;
      accentColor?: string | null;
      phoneNumber?: string | null;
      themePreference?: 'dark' | 'light';
      bio?: string | null;
      groupAddPrivacy?: 'everyone' | 'friends' | 'invite_only';
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
    if (updates.bannerUrl !== undefined) {
      updateParts.push('banner_url = ?');
      params.push(updates.bannerUrl);
    }
    if (updates.accentColor !== undefined) {
      updateParts.push('accent_color = ?');
      params.push(updates.accentColor);
    }
    if (updates.phoneNumber !== undefined) {
      updateParts.push('phone_number = ?');
      params.push(updates.phoneNumber);
    }
    if (updates.themePreference !== undefined) {
      updateParts.push('theme_preference = ?');
      params.push(updates.themePreference);
    }
    if (updates.bio !== undefined) {
      updateParts.push('bio = ?');
      params.push(updates.bio);
    }
    if (updates.groupAddPrivacy !== undefined) {
      updateParts.push('group_add_privacy = ?');
      params.push(updates.groupAddPrivacy);
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
        SELECT id, email, first_name, last_name, display_name, avatar_url, phone_number, is_admin, is_moderator, onboarded, status, theme_preference, bio, is_family, group_add_privacy, created_at, last_active_at
        FROM users
        WHERE status = 'active'
        ORDER BY created_at DESC
      `)
      .all() as any[];

    return rows.map((r) => {
      const isAdmin = r.is_admin === 1 || (!!config.INITIAL_ADMIN_EMAIL && r.email.toLowerCase() === config.INITIAL_ADMIN_EMAIL.toLowerCase().trim());
      const isModerator = !isAdmin && r.is_moderator === 1;
      return {
        id: r.id,
        email: r.email,
        firstName: r.first_name || null,
        lastName: r.last_name || null,
        displayName: r.display_name,
        avatarUrl: r.avatar_url || null,
        phoneNumber: r.phone_number || null,
        isAdmin,
        isModerator,
        bio: r.bio || null,
        isFamily: r.is_family === 1,
        groupAddPrivacy: r.group_add_privacy || 'everyone',
        themePreference: r.theme_preference === 'light' ? 'light' : 'dark',
        onboarded: r.onboarded === 1,
        status: r.status,
        createdAt: r.created_at,
        lastActiveAt: r.last_active_at,
      };
    });
  }

  async searchUsers(excludeUserId: string, query?: string): Promise<DbUser[]> {
    const q = (query || '').toLowerCase().trim();
    let rows: any[];

    if (q) {
      rows = this.getSqlite()
        .prepare(`
          SELECT id, email, first_name, last_name, display_name, avatar_url, phone_number, is_admin, is_moderator, onboarded, status, theme_preference, bio, is_family, group_add_privacy, created_at, last_active_at
          FROM users
          WHERE id != ? AND status = 'active' AND (LOWER(display_name) LIKE ? OR LOWER(email) LIKE ?)
          ORDER BY display_name ASC
          LIMIT 30
        `)
        .all(excludeUserId, `%${q}%`, `%${q}%`) as any[];
    } else {
      rows = this.getSqlite()
        .prepare(`
          SELECT id, email, first_name, last_name, display_name, avatar_url, phone_number, is_admin, is_moderator, onboarded, status, theme_preference, bio, is_family, group_add_privacy, created_at, last_active_at
          FROM users
          WHERE id != ? AND status = 'active'
          ORDER BY last_active_at DESC
          LIMIT 30
        `)
        .all(excludeUserId) as any[];
    }

    return rows.map((r) => {
      const isAdmin = r.is_admin === 1 || (!!config.INITIAL_ADMIN_EMAIL && r.email.toLowerCase() === config.INITIAL_ADMIN_EMAIL.toLowerCase().trim());
      const isModerator = !isAdmin && r.is_moderator === 1;
      return {
        id: r.id,
        email: r.email,
        firstName: r.first_name || null,
        lastName: r.last_name || null,
        displayName: r.display_name,
        avatarUrl: r.avatar_url || null,
        phoneNumber: r.phone_number || null,
        isAdmin,
        isModerator,
        bio: r.bio || null,
        isFamily: r.is_family === 1,
        groupAddPrivacy: r.group_add_privacy || 'everyone',
        themePreference: r.theme_preference === 'light' ? 'light' : 'dark',
        onboarded: r.onboarded === 1,
        status: r.status,
        createdAt: r.created_at,
        lastActiveAt: r.last_active_at,
      };
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
        SELECT c.id, c.type, c.name, c.avatar_url, c.creator_id, c.updated_at,
               c.description, c.rules, c.join_policy, c.server_id, c.is_announcement_only
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
          // Group or Channel participants summary
          const partRows = this.getSqlite()
            .prepare(`
              SELECT u.id, u.email, u.display_name, u.avatar_url, cp.is_admin, cp.role, cp.custom_tag, cp.joined_at
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
            isAdmin: p.is_admin === 1 || p.role === 'owner' || p.role === 'admin',
            role: (p.role || (p.is_admin === 1 ? 'admin' : 'member')) as 'owner' | 'admin' | 'moderator' | 'member',
            customTag: p.custom_tag || null,
            joinedAt: p.joined_at || undefined,
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
          .prepare("SELECT user_id FROM conversation_participants WHERE conversation_id = ? AND (is_admin = 1 OR role IN ('owner', 'admin'))")
          .all(conv.id) as any[];
        const adminIds = adminRows.map((a) => a.user_id);

        return {
          id: conv.id,
          type: conv.type,
          name: conv.type === 'direct' && peer ? peer.display_name : conv.name || (conv.type === 'channel' ? 'Kanal' : 'Chat'),
          description: conv.description || null,
          rules: conv.rules || null,
          joinPolicy: (conv.join_policy as any) || 'auto',
          avatarUrl: conv.avatar_url || null,
          creatorId: conv.creator_id || null,
          serverId: conv.server_id || null,
          isAnnouncementOnly: conv.is_announcement_only === 1,
          adminIds,
          participantCount,
          participants: conv.type === 'group' || conv.type === 'channel' ? participants : undefined,
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
    if (!isParticipant) {
      const user = await this.getUserById(userId);
      if (user?.isAdmin) {
        const allGroups = await this.getAllGroups();
        const match = allGroups.find((g) => g.id === conversationId);
        if (match) return match;

        const chanRow = this.getSqlite()
          .prepare('SELECT id, type, name, description, rules, server_id, is_announcement_only, updated_at FROM conversations WHERE id = ?')
          .get(conversationId) as any;
        if (chanRow) {
          return {
            id: chanRow.id,
            type: chanRow.type,
            name: chanRow.name,
            description: chanRow.description || null,
            rules: chanRow.rules || null,
            serverId: chanRow.server_id || null,
            isAnnouncementOnly: chanRow.is_announcement_only === 1,
            adminIds: [],
            participantCount: 0,
            peer: null,
            lastMessage: null,
            unreadCount: 0,
            updatedAt: chanRow.updated_at,
          };
        }
      }
      return null;
    }

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
          INSERT INTO conversations (id, type, name, avatar_url, creator_id, join_policy, created_at, updated_at)
          VALUES (?, 'group', ?, ?, ?, 'auto', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `)
        .run(convId, name, avatarUrl || null, creatorId);

      // Creator is group owner
      sqlite
        .prepare(`
          INSERT INTO conversation_participants (conversation_id, user_id, is_admin, role)
          VALUES (?, ?, 1, 'owner')
        `)
        .run(convId, creatorId);

      // Add other members
      const uniqueMembers = Array.from(new Set(memberIds)).filter((id) => id !== creatorId);
      for (const memberId of uniqueMembers) {
        sqlite
          .prepare(`
            INSERT INTO conversation_participants (conversation_id, user_id, is_admin, role)
            VALUES (?, ?, 0, 'member')
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
            INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, is_admin, role)
            VALUES (?, ?, 0, 'member')
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
        WHERE conversation_id = ? AND user_id = ? AND (is_admin = 1 OR role IN ('owner', 'admin'))
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
        SELECT id, conversation_id, sender_id, sender_name, sender_avatar, client_message_id, content, reply_to, forwarded_from, attachments, status, type, is_system, created_at
        FROM (
          SELECT * FROM messages
          WHERE conversation_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        )
        ORDER BY created_at ASC
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

    // Fetch read receipts
    let readMap = new Map<string, Array<{ userId: string; displayName?: string; readAt: string }>>();
    try {
      const readRows = this.getSqlite().prepare(`
        SELECT mr.message_id, mr.user_id, u.display_name, mr.read_at
        FROM message_reads mr
        JOIN users u ON mr.user_id = u.id
        WHERE mr.conversation_id = ?
      `).all(conversationId) as any[];

      for (const r of readRows) {
        if (!readMap.has(r.message_id)) {
          readMap.set(r.message_id, []);
        }
        readMap.get(r.message_id)!.push({
          userId: r.user_id,
          displayName: r.display_name,
          readAt: r.read_at,
        });
      }
    } catch (_) {}

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
        type: m.type || 'text',
        isSystem: m.is_system === 1,
        replyTo,
        forwardedFrom,
        attachments,
        reactions: reactionsMap.get(m.id) || undefined,
        status: m.status,
        readBy: readMap.get(m.id) || undefined,
        createdAt: m.created_at,
      };
    });
  }

  async findMessageByClientId(clientMessageId: string, senderId: string, conversationId?: string): Promise<DbMessage | null> {
    const query = conversationId
      ? `SELECT id, conversation_id, sender_id, sender_name, sender_avatar, client_message_id, content, reply_to, forwarded_from, attachments, status, type, is_system, created_at
         FROM messages
         WHERE client_message_id = ? AND sender_id = ? AND conversation_id = ?`
      : `SELECT id, conversation_id, sender_id, sender_name, sender_avatar, client_message_id, content, reply_to, forwarded_from, attachments, status, type, is_system, created_at
         FROM messages
         WHERE client_message_id = ? AND sender_id = ?`;
    const params = conversationId ? [clientMessageId, senderId, conversationId] : [clientMessageId, senderId];
    const row = this.getSqlite().prepare(query).get(...params) as any;

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
      type: row.type || 'text',
      isSystem: row.is_system === 1,
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
    type?: 'text' | 'image' | 'video' | 'voice' | 'file' | 'system';
    isSystem?: boolean;
  }): Promise<DbMessage> {
    const msgId = message.id || 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const status = message.status || 'sent';
    const msgType = message.type || 'text';
    const isSystem = message.isSystem ? 1 : 0;

    const replyToJson = message.replyTo ? JSON.stringify(message.replyTo) : null;
    const forwardedFromJson = message.forwardedFrom ? JSON.stringify(message.forwardedFrom) : null;
    const attachmentsJson = message.attachments && message.attachments.length > 0 ? JSON.stringify(message.attachments) : null;

    const sqlite = this.getSqlite();
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      sqlite
        .prepare(`
          INSERT INTO messages (id, conversation_id, sender_id, sender_name, sender_avatar, client_message_id, content, reply_to, forwarded_from, attachments, status, type, is_system)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          status,
          msgType,
          isSystem
        );

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
        SELECT id, conversation_id, sender_id, sender_name, sender_avatar, client_message_id, content, reply_to, forwarded_from, attachments, status, type, is_system, created_at
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
      type: saved.type || msgType,
      isSystem: saved.is_system === 1,
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
    const adminEmail = (config.INITIAL_ADMIN_EMAIL || '').toLowerCase().trim();
    const rows = this.getSqlite()
      .prepare('SELECT id, email, first_name, last_name, display_name, avatar_url, phone_number, is_admin, is_moderator, onboarded, status, theme_preference, bio, is_family, group_add_privacy, created_at, last_active_at FROM users WHERE is_moderator = 1 AND is_admin = 0 AND LOWER(email) != ? ORDER BY display_name ASC')
      .all(adminEmail) as any[];

    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      firstName: r.first_name || null,
      lastName: r.last_name || null,
      displayName: r.display_name,
      avatarUrl: r.avatar_url || null,
      phoneNumber: r.phone_number || null,
      isAdmin: false,
      isModerator: true,
      bio: r.bio || null,
      isFamily: r.is_family === 1,
      groupAddPrivacy: r.group_add_privacy || 'everyone',
      themePreference: r.theme_preference === 'light' ? 'light' : 'dark',
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
          space_used = excluded.space_used,
          space_total = excluded.space_total,
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

  async updateTelegramBot(id: string, updates: Partial<Pick<DbTelegramBot, 'isEnabled' | 'customCommands' | 'encryptedToken' | 'webhookSecretToken' | 'botName' | 'username'>>): Promise<DbTelegramBot | null> {
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
    if (updates.botName !== undefined) {
      updateParts.push('bot_name = ?');
      params.push(updates.botName);
    }
    if (updates.username !== undefined) {
      updateParts.push('username = ?');
      params.push(updates.username);
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
    this.getSqlite().exec('PRAGMA foreign_keys = OFF;');
    try {
      this.getSqlite().prepare(`
        INSERT INTO support_reports (id, user_id, user_email, user_display_name, title, description, diagnostics_json, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)
      `).run(id, report.userId, report.userEmail, report.userDisplayName, report.title, report.description, JSON.stringify(report.diagnostics || {}), now);
    } finally {
      this.getSqlite().exec('PRAGMA foreign_keys = ON;');
    }

    return {
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
  }

  async getSupportReports(limit: number = 50): Promise<DbSupportReport[]> {
    const rows = this.getSqlite().prepare(`
      SELECT id, user_id, user_email, user_display_name, title, description, diagnostics_json, status, created_at, resolved_at
      FROM support_reports
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map((r) => {
      let diag: any = {};
      try {
        diag = JSON.parse(r.diagnostics_json || '{}');
      } catch (_) {}
      return {
        id: r.id,
        userId: r.user_id,
        userEmail: r.user_email,
        userDisplayName: r.user_display_name,
        title: r.title,
        description: r.description,
        diagnostics: diag,
        status: r.status as 'open' | 'investigating' | 'resolved',
        createdAt: r.created_at,
        resolvedAt: r.resolved_at || null,
      };
    });
  }

  async updateSupportReportStatus(id: string, status: 'open' | 'investigating' | 'resolved'): Promise<boolean> {
    const resolvedAt = status === 'resolved' ? new Date().toISOString() : null;
    const res = this.getSqlite().prepare(`
      UPDATE support_reports
      SET status = ?, resolved_at = ?
      WHERE id = ?
    `).run(status, resolvedAt, id);
    return res.changes > 0;
  }

  // Authorized Message Search
  async searchMessages(userId: string, query: string, conversationId?: string): Promise<Array<DbMessage & { conversationName?: string }>> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    let sql = `
      SELECT m.*, c.name as conversation_name, c.type as conversation_type
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
      WHERE cp.user_id = ? AND m.content LIKE ?
    `;
    const params: any[] = [userId, `%${trimmed}%`];

    if (conversationId) {
      sql += ' AND m.conversation_id = ?';
      params.push(conversationId);
    }

    sql += ' ORDER BY m.created_at DESC LIMIT 50';

    const rows = this.getSqlite().prepare(sql).all(...params) as any[];
    return rows.map((row) => {
      let replyTo: any = null;
      let forwardedFrom: any = null;
      let attachments: any = null;
      try { if (row.reply_to) replyTo = JSON.parse(row.reply_to); } catch (_) {}
      try { if (row.forwarded_from) forwardedFrom = JSON.parse(row.forwarded_from); } catch (_) {}
      try { if (row.attachments) attachments = JSON.parse(row.attachments); } catch (_) {}

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
        conversationName: row.conversation_name || (row.conversation_type === 'direct' ? 'Direkt Mesaj' : 'Grup'),
      };
    });
  }

  // Groups Management & Roles
  async getAllGroups(): Promise<DbConversationSummary[]> {
    const rows = this.getSqlite()
      .prepare(`
        SELECT c.id, c.type, c.name, c.avatar_url, c.creator_id, c.updated_at,
               c.description, c.rules, c.join_policy, c.server_id, c.is_announcement_only
        FROM conversations c
        WHERE c.type = 'group'
        ORDER BY c.updated_at DESC
      `)
      .all() as any[];

    return Promise.all(
      rows.map(async (conv) => {
        const partRows = this.getSqlite()
          .prepare(`
            SELECT u.id, u.email, u.display_name, u.avatar_url, cp.is_admin, cp.role, cp.custom_tag, cp.joined_at
            FROM conversation_participants cp
            JOIN users u ON u.id = cp.user_id
            WHERE cp.conversation_id = ?
            ORDER BY cp.is_admin DESC, u.display_name ASC
          `)
          .all(conv.id) as any[];

        const participants = partRows.map((p) => ({
          id: p.id,
          email: p.email,
          displayName: p.display_name,
          avatarUrl: p.avatar_url || null,
          isAdmin: p.is_admin === 1 || p.role === 'owner' || p.role === 'admin',
          role: (p.role || (p.is_admin === 1 ? 'admin' : 'member')) as 'owner' | 'admin' | 'moderator' | 'member',
          customTag: p.custom_tag || null,
          joinedAt: p.joined_at || undefined,
        }));

        const adminIds = participants.filter((p) => p.isAdmin).map((p) => p.id);

        return {
          id: conv.id,
          type: conv.type,
          name: conv.name || 'Grup',
          description: conv.description || null,
          rules: conv.rules || null,
          joinPolicy: (conv.join_policy as any) || 'auto',
          avatarUrl: conv.avatar_url || null,
          creatorId: conv.creator_id || null,
          serverId: null,
          isAnnouncementOnly: false,
          adminIds,
          participantCount: participants.length,
          participants,
          peer: null,
          lastMessage: null,
          unreadCount: 0,
          updatedAt: conv.updated_at,
        };
      })
    );
  }

  async updateGroupSettings(conversationId: string, settings: { name?: string; description?: string | null; rules?: string | null; avatarUrl?: string | null; joinPolicy?: 'auto' | 'invite' | 'request' }): Promise<void> {
    const updateParts: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const params: any[] = [];

    if (settings.name !== undefined) {
      updateParts.push('name = ?');
      params.push(settings.name);
    }
    if (settings.description !== undefined) {
      updateParts.push('description = ?');
      params.push(settings.description);
    }
    if (settings.rules !== undefined) {
      updateParts.push('rules = ?');
      params.push(settings.rules);
    }
    if (settings.avatarUrl !== undefined) {
      updateParts.push('avatar_url = ?');
      params.push(settings.avatarUrl);
    }
    if (settings.joinPolicy !== undefined) {
      updateParts.push('join_policy = ?');
      params.push(settings.joinPolicy);
    }

    params.push(conversationId);
    this.getSqlite().prepare(`UPDATE conversations SET ${updateParts.join(', ')} WHERE id = ?`).run(...params);
  }

  async updateParticipantRole(conversationId: string, userId: string, role: 'owner' | 'admin' | 'moderator' | 'member', customTag?: string | null): Promise<void> {
    const isAdmin = role === 'owner' || role === 'admin' ? 1 : 0;
    this.getSqlite().prepare(`
      UPDATE conversation_participants
      SET role = ?, is_admin = ?, custom_tag = ?
      WHERE conversation_id = ? AND user_id = ?
    `).run(role, isAdmin, customTag !== undefined ? customTag : null, conversationId, userId);
  }

  async getConversationRole(conversationId: string, userId: string): Promise<'owner' | 'admin' | 'moderator' | 'member' | null> {
    const row = this.getSqlite().prepare(`
      SELECT role, is_admin FROM conversation_participants
      WHERE conversation_id = ? AND user_id = ?
    `).get(conversationId, userId) as any;
    if (!row) return null;
    if (row.role) return row.role as any;
    return row.is_admin === 1 ? 'admin' : 'member';
  }

  // Servers & Channels
  async createServer(ownerId: string, data: { name: string; description?: string | null; purpose: ServerPurpose; avatarUrl?: string | null; bannerUrl?: string | null; rules?: string | null; welcomeMessage?: string | null; requiresApproval?: boolean; joinQuestions?: ServerJoinQuestion[] }): Promise<{ server: DbServer; channels: DbConversationSummary[] }> {
    const serverId = 'srv_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();
    const sqlite = this.getSqlite();

    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const joinQuestionsJson = data.joinQuestions ? JSON.stringify(data.joinQuestions) : '[]';
      const requiresApproval = data.requiresApproval || (data.joinQuestions && data.joinQuestions.length > 0) ? 1 : 0;

      sqlite.prepare(`
        INSERT INTO servers (id, name, description, purpose, avatar_url, banner_url, welcome_message, rules, requires_approval, join_questions_json, owner_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        serverId,
        data.name,
        data.description || null,
        data.purpose || 'chat',
        data.avatarUrl || null,
        data.bannerUrl || null,
        data.welcomeMessage || null,
        data.rules || null,
        requiresApproval,
        joinQuestionsJson,
        ownerId
      );

      sqlite.prepare(`
        INSERT INTO server_members (server_id, user_id, role, joined_at)
        VALUES (?, ?, 'owner', CURRENT_TIMESTAMP)
      `).run(serverId, ownerId);

      const defaultChannels = [
        { name: 'genel-sohbet', isAnnouncement: 0 },
        { name: 'duyurular', isAnnouncement: 1 },
        { name: 'kurallar', isAnnouncement: 1 },
      ];

      const channels: DbConversationSummary[] = [];

      for (const ch of defaultChannels) {
        const chId = 'chan_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
        sqlite.prepare(`
          INSERT INTO conversations (id, type, name, creator_id, server_id, is_announcement_only, created_at, updated_at)
          VALUES (?, 'channel', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(chId, ch.name, ownerId, serverId, ch.isAnnouncement);

        sqlite.prepare(`
          INSERT INTO conversation_participants (conversation_id, user_id, is_admin, role)
          VALUES (?, ?, 1, 'owner')
        `).run(chId, ownerId);

        channels.push({
          id: chId,
          type: 'channel',
          name: ch.name,
          creatorId: ownerId,
          serverId,
          isAnnouncementOnly: ch.isAnnouncement === 1,
          adminIds: [ownerId],
          participantCount: 1,
          peer: null,
          lastMessage: null,
          unreadCount: 0,
          updatedAt: now,
        });
      }

      sqlite.exec('COMMIT');

      const ownerUser = await this.getUserById(ownerId);
      const server: DbServer = {
        id: serverId,
        name: data.name,
        description: data.description || null,
        purpose: data.purpose,
        avatarUrl: data.avatarUrl || null,
        bannerUrl: data.bannerUrl || null,
        welcomeMessage: data.welcomeMessage || null,
        rules: data.rules || null,
        requiresApproval: requiresApproval === 1,
        joinQuestions: data.joinQuestions || [],
        roles: [],
        ownerId,
        memberIds: [ownerId],
        members: ownerUser ? [{
          id: ownerUser.id,
          displayName: ownerUser.displayName,
          avatarUrl: ownerUser.avatarUrl,
          role: 'owner',
          roleIds: [],
          customTag: null,
          joinedAt: now,
        }] : [],
        channels,
        createdAt: now,
        updatedAt: now,
      };

      return { server, channels };
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }
  }

  async getServer(serverId: string, userId: string): Promise<DbServer | null> {
    const s = this.getSqlite().prepare(`
      SELECT id, name, description, purpose, avatar_url, banner_url, welcome_message, rules, requires_approval, join_questions_json, owner_id, created_at, updated_at
      FROM servers WHERE id = ?
    `).get(serverId) as any;
    if (!s) return null;

    const memberRoleRows = this.getSqlite().prepare(`
      SELECT user_id, role_id FROM server_member_roles WHERE server_id = ?
    `).all(serverId) as any[];
    const userRoleMap = new Map<string, string[]>();
    for (const mr of memberRoleRows) {
      const arr = userRoleMap.get(mr.user_id) || [];
      arr.push(mr.role_id);
      userRoleMap.set(mr.user_id, arr);
    }

    const memberRows = this.getSqlite().prepare(`
      SELECT sm.user_id, sm.role, sm.custom_tag, sm.joined_at, u.display_name, u.avatar_url
      FROM server_members sm
      JOIN users u ON u.id = sm.user_id
      WHERE sm.server_id = ?
      ORDER BY sm.joined_at ASC
    `).all(serverId) as any[];

    const memberIds = memberRows.map((m) => m.user_id);
    const members = memberRows.map((m) => ({
      id: m.user_id,
      displayName: m.display_name,
      avatarUrl: m.avatar_url || null,
      role: m.role as any,
      roleIds: userRoleMap.get(m.user_id) || [],
      customTag: m.custom_tag || null,
      joinedAt: m.joined_at,
    }));

    const chanRows = this.getSqlite().prepare(`
      SELECT id, name, is_announcement_only, updated_at, creator_id
      FROM conversations
      WHERE server_id = ?
      ORDER BY created_at ASC
    `).all(serverId) as any[];

    const channels: DbConversationSummary[] = chanRows.map((c) => ({
      id: c.id,
      type: 'channel',
      name: c.name,
      serverId,
      creatorId: c.creator_id,
      isAnnouncementOnly: c.is_announcement_only === 1,
      adminIds: [s.owner_id],
      participantCount: memberIds.length,
      peer: null,
      lastMessage: null,
      unreadCount: 0,
      updatedAt: c.updated_at,
    }));

    let joinQuestions: ServerJoinQuestion[] = [];
    if (s.join_questions_json) {
      try {
        joinQuestions = JSON.parse(s.join_questions_json);
      } catch {}
    }

    const roleRows = this.getSqlite().prepare(`
      SELECT id, server_id, name, color, permissions_json, order_index, created_at
      FROM server_roles
      WHERE server_id = ?
      ORDER BY order_index ASC, created_at ASC
    `).all(serverId) as any[];

    const roles: ServerCustomRole[] = roleRows.map((r) => ({
      id: r.id,
      serverId: r.server_id,
      name: r.name,
      color: r.color,
      permissions: JSON.parse(r.permissions_json || '[]'),
      order: r.order_index,
      createdAt: r.created_at,
    }));

    return {
      id: s.id,
      name: s.name,
      description: s.description || null,
      purpose: s.purpose || 'chat',
      avatarUrl: s.avatar_url || null,
      bannerUrl: s.banner_url || null,
      welcomeMessage: s.welcome_message || null,
      rules: s.rules || null,
      requiresApproval: s.requires_approval === 1,
      joinQuestions,
      roles,
      ownerId: s.owner_id,
      memberIds,
      members,
      channels,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    };
  }

  async getUserServers(userId: string): Promise<DbServer[]> {
    const rows = this.getSqlite().prepare(`
      SELECT s.id
      FROM servers s
      JOIN server_members sm ON sm.server_id = s.id
      WHERE sm.user_id = ?
      ORDER BY s.updated_at DESC
    `).all(userId) as any[];

    const servers: DbServer[] = [];
    for (const r of rows) {
      const s = await this.getServer(r.id, userId);
      if (s) servers.push(s);
    }
    return servers;
  }

  async getAllServers(): Promise<DbServer[]> {
    const rows = this.getSqlite().prepare(`
      SELECT id, name, description, purpose, avatar_url, rules, owner_id, created_at, updated_at
      FROM servers
      ORDER BY updated_at DESC
    `).all() as any[];

    const servers: DbServer[] = [];
    for (const r of rows) {
      const s = await this.getServer(r.id, r.owner_id);
      if (s) servers.push(s);
    }
    return servers;
  }

  async createServerChannel(serverId: string, actorId: string, data: { name: string; isAnnouncementOnly?: boolean }): Promise<DbConversationSummary> {
    const chId = 'chan_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const cleanName = data.name.replace(/^#/, '').trim();
    const isAnnounce = data.isAnnouncementOnly ? 1 : 0;
    const now = new Date().toISOString();

    const sqlite = this.getSqlite();
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      sqlite.prepare(`
        INSERT INTO conversations (id, type, name, creator_id, server_id, is_announcement_only, created_at, updated_at)
        VALUES (?, 'channel', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(chId, cleanName, actorId, serverId, isAnnounce);

      const members = sqlite.prepare('SELECT user_id, role, custom_tag FROM server_members WHERE server_id = ?').all(serverId) as any[];
      for (const m of members) {
        const isAdmin = m.role === 'owner' || m.role === 'admin' ? 1 : 0;
        sqlite.prepare(`
          INSERT INTO conversation_participants (conversation_id, user_id, is_admin, role, custom_tag)
          VALUES (?, ?, ?, ?, ?)
        `).run(chId, m.user_id, isAdmin, m.role, m.custom_tag);
      }

      sqlite.prepare('UPDATE servers SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(serverId);
      sqlite.exec('COMMIT');

      return {
        id: chId,
        type: 'channel',
        name: cleanName,
        serverId,
        creatorId: actorId,
        isAnnouncementOnly: isAnnounce === 1,
        adminIds: members.filter((m) => m.role === 'owner' || m.role === 'admin').map((m) => m.user_id),
        participantCount: members.length,
        peer: null,
        lastMessage: null,
        unreadCount: 0,
        updatedAt: now,
      };
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }
  }

  async addServerMember(serverId: string, userId: string, role: 'admin' | 'moderator' | 'member' = 'member'): Promise<void> {
    const sqlite = this.getSqlite();
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      sqlite.prepare(`
        INSERT OR REPLACE INTO server_members (server_id, user_id, role, joined_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `).run(serverId, userId, role);

      const channels = sqlite.prepare('SELECT id FROM conversations WHERE server_id = ?').all(serverId) as any[];
      const isAdmin = role === 'admin' ? 1 : 0;
      for (const ch of channels) {
        sqlite.prepare(`
          INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, is_admin, role)
          VALUES (?, ?, ?, ?)
        `).run(ch.id, userId, isAdmin, role);
      }

      sqlite.prepare('UPDATE servers SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(serverId);
      sqlite.exec('COMMIT');
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }
  }

  async removeServerMember(serverId: string, userId: string): Promise<void> {
    const sqlite = this.getSqlite();
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      sqlite.prepare('DELETE FROM server_members WHERE server_id = ? AND user_id = ?').run(serverId, userId);
      const channels = sqlite.prepare('SELECT id FROM conversations WHERE server_id = ?').all(serverId) as any[];
      for (const ch of channels) {
        sqlite.prepare('DELETE FROM conversation_participants WHERE conversation_id = ? AND user_id = ?').run(ch.id, userId);
      }
      sqlite.prepare('UPDATE servers SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(serverId);
      sqlite.exec('COMMIT');
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }
  }

  async updateServerMemberRole(serverId: string, userId: string, role: 'owner' | 'admin' | 'moderator' | 'member', customTag?: string | null): Promise<void> {
    const sqlite = this.getSqlite();
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      if (customTag !== undefined) {
        sqlite.prepare(`
          UPDATE server_members SET role = ?, custom_tag = ? WHERE server_id = ? AND user_id = ?
        `).run(role, customTag, serverId, userId);
      } else {
        sqlite.prepare(`
          UPDATE server_members SET role = ? WHERE server_id = ? AND user_id = ?
        `).run(role, serverId, userId);
      }

      const isAdmin = role === 'owner' || role === 'admin' ? 1 : 0;
      const channels = sqlite.prepare('SELECT id FROM conversations WHERE server_id = ?').all(serverId) as any[];
      for (const ch of channels) {
        if (customTag !== undefined) {
          sqlite.prepare(`
            UPDATE conversation_participants SET role = ?, is_admin = ?, custom_tag = ?
            WHERE conversation_id = ? AND user_id = ?
          `).run(role, isAdmin, customTag, ch.id, userId);
        } else {
          sqlite.prepare(`
            UPDATE conversation_participants SET role = ?, is_admin = ?
            WHERE conversation_id = ? AND user_id = ?
          `).run(role, isAdmin, ch.id, userId);
        }
      }
      sqlite.exec('COMMIT');
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }
  }

  async updateServerSettings(serverId: string, updates: { name?: string; description?: string | null; rules?: string | null; avatarUrl?: string | null; bannerUrl?: string | null; welcomeMessage?: string | null; requiresApproval?: boolean; purpose?: ServerPurpose }): Promise<void> {
    const updateParts: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const params: any[] = [];

    if (updates.name !== undefined) {
      updateParts.push('name = ?');
      params.push(updates.name);
    }
    if (updates.description !== undefined) {
      updateParts.push('description = ?');
      params.push(updates.description);
    }
    if (updates.rules !== undefined) {
      updateParts.push('rules = ?');
      params.push(updates.rules);
    }
    if (updates.avatarUrl !== undefined) {
      updateParts.push('avatar_url = ?');
      params.push(updates.avatarUrl);
    }
    if (updates.bannerUrl !== undefined) {
      updateParts.push('banner_url = ?');
      params.push(updates.bannerUrl);
    }
    if (updates.welcomeMessage !== undefined) {
      updateParts.push('welcome_message = ?');
      params.push(updates.welcomeMessage);
    }
    if (updates.requiresApproval !== undefined) {
      updateParts.push('requires_approval = ?');
      params.push(updates.requiresApproval ? 1 : 0);
    }
    if (updates.purpose !== undefined) {
      updateParts.push('purpose = ?');
      params.push(updates.purpose);
    }

    params.push(serverId);
    this.getSqlite().prepare(`UPDATE servers SET ${updateParts.join(', ')} WHERE id = ?`).run(...params);
  }

  async updateServerIdentity(serverId: string, data: { name?: string; description?: string | null; purpose?: ServerPurpose; avatarUrl?: string | null; bannerUrl?: string | null; rules?: string | null; welcomeMessage?: string | null; requiresApproval?: boolean }): Promise<DbServer | null> {
    await this.updateServerSettings(serverId, data);
    return this.getServer(serverId, '');
  }

  async isServerMember(serverId: string, userId: string): Promise<boolean> {
    const row = this.getSqlite().prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, userId);
    return !!row;
  }

  async isServerAdmin(serverId: string, userId: string): Promise<boolean> {
    const row = this.getSqlite().prepare(`
      SELECT 1 FROM server_members
      WHERE server_id = ? AND user_id = ? AND role IN ('owner', 'admin')
    `).get(serverId, userId);
    if (row) return true;

    const s = this.getSqlite().prepare('SELECT owner_id FROM servers WHERE id = ?').get(serverId) as any;
    return s?.owner_id === userId;
  }

  // Community Join Questions & Roles
  async setServerJoinQuestions(serverId: string, questions: ServerJoinQuestion[]): Promise<ServerJoinQuestion[]> {
    const json = JSON.stringify(questions);
    this.getSqlite().prepare(`
      UPDATE servers
      SET join_questions_json = ?, requires_approval = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(json, serverId);
    return questions;
  }

  async getServerJoinQuestions(serverId: string): Promise<ServerJoinQuestion[]> {
    const row = this.getSqlite().prepare('SELECT join_questions_json FROM servers WHERE id = ?').get(serverId) as any;
    if (!row || !row.join_questions_json) return [];
    try {
      return JSON.parse(row.join_questions_json);
    } catch {
      return [];
    }
  }

  async createServerRole(serverId: string, data: { name: string; color: string; permissions: ServerPermission[]; order?: number }): Promise<ServerCustomRole> {
    const id = 'role_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();
    const orderIndex = data.order ?? 0;
    const permissionsJson = JSON.stringify(data.permissions);

    this.getSqlite().prepare(`
      INSERT INTO server_roles (id, server_id, name, color, permissions_json, order_index, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, serverId, data.name, data.color, permissionsJson, orderIndex, now);

    return {
      id,
      serverId,
      name: data.name,
      color: data.color,
      permissions: data.permissions,
      order: orderIndex,
      createdAt: now,
    };
  }

  async updateServerRole(serverId: string, roleId: string, updates: { name?: string; color?: string; permissions?: ServerPermission[]; order?: number }): Promise<ServerCustomRole | null> {
    const updateParts: string[] = [];
    const params: any[] = [];

    if (updates.name !== undefined) {
      updateParts.push('name = ?');
      params.push(updates.name);
    }
    if (updates.color !== undefined) {
      updateParts.push('color = ?');
      params.push(updates.color);
    }
    if (updates.permissions !== undefined) {
      updateParts.push('permissions_json = ?');
      params.push(JSON.stringify(updates.permissions));
    }
    if (updates.order !== undefined) {
      updateParts.push('order_index = ?');
      params.push(updates.order);
    }

    if (updateParts.length > 0) {
      params.push(roleId, serverId);
      this.getSqlite().prepare(`UPDATE server_roles SET ${updateParts.join(', ')} WHERE id = ? AND server_id = ?`).run(...params);
    }

    const row = this.getSqlite().prepare('SELECT * FROM server_roles WHERE id = ?').get(roleId) as any;
    if (!row) return null;
    return {
      id: row.id,
      serverId: row.server_id,
      name: row.name,
      color: row.color,
      permissions: JSON.parse(row.permissions_json || '[]'),
      order: row.order_index,
      createdAt: row.created_at,
    };
  }

  async deleteServerRole(serverId: string, roleId: string): Promise<boolean> {
    const res = this.getSqlite().prepare('DELETE FROM server_roles WHERE id = ? AND server_id = ?').run(roleId, serverId);
    this.getSqlite().prepare('DELETE FROM server_member_roles WHERE role_id = ?').run(roleId);
    return res.changes > 0;
  }

  async getServerRoles(serverId: string): Promise<ServerCustomRole[]> {
    const rows = this.getSqlite().prepare(`
      SELECT id, server_id, name, color, permissions_json, order_index, created_at
      FROM server_roles
      WHERE server_id = ?
      ORDER BY order_index ASC, created_at ASC
    `).all(serverId) as any[];

    return rows.map((r) => ({
      id: r.id,
      serverId: r.server_id,
      name: r.name,
      color: r.color,
      permissions: JSON.parse(r.permissions_json || '[]'),
      order: r.order_index,
      createdAt: r.created_at,
    }));
  }

  async setServerMemberCustomRoles(serverId: string, userId: string, roleIds: string[]): Promise<void> {
    const sqlite = this.getSqlite();
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      sqlite.prepare('DELETE FROM server_member_roles WHERE server_id = ? AND user_id = ?').run(serverId, userId);
      const insert = sqlite.prepare('INSERT INTO server_member_roles (server_id, user_id, role_id) VALUES (?, ?, ?)');
      for (const rId of roleIds) {
        insert.run(serverId, userId, rId);
      }
      sqlite.exec('COMMIT');
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }
  }

  async hasServerPermission(serverId: string, userId: string, permission: ServerPermission): Promise<boolean> {
    const user = await this.getUserById(userId);
    if (user?.isAdmin) return true;

    const member = this.getSqlite().prepare('SELECT role FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, userId) as any;
    if (!member) return false;

    if (member.role === 'owner' || member.role === 'admin') return true;
    if (member.role === 'moderator') {
      if (['manage_messages', 'kick_members', 'send_announcements', 'view_audit_logs'].includes(permission)) {
        return true;
      }
    }

    const customRoles = this.getSqlite().prepare(`
      SELECT sr.permissions_json
      FROM server_member_roles smr
      JOIN server_roles sr ON sr.id = smr.role_id
      WHERE smr.server_id = ? AND smr.user_id = ?
    `).all(serverId, userId) as any[];

    for (const cr of customRoles) {
      try {
        const perms: ServerPermission[] = JSON.parse(cr.permissions_json);
        if (perms.includes(permission)) return true;
      } catch {}
    }

    return false;
  }

  // User Blocking & Relationships
  async blockUser(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) return;
    this.getSqlite().prepare(`
      INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id, created_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).run(blockerId, blockedId);

    await this.removeFriend(blockerId, blockedId);

    this.getSqlite().prepare(`
      DELETE FROM friend_requests
      WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    `).run(blockerId, blockedId, blockedId, blockerId);
  }

  async unblockUser(blockerId: string, blockedId: string): Promise<void> {
    this.getSqlite().prepare('DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?').run(blockerId, blockedId);
  }

  async isUserBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const row = this.getSqlite().prepare('SELECT 1 FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?').get(blockerId, blockedId);
    return !!row;
  }

  async areUsersBlocked(userId1: string, userId2: string): Promise<boolean> {
    const row = this.getSqlite().prepare(`
      SELECT 1 FROM user_blocks
      WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
    `).get(userId1, userId2, userId2, userId1);
    return !!row;
  }

  async getBlockedUsers(userId: string): Promise<DbUser[]> {
    const rows = this.getSqlite().prepare(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.display_name, u.avatar_url, u.banner_url, u.accent_color, u.is_admin, u.is_moderator, u.bio, u.created_at, u.last_active_at
      FROM users u
      JOIN user_blocks ub ON ub.blocked_id = u.id
      WHERE ub.blocker_id = ?
      ORDER BY ub.created_at DESC
    `).all(userId) as any[];

    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      firstName: row.first_name || null,
      lastName: row.last_name || null,
      displayName: row.display_name,
      avatarUrl: row.avatar_url || null,
      bannerUrl: row.banner_url || null,
      accentColor: row.accent_color || null,
      isAdmin: row.is_admin === 1,
      isModerator: row.is_moderator === 1,
      bio: row.bio || null,
      onboarded: true,
      status: 'active',
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at,
    }));
  }

  async getUserRelationship(userId1: string, userId2: string): Promise<{
    isFriend: boolean;
    isBlocked: boolean;
    isBlockedBy: boolean;
    friendRequestStatus: 'none' | 'sent' | 'received';
    friendRequestId: string | null;
  }> {
    const isFriend = await this.areFriends(userId1, userId2);
    const isBlocked = await this.isUserBlocked(userId1, userId2);
    const isBlockedBy = await this.isUserBlocked(userId2, userId1);

    const pendingReq = this.getSqlite().prepare(`
      SELECT id, sender_id, receiver_id
      FROM friend_requests
      WHERE status = 'pending' AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
    `).get(userId1, userId2, userId2, userId1) as any;

    let friendRequestStatus: 'none' | 'sent' | 'received' = 'none';
    let friendRequestId: string | null = null;

    if (pendingReq) {
      friendRequestId = pendingReq.id;
      if (pendingReq.sender_id === userId1) {
        friendRequestStatus = 'sent';
      } else {
        friendRequestStatus = 'received';
      }
    }

    return {
      isFriend,
      isBlocked,
      isBlockedBy,
      friendRequestStatus,
      friendRequestId,
    };
  }

  // Membership Invitations & Join Requests
  async createMembershipInvitation(invitation: Omit<DbMembershipInvitation, 'id' | 'createdAt' | 'status'> & { id?: string }): Promise<DbMembershipInvitation> {
    const id = invitation.id || 'inv_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();
    const answersJson = invitation.answers ? JSON.stringify(invitation.answers) : null;

    this.getSqlite().prepare(`
      INSERT INTO membership_invitations (id, target_type, target_id, target_name, user_id, user_display_name, type, status, answers_json, created_by_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(id, invitation.targetType, invitation.targetId, invitation.targetName, invitation.userId, invitation.userDisplayName, invitation.type, answersJson, invitation.createdById, now);

    return {
      id,
      targetType: invitation.targetType,
      targetId: invitation.targetId,
      targetName: invitation.targetName,
      userId: invitation.userId,
      userDisplayName: invitation.userDisplayName,
      type: invitation.type,
      status: 'pending',
      answers: invitation.answers,
      createdById: invitation.createdById,
      createdAt: now,
      resolvedAt: null,
      resolvedById: null,
    };
  }

  async getUserInvitations(userId: string): Promise<DbMembershipInvitation[]> {
    const rows = this.getSqlite().prepare(`
      SELECT id, target_type, target_id, target_name, user_id, user_display_name, type, status, answers_json, created_by_id, created_at, resolved_at, resolved_by_id
      FROM membership_invitations
      WHERE user_id = ? AND type = 'invite' AND status = 'pending'
      ORDER BY created_at DESC
    `).all(userId) as any[];

    return rows.map((r) => ({
      id: r.id,
      targetType: r.target_type,
      targetId: r.target_id,
      targetName: r.target_name,
      userId: r.user_id,
      userDisplayName: r.user_display_name,
      type: r.type,
      status: r.status,
      answers: r.answers_json ? JSON.parse(r.answers_json) : undefined,
      createdById: r.created_by_id,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at || null,
      resolvedById: r.resolved_by_id || null,
    }));
  }

  async getTargetJoinRequests(targetType: 'group' | 'server', targetId: string): Promise<DbMembershipInvitation[]> {
    const rows = this.getSqlite().prepare(`
      SELECT id, target_type, target_id, target_name, user_id, user_display_name, type, status, answers_json, created_by_id, created_at, resolved_at, resolved_by_id
      FROM membership_invitations
      WHERE target_id = ? AND type = 'request' AND status = 'pending'
      ORDER BY created_at DESC
    `).all(targetId) as any[];

    return rows.map((r) => ({
      id: r.id,
      targetType: r.target_type,
      targetId: r.target_id,
      targetName: r.target_name,
      userId: r.user_id,
      userDisplayName: r.user_display_name,
      type: r.type,
      status: r.status,
      answers: r.answers_json ? JSON.parse(r.answers_json) : undefined,
      createdById: r.created_by_id,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at || null,
      resolvedById: r.resolved_by_id || null,
    }));
  }

  async resolveMembershipInvitation(id: string, status: 'accepted' | 'declined' | 'approved' | 'rejected', actorId: string): Promise<DbMembershipInvitation | null> {
    const now = new Date().toISOString();
    const res = this.getSqlite().prepare(`
      UPDATE membership_invitations
      SET status = ?, resolved_at = ?, resolved_by_id = ?
      WHERE id = ?
    `).run(status, now, actorId, id);

    if (res.changes === 0) return null;

    const r = this.getSqlite().prepare(`
      SELECT id, target_type, target_id, target_name, user_id, user_display_name, type, status, answers_json, created_by_id, created_at, resolved_at, resolved_by_id
      FROM membership_invitations
      WHERE id = ?
    `).get(id) as any;

    if (!r) return null;
    return {
      id: r.id,
      targetType: r.target_type,
      targetId: r.target_id,
      targetName: r.target_name,
      userId: r.user_id,
      userDisplayName: r.user_display_name,
      type: r.type,
      status: r.status,
      answers: r.answers_json ? JSON.parse(r.answers_json) : undefined,
      createdById: r.created_by_id,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at || null,
      resolvedById: r.resolved_by_id || null,
    };
  }

  async hasActiveInvitationOrRequest(targetId: string, userId: string): Promise<boolean> {
    const row = this.getSqlite().prepare(`
      SELECT 1 FROM membership_invitations
      WHERE target_id = ? AND user_id = ? AND status = 'pending'
    `).get(targetId, userId);
    return !!row;
  }

  // Family Role & User Profile
  async setUserFamily(userId: string, isFamily: boolean): Promise<DbUser | null> {
    this.getSqlite()
      .prepare('UPDATE users SET is_family = ? WHERE id = ?')
      .run(isFamily ? 1 : 0, userId);
    return this.getUserById(userId);
  }

  // Group Discoverability Search
  async searchDiscoverableGroups(userId: string, query: string): Promise<DbConversationSummary[]> {
    const q = (query || '').toLowerCase().trim();
    const rows = this.getSqlite().prepare(`
      SELECT DISTINCT c.id
      FROM conversations c
      LEFT JOIN conversation_participants cp ON c.id = cp.conversation_id AND cp.user_id = ?
      WHERE c.type = 'group'
        AND (cp.user_id IS NOT NULL OR c.join_policy IN ('auto', 'request'))
        AND (LOWER(c.name) LIKE ? OR LOWER(COALESCE(c.description, '')) LIKE ?)
      ORDER BY c.updated_at DESC
      LIMIT 20
    `).all(userId, `%${q}%`, `%${q}%`) as any[];

    const result: DbConversationSummary[] = [];
    for (const r of rows) {
      const summary = await this.getConversation(r.id, userId);
      if (summary) result.push(summary);
    }
    return result;
  }

  // Message Reads Tracking
  async recordMessageRead(messageId: string, conversationId: string, userId: string): Promise<void> {
    const now = new Date().toISOString();
    try {
      this.getSqlite().prepare(`
        INSERT OR IGNORE INTO message_reads (message_id, conversation_id, user_id, read_at)
        VALUES (?, ?, ?, ?)
      `).run(messageId, conversationId, userId, now);
    } catch (_) {}

    try {
      this.getSqlite().prepare(`
        UPDATE conversation_participants
        SET last_read_message_id = ?
        WHERE conversation_id = ? AND user_id = ?
      `).run(messageId, conversationId, userId);
    } catch (_) {}

    try {
      this.getSqlite().prepare(`
        UPDATE messages
        SET status = 'read'
        WHERE id = ? AND sender_id != ?
      `).run(messageId, userId);
    } catch (_) {}
  }

  async getMessageReads(messageId: string): Promise<{ userId: string; displayName: string; readAt: string }[]> {
    const rows = this.getSqlite().prepare(`
      SELECT mr.user_id, u.display_name, mr.read_at
      FROM message_reads mr
      JOIN users u ON mr.user_id = u.id
      WHERE mr.message_id = ?
      ORDER BY mr.read_at ASC
    `).all(messageId) as any[];

    return rows.map((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
      readAt: r.read_at,
    }));
  }

  // Server Invites
  async createServerInvite(serverId: string, createdById: string, options?: { maxUses?: number | null; expiresAt?: string | null }): Promise<DbServerInvite> {
    const id = 'sinv_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    const now = new Date().toISOString();

    this.getSqlite().prepare(`
      INSERT INTO server_invites (id, server_id, code, created_by_id, max_uses, used_count, expires_at, is_revoked, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?)
    `).run(id, serverId, code, createdById, options?.maxUses ?? null, options?.expiresAt ?? null, now);

    return {
      id,
      serverId,
      code,
      createdById,
      maxUses: options?.maxUses ?? null,
      usedCount: 0,
      expiresAt: options?.expiresAt ?? null,
      isRevoked: false,
      createdAt: now,
    };
  }

  async getServerInviteByCode(code: string): Promise<DbServerInvite | null> {
    const row = this.getSqlite().prepare(`
      SELECT id, server_id, code, created_by_id, max_uses, used_count, expires_at, is_revoked, created_at
      FROM server_invites
      WHERE UPPER(code) = UPPER(?) AND is_revoked = 0
    `).get(code) as any;

    if (!row) return null;
    return {
      id: row.id,
      serverId: row.server_id,
      code: row.code,
      createdById: row.created_by_id,
      maxUses: row.max_uses,
      usedCount: row.used_count,
      expiresAt: row.expires_at,
      isRevoked: row.is_revoked === 1,
      createdAt: row.created_at,
    };
  }

  async useServerInvite(code: string, userId: string): Promise<{ success: boolean; serverId: string; message: string }> {
    const invite = await this.getServerInviteByCode(code);
    if (!invite) {
      return { success: false, serverId: '', message: 'Davet linki geçersiz veya iptal edilmiş.' };
    }
    if (invite.isRevoked) {
      return { success: false, serverId: invite.serverId, message: 'Bu davet linki iptal edilmiş.' };
    }
    if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
      return { success: false, serverId: invite.serverId, message: 'Bu davet linkinin süresi dolmuş.' };
    }
    if (invite.maxUses && invite.usedCount >= invite.maxUses) {
      return { success: false, serverId: invite.serverId, message: 'Bu davet linkinin kullanım limiti dolmuş.' };
    }

    const isMember = await this.isServerMember(invite.serverId, userId);
    if (isMember) {
      return { success: true, serverId: invite.serverId, message: 'Zaten bu sunucunun üyesisiniz.' };
    }

    await this.addServerMember(invite.serverId, userId, 'member');

    this.getSqlite().prepare(`
      UPDATE server_invites
      SET used_count = used_count + 1
      WHERE id = ?
    `).run(invite.id);

    return { success: true, serverId: invite.serverId, message: 'Sunucuya başarıyla katıldınız!' };
  }

  async revokeServerInvite(inviteId: string): Promise<boolean> {
    const res = this.getSqlite().prepare(`
      UPDATE server_invites
      SET is_revoked = 1
      WHERE id = ?
    `).run(inviteId);
    return res.changes > 0;
  }

  async getServerInvites(serverId: string): Promise<DbServerInvite[]> {
    const rows = this.getSqlite().prepare(`
      SELECT id, server_id, code, created_by_id, max_uses, used_count, expires_at, is_revoked, created_at
      FROM server_invites
      WHERE server_id = ?
      ORDER BY created_at DESC
    `).all(serverId) as any[];

    return rows.map((r) => ({
      id: r.id,
      serverId: r.server_id,
      code: r.code,
      createdById: r.created_by_id,
      maxUses: r.max_uses,
      usedCount: r.used_count,
      expiresAt: r.expires_at,
      isRevoked: r.is_revoked === 1,
      createdAt: r.created_at,
    }));
  }

  // Friends & Friend Requests
  async sendFriendRequest(senderId: string, targetEmailOrId: string): Promise<DbFriendRequest> {
    const target = targetEmailOrId.trim();
    let receiver = await this.getUserById(target);
    if (!receiver) {
      receiver = await this.getUserByEmail(target);
    }
    if (!receiver) {
      throw new Error('Kullanıcı bulunamadı.');
    }
    if (receiver.id === senderId) {
      throw new Error('Kendinize arkadaşlık isteği gönderemezsiniz.');
    }

    const alreadyFriends = await this.areFriends(senderId, receiver.id);
    if (alreadyFriends) {
      throw new Error('Bu kullanıcıyla zaten arkadaşsınız.');
    }

    const areBlocked = await this.areUsersBlocked(senderId, receiver.id);
    if (areBlocked) {
      throw new Error('Engellenen veya sizi engelleyen bir kullanıcıya arkadaşlık isteği gönderilemez.');
    }

    const sender = await this.getUserById(senderId);
    if (!sender) throw new Error('Gönderen kullanıcı bulunamadı.');

    const existing = this.getSqlite().prepare(`
      SELECT id, sender_id, receiver_id, status, created_at
      FROM friend_requests
      WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
        AND status = 'pending'
    `).get(senderId, receiver.id, receiver.id, senderId) as any;

    if (existing) {
      throw new Error('Zaten bekleyen bir arkadaşlık isteği mevcut.');
    }

    const id = 'freq_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();

    this.getSqlite().prepare(`
      INSERT INTO friend_requests (id, sender_id, receiver_id, status, created_at)
      VALUES (?, ?, ?, 'pending', ?)
    `).run(id, senderId, receiver.id, now);

    return {
      id,
      senderId,
      senderName: sender.displayName,
      senderAvatar: sender.avatarUrl || null,
      receiverId: receiver.id,
      receiverName: receiver.displayName,
      receiverAvatar: receiver.avatarUrl || null,
      status: 'pending',
      createdAt: now,
    };
  }

  async getFriendRequests(userId: string): Promise<{ incoming: DbFriendRequest[]; outgoing: DbFriendRequest[] }> {
    const incomingRows = this.getSqlite().prepare(`
      SELECT fr.id, fr.sender_id, u.display_name AS sender_name, u.avatar_url AS sender_avatar,
             fr.receiver_id, ru.display_name AS receiver_name, ru.avatar_url AS receiver_avatar,
             fr.status, fr.created_at
      FROM friend_requests fr
      JOIN users u ON fr.sender_id = u.id
      JOIN users ru ON fr.receiver_id = ru.id
      WHERE fr.receiver_id = ? AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
    `).all(userId) as any[];

    const outgoingRows = this.getSqlite().prepare(`
      SELECT fr.id, fr.sender_id, u.display_name AS sender_name, u.avatar_url AS sender_avatar,
             fr.receiver_id, ru.display_name AS receiver_name, ru.avatar_url AS receiver_avatar,
             fr.status, fr.created_at
      FROM friend_requests fr
      JOIN users u ON fr.sender_id = u.id
      JOIN users ru ON fr.receiver_id = ru.id
      WHERE fr.sender_id = ? AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
    `).all(userId) as any[];

    const mapRow = (r: any): DbFriendRequest => ({
      id: r.id,
      senderId: r.sender_id,
      senderName: r.sender_name,
      senderAvatar: r.sender_avatar || null,
      receiverId: r.receiver_id,
      receiverName: r.receiver_name,
      receiverAvatar: r.receiver_avatar || null,
      status: r.status,
      createdAt: r.created_at,
    });

    return {
      incoming: incomingRows.map(mapRow),
      outgoing: outgoingRows.map(mapRow),
    };
  }

  async respondFriendRequest(requestId: string, userId: string, action: 'accept' | 'decline'): Promise<DbFriendRequest> {
    const row = this.getSqlite().prepare(`
      SELECT fr.id, fr.sender_id, u.display_name AS sender_name, u.avatar_url AS sender_avatar,
             fr.receiver_id, ru.display_name AS receiver_name, ru.avatar_url AS receiver_avatar,
             fr.status, fr.created_at
      FROM friend_requests fr
      JOIN users u ON fr.sender_id = u.id
      JOIN users ru ON fr.receiver_id = ru.id
      WHERE fr.id = ?
    `).get(requestId) as any;

    if (!row) throw new Error('İstek bulunamadı.');
    if (row.receiver_id !== userId) throw new Error('Bu isteği yanıtlama yetkiniz yok.');
    if (row.status !== 'pending') throw new Error('Bu istek zaten yanıtlanmış.');

    const newStatus = action === 'accept' ? 'accepted' : 'declined';
    this.getSqlite().prepare(`
      UPDATE friend_requests
      SET status = ?
      WHERE id = ?
    `).run(newStatus, requestId);

    if (action === 'accept') {
      const now = new Date().toISOString();
      this.getSqlite().prepare(`
        INSERT OR IGNORE INTO user_friends (user_id, friend_id, created_at)
        VALUES (?, ?, ?)
      `).run(row.sender_id, row.receiver_id, now);

      this.getSqlite().prepare(`
        INSERT OR IGNORE INTO user_friends (user_id, friend_id, created_at)
        VALUES (?, ?, ?)
      `).run(row.receiver_id, row.sender_id, now);
    }

    return {
      id: row.id,
      senderId: row.sender_id,
      senderName: row.sender_name,
      senderAvatar: row.sender_avatar || null,
      receiverId: row.receiver_id,
      receiverName: row.receiver_name,
      receiverAvatar: row.receiver_avatar || null,
      status: newStatus,
      createdAt: row.created_at,
    };
  }

  async getFriends(userId: string): Promise<DbUser[]> {
    const rows = this.getSqlite().prepare(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.display_name, u.avatar_url, u.phone_number,
             u.is_admin, u.is_moderator, u.onboarded, u.status, u.theme_preference, u.bio, u.is_family,
             u.group_add_privacy, u.created_at, u.last_active_at
      FROM user_friends uf
      JOIN users u ON uf.friend_id = u.id
      WHERE uf.user_id = ? AND u.status = 'active'
      ORDER BY u.display_name ASC
    `).all(userId) as any[];

    return rows.map((r) => {
      const isAdmin = r.is_admin === 1 || (!!config.INITIAL_ADMIN_EMAIL && r.email.toLowerCase() === config.INITIAL_ADMIN_EMAIL.toLowerCase().trim());
      const isModerator = !isAdmin && r.is_moderator === 1;
      return {
        id: r.id,
        email: r.email,
        firstName: r.first_name || null,
        lastName: r.last_name || null,
        displayName: r.display_name,
        avatarUrl: r.avatar_url || null,
        phoneNumber: r.phone_number || null,
        isAdmin,
        isModerator,
        bio: r.bio || null,
        isFamily: r.is_family === 1,
        groupAddPrivacy: r.group_add_privacy || 'everyone',
        themePreference: r.theme_preference === 'light' ? 'light' : 'dark',
        onboarded: r.onboarded === 1,
        status: r.status,
        createdAt: r.created_at,
        lastActiveAt: r.last_active_at,
      };
    });
  }

  async removeFriend(userId: string, friendId: string): Promise<boolean> {
    const res = this.getSqlite().prepare(`
      DELETE FROM user_friends
      WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
    `).run(userId, friendId, friendId, userId);
    return res.changes > 0;
  }

  async areFriends(userId1: string, userId2: string): Promise<boolean> {
    const row = this.getSqlite().prepare(`
      SELECT 1 FROM user_friends
      WHERE user_id = ? AND friend_id = ?
    `).get(userId1, userId2);
    return !!row;
  }

  // Bot Pool & Gemini AI Configuration
  async addBotPoolToken(tokenEncrypted: string, botName: string, username: string): Promise<DbBotPoolItem> {
    const id = 'pool_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();

    this.getSqlite().prepare(`
      INSERT INTO bot_pool (id, token_encrypted, bot_name, username, is_assigned, created_at)
      VALUES (?, ?, ?, ?, 0, ?)
    `).run(id, tokenEncrypted, botName, username, now);

    return {
      id,
      tokenEncrypted,
      botName,
      username,
      isAssigned: false,
      assignedName: null,
      assignedConversationId: null,
      createdAt: now,
    };
  }

  async getBotPool(): Promise<DbBotPoolItem[]> {
    const rows = this.getSqlite().prepare(`
      SELECT id, token_encrypted, bot_name, username, is_assigned, assigned_name, assigned_conversation_id, created_at
      FROM bot_pool
      ORDER BY created_at DESC
    `).all() as any[];

    return rows.map((r) => ({
      id: r.id,
      tokenEncrypted: r.token_encrypted,
      botName: r.bot_name,
      username: r.username,
      isAssigned: r.is_assigned === 1,
      assignedName: r.assigned_name || null,
      assignedConversationId: r.assigned_conversation_id || null,
      createdAt: r.created_at,
    }));
  }

  async removeBotPoolToken(id: string): Promise<boolean> {
    const res = this.getSqlite().prepare('DELETE FROM bot_pool WHERE id = ?').run(id);
    return res.changes > 0;
  }

  async assignBotFromPool(poolId: string, conversationId: string, customName?: string): Promise<DbBotPoolItem | null> {
    const res = this.getSqlite().prepare(`
      UPDATE bot_pool
      SET is_assigned = 1, assigned_conversation_id = ?, assigned_name = ?
      WHERE id = ?
    `).run(conversationId, customName || null, poolId);

    if (res.changes === 0) return null;
    const item = this.getSqlite().prepare('SELECT * FROM bot_pool WHERE id = ?').get(poolId) as any;
    if (!item) return null;

    return {
      id: item.id,
      tokenEncrypted: item.token_encrypted,
      botName: item.bot_name,
      username: item.username,
      isAssigned: item.is_assigned === 1,
      assignedName: item.assigned_name || null,
      assignedConversationId: item.assigned_conversation_id || null,
      createdAt: item.created_at,
    };
  }

  async getGeminiConfig(): Promise<DbGeminiConfig | null> {
    const row = this.getSqlite().prepare(`
      SELECT api_key_encrypted, is_enabled, default_prompt, model, updated_at
      FROM gemini_config
      WHERE id = 'default'
    `).get() as any;

    if (!row) return null;
    return {
      apiKeyEncrypted: row.api_key_encrypted,
      isEnabled: row.is_enabled === 1,
      defaultPrompt: row.default_prompt || null,
      model: row.model || 'gemini-1.5-flash',
      updatedAt: row.updated_at,
    };
  }

  async updateGeminiConfig(configData: { apiKeyEncrypted?: string; isEnabled?: boolean; defaultPrompt?: string | null; model?: string }): Promise<DbGeminiConfig> {
    const now = new Date().toISOString();
    const existing = await this.getGeminiConfig();

    const apiKeyEncrypted = configData.apiKeyEncrypted ?? existing?.apiKeyEncrypted ?? '';
    const isEnabled = configData.isEnabled !== undefined ? (configData.isEnabled ? 1 : 0) : (existing?.isEnabled ? 1 : 0);
    const defaultPrompt = configData.defaultPrompt !== undefined ? configData.defaultPrompt : (existing?.defaultPrompt ?? null);
    const model = configData.model ?? existing?.model ?? 'gemini-1.5-flash';

    this.getSqlite().prepare(`
      INSERT INTO gemini_config (id, api_key_encrypted, is_enabled, default_prompt, model, updated_at)
      VALUES ('default', ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        api_key_encrypted = excluded.api_key_encrypted,
        is_enabled = excluded.is_enabled,
        default_prompt = excluded.default_prompt,
        model = excluded.model,
        updated_at = excluded.updated_at
    `).run(apiKeyEncrypted, isEnabled, defaultPrompt, model, now);

    return {
      apiKeyEncrypted,
      isEnabled: isEnabled === 1,
      defaultPrompt,
      model,
      updatedAt: now,
    };
  }
}
