import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireAdmin } from '../auth/index.js';
import { dataStore } from '../db/index.js';
import { TelegramBotService } from '../services/telegram.js';

const router = Router();

// Rate limiter for public Telegram webhooks to prevent DDoS / spam
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'RATE_LIMIT_EXCEEDED' },
});

// GET /api/telegram/bots (Admin only)
router.get('/bots', requireAuth, requireAdmin, async (req, res) => {
  try {
    const bots = await dataStore.getTelegramBots();
    // Strictly sanitize and never return encryptedToken or webhookSecretToken
    const sanitized = bots.map((b) => ({
      id: b.id,
      botName: b.botName,
      username: b.username,
      isEnabled: b.isEnabled,
      customCommands: b.customCommands,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    }));

    res.json({ bots: sanitized });
  } catch (err: any) {
    res.status(500).json({ error: 'DB_ERROR', message: err.message });
  }
});

// POST /api/telegram/bots (Admin only)
const addBotSchema = z.object({
  token: z.string().min(10, 'Geçerli bir Telegram bot belirteci giriniz.'),
  customCommands: z
    .array(
      z.object({
        command: z.string().min(1),
        response: z.string().min(1),
        description: z.string().optional(),
      })
    )
    .optional(),
});

router.post('/bots', requireAuth, requireAdmin, async (req, res) => {
  const parseResult = addBotSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: 'Geçersiz bot belirteci veya parametreler.' });
    return;
  }

  const { token, customCommands = [] } = parseResult.data;
  const user = req.user!;

  try {
    const bot = await TelegramBotService.registerBot(token, customCommands);

    await dataStore.recordAuditLog({
      actorId: user.id,
      actorEmail: user.email,
      action: 'TELEGRAM_BOT_ADDED',
      target: `@${bot.username}`,
      details: `@${bot.username} (${bot.botName}) botu sisteme eklendi`,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      bot: {
        id: bot.id,
        botName: bot.botName,
        username: bot.username,
        isEnabled: bot.isEnabled,
        customCommands: bot.customCommands,
        createdAt: bot.createdAt,
      },
      message: `@${bot.username} botu başarıyla bağlandı.`,
    });
  } catch (err: any) {
    console.error('[TELEGRAM BOT REGISTER ERROR]', err);
    res.status(400).json({ error: 'BOT_REGISTER_ERROR', message: err.message });
  }
});

// POST /api/telegram/bots/:id/toggle (Admin only - start or stop bot)
router.post('/bots/:id/toggle', requireAuth, requireAdmin, async (req, res) => {
  const id = req.params.id as string;
  const user = req.user!;
  const { isEnabled } = req.body;

  if (typeof isEnabled !== 'boolean') {
    res.status(400).json({ error: 'INVALID_INPUT', message: 'isEnabled alanı boolean olmalıdır.' });
    return;
  }

  const bot = await dataStore.getTelegramBotById(id);
  if (!bot) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Bot bulunamadı.' });
    return;
  }

  const updated = await dataStore.updateTelegramBot(id, { isEnabled });
  if (!updated) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Bot bulunamadı.' });
    return;
  }

  // Manage webhook registration according to enabled state
  if (isEnabled) {
    await TelegramBotService.setupWebhookAndCommands(updated);
  } else {
    await TelegramBotService.deleteWebhook(bot);
  }

  await dataStore.recordAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: isEnabled ? 'TELEGRAM_BOT_STARTED' : 'TELEGRAM_BOT_STOPPED',
    target: `@${bot.username}`,
    details: `@${bot.username} botu ${isEnabled ? 'başlatıldı (webhook aktif)' : 'durduruldu (webhook kaldırıldı)'}`,
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    isEnabled: updated.isEnabled,
    message: isEnabled ? `@${bot.username} botu başlatıldı ve webhook aktif edildi.` : `@${bot.username} botu durduruldu ve webhook kaldırıldı.`,
  });
});

// POST /api/telegram/bots/:id/test (Admin only - verify credentials & webhook status)
router.post('/bots/:id/test', requireAuth, requireAdmin, async (req, res) => {
  const id = req.params.id as string;

  try {
    const bot = await dataStore.getTelegramBotById(id);
    if (!bot) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Bot bulunamadı.' });
      return;
    }

    const testResult = await TelegramBotService.testBot(bot);
    res.json({
      success: true,
      bot: {
        id: bot.id,
        botName: testResult.botInfo.botName,
        username: testResult.botInfo.username,
        isEnabled: bot.isEnabled,
      },
      webhookInfo: testResult.webhookInfo,
      message: `@${testResult.botInfo.username} bağlantısı başarıyla doğrulandı.`,
    });
  } catch (err: any) {
    console.error('[TELEGRAM BOT TEST ERROR]', err);
    res.status(400).json({ error: 'BOT_TEST_ERROR', message: err.message || 'Bot bağlantı testi başarısız oldu.' });
  }
});

