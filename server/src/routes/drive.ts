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

    const state = GoogleDriveService.generateState(req.user?.id, status.redirectUri);
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
    console.error('[DRIVE CONNECT ERROR]', err.message || err);
    res.status(400).json({ error: 'OAUTH_ERROR', message: err.message || 'Google Drive yetkilendirme kodu doğrulanamadı.' });
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

// GET & POST /api/drive/callback - Google OAuth 2.0 redirect target
router.all('/callback', async (req, res) => {
  const code = ((req.query.code || req.body?.code) as string | undefined)?.trim();
  const state = ((req.query.state || req.body?.state) as string | undefined)?.trim();
  const error = ((req.query.error || req.body?.error) as string | undefined)?.trim();

  const frontendUrl = (process.env.CORS_ORIGIN || '').split(',')[0].trim().replace(/\/+$/, '') || 'https://xxq-chat-frontend.onrender.com';

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
          <p>Lütfen XXQ Chat Yönetim Paneline dönerek "Drive Ekle" butonundan bağlantıyı tekrar başlatın.</p>
          <a href="${frontendUrl}" class="btn">XXQ Chat'e Dön</a>
        </div>
      </body>
      </html>
    `);
    return;
  }

  // Validate OAuth state parameter to prevent CSRF and retrieve matching redirectUri
  const stateCheck = GoogleDriveService.verifyState(state);
  if (!stateCheck.isValid) {
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
          <p>OAuth durum parametresi (state) geçersiz veya süresi dolmuş. Olası bir yetkisiz yönlendirmeyi veya CSRF saldırısını önlemek amacıyla istek reddedildi.</p>
          <p>Lütfen XXQ Chat Yönetim Paneline dönerek "Drive Ekle" butonuna tıklayıp yeni bir yetkilendirme başlatın.</p>
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
          <p style="color:#94a3b8; font-size: 13px;">Google OAuth yönlendirmesinde yetkilendirme kodu (code) bulunamadı. Lütfen yeni bir yetkilendirme başlatın.</p>
          <a href="${frontendUrl}" style="display:inline-block; margin-top:16px; background:#7c3aed; color:#fff; padding:10px 20px; border-radius:10px; text-decoration:none; font-size:12px;">XXQ Chat'e Dön</a>
        </div>
      </body>
      </html>
    `);
    return;
  }

  // Perform single-use code exchange with the preserved matching redirectUri
  let connectedAccountEmail: string | null = null;
  let autoExchangeError: string | null = null;

  try {
    const redirectUri = stateCheck.redirectUri || GoogleDriveService.getRedirectUri();
    const driveAccount = await GoogleDriveService.exchangeCodeAndConnect(code, redirectUri);
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

  if (connectedAccountEmail) {
    res.send(`
      <!DOCTYPE html>
      <html lang="tr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>XXQ Chat - Google Drive Başarıyla Bağlandı</title>
        <style>
          body { background-color: #090710; color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
          .card { background-color: #120f1e; border: 1px solid #166534; border-radius: 20px; padding: 32px; max-width: 520px; width: 100%; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
          .badge { display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 18px; background: rgba(34,197,94,0.2); border: 1px solid rgba(34,197,94,0.4); color: #4ade80; margin-bottom: 16px; font-size: 24px; }
          h1 { color: #ffffff; font-size: 20px; margin-top: 0; margin-bottom: 8px; }
          p { color: #94a3b8; font-size: 13px; line-height: 1.5; margin: 8px 0; }
          .btn { display: inline-block; background-color: #7c3aed; color: #fff; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 13px; margin-top: 16px; border: none; cursor: pointer; transition: background 0.2s; }
          .btn:hover { background-color: #6d28d9; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">✓</div>
          <h1>Google Drive Başarıyla Bağlandı</h1>
          <p style="color:#4ade80; font-weight:600; font-size:14px;">${connectedAccountEmail} hesabı başarıyla XXQ Chat depolama alanına bağlandı.</p>
          <p>Sohbet ekleri (dosya, görsel, belge) artık bu Google Drive hesabındaki 'XXQ Chat' klasöründe güvenle saklanacaktır.</p>
          <p style="font-size: 12px; color: #64748b; margin-top: 16px;">Bu pencere birkaç saniye içinde otomatik olarak kapanacaktır.</p>
          <a href="${frontendUrl}" class="btn" id="returnBtn">XXQ Chat'e Dön</a>
        </div>
        <script>
          try {
            if (window.opener) {
              window.opener.postMessage({
                type: 'XXQ_DRIVE_OAUTH_SUCCESS',
                email: ${JSON.stringify(connectedAccountEmail)}
              }, '*');
              setTimeout(function() { window.close(); }, 2000);
            }
          } catch (e) {}
        </script>
      </body>
      </html>
    `);
  } else {
    res.status(400).send(`
      <!DOCTYPE html>
      <html lang="tr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>XXQ Chat - Google Drive Bağlantısı Başarısız</title>
        <style>
          body { background-color: #090710; color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
          .card { background-color: #120f1e; border: 1px solid #7f1d1d; border-radius: 20px; padding: 32px; max-width: 520px; width: 100%; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
          .badge { display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 18px; background: rgba(239,68,68,0.2); border: 1px solid rgba(239,68,68,0.4); color: #f87171; margin-bottom: 16px; font-size: 24px; }
          h1 { color: #f87171; font-size: 20px; margin-top: 0; margin-bottom: 8px; }
          p { color: #94a3b8; font-size: 13px; line-height: 1.5; margin: 8px 0; }
          .err-box { background: #1a0f18; border: 1px solid #831843; border-radius: 12px; padding: 12px; color: #fca5a5; font-size: 12px; line-height: 1.5; margin: 16px 0; text-align: left; }
          .btn { display: inline-block; background-color: #7c3aed; color: #fff; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 13px; margin-top: 16px; border: none; cursor: pointer; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">✕</div>
          <h1>Yetkilendirme Başarısız Oldu</h1>
          <div class="err-box">${autoExchangeError || 'Google Drive yetkilendirme kodu doğrulanamadı.'}</div>
          <p>Google yetkilendirme kodları tek kullanımlık ve kısa ömürlüdür. Bir kez başarısız olan veya kullanılan kod tekrar denenemez.</p>
          <p>Lütfen XXQ Chat Yönetim Paneline dönerek <strong>"Drive Ekle"</strong> butonuna tıklayıp yeni bir oturum açma akışı başlatın.</p>
          <a href="${frontendUrl}" class="btn" id="returnBtn">XXQ Chat'e Dön</a>
        </div>
        <script>
          try {
            if (window.opener) {
              window.opener.postMessage({
                type: 'XXQ_DRIVE_OAUTH_FAILED',
                error: ${JSON.stringify(autoExchangeError || 'Yetkilendirme doğrulanamadı.')}
              }, '*');
            }
          } catch (e) {}
        </script>
      </body>
      </html>
    `);
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
