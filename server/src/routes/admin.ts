import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../auth/index.js';
import { db, isWhitelistModeEnabled } from '../db/index.js';
import { config } from '../config.js';

const router = Router();

// Apply auth and admin checks to all admin endpoints
router.use(requireAuth, requireAdmin);

// Helper to log audit records
function recordAudit(actorId: string, actorEmail: string, action: string, target: string | null, details: string, ip: string | undefined) {
  const id = 'audit_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  db.prepare(`
    INSERT INTO audit_logs (id, actor_id, actor_email, action, target, details, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, actorId, actorEmail, action, target, details, ip || 'unknown');
}

// GET /api/admin/status
router.get('/status', (req, res) => {
  const whitelistMode = isWhitelistModeEnabled();

  const totalUsers = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count;
  const approvedWhitelistCount = (db.prepare('SELECT COUNT(*) as count FROM whitelist').get() as any).count;
  const adminCount = (db.prepare('SELECT COUNT(*) as count FROM users WHERE is_admin = 1').get() as any).count;
  const totalMessages = (db.prepare('SELECT COUNT(*) as count FROM messages').get() as any).count;

  res.json({
    whitelistMode,
    stats: {
      totalUsers,
      approvedWhitelistCount,
      adminCount,
      totalMessages,
    },
    initialAdminEmail: config.INITIAL_ADMIN_EMAIL,
  });
});

// POST /api/admin/whitelist/toggle
const toggleSchema = z.object({
  enabled: z.boolean(),
  confirmation: z.literal(true), // Explicit confirmation required
});

router.post('/whitelist/toggle', (req, res) => {
  const parseResult = toggleSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: 'Confirmation required to toggle whitelist mode' });
    return;
  }

  const { enabled } = parseResult.data;
  const user = req.user!;

  db.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES ('whitelist_mode', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(enabled ? 'true' : 'false');

  const action = enabled ? 'WHITELIST_ENABLED' : 'WHITELIST_DISABLED';
  recordAudit(
    user.id,
    user.email,
    action,
    'SYSTEM',
    `Whitelist mode changed to ${enabled ? 'ENABLED' : 'DISABLED'}`,
    req.ip
  );

  res.json({
    success: true,
    whitelistMode: enabled,
    message: `Whitelist access control is now ${enabled ? 'ENABLED' : 'DISABLED'}.`,
  });
});

// GET /api/admin/whitelist
router.get('/whitelist', (req, res) => {
  const items = db.prepare(`
    SELECT w.email, w.approved_by, w.created_at, u.display_name, u.avatar_url, u.is_admin
    FROM whitelist w
    LEFT JOIN users u ON LOWER(u.email) = LOWER(w.email)
    ORDER BY w.created_at DESC
  `).all();

  res.json({ whitelist: items });
});

// POST /api/admin/whitelist/add
const addWhitelistSchema = z.object({
  email: z.string().email(),
});

router.post('/whitelist/add', (req, res) => {
  const parseResult = addWhitelistSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_EMAIL', message: 'Valid email address is required' });
    return;
  }

  const email = parseResult.data.email.toLowerCase().trim();
  const user = req.user!;

  try {
    db.prepare(`
      INSERT INTO whitelist (email, approved_by, created_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(email) DO UPDATE SET approved_by = excluded.approved_by
    `).run(email, user.email);

    recordAudit(
      user.id,
      user.email,
      'USER_WHITELIST_APPROVED',
      email,
      `User ${email} approved for application access`,
      req.ip
    );

    res.json({ success: true, email, message: `Account ${email} has been approved.` });
  } catch (err: any) {
    res.status(500).json({ error: 'DB_ERROR', message: err.message });
  }
});

// DELETE /api/admin/whitelist/:email
router.delete('/whitelist/:email', (req, res) => {
  const email = req.params.email.toLowerCase().trim();
  const user = req.user!;

  // Prevent removing the bootstrap admin email
  if (email === config.INITIAL_ADMIN_EMAIL.toLowerCase().trim()) {
    res.status(400).json({ error: 'PROTECTED_ACCOUNT', message: 'Cannot remove the initial designated administrator account' });
    return;
  }

  const result = db.prepare('DELETE FROM whitelist WHERE LOWER(email) = ?').run(email);

  if (result.changes === 0) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'User is not in the whitelist' });
    return;
  }

  recordAudit(
    user.id,
    user.email,
    'USER_WHITELIST_REVOKED',
    email,
    `Whitelist approval revoked for ${email}`,
    req.ip
  );

  res.json({ success: true, email, message: `Whitelist approval for ${email} has been revoked.` });
});

// GET /api/admin/audit-logs
router.get('/audit-logs', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const logs = db.prepare(`
    SELECT id, actor_id, actor_email, action, target, details, ip_address, created_at
    FROM audit_logs
    ORDER BY created_at DESC, rowid DESC
    LIMIT ?
  `).all(limit);

  res.json({ auditLogs: logs });
});

// GET /api/admin/users
router.get('/users', (req, res) => {
  const users = db.prepare(`
    SELECT id, email, display_name, avatar_url, is_admin, created_at, last_active_at
    FROM users
    ORDER BY created_at DESC
  `).all();

  res.json({ users });
});

export const adminRouter = router;
