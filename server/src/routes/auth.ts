import { Router } from 'express';
import { z } from 'zod';
import { generateDevToken, requireAuth, verifyFirebaseIdToken, upsertUserAndGetAuth } from '../auth/index.js';
import { isWhitelistModeEnabled, isEmailWhitelisted, db } from '../db/index.js';
import { config } from '../config.js';

const router = Router();

// Endpoint to verify current session and whitelist status
router.get('/session', requireAuth, (req, res) => {
  const user = req.user!;
  const whitelistMode = isWhitelistModeEnabled();
  const whitelisted = isEmailWhitelisted(user.email);

  res.json({
    user,
    whitelist: {
      modeActive: whitelistMode,
      isApproved: user.isAdmin || whitelisted,
      canAccessApp: !whitelistMode || user.isAdmin || whitelisted,
    },
  });
});

// Production Google/Firebase Sign-In endpoint
const googleAuthSchema = z.object({
  idToken: z.string().min(10, 'Google ID belirteci gereklidir.'),
});

router.post(['/google', '/firebase'], async (req, res) => {
  const parseResult = googleAuthSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: 'Geçersiz kimlik doğrulama verisi.', details: parseResult.error.format() });
    return;
  }

  const { idToken } = parseResult.data;
  const verifiedUser = await verifyFirebaseIdToken(idToken);

  if (!verifiedUser) {
    res.status(401).json({
      error: 'INVALID_CREDENTIALS',
      message: 'Google kimlik doğrulama belirteci doğrulanamadı veya süresi doldu.',
    });
    return;
  }

  // Server-side upsert with verified claims from Google
  const user = upsertUserAndGetAuth({
    id: verifiedUser.uid,
    email: verifiedUser.email,
    displayName: verifiedUser.displayName,
    avatarUrl: verifiedUser.avatarUrl,
  });

  const token = generateDevToken({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    isAdmin: user.isAdmin,
  });

  const whitelistMode = isWhitelistModeEnabled();
  const whitelisted = isEmailWhitelisted(user.email);

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      isAdmin: user.isAdmin,
    },
    whitelist: {
      modeActive: whitelistMode,
      isApproved: user.isAdmin || whitelisted,
      canAccessApp: !whitelistMode || user.isAdmin || whitelisted,
    },
  });
});

// Development / Test sign-in endpoint (strictly disabled in production)
const devLoginSchema = z.object({
  email: z.string().email('Geçerli bir e-posta adresi girin.'),
  displayName: z.string().min(1).max(50).optional(),
});

router.post('/dev-login', (req, res) => {
  // Security guard: Never allow development bypass in production environments
  if (config.NODE_ENV === 'production') {
    res.status(403).json({
      error: 'DEV_LOGIN_DISABLED',
      message: 'Geliştirici girişi üretim ortamında güvenlik nedeniyle devre dışıdır. Lütfen Google ile giriş yapın.',
    });
    return;
  }

  const parseResult = devLoginSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const { email, displayName } = parseResult.data;
  const normalizedEmail = email.toLowerCase().trim();
  const isInitialAdmin = normalizedEmail === config.INITIAL_ADMIN_EMAIL.toLowerCase().trim();

  // Check if user exists in DB
  let userRow = db.prepare('SELECT id, email, display_name, avatar_url, is_admin FROM users WHERE LOWER(email) = ?').get(normalizedEmail) as any;

  if (!userRow) {
    const id = 'usr_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const name = displayName || normalizedEmail.split('@')[0];
    db.prepare(`
      INSERT INTO users (id, email, display_name, is_admin)
      VALUES (?, ?, ?, ?)
    `).run(id, normalizedEmail, name, isInitialAdmin ? 1 : 0);

    userRow = {
      id,
      email: normalizedEmail,
      display_name: name,
      avatar_url: null,
      is_admin: isInitialAdmin ? 1 : 0,
    };
  }

  const token = generateDevToken({
    id: userRow.id,
    email: userRow.email,
    displayName: userRow.display_name,
    avatarUrl: userRow.avatar_url || undefined,
    isAdmin: userRow.is_admin === 1,
  });

  const whitelistMode = isWhitelistModeEnabled();
  const whitelisted = isEmailWhitelisted(userRow.email);

  res.json({
    token,
    user: {
      id: userRow.id,
      email: userRow.email,
      displayName: userRow.display_name,
      avatarUrl: userRow.avatar_url,
      isAdmin: userRow.is_admin === 1,
    },
    whitelist: {
      modeActive: whitelistMode,
      isApproved: userRow.is_admin === 1 || whitelisted,
      canAccessApp: !whitelistMode || userRow.is_admin === 1 || whitelisted,
    },
  });
});

export const authRouter = router;
