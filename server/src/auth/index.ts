import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db } from '../db/index.js';

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

// Verify auth token (supporting Firebase ID tokens or dev tokens)
export async function verifyAuthToken(token: string): Promise<AuthUser | null> {
  if (!token) return null;

  // 1. Try dev JWT verification first
  try {
    const decoded = jwt.verify(token, config.JWT_DEV_SECRET) as any;
    if (decoded && decoded.email) {
      const email = decoded.email.toLowerCase().trim();
      const id = decoded.uid || 'usr_' + Buffer.from(email).toString('hex').slice(0, 16);
      const displayName = decoded.name || email.split('@')[0];
      const avatarUrl = decoded.picture || '';

      // Check admin status from DB or config
      const isInitialAdmin = email === config.INITIAL_ADMIN_EMAIL.toLowerCase().trim();
      const existingUser = db.prepare('SELECT id, is_admin, display_name, avatar_url FROM users WHERE email = ?').get(email) as any;

      let isAdmin = false;
      let effectiveId = id;

      if (existingUser) {
        isAdmin = existingUser.is_admin === 1 || isInitialAdmin;
        effectiveId = existingUser.id;
      } else {
        isAdmin = isInitialAdmin;
        // Upsert user into database
        db.prepare(`
          INSERT INTO users (id, email, display_name, avatar_url, is_admin)
          VALUES (?, ?, ?, ?, ?)
        `).run(id, email, displayName, avatarUrl, isAdmin ? 1 : 0);
      }

      return {
        id: effectiveId,
        email,
        displayName: existingUser?.display_name || displayName,
        avatarUrl: existingUser?.avatar_url || avatarUrl,
        isAdmin,
      };
    }
  } catch (err) {
    // If not valid dev token, proceed to check Firebase
  }

  // 2. If Firebase credentials configured, verify with Firebase Admin
  if (config.FIREBASE_PROJECT_ID && config.FIREBASE_CLIENT_EMAIL && config.FIREBASE_PRIVATE_KEY) {
    try {
      // Lazy load firebase-admin if configured
      // In production environment with service account
      // For now, if firebase-admin is available:
      // const decoded = await admin.auth().verifyIdToken(token);
    } catch (firebaseErr) {
      console.error('Firebase token verification error:', firebaseErr);
      return null;
    }
  }

  return null;
}

// Express authentication middleware
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.split('Bearer ')[1].trim();
  const user = await verifyAuthToken(token);

  if (!user) {
    res.status(401).json({ error: 'INVALID_TOKEN', message: 'Invalid or expired authorization token' });
    return;
  }

  req.user = user;
  next();
}

// Admin-only authorization middleware
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
    return;
  }

  if (!req.user.isAdmin) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Administrator privileges required' });
    return;
  }

  next();
}
