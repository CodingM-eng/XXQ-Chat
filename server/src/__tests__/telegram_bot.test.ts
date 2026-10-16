import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { dataStore } from '../db/index.js';
import { generateDevToken } from '../auth/index.js';
import { TelegramBotService } from '../services/telegram.js';
import { encryptSecret } from '../utils/crypto.js';

describe('XXQ Chat Telegram Bot Integration Suite', () => {
  const adminEmail = 'codingdevelopia@gmail.com';
  let adminToken: string;

  beforeEach(async () => {
    adminToken = generateDevToken({ id: 'adm_1', email: adminEmail, displayName: 'Sistem Yöneticisi', isAdmin: true });
    await dataStore.addToWhitelist(adminEmail, 'system');
    const existingBots = await dataStore.getTelegramBots();
    for (const b of existingBots) {
      await dataStore.deleteTelegramBot(b.id);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects webhook requests with missing or invalid secret token', async () => {
    const bot = await dataStore.addTelegramBot({
      botName: 'Test Bot',
      username: 'xxq_test_bot',
      encryptedToken: encryptSecret('123456:fake_token'),
      webhookSecretToken: 'valid_secret_token_123',
      isEnabled: true,
      customCommands: [],
    });

    const res = await request(app)
      .post(`/api/telegram/webhook/${bot.id}`)
      .set('x-telegram-bot-api-secret-token', 'wrong_secret')
      .send({ update_id: 1001, message: { text: '/start', chat: { id: 999 } } });

    expect(res.status).toBe(403);
    expect(res.body.ok).toBe(false);
  });

  it('processes /start, /yardim, /stat and custom commands with safe output', async () => {
    const sendSpy = vi.spyOn(TelegramBotService, 'sendMessage').mockResolvedValue(true);

    const bot = await dataStore.addTelegramBot({
      botName: 'XXQ Chat Bot',
      username: 'xxq_official_bot',
      encryptedToken: encryptSecret('123456:fake_token_2'),
      webhookSecretToken: 'secret_token_abc',
      isEnabled: true,
      customCommands: [
        { command: 'duyuru', response: 'Sistem bakımdaydı, şimdi aktif!', description: 'Son duyuru' },
      ],
    });

    // 1. Test /start
    const resStart = await request(app)
      .post(`/api/telegram/webhook/${bot.id}`)
      .set('x-telegram-bot-api-secret-token', 'secret_token_abc')
      .send({
        update_id: 101,
        message: { text: '/start', chat: { id: 12345 } },
      });

    expect(resStart.status).toBe(200);
    expect(resStart.body.ok).toBe(true);
    expect(sendSpy).toHaveBeenCalledWith(expect.anything(), 12345, expect.stringContaining('XXQ Chat Botuna Hoş Geldiniz'));

    // 2. Test /yardim
    await request(app)
      .post(`/api/telegram/webhook/${bot.id}`)
      .set('x-telegram-bot-api-secret-token', 'secret_token_abc')
      .send({
        update_id: 102,
        message: { text: '/yardim', chat: { id: 12345 } },
      });

    expect(sendSpy).toHaveBeenCalledWith(expect.anything(), 12345, expect.stringContaining('/stat'));
    expect(sendSpy).toHaveBeenCalledWith(expect.anything(), 12345, expect.stringContaining('/duyuru'));

    // 3. Test /stat (safe aggregated stats only)
    await request(app)
      .post(`/api/telegram/webhook/${bot.id}`)
      .set('x-telegram-bot-api-secret-token', 'secret_token_abc')
      .send({
        update_id: 103,
        message: { text: '/stat', chat: { id: 12345 } },
      });

    expect(sendSpy).toHaveBeenCalledWith(
      expect.anything(),
      12345,
      expect.stringMatching(/Toplam Mesaj|Kayıtlı Kullanıcı|Onaylı Kullanıcı/)
    );
    // Explicit check: ensure NO private tokens or phone numbers exist in the sent text
    const lastCallText = sendSpy.mock.calls[sendSpy.mock.calls.length - 1][2];
    expect(lastCallText).not.toContain('fake_token');
    expect(lastCallText).not.toContain('secret_token');
    expect(lastCallText).not.toContain('+90');

    // 4. Test custom command /duyuru
    await request(app)
      .post(`/api/telegram/webhook/${bot.id}`)
      .set('x-telegram-bot-api-secret-token', 'secret_token_abc')
      .send({
        update_id: 104,
        message: { text: '/duyuru', chat: { id: 12345 } },
      });

    expect(sendSpy).toHaveBeenCalledWith(expect.anything(), 12345, 'Sistem bakımdaydı, şimdi aktif!');
  });

  it('ensures webhook idempotency by ignoring duplicate update_ids', async () => {
    const sendSpy = vi.spyOn(TelegramBotService, 'sendMessage').mockResolvedValue(true);

    const bot = await dataStore.addTelegramBot({
      botName: 'Idempotency Bot',
      username: 'xxq_idem_bot',
      encryptedToken: encryptSecret('tok_123'),
      webhookSecretToken: 'sec_idem',
      isEnabled: true,
      customCommands: [],
    });

    const updatePayload = {
      update_id: 99991,
      message: { text: '/start', chat: { id: 888 } },
    };

    // First delivery
    await request(app)
      .post(`/api/telegram/webhook/${bot.id}`)
      .set('x-telegram-bot-api-secret-token', 'sec_idem')
      .send(updatePayload);

    expect(sendSpy).toHaveBeenCalledTimes(1);

    // Duplicate delivery with same update_id
    await request(app)
      .post(`/api/telegram/webhook/${bot.id}`)
      .set('x-telegram-bot-api-secret-token', 'sec_idem')
      .send(updatePayload);

    // Should NOT call sendMessage a second time
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('manages Telegram bots via admin CRUD endpoints', async () => {
    // Mock getMe validation
    vi.spyOn(TelegramBotService, 'validateToken').mockResolvedValueOnce({
      username: 'xxq_admin_bot',
      botName: 'Admin Bot',
      botId: 555666777,
    });
    vi.spyOn(TelegramBotService, 'setupWebhookAndCommands').mockResolvedValue();

    // 1. Add bot
    const addRes = await request(app)
      .post('/api/telegram/bots')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ token: '111222333:AAFFFakeTokenValueForTest' });

    expect(addRes.status).toBe(200);
    expect(addRes.body.bot.username).toBe('xxq_admin_bot');
    const botId = addRes.body.bot.id;

    // 2. List bots (encryptedToken must be sanitized)
    const listRes = await request(app)
      .get('/api/telegram/bots')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    const listed = listRes.body.bots.find((b: any) => b.id === botId);
    expect(listed).toBeDefined();
    expect(listed.encryptedToken).toBeUndefined();
    expect(listed.webhookSecretToken).toBeUndefined();

    // 3. Toggle bot
    const toggleRes = await request(app)
      .post(`/api/telegram/bots/${botId}/toggle`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isEnabled: false });

    expect(toggleRes.status).toBe(200);
    expect(toggleRes.body.isEnabled).toBe(false);

    // 4. Delete bot
    const delRes = await request(app)
      .delete(`/api/telegram/bots/${botId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);
  });

  it('tests bot connection status and webhook info via /api/telegram/bots/:id/test', async () => {
    vi.spyOn(TelegramBotService, 'testBot').mockResolvedValueOnce({
      botInfo: { username: 'xxq_health_bot', botName: 'Health Checker', botId: 123456 },
      webhookInfo: { url: 'https://example.com/api/telegram/webhook/test', pendingUpdateCount: 0 },
    });

    const bot = await dataStore.addTelegramBot({
      botName: 'Health Checker',
      username: 'xxq_health_bot',
      encryptedToken: encryptSecret('tok_health'),
      webhookSecretToken: 'sec_health',
      isEnabled: true,
      customCommands: [],
    });

    const res = await request(app)
      .post(`/api/telegram/bots/${bot.id}/test`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.bot.username).toBe('xxq_health_bot');
    expect(res.body.webhookInfo.pendingUpdateCount).toBe(0);
  });

  it('replaces bot token securely and updates webhook via /api/telegram/bots/:id/token', async () => {
    vi.spyOn(TelegramBotService, 'validateToken').mockResolvedValueOnce({
      username: 'xxq_rotated_bot',
      botName: 'Rotated Bot',
      botId: 777888999,
    });
    const setupSpy = vi.spyOn(TelegramBotService, 'setupWebhookAndCommands').mockResolvedValue();

    const bot = await dataStore.addTelegramBot({
      botName: 'Old Bot Name',
      username: 'xxq_old_bot',
      encryptedToken: encryptSecret('tok_old'),
      webhookSecretToken: 'sec_old',
      isEnabled: true,
      customCommands: [{ command: 'duyuru', response: 'aktif' }],
    });

    const res = await request(app)
      .put(`/api/telegram/bots/${bot.id}/token`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ token: '999888777:NEW_TOKEN_AFTER_REVOKE' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.bot.username).toBe('xxq_rotated_bot');
    expect(res.body.bot.botName).toBe('Rotated Bot');
    // Ensure token is not returned
    expect(res.body.bot.encryptedToken).toBeUndefined();
    // Ensure setupWebhookAndCommands was called with updated bot
    expect(setupSpy).toHaveBeenCalled();
  });

  it('unregisters webhook when bot is toggled off or deleted', async () => {
    const deleteWebhookSpy = vi.spyOn(TelegramBotService, 'deleteWebhook').mockResolvedValue(true);

    const bot = await dataStore.addTelegramBot({
      botName: 'Toggle Bot',
      username: 'xxq_toggle_bot',
      encryptedToken: encryptSecret('tok_toggle'),
      webhookSecretToken: 'sec_toggle',
      isEnabled: true,
      customCommands: [],
    });

    // 1. Toggle off
    const toggleRes = await request(app)
      .post(`/api/telegram/bots/${bot.id}/toggle`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isEnabled: false });

    expect(toggleRes.status).toBe(200);
    expect(deleteWebhookSpy).toHaveBeenCalledTimes(1);

    // 2. Delete
    const deleteRes = await request(app)
      .delete(`/api/telegram/bots/${bot.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteWebhookSpy).toHaveBeenCalledTimes(2);
  });

  it('blocks non-admin users from accessing telegram bot management', async () => {
    const userToken = generateDevToken({ id: 'reg_user', email: 'regular@user.com', displayName: 'Standart Kullanıcı', isAdmin: false });

    const getRes = await request(app)
      .get('/api/telegram/bots')
      .set('Authorization', `Bearer ${userToken}`);
    expect(getRes.status).toBe(403);

    const postRes = await request(app)
      .post('/api/telegram/bots')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ token: '123456789:test' });
    expect(postRes.status).toBe(403);
  });
});
