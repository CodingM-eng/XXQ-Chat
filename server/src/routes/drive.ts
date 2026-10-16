import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../auth/index.js';
import { dataStore } from '../db/index.js';
import { GoogleDriveService } from '../services/drive.js';

const router = Router();

// GET /api/drive/auth-url (Admin only)
router.get('/auth-url', requireAuth, requireAdmin, (req, res) => {
  try {
    const authUrl = GoogleDriveService.getAuthUrl();
    res.json({ authUrl });
  } catch (err: any) {
    res.status(400).json({ error: 'CONFIG_ERROR', message: err.message });
  }
});

// POST /api/drive/connect (Admin only)
const connectSchema = z.object({
  code: z.string().min(1, 'Yetkilendirme kodu gereklidir.'),
});

router.post('/connect', requireAuth, requireAdmin, async (req, res) => {
  const parseResult = connectSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: 'Geçersiz yetkilendirme kodu.' });
    return;
  }

  const { code } = parseResult.data;
  const user = req.user!;

  try {
    const driveAccount = await GoogleDriveService.exchangeCodeAndConnect(code);

    await dataStore.recordAuditLog({
      actorId: user.id,
      actorEmail: user.email,
      action: 'DRIVE_ACCOUNT_CONNECTED',
      target: driveAccount.email,
      details: `${driveAccount.email} Google Drive hesabı depolama alanı olarak bağlandı`,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      account: {
        id: driveAccount.id,
        email: driveAccount.email,
        displayName: driveAccount.displayName,
        spaceUsed: driveAccount.spaceUsed,
        spaceTotal: driveAccount.spaceTotal,
        createdAt: driveAccount.createdAt,
      },
      message: `${driveAccount.email} Google Drive hesabı başarıyla bağlandı.`,
    });
  } catch (err: any) {
    console.error('[DRIVE CONNECT ERROR]', err);
    res.status(500).json({ error: 'DRIVE_CONNECT_ERROR', message: err.message });
  }
});

// GET /api/drive/accounts (Admin only)
router.get('/accounts', requireAuth, requireAdmin, async (req, res) => {
  try {
    const accounts = await dataStore.getDriveAccounts();
    // Strictly sanitize and exclude encryptedRefreshToken
    const sanitized = accounts.map((acc) => ({
      id: acc.id,
      email: acc.email,
      displayName: acc.displayName,
      folderId: acc.folderId,
      spaceUsed: acc.spaceUsed,
      spaceTotal: acc.spaceTotal,
      createdAt: acc.createdAt,
      updatedAt: acc.updatedAt,
    }));

    res.json({ accounts: sanitized });
  } catch (err: any) {
    res.status(500).json({ error: 'DB_ERROR', message: err.message });
  }
});

// DELETE /api/drive/accounts/:id (Admin only)
router.delete('/accounts/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = req.params.id as string;
  const user = req.user!;

  try {
    const account = await dataStore.getDriveAccountById(id);
    if (!account) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Drive hesabı bulunamadı.' });
      return;
    }

    const removed = await dataStore.removeDriveAccount(id);
    if (removed) {
      await dataStore.recordAuditLog({
        actorId: user.id,
        actorEmail: user.email,
        action: 'DRIVE_ACCOUNT_DISCONNECTED',
        target: account.email,
        details: `${account.email} Google Drive hesabının bağlantısı kaldırıldı`,
        ipAddress: req.ip,
      });
    }

    res.json({ success: true, message: 'Google Drive hesabı başarıyla kaldırıldı.' });
  } catch (err: any) {
    res.status(500).json({ error: 'DB_ERROR', message: err.message });
  }
});

export const driveRouter = router;
