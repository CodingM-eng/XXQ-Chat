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

  // If user state is rejected, immediately deny access with explicit rejection status
  if (user.status === 'rejected') {
    res.status(403).json({
      error: 'ACCESS_DENIED_REJECTED',
      message: 'Beyaz liste erişim başvurunuz bir yönetici veya yetkili moderatör tarafından onaylanmamıştır (Reddedildi).',
      email: user.email,
      status: 'rejected',
      whitelistActive: true,
    });
    return;
  }

  // If user state is pending, immediately deny access
  if (user.status === 'pending') {
    await dataStore.recordPendingAccess(user.email, user.displayName, user.avatarUrl);
    res.status(403).json({
      error: 'ACCESS_DENIED_NOT_WHITELISTED',
      message: 'XXQ Chat şu anda kısıtlı beyaz liste modunda çalışmaktadır. Hesabınız henüz bir yönetici veya yetkili moderatör tarafından onaylanmamıştır.',
      email: user.email,
      status: 'pending',
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
    const pendingReq = await dataStore.getPendingAccessRequestByEmail(user.email);
    const isRejected = pendingReq?.status === 'rejected';

    await dataStore.recordPendingAccess(user.email, user.displayName, user.avatarUrl);
    res.status(403).json({
      error: isRejected ? 'ACCESS_DENIED_REJECTED' : 'ACCESS_DENIED_NOT_WHITELISTED',
      message: isRejected
        ? 'Beyaz liste erişim başvurunuz bir yönetici veya yetkili moderatör tarafından onaylanmamıştır (Reddedildi).'
        : 'XXQ Chat şu anda kısıtlı beyaz liste modunda çalışmaktadır. Hesabınız henüz bir yönetici veya yetkili moderatör tarafından onaylanmamıştır.',
      email: user.email,
      status: isRejected ? 'rejected' : 'pending',
      whitelistActive: true,
    });
    return;
  }

  next();
}
