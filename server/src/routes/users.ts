import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/index.js';
import { enforceWhitelist } from '../middleware/whitelist.js';
import { db } from '../db/index.js';

const router = Router();

router.use(requireAuth, enforceWhitelist);

// GET /api/users/me - get current user profile
router.get('/me', (req, res) => {
  const user = req.user!;
  const userRow = db.prepare('SELECT id, email, display_name, avatar_url, is_admin, created_at FROM users WHERE id = ?').get(user.id) as any;

  if (!userRow) {
    res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User record not found' });
    return;
  }

  res.json({
    user: {
      id: userRow.id,
      email: userRow.email,
      displayName: userRow.display_name,
      avatarUrl: userRow.avatar_url,
      isAdmin: userRow.is_admin === 1,
      createdAt: userRow.created_at,
    },
  });
});

// PATCH /api/users/me - update current user profile
const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  avatarUrl: z.string().url().or(z.literal('')).optional(),
});

router.patch('/me', (req, res) => {
  const parseResult = updateProfileSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const user = req.user!;
  const { displayName, avatarUrl } = parseResult.data;

  if (displayName !== undefined && avatarUrl !== undefined) {
    db.prepare('UPDATE users SET display_name = ?, avatar_url = ?, last_active_at = CURRENT_TIMESTAMP WHERE id = ?').run(displayName, avatarUrl, user.id);
  } else if (displayName !== undefined) {
    db.prepare('UPDATE users SET display_name = ?, last_active_at = CURRENT_TIMESTAMP WHERE id = ?').run(displayName, user.id);
  } else if (avatarUrl !== undefined) {
    db.prepare('UPDATE users SET avatar_url = ?, last_active_at = CURRENT_TIMESTAMP WHERE id = ?').run(avatarUrl, user.id);
  }

  const updated = db.prepare('SELECT id, email, display_name, avatar_url, is_admin FROM users WHERE id = ?').get(user.id) as any;

  res.json({
    user: {
      id: updated.id,
      email: updated.email,
      displayName: updated.display_name,
      avatarUrl: updated.avatar_url,
      isAdmin: updated.is_admin === 1,
    },
  });
});

// GET /api/users - search contacts / users
router.get('/', (req, res) => {
  const currentUser = req.user!;
  const query = (req.query.q as string || '').toLowerCase().trim();

  let users: any[];
  if (query) {
    users = db.prepare(`
      SELECT id, email, display_name, avatar_url, is_admin
      FROM users
      WHERE id != ? AND (LOWER(display_name) LIKE ? OR LOWER(email) LIKE ?)
      ORDER BY display_name ASC
      LIMIT 30
    `).all(currentUser.id, `%${query}%`, `%${query}%`);
  } else {
    users = db.prepare(`
      SELECT id, email, display_name, avatar_url, is_admin
      FROM users
      WHERE id != ?
      ORDER BY last_active_at DESC
      LIMIT 30
    `).all(currentUser.id);
  }

  res.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.display_name,
      avatarUrl: u.avatar_url,
      isAdmin: u.is_admin === 1,
    })),
  });
});

export const usersRouter = router;
