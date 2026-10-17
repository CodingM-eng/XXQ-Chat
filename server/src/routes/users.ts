import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { requireAuth } from '../auth/index.js';
import { enforceWhitelist } from '../middleware/whitelist.js';
import { dataStore } from '../db/index.js';

const router = Router();

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 }, // 1 MB limit for profile picture
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Yalnızca resim dosyaları (JPEG, PNG, WEBP, GIF) yüklenebilir.'));
    }
    cb(null, true);
  },
});

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
      bannerUrl: userRow.bannerUrl || null,
      accentColor: userRow.accentColor || null,
      phoneNumber: userRow.phoneNumber, // Returned only to the user themselves
      isAdmin: userRow.isAdmin,
      isModerator: userRow.isModerator,
      isFamily: !!userRow.isFamily,
      groupAddPrivacy: userRow.groupAddPrivacy || 'everyone',
      bio: userRow.bio || null,
      themePreference: userRow.themePreference || 'dark',
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
  bio: z.string().max(500).optional(),
});

router.post('/onboarding', async (req, res) => {
  const parseResult = onboardingSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const user = req.user!;
  const { firstName, lastName, displayName, avatarUrl, phoneNumber, bio } = parseResult.data;

  const completed = await dataStore.completeOnboarding(user.id, {
    firstName: firstName?.trim() || null,
    lastName: lastName?.trim() || null,
    displayName: displayName.trim(),
    avatarUrl: avatarUrl?.trim() || null,
    phoneNumber: phoneNumber?.trim() || null,
  });

  if (bio !== undefined) {
    await dataStore.updateUserProfile(user.id, { bio: bio.trim() || null });
  }

  const freshUser = await dataStore.getUserById(user.id);

  res.json({
    user: freshUser,
  });
});

// PATCH /api/users/me - update current user profile
const updateProfileSchema = z.object({
  firstName: z.string().max(50).optional(),
  lastName: z.string().max(50).optional(),
  displayName: z.string().min(1).max(50).optional(),
  avatarUrl: z.string().optional().nullable(),
  bannerUrl: z.string().optional().nullable(),
  accentColor: z.string().max(25).optional().nullable(),
  phoneNumber: z.string().max(30).optional(),
  themePreference: z.enum(['dark', 'light']).optional(),
  bio: z.string().max(500).optional().nullable(),
  groupAddPrivacy: z.enum(['everyone', 'friends', 'invite_only']).optional(),
});

router.patch('/me', async (req, res) => {
  const parseResult = updateProfileSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const user = req.user!;
  const { firstName, lastName, displayName, avatarUrl, bannerUrl, accentColor, phoneNumber, themePreference, bio, groupAddPrivacy } = parseResult.data;

  const updated = await dataStore.updateUserProfile(user.id, {
    firstName: firstName?.trim(),
    lastName: lastName?.trim(),
    displayName: displayName?.trim(),
    avatarUrl: avatarUrl !== undefined ? (avatarUrl?.trim() || null) : undefined,
    bannerUrl: bannerUrl !== undefined ? (bannerUrl?.trim() || null) : undefined,
    accentColor: accentColor !== undefined ? (accentColor?.trim() || null) : undefined,
    phoneNumber: phoneNumber !== undefined ? (phoneNumber.trim() || null) : undefined,
    themePreference,
    bio: bio !== undefined ? (bio?.trim() || null) : undefined,
    groupAddPrivacy,
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
      bannerUrl: updated.bannerUrl || null,
      accentColor: updated.accentColor || null,
      phoneNumber: updated.phoneNumber,
      isAdmin: updated.isAdmin,
      isModerator: updated.isModerator,
      isFamily: !!updated.isFamily,
      groupAddPrivacy: updated.groupAddPrivacy || 'everyone',
      bio: updated.bio || null,
      themePreference: updated.themePreference || 'dark',
      onboarded: updated.onboarded,
    },
  });
});

// POST /api/users/avatar - upload profile picture (local file or URL)
router.post('/avatar', (req, res) => {
  avatarUpload.single('file')(req, res, async (err: any) => {
    if (err) {
      res.status(400).json({ error: 'UPLOAD_ERROR', message: err.message || 'Resim yüklenirken hata oluştu.' });
      return;
    }

    const user = req.user!;
    let newAvatarUrl: string | null = null;

    if (req.file) {
      // Validate file size and type
      if (!req.file.mimetype.startsWith('image/')) {
        res.status(400).json({ error: 'INVALID_FILE_TYPE', message: 'Yalnızca resim dosyası yüklenebilir.' });
        return;
      }
      newAvatarUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    } else if (req.body && typeof req.body.avatarUrl === 'string') {
      const url = req.body.avatarUrl.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:image/')) {
        res.status(400).json({ error: 'INVALID_URL', message: 'Geçersiz resim bağlantısı. http://, https:// veya data URI olmalıdır.' });
        return;
      }
      newAvatarUrl = url;
    } else {
      res.status(400).json({ error: 'NO_IMAGE', message: 'Bir resim dosyası veya geçerli bir resim bağlantısı sağlamalısınız.' });
      return;
    }

    const updated = await dataStore.updateUserProfile(user.id, {
      avatarUrl: newAvatarUrl,
    });

    res.json({
      success: true,
      avatarUrl: newAvatarUrl,
      user: updated,
      message: 'Profil fotoğrafı başarıyla güncellendi.',
    });
  });
});

const bannerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB limit for profile banner
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Yalnızca resim dosyaları (JPEG, PNG, WEBP, GIF) yüklenebilir.'));
    }
    cb(null, true);
  },
});

// POST /api/users/banner - upload or set profile banner
router.post('/banner', (req, res) => {
  bannerUpload.single('file')(req, res, async (err: any) => {
    if (err) {
      res.status(400).json({ error: 'UPLOAD_ERROR', message: err.message || 'Afiş yüklenirken hata oluştu.' });
      return;
    }

    const user = req.user!;
    let newBannerUrl: string | null = null;

    if (req.file) {
      if (!req.file.mimetype.startsWith('image/')) {
        res.status(400).json({ error: 'INVALID_FILE_TYPE', message: 'Yalnızca resim dosyası yüklenebilir.' });
        return;
      }
      newBannerUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    } else if (req.body && typeof req.body.bannerUrl === 'string') {
      const url = req.body.bannerUrl.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:image/')) {
        res.status(400).json({ error: 'INVALID_URL', message: 'Geçersiz resim bağlantısı. http://, https:// veya data URI olmalıdır.' });
        return;
      }
      newBannerUrl = url;
    } else {
      res.status(400).json({ error: 'NO_IMAGE', message: 'Bir resim dosyası veya geçerli bir afiş bağlantısı sağlamalısınız.' });
      return;
    }

    const updated = await dataStore.updateUserProfile(user.id, {
      bannerUrl: newBannerUrl,
    });

    res.json({
      success: true,
      bannerUrl: newBannerUrl,
      user: updated,
      message: 'Profil afişi başarıyla güncellendi.',
    });
  });
});

// DELETE /api/users/banner - remove profile banner
router.delete('/banner', async (req, res) => {
  const user = req.user!;
  const updated = await dataStore.updateUserProfile(user.id, {
    bannerUrl: null,
  });
  res.json({
    success: true,
    user: updated,
    message: 'Profil afişi kaldırıldı.',
  });
});

// GET /api/users/me/blocked - get blocked users list
router.get('/me/blocked', async (req, res) => {
  const currentUserId = req.user!.id;
  const blockedUsers = await dataStore.getBlockedUsers(currentUserId);
  res.json({
    success: true,
    blockedUsers: blockedUsers.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      bannerUrl: u.bannerUrl || null,
      accentColor: u.accentColor || null,
      bio: u.bio || null,
    })),
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
      bannerUrl: u.bannerUrl || null,
      accentColor: u.accentColor || null,
      isAdmin: u.isAdmin,
    })),
  });
});

// GET /api/users/:id - get another user's public profile (bio, displayName, avatar, roles)
router.get('/:id', async (req, res) => {
  const targetId = req.params.id;
  const user = await dataStore.getUserById(targetId);

  if (!user || user.status === 'blocked') {
    res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Kullanıcı bulunamadı.' });
    return;
  }

  res.json({
    user: {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bannerUrl: user.bannerUrl || null,
      accentColor: user.accentColor || null,
      bio: user.bio || null,
      isAdmin: user.isAdmin,
      isModerator: user.isModerator,
      isFamily: !!user.isFamily,
      groupAddPrivacy: user.groupAddPrivacy || 'everyone',
      createdAt: user.createdAt,
      lastActiveAt: user.lastActiveAt,
    },
  });
});

// GET /api/users/:id/relationship - get relationship status (friends, blocked, friend request)
router.get('/:id/relationship', async (req, res) => {
  const currentUserId = req.user!.id;
  const targetId = req.params.id;
  const relationship = await dataStore.getUserRelationship(currentUserId, targetId);
  res.json({ success: true, relationship });
});

// POST /api/users/:id/block - block user
router.post('/:id/block', async (req, res) => {
  const currentUserId = req.user!.id;
  const targetId = req.params.id;
  if (currentUserId === targetId) {
    res.status(400).json({ error: 'CANNOT_BLOCK_SELF', message: 'Kendinizi engelleyemezsiniz.' });
    return;
  }
  await dataStore.blockUser(currentUserId, targetId);
  res.json({ success: true, message: 'Kullanıcı engellendi.' });
});

// POST /api/users/:id/unblock - unblock user
router.post('/:id/unblock', async (req, res) => {
  const currentUserId = req.user!.id;
  const targetId = req.params.id;
  await dataStore.unblockUser(currentUserId, targetId);
  res.json({ success: true, message: 'Kullanıcının engeli kaldırıldı.' });
});

export const usersRouter = router;
