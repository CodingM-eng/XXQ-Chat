import { Request, Response, NextFunction } from 'express';
import { isWhitelistModeEnabled, isEmailWhitelisted } from '../db/index.js';

export function enforceWhitelist(req: Request, res: Response, next: NextFunction): void {
  const user = req.user;

  if (!user) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
    return;
  }

  // Administrators always have access
  if (user.isAdmin) {
    return next();
  }

  // Check if whitelist mode is currently enabled
  const whitelistEnabled = isWhitelistModeEnabled();

  if (!whitelistEnabled) {
    // Whitelist is OFF, all authenticated users are permitted
    return next();
  }

  // Whitelist is ON: verify if user's email is explicitly approved
  const approved = isEmailWhitelisted(user.email);

  if (!approved) {
    res.status(403).json({
      error: 'ACCESS_DENIED_NOT_WHITELISTED',
      message: 'XXQ Chat is currently in restricted whitelist mode. Your account has not been approved by an administrator.',
      email: user.email,
      whitelistActive: true,
    });
    return;
  }

  next();
}
