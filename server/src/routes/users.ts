import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/index.js';
import { enforceWhitelist } from '../middleware/whitelist.js';
import { dataStore } from '../db/index.js';

const router = Router();

router.use(requireAuth, enforceWhitelist);

// GET /api/users/me - get current user profile
router.get('/me', async (req, res) => {
  const user = req.user!;
  const userRow = await dataStore.getUserById(user.id);

  if (!userRow) {
    res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User record not found' });
    return;
  }

  res.json({
    user: {
      id: userRow.id,
      email: userRow.email,
      displayName: userRow.displayName,
      avatarUrl: userRow.avatarUrl,
      isAdmin: userRow.isAdmin,
      createdAt: userRow.createdAt,
    },
  });
});

// PATCH /api/users/me - update current user profile
const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  avatarUrl: z.string().url().or(z.literal('')).optional(),
});

router.patch('/me', async (req, res) => {
  const parseResult = updateProfileSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const user = req.user!;
  const { displayName, avatarUrl } = parseResult.data;

  const updated = await dataStore.updateUserProfile(user.id, {
    displayName,
    avatarUrl,
  });

  if (!updated) {
    res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User record not found' });
    return;
  }

  res.json({
    user: {
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      avatarUrl: updated.avatarUrl,
      isAdmin: updated.isAdmin,
    },
  });
});

// GET /api/users - search contacts / users
router.get('/', async (req, res) => {
  const currentUser = req.user!;
  const query = (req.query.q as string || '').toLowerCase().trim();
  const users = await dataStore.searchUsers(currentUser.id, query);

  res.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      isAdmin: u.isAdmin,
    })),
  });
});

export const usersRouter = router;
