import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../auth/index.js';
import { dataStore } from '../db/index.js';
import { GoogleDriveService } from '../services/drive.js';

const router = Router();

// GET /api/drive/auth-url (Admin only)
router.get('/auth-url', requireAuth, requireAdmin, (req, res) => {
  try {
    const status = GoogleDriveService.getStatus();
    if (!status.isConfigured) {
      res.status(400).json({
        error: 'CONFIG_ERROR',
        message: status.errorMessageTr || 'Google Drive OAuth yapılandırması eksik. Lütfen Render ortam değişkenlerini tanımlayın.',
        missingSettings: status.missingSettings,
        redirectUri: status.redirectUri,
      });
      return;
    }

    const state = GoogleDriveService.generateState(req.user?.id);
    const authUrl = GoogleDriveService.getAuthUrl(state);
    res.json({ authUrl, state, redirectUri: status.redirectUri });
  } catch (err: any) {
    res.status(400).json({
      error: 'CONFIG_ERROR',
      message: err.message,
      missingSettings: GoogleDriveService.getStatus().missingSettings,
    });
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

  const status = GoogleDriveService.getStatus();
  if (!status.isConfigured) {
    res.status(400).json({
      error: 'CONFIG_ERROR',
      message: status.errorMessageTr || 'Google Drive OAuth yapılandırması eksik. Lütfen Render ortam değişkenlerini tanımlayın.',
      missingSettings: status.missingSettings,
      redirectUri: status.redirectUri,
    });
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

// GET /api/drive/status (Admin only) - returns current Drive config and account status
router.get('/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const configStatus = GoogleDriveService.getStatus();
    const accounts = await dataStore.getDriveAccounts();
    res.json({
      ...configStatus,
      accountsCount: accounts.length,
      hasActiveAccount: accounts.length > 0,
      accounts: accounts.map((acc) => ({
        id: acc.id,
        email: acc.email,
        displayName: acc.displayName,
        spaceUsed: acc.spaceUsed,
        spaceTotal: acc.spaceTotal,
        createdAt: acc.createdAt,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'STATUS_ERROR', message: err.message });
  }
});

// POST /api/drive/accounts/:id/sync (Admin only) - syncs storage quota for a connected Drive account
router.post('/accounts/:id/sync', requireAuth, requireAdmin, async (req, res) => {
  const id = req.params.id as string;
  try {
    const account = await dataStore.getDriveAccountById(id);
    if (!account) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Drive hesabı bulunamadı.' });
      return;
    }

    const quota = await GoogleDriveService.syncAccountQuota(account);
    res.json({
      success: true,
      quota,
      message: `${account.email} hesabı depolama kotası başarıyla güncellendi.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'SYNC_ERROR', message: err.message });
  }
});

// GET /api/drive/callback - Google OAuth 2.0 redirect target
router.get('/callback', async (req, res) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const error = req.query.error as string | undefined;

  const frontendUrl = (process.env.CORS_ORIGIN || '').split(',')[0].trim().replace(/\/$/, '') || 'https://xxq-chat-frontend.onrender.com';

  if (error) {
    res.status(400).send(`
      <!DOCTYPE html>
      <html lang="tr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>XXQ Chat - Google Drive Bağlantı Hatası</title>
        <style>
          body { background-color: #090710; color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
          .card { background-color: #120f1e; border: 1px solid #3b1d54; border-radius: 20px; padding: 32px; max-width: 480px; width: 100%; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
          h1 { color: #f87171; font-size: 20px; margin-top: 0; }
          p { color: #94a3b8; font-size: 14px; line-height: 1.5; }
          .btn { display: inline-block; background-color: #7c3aed; color: #fff; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 13px; margin-top: 20px; border: none; cursor: pointer; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Google Drive Yetkilendirmesi Başarısız</h1>
          <p>Google OAuth izni onaylanmadı veya reddedildi: <strong>${error}</strong></p>
          <p>Lütfen XXQ Chat Yönetim Paneline dönerek bağlantıyı tekrar deneyin.</p>
          <a href="${frontendUrl}" class="btn">XXQ Chat'e Dön</a>
        </div>
      </body>
      </html>
    `);
    return;
  }

  // Validate OAuth state parameter to prevent CSRF
  if (!state || !GoogleDriveService.verifyState(state)) {
    res.status(400).send(`
      <!DOCTYPE html>
      <html lang="tr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>XXQ Chat - Güvenlik Doğrulaması Başarısız</title>
        <style>
          body { background-color: #090710; color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
          .card { background-color: #120f1e; border: 1px solid #3b1d54; border-radius: 20px; padding: 32px; max-width: 480px; width: 100%; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
          h1 { color: #f87171; font-size: 20px; margin-top: 0; }
          p { color: #94a3b8; font-size: 14px; line-height: 1.5; }
          .btn { display: inline-block; background-color: #7c3aed; color: #fff; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 13px; margin-top: 20px; border: none; cursor: pointer; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Güvenlik Doğrulaması Başarısız</h1>
          <p>OAuth durum parametresi (state) geçersiz veya süresi dolmuş. Olası bir yetkisiz yönlendirmeyi önlemek amacıyla istek reddedildi.</p>
          <p>Lütfen XXQ Chat Yönetim Paneline dönerek bağlantıyı tekrar başlatın.</p>
          <a href="${frontendUrl}" class="btn">XXQ Chat'e Dön</a>
        </div>
      </body>
      </html>
    `);
    return;
  }

  if (!code) {
    res.status(400).send(`
      <!DOCTYPE html>
      <html lang="tr">
      <head>
        <meta charset="UTF-8">
        <title>XXQ Chat - Yetkilendirme Kodu Eksik</title>
        <style>
          body { background-color: #090710; color: #f1f5f9; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background-color: #120f1e; border: 1px solid #2a2042; border-radius: 16px; padding: 28px; max-width: 440px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2 style="color:#c084fc;">Google Drive Callback</h2>
          <p style="color:#94a3b8; font-size: 13px;">Bu adres Google OAuth geri dönüşüdür. Yetkilendirme kodu bulunamadı.</p>
        </div>
      </body>
      </html>
    `);
    return;
  }

  // Attempt automatic exchange if credentials are fully configured
  let connectedAccountEmail: string | null = null;
  let autoExchangeError: string | null = null;

  try {
    const driveAccount = await GoogleDriveService.exchangeCodeAndConnect(code);
    connectedAccountEmail = driveAccount.email;
    await dataStore.recordAuditLog({
      actorEmail: 'system/oauth-callback',
      action: 'DRIVE_ACCOUNT_CONNECTED',
      target: driveAccount.email,
      details: `${driveAccount.email} Google Drive hesabı OAuth callback üzerinden başarıyla bağlandı`,
      ipAddress: req.ip,
    });
  } catch (err: any) {
    autoExchangeError = err.message;
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>XXQ Chat - Google Drive Bağlantısı</title>
      <style>
        body { background-color: #090710; color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
        .card { background-color: #120f1e; border: 1px solid #2a2042; border-radius: 20px; padding: 32px; max-width: 520px; width: 100%; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
        .badge { display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 18px; background: rgba(124,58,237,0.2); border: 1px solid rgba(124,58,237,0.4); color: #c084fc; margin-bottom: 16px; font-size: 24px; }
        h1 { color: #ffffff; font-size: 20px; margin-top: 0; margin-bottom: 8px; }
        p { color: #94a3b8; font-size: 13px; line-height: 1.5; margin: 8px 0; }
        .code-box { background: #07050d; border: 1px dashed #4c1d95; border-radius: 12px; padding: 12px; font-family: monospace; font-size: 12px; color: #e9d5ff; word-break: break-all; margin: 16px 0; user-select: all; text-align: left; }
        .btn { display: inline-block; background-color: #7c3aed; color: #fff; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 13px; margin-top: 12px; border: none; cursor: pointer; transition: background 0.2s; }
        .btn:hover { background-color: #6d28d9; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">✓</div>
        <h1>Google Drive Yetkilendirmesi Başarılı</h1>
        ${
          connectedAccountEmail
            ? `<p style="color:#4ade80;"><strong>${connectedAccountEmail}</strong> hesabı başarıyla XXQ Chat depolama alanına bağlandı.</p>`
            : `<p>Aşağıdaki yetkilendirme kodunu XXQ Chat Yönetim Paneline yapıştırarak bağlantıyı tamamlayabilirsiniz:</p>
               <div class="code-box">${code}</div>`
        }
        <p>Pencere birkaç saniye içinde otomatik olarak kapanacaktır.</p>
        <a href="${frontendUrl}" class="btn" id="returnBtn">XXQ Chat'e Dön</a>
      </div>
      <script>
        // Notify parent / opener window if opened in a popup
        try {
          if (window.opener) {
            window.opener.postMessage({
              type: 'XXQ_DRIVE_OAUTH_CODE',
              code: ${JSON.stringify(code)},
              email: ${JSON.stringify(connectedAccountEmail || '')}
            }, '*');
            setTimeout(function() { window.close(); }, 2000);
          }
        } catch (e) {}
      </script>
    </body>
    </html>
  `);
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
