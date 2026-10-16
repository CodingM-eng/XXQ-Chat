import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { config } from '../config.js';
import { dataStore, isWhitelistModeEnabled, isEmailWhitelisted } from '../db/index.js';

export interface AuthUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName: string;
  avatarUrl?: string;
  isAdmin: boolean;
  isModerator?: boolean;
  onboarded: boolean;
  status: 'active' | 'pending' | 'blocked';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Generate a development JWT token
export function generateDevToken(user: {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  isAdmin?: boolean;
}): string {
  return jwt.sign(
    {
      uid: user.id,
      email: user.email.toLowerCase().trim(),
      name: user.displayName,
      picture: user.avatarUrl,
      isAdmin: !!user.isAdmin,
    },
    config.JWT_DEV_SECRET,
    { expiresIn: '7d' }
  );
}

// Verify Firebase ID Token cryptographically using Firebase Admin or Google OAuth2 tokeninfo fallback
export async function verifyFirebaseIdToken(idToken: string): Promise<{ uid: string; email: string; displayName: string; avatarUrl?: string } | null> {
  if (!idToken || typeof idToken !== 'string') return null;

  // 1. Try Firebase Admin SDK verification if available
  try {
    if (getApps().length > 0) {
      const decoded = await getAuth().verifyIdToken(idToken);
      if (decoded && decoded.email) {
        return {
          uid: decoded.uid,
          email: decoded.email.toLowerCase().trim(),
          displayName: decoded.name || decoded.email.split('@')[0],
          avatarUrl: decoded.picture || undefined,
        };
      }
    }
  } catch (err: any) {
    // If admin SDK verification fails or is unconfigured, fallback to tokeninfo
  }

  // 2. Fallback to Google OAuth2 tokeninfo verification
  try {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) {
      console.warn('[AUTH] Firebase/Google token verification rejected by Google API:', response.status);
      return null;
    }

    const payload = (await response.json()) as any;

    if (!payload || !payload.email || !payload.sub) {
      console.warn('[AUTH] Incomplete token payload from Google API');
      return null;
    }

    // Verify audience matches FIREBASE_PROJECT_ID if specified
    if (config.FIREBASE_PROJECT_ID && payload.aud && payload.aud !== config.FIREBASE_PROJECT_ID) {
      console.warn(`[AUTH] Token audience mismatch: expected ${config.FIREBASE_PROJECT_ID}, got ${payload.aud}`);
      return null;
    }

    const email = payload.email.toLowerCase().trim();
    const uid = payload.sub || 'usr_' + Buffer.from(email).toString('hex').slice(0, 16);
    const displayName = payload.name || email.split('@')[0];
    const avatarUrl = payload.picture || undefined;

    return { uid, email, displayName, avatarUrl };
  } catch (err: any) {
    console.error('[AUTH] Failed to verify token with Google API:', err.message);
    return null;
  }
}

// Authorize user with strict whitelist enforcement:
// When whitelist mode is ON, unapproved authenticated accounts must be denied access BEFORE becoming active XXQ Chat users.
// They must NOT have full active user profiles created, nor appear in user directories, search, conversation suggestions, or presence.
export async function authorizeUser(user: {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}): Promise<AuthUser> {
  const normalizedEmail = user.email.toLowerCase().trim();
  const isInitialAdmin = config.INITIAL_ADMIN_EMAIL && normalizedEmail === config.INITIAL_ADMIN_EMAIL.toLowerCase().trim();
  const existingUser = await dataStore.getUserByEmail(normalizedEmail);
  const isAdmin = isInitialAdmin || existingUser?.isAdmin || false;

  const whitelistActive = await isWhitelistModeEnabled();
  const isApproved = isAdmin || (await isEmailWhitelisted(normalizedEmail));

  // If whitelist mode is ON and account is unapproved:
  if (whitelistActive && !isApproved) {
    // Record pending request in isolated table/collection (admin view only)
    await dataStore.recordPendingAccess(normalizedEmail, user.displayName, user.avatarUrl);

    // Return pending status without adding to users directory
    return {
      id: existingUser?.id || user.id,
      email: normalizedEmail,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      isAdmin: false,
      onboarded: false,
      status: 'pending',
    };
  }

  // Account is authorized (whitelist is OFF, or user is whitelisted / admin):
  const isModerator = existingUser?.isModerator || false;
  const dbUser = await dataStore.upsertUser({
    id: existingUser?.id || user.id,
    email: normalizedEmail,
    displayName: existingUser?.displayName || user.displayName,
    avatarUrl: existingUser?.avatarUrl || user.avatarUrl || null,
    isAdmin,
    isModerator,
    onboarded: existingUser ? existingUser.onboarded : (isAdmin ? true : false),
    status: 'active',
  });

  return {
    id: dbUser.id,
    email: dbUser.email,
    firstName: dbUser.firstName,
    lastName: dbUser.lastName,
    displayName: dbUser.displayName,
    avatarUrl: dbUser.avatarUrl || undefined,
    isAdmin: dbUser.isAdmin,
    isModerator: dbUser.isModerator,
    onboarded: dbUser.onboarded,
    status: dbUser.status,
  };
}

export async function upsertUserAndGetAuth(user: {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}): Promise<AuthUser> {
  return authorizeUser(user);
}

// Verify auth token (supporting server-signed session JWTs or direct Firebase ID tokens)
export async function verifyAuthToken(token: string): Promise<AuthUser | null> {
  if (!token) return null;

  // 1. Try server signed session JWT verification
  try {
    const decoded = jwt.verify(token, config.JWT_DEV_SECRET) as any;
    if (decoded && decoded.email) {
      return await authorizeUser({
        id: decoded.uid || 'usr_' + Buffer.from(decoded.email).toString('hex').slice(0, 16),
        email: decoded.email,
        displayName: decoded.name || decoded.email.split('@')[0],
        avatarUrl: decoded.picture || undefined,
      });
    }
  } catch (err) {
    // Session token invalid or expired, check if it's a raw Firebase ID token
  }

  // 2. Verify as Firebase ID token directly
  const verifiedFirebase = await verifyFirebaseIdToken(token);
  if (verifiedFirebase) {
    return await authorizeUser({
      id: verifiedFirebase.uid,
      email: verifiedFirebase.email,
      displayName: verifiedFirebase.displayName,
      avatarUrl: verifiedFirebase.avatarUrl,
    });
  }

  return null;
}

// Express authentication middleware
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Yetkilendirme başlığı eksik veya geçersiz.' });
    return;
  }

  const token = authHeader.split('Bearer ')[1].trim();
  const user = await verifyAuthToken(token);

  if (!user) {
    res.status(401).json({ error: 'INVALID_TOKEN', message: 'Geçersiz veya süresi dolmuş yetkilendirme belirteci.' });
    return;
  }

  req.user = user;
  next();
}

// Admin only middleware
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Giriş yapmanız gerekmektedir.' });
    return;
  }

  if (!req.user.isAdmin) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Bu işlem için yönetici yetkisi gereklidir.' });
    return;
  }

  next();
}

// Admin or Moderator middleware
export function requireModerator(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Giriş yapmanız gerekmektedir.' });
    return;
  }

  if (!req.user.isAdmin && !req.user.isModerator) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Bu işlem için moderatör veya yönetici yetkisi gereklidir.' });
    return;
  }

  next();
}

