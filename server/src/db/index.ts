import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

const dbPath = path.resolve(process.cwd(), config.DB_PATH);
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new DatabaseSync(dbPath);

// Enable WAL mode and foreign keys
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Helper to execute inside a database transaction
export function runTransaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const res = fn();
    db.exec('COMMIT');
    return res;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Initialize database schema
export function initDb() {
  db.exec(`
    -- System settings (e.g., whitelist_mode)
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Whitelist table
    CREATE TABLE IF NOT EXISTS whitelist (
      email TEXT PRIMARY KEY,
      approved_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Audit logs table
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

    -- Conversations table
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('direct', 'group')),
      name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Conversation participants table
    CREATE TABLE IF NOT EXISTS conversation_participants (
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_read_message_id TEXT,
      PRIMARY KEY (conversation_id, user_id),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Messages table
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

    -- Indexes for high-performance querying
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_client_id ON messages(client_message_id);
    CREATE INDEX IF NOT EXISTS idx_participants_user ON conversation_participants(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
  `);

  // Initialize whitelist_mode setting if not present
  const getWhitelistSetting = db.prepare('SELECT value FROM system_settings WHERE key = ?');
  const existingSetting = getWhitelistSetting.get('whitelist_mode') as { value: string } | undefined;

  if (!existingSetting) {
    const setWhitelistSetting = db.prepare('INSERT INTO system_settings (key, value) VALUES (?, ?)');
    setWhitelistSetting.run('whitelist_mode', config.WHITELIST_MODE_DEFAULT ? 'true' : 'false');
  }

  // Pre-seed initial administrator if configured
  if (config.INITIAL_ADMIN_EMAIL) {
    const adminEmail = config.INITIAL_ADMIN_EMAIL.toLowerCase().trim();
    // Auto-approve initial admin in whitelist table
    const checkWhitelist = db.prepare('SELECT email FROM whitelist WHERE email = ?').get(adminEmail);
    if (!checkWhitelist) {
      db.prepare('INSERT INTO whitelist (email, approved_by) VALUES (?, ?)').run(adminEmail, 'system_bootstrap');
    }

    // Auto-seed initial user row if not exists
    const checkUser = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
    if (!checkUser) {
      const adminId = 'user_admin_bootstrap';
      db.prepare(`
        INSERT INTO users (id, email, display_name, is_admin)
        VALUES (?, ?, ?, 1)
      `).run(adminId, adminEmail, 'Initial Admin');

      // Record audit log
      db.prepare(`
        INSERT INTO audit_logs (id, actor_id, actor_email, action, target, details)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'audit_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        'system',
        'system',
        'SYSTEM_BOOTSTRAP_ADMIN',
        adminEmail,
        'Initial administrator designated via server environment'
      );
    }
  }
}

export function isWhitelistModeEnabled(): boolean {
  try {
    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'whitelist_mode'").get() as { value: string } | undefined;
    if (!row) {
      // Fail closed
      return true;
    }
    return row.value === 'true';
  } catch (err) {
    // Fail closed on database error
    console.error('Failed to query whitelist mode from database:', err);
    return true;
  }
}

export function isEmailWhitelisted(email: string): boolean {
  try {
    const normalized = email.toLowerCase().trim();
    // Check if user is an admin
    const userRow = db.prepare('SELECT is_admin FROM users WHERE LOWER(email) = ?').get(normalized) as { is_admin: number } | undefined;
    if (userRow && userRow.is_admin === 1) {
      return true;
    }

    // Check whitelist table
    const whitelistRow = db.prepare('SELECT email FROM whitelist WHERE LOWER(email) = ?').get(normalized);
    return !!whitelistRow;
  } catch (err) {
    console.error('Failed to check whitelist status:', err);
    return false;
  }
}
