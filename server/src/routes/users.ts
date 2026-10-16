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
    res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Kullanıcı kaydı bulunamadı.' });
    return;
  }

  res.json({
    user: {
      id: userRow.id,
      email: userRow.email,
      firstName: userRow.firstName,
      lastName: userRow.lastName,
      displayName: userRow.displayName,
      avatarUrl: userRow.avatarUrl,
      phoneNumber: userRow.phoneNumber, // Returned only to the user themselves
      isAdmin: userRow.isAdmin,
      onboarded: userRow.onboarded,
      status: userRow.status,
      createdAt: userRow.createdAt,
    },
  });
});

// POST /api/users/onboarding - complete profile onboarding
const onboardingSchema = z.object({
  firstName: z.string().max(50).optional(),
  lastName: z.string().max(50).optional(),
  displayName: z.string().min(1, 'Görünen isim gereklidir.').max(50),
  avatarUrl: z.string().optional(),
  phoneNumber: z.string().max(30).optional(),
});

router.post('/onboarding', async (req, res) => {
  const parseResult = onboardingSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const user = req.user!;
  const { firstName, lastName, displayName, avatarUrl, phoneNumber } = parseResult.data;

  const completed = await dataStore.completeOnboarding(user.id, {
    firstName: firstName?.trim() || null,
    lastName: lastName?.trim() || null,
    displayName: displayName.trim(),
    avatarUrl: avatarUrl?.trim() || null,
    phoneNumber: phoneNumber?.trim() || null,
  });

  res.json({
    user: {
      id: completed.id,
      email: completed.email,
      firstName: completed.firstName,
      lastName: completed.lastName,
      displayName: completed.displayName,
      avatarUrl: completed.avatarUrl,
      phoneNumber: completed.phoneNumber,
      isAdmin: completed.isAdmin,
      onboarded: completed.onboarded,
      status: completed.status,
    },
  });
});

// PATCH /api/users/me - update current user profile
const updateProfileSchema = z.object({
  firstName: z.string().max(50).optional(),
  lastName: z.string().max(50).optional(),
  displayName: z.string().min(1).max(50).optional(),
  avatarUrl: z.string().optional(),
  phoneNumber: z.string().max(30).optional(),
});

router.patch('/me', async (req, res) => {
  const parseResult = updateProfileSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const user = req.user!;
  const { firstName, lastName, displayName, avatarUrl, phoneNumber } = parseResult.data;

  const updated = await dataStore.updateUserProfile(user.id, {
    firstName: firstName?.trim(),
    lastName: lastName?.trim(),
    displayName: displayName?.trim(),
    avatarUrl: avatarUrl !== undefined ? (avatarUrl.trim() || null) : undefined,
    phoneNumber: phoneNumber !== undefined ? (phoneNumber.trim() || null) : undefined,
  });

  if (!updated) {
    res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Kullanıcı kaydı bulunamadı.' });
    return;
  }

  res.json({
    user: {
      id: updated.id,
      email: updated.email,
      firstName: updated.firstName,
      lastName: updated.lastName,
      displayName: updated.displayName,
      avatarUrl: updated.avatarUrl,
      phoneNumber: updated.phoneNumber,
      isAdmin: updated.isAdmin,
      onboarded: updated.onboarded,
    },
  });
});

// GET /api/users - search contacts / users (strictly active users, never exposing private phone numbers)
router.get('/', async (req, res) => {
  const currentUser = req.user!;
  const query = (req.query.q as string || '').toLowerCase().trim();
  const users = await dataStore.searchUsers(currentUser.id, query);

  res.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      isAdmin: u.isAdmin,
    })),
  });
});

export const usersRouter = router;
