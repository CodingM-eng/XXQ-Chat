import { Request, Response, NextFunction } from 'express';
import { isWhitelistModeEnabled, isEmailWhitelisted, dataStore } from '../db/index.js';

export async function enforceWhitelist(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = req.user;

  if (!user) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Yetkilendirme gereklidir.' });
    return;
  }

  // Administrators always have full access
  if (user.isAdmin) {
    return next();
  }

  // If user state is pending, immediately deny access
  if (user.status === 'pending') {
    await dataStore.recordPendingAccess(user.email, user.displayName, user.avatarUrl);
    res.status(403).json({
      error: 'ACCESS_DENIED_NOT_WHITELISTED',
      message: 'XXQ Chat şu anda kısıtlı beyaz liste modunda çalışmaktadır. Hesabınız henüz bir yönetici tarafından onaylanmamıştır.',
      email: user.email,
      whitelistActive: true,
    });
    return;
  }

  // Check if whitelist mode is currently enabled
  const whitelistEnabled = await isWhitelistModeEnabled();

  if (!whitelistEnabled) {
    // Whitelist is OFF, all authenticated users are permitted
    return next();
  }

  // Whitelist is ON: verify if user's email is explicitly approved
  const approved = await isEmailWhitelisted(user.email);

  if (!approved) {
    await dataStore.recordPendingAccess(user.email, user.displayName, user.avatarUrl);
    res.status(403).json({
      error: 'ACCESS_DENIED_NOT_WHITELISTED',
      message: 'XXQ Chat şu anda kısıtlı beyaz liste modunda çalışmaktadır. Hesabınız henüz bir yönetici tarafından onaylanmamıştır.',
      email: user.email,
      whitelistActive: true,
    });
    return;
  }

  next();
}
