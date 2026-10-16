import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { config } from '../config.js';
import { dataStore } from '../db/index.js';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  isAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Generate a development JWT token
export function generateDevToken(user: { id: string; email: string; displayName: string; avatarUrl?: string; isAdmin?: boolean }): string {
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

// Upsert user into database and return full AuthUser with verified permissions
export async function upsertUserAndGetAuth(user: { id: string; email: string; displayName: string; avatarUrl?: string }): Promise<AuthUser> {
  const dbUser = await dataStore.upsertUser({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  });

  return {
    id: dbUser.id,
    email: dbUser.email,
    displayName: dbUser.displayName,
    avatarUrl: dbUser.avatarUrl || undefined,
    isAdmin: dbUser.isAdmin,
  };
}

// Verify auth token (supporting server-signed session JWTs or direct Firebase ID tokens)
export async function verifyAuthToken(token: string): Promise<AuthUser | null> {
  if (!token) return null;

  // 1. Try server signed session JWT verification
  try {
    const decoded = jwt.verify(token, config.JWT_DEV_SECRET) as any;
    if (decoded && decoded.email) {
      return await upsertUserAndGetAuth({
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
    return await upsertUserAndGetAuth({
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
    res.status(401).json({ error: 'INVALID_TOKEN', message: 'Oturum belirteci geçersiz veya süresi dolmuş.' });
    return;
  }

  req.user = user;
  next();
}

// Admin-only authorization middleware
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Kimlik doğrulaması gereklidir.' });
    return;
  }

  if (!req.user.isAdmin) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Bu işlem için yönetici yetkileri gereklidir.' });
    return;
  }

  next();
}