// PUT /api/telegram/bots/:id/token (Admin only - replace / rotate bot token)
const replaceTokenSchema = z.object({
  token: z.string().min(10, 'Geçerli bir Telegram bot belirteci giriniz.'),
});

router.put('/bots/:id/token', requireAuth, requireAdmin, async (req, res) => {
  const id = req.params.id as string;
  const parseResult = replaceTokenSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: 'Geçersiz bot belirteci.' });
    return;
  }

  const { token } = parseResult.data;
  const user = req.user!;

  try {
    const updated = await TelegramBotService.replaceToken(id, token);

    await dataStore.recordAuditLog({
      actorId: user.id,
      actorEmail: user.email,
      action: 'TELEGRAM_BOT_TOKEN_REPLACED',
      target: `@${updated.username}`,
      details: `@${updated.username} bot belirteci yenilendi ve webhook güncellendi`,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      bot: {
        id: updated.id,
        botName: updated.botName,
        username: updated.username,
        isEnabled: updated.isEnabled,
        customCommands: updated.customCommands,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
      message: `@${updated.username} bot belirteci başarıyla yenilendi.`,
    });
  } catch (err: any) {
    console.error('[TELEGRAM BOT REPLACE TOKEN ERROR]', err);
    res.status(400).json({ error: 'TOKEN_REPLACE_ERROR', message: err.message });
  }
});

// PATCH /api/telegram/bots/:id/commands (Admin only)
const updateCommandsSchema = z.object({
  customCommands: z.array(
    z.object({
      command: z.string().min(1),
      response: z.string().min(1),
      description: z.string().optional(),
    })
  ),
});

router.patch('/bots/:id/commands', requireAuth, requireAdmin, async (req, res) => {
  const id = req.params.id as string;
  const parseResult = updateCommandsSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: 'Geçersiz komut yapılandırması.' });
    return;
  }

  const { customCommands } = parseResult.data;

  const bot = await dataStore.getTelegramBotById(id);
  if (!bot) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Bot bulunamadı.' });
    return;
  }

  const updated = await dataStore.updateTelegramBot(id, { customCommands });
  if (updated && updated.isEnabled) {
    await TelegramBotService.setupWebhookAndCommands(updated);
  }

  res.json({ success: true, customCommands: updated?.customCommands || [], message: 'Komutlar başarıyla güncellendi.' });
});

// DELETE /api/telegram/bots/:id (Admin only)
router.delete('/bots/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = req.params.id as string;
  const user = req.user!;

  const bot = await dataStore.getTelegramBotById(id);
  if (!bot) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Bot bulunamadı.' });
    return;
  }

  // Remove webhook from Telegram before deleting
  await TelegramBotService.deleteWebhook(bot);

  await dataStore.deleteTelegramBot(id);

  await dataStore.recordAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: 'TELEGRAM_BOT_REMOVED',
    target: `@${bot.username}`,
    details: `@${bot.username} botu ve webhook kaydı sistemden silindi`,
    ipAddress: req.ip,
  });

  res.json({ success: true, message: `@${bot.username} botu silindi.` });
});

// POST /api/telegram/webhook/:botId (PUBLIC Telegram Webhook Endpoint)
router.post('/webhook/:botId', webhookLimiter, async (req, res) => {
  const botId = req.params.botId as string;
  const secretToken = req.headers['x-telegram-bot-api-secret-token'] as string | undefined;

  try {
    const bot = await dataStore.getTelegramBotById(botId);
    if (!bot) {
      res.status(404).json({ ok: false, error: 'BOT_NOT_FOUND' });
      return;
    }

    const result = await TelegramBotService.handleWebhookUpdate(bot, secretToken, req.body);
    if (!result.handled && result.reason === 'UNAUTHORIZED_SECRET_TOKEN') {
      res.status(403).json({ ok: false, error: 'FORBIDDEN' });
      return;
    }

    // Always respond 200 OK to Telegram
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[TELEGRAM WEBHOOK ERROR]', err);
    res.status(200).json({ ok: true }); // Telegram repeats on non-200, return 200 to acknowledge
  }
});

export const telegramRouter = router;
