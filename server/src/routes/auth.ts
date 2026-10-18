import { Router } from 'express';
import { z } from 'zod';
import { generateDevToken, requireAuth, verifyFirebaseIdToken, authorizeUser } from '../auth/index.js';
import { isWhitelistModeEnabled, isEmailWhitelisted } from '../db/index.js';
import { config } from '../config.js';

const router = Router();

// Endpoint to verify current session and whitelist status
router.get('/session', requireAuth, async (req, res) => {
  const user = req.user!;
  const whitelistMode = await isWhitelistModeEnabled();
  const whitelisted = await isEmailWhitelisted(user.email);
  const isApproved = user.isAdmin || whitelisted;

  res.json({
    user,
    whitelist: {
      modeActive: whitelistMode,
      isApproved,
      canAccessApp: !whitelistMode || isApproved,
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

  // Server-side authorization check & conditional user upsert
  const user = await authorizeUser({
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

  const whitelistMode = await isWhitelistModeEnabled();
  const whitelisted = await isEmailWhitelisted(user.email);
  const isApproved = user.isAdmin || whitelisted;

  res.json({
    token,
    user,
    whitelist: {
      modeActive: whitelistMode,
      isApproved,
      canAccessApp: !whitelistMode || isApproved,
    },
  });
});

// Development / Test sign-in endpoint (strictly disabled in production)
const devLoginSchema = z.object({
  email: z.string().email('Geçerli bir e-posta adresi girin.'),
  displayName: z.string().min(1).max(50).optional(),
});

router.post('/dev-login', async (req, res) => {
  // Allow dev login in development, or if explicitly enabled via ALLOW_DEV_LOGIN, or when Firebase is not configured
  const allowDevLogin = process.env.ALLOW_DEV_LOGIN === 'true' || config.NODE_ENV !== 'production' || !config.FIREBASE_PROJECT_ID;
  if (!allowDevLogin) {
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
  const uid = 'usr_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);

  const user = await authorizeUser({
    id: uid,
    email: normalizedEmail,
    displayName: displayName || normalizedEmail.split('@')[0],
  });

  const token = generateDevToken({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    isAdmin: user.isAdmin,
  });

  const whitelistMode = await isWhitelistModeEnabled();
  const whitelisted = await isEmailWhitelisted(user.email);
  const isApproved = user.isAdmin || whitelisted;

  res.json({
    token,
    user,
    whitelist: {
      modeActive: whitelistMode,
      isApproved,
      canAccessApp: !whitelistMode || isApproved,
    },
  });
});

export const authRouter = router;
