import crypto from 'crypto';
import { config } from '../config.js';
import { decryptSecret, encryptSecret } from '../utils/crypto.js';
import { dataStore } from '../db/index.js';
import { DbTelegramBot, TelegramCommandConfig } from '../db/types.js';

// Cache recent update_ids to ensure webhook idempotency
const processedUpdateIds = new Set<number>();
const MAX_PROCESSED_UPDATES = 10000;

function markUpdateProcessed(updateId: number): boolean {
  if (processedUpdateIds.has(updateId)) {
    return false; // already processed
  }
  if (processedUpdateIds.size >= MAX_PROCESSED_UPDATES) {
    // Clear oldest items
    const iter = processedUpdateIds.values();
    for (let i = 0; i < 2000; i++) {
      const next = iter.next();
      if (next.done) break;
      processedUpdateIds.delete(next.value);
    }
  }
  processedUpdateIds.add(updateId);
  return true;
}

export class TelegramBotService {
  /**
   * Validates a bot token with Telegram getMe API.
   */
  static async validateToken(token: string): Promise<{ username: string; botName: string; botId: number }> {
    const res = await fetch(`https://api.telegram.org/bot${token.trim()}/getMe`);
    if (!res.ok) {
      throw new Error('Telegram bot belirteci geçersiz veya Telegram sunucusuna ulaşılamadı.');
    }

    const data = (await res.json()) as any;
    if (!data.ok || !data.result) {
      throw new Error('Telegram API yanıtı başarısız.');
    }

    return {
      username: data.result.username || '',
      botName: data.result.first_name || 'XXQ Chat Bot',
      botId: data.result.id,
    };
  }

  /**
   * Connects and registers a new bot, sets up webhook and commands.
   */
  static async registerBot(token: string, customCommands: TelegramCommandConfig[] = []): Promise<DbTelegramBot> {
    const trimmedToken = token.trim();
    const info = await this.validateToken(trimmedToken);

    const webhookSecretToken = crypto.randomBytes(32).toString('hex');
    const encryptedToken = encryptSecret(trimmedToken);

    // Save bot to database first to obtain or ensure botId
    const bot = await dataStore.addTelegramBot({
      botName: info.botName,
      username: info.username,
      encryptedToken,
      webhookSecretToken,
      isEnabled: true,
      customCommands,
    });

    // Register webhook and default commands
    await this.setupWebhookAndCommands(bot, trimmedToken);

    return bot;
  }

  /**
   * Sets webhook and registers bot commands with Telegram API.
   */
  static async setupWebhookAndCommands(bot: DbTelegramBot, rawToken?: string): Promise<void> {
    const token = rawToken || decryptSecret(bot.encryptedToken);

    // Register commands
    const defaultCommands = [
      { command: 'start', description: 'XXQ Chat botunu başlat' },
      { command: 'yardim', description: 'Kullanılabilir komutları listele' },
      { command: 'stat', description: 'Güvenli sistem istatistiklerini görüntüle' },
      ...bot.customCommands.map((c) => ({
        command: c.command.toLowerCase().replace(/^\//, ''),
        description: c.description || c.command,
      })),
    ];

    try {
      await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commands: defaultCommands }),
      });
    } catch (err) {
      console.warn('[TELEGRAM] Could not register commands:', err);
    }

    // Register Webhook with secret token
    if (config.SERVER_BASE_URL && !config.SERVER_BASE_URL.includes('localhost')) {
      const webhookUrl = `${config.SERVER_BASE_URL.replace(/\/$/, '')}/api/telegram/webhook/${bot.id}`;
      try {
        const whRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: webhookUrl,
            secret_token: bot.webhookSecretToken,
            drop_pending_updates: false,
          }),
        });
        if (!whRes.ok) {
          console.warn('[TELEGRAM] Webhook registration response was not OK:', whRes.status);
        }
      } catch (err) {
        console.warn('[TELEGRAM] Webhook registration failed:', err);
      }
    }
  }

  /**
   * Sends a message via Telegram bot.
   */
  static async sendMessage(bot: DbTelegramBot, chatId: number | string, text: string): Promise<boolean> {
    try {
      const token = decryptSecret(bot.encryptedToken);
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
        }),
      });
      return res.ok;
    } catch (err) {
      console.error('[TELEGRAM] Send message error:', err);
      return false;
    }
  }

  /**
   * Processes an incoming webhook update securely and idempotently.
   */
  static async handleWebhookUpdate(
    bot: DbTelegramBot,
    secretTokenHeader: string | undefined,
    update: any
  ): Promise<{ handled: boolean; reason?: string }> {
    // 1. Verify webhook secret token header
    if (!secretTokenHeader || secretTokenHeader !== bot.webhookSecretToken) {
      return { handled: false, reason: 'UNAUTHORIZED_SECRET_TOKEN' };
    }

    if (!bot.isEnabled) {
      return { handled: false, reason: 'BOT_DISABLED' };
    }

    if (!update || typeof update !== 'object') {
      return { handled: false, reason: 'INVALID_UPDATE' };
    }

    // 2. Idempotency check
    if (update.update_id) {
      const isNew = markUpdateProcessed(update.update_id);
      if (!isNew) {
        return { handled: true, reason: 'ALREADY_PROCESSED' };
      }
    }

    const message = update.message;
    if (!message || !message.text || !message.chat?.id) {
      return { handled: true };
    }

    const chatId = message.chat.id;
    const rawText = message.text.trim();

    // Check commands
    if (rawText.startsWith('/')) {
      const commandParts = rawText.split(' ');
      const commandWithMention = commandParts[0].toLowerCase();
      // Remove bot username if command was e.g. /yardim@xxq_bot
      const cleanCommand = commandWithMention.split('@')[0].slice(1);

      if (cleanCommand === 'start') {
        const welcomeText = `👋 <b>XXQ Chat Botuna Hoş Geldiniz!</b>\n\nBu bot, XXQ Chat sistemi ile entegre çalışmaktadır.\nKullanabileceğiniz komutlar için <b>/yardim</b> yazabilirsiniz.`;
        await this.sendMessage(bot, chatId, welcomeText);
        return { handled: true };
      }

      if (cleanCommand === 'yardim' || cleanCommand === 'help') {
        let helpText = `📖 <b>XXQ Chat Bot Komutları</b>\n\n` +
          `• <b>/start</b> - Botu başlatır ve selamlama gönderir.\n` +
          `• <b>/yardim</b> - Bu yardım menüsünü görüntüler.\n` +
          `• <b>/stat</b> - Güvenli sistem ve sunucu durumunu gösterir.\n`;

        if (bot.customCommands && bot.customCommands.length > 0) {
          helpText += `\n<b>Özel Komutlar:</b>\n`;
          for (const c of bot.customCommands) {
            helpText += `• <b>/${c.command}</b> - ${c.description || 'Özel yanıt'}\n`;
          }
        }

        await this.sendMessage(bot, chatId, helpText);
        return { handled: true };
      }

      if (cleanCommand === 'stat' || cleanCommand === 'stats') {
        // Safe aggregated metrics ONLY - strictly NO personal data, no phone numbers, no tokens
        const stats = await dataStore.getStats();
        const uptimeHours = Math.floor(process.uptime() / 3600);
        const uptimeMins = Math.floor((process.uptime() % 3600) / 60);

        const statsText = `📊 <b>XXQ Chat Sistem Durumu</b>\n\n` +
          `👥 <b>Kayıtlı Kullanıcı:</b> ${stats.totalUsers}\n` +
          `✅ <b>Onaylı Kullanıcı:</b> ${stats.approvedWhitelistCount}\n` +
          `💬 <b>Toplam Mesaj:</b> ${stats.totalMessages}\n` +
          `🛡️ <b>Yönetici Sayısı:</b> ${stats.adminCount}\n` +
          `⏱️ <b>Sunucu Çalışma Süresi:</b> ${uptimeHours} sa ${uptimeMins} dk\n` +
          `🟢 <b>Durum:</b> Çevrimiçi ve Aktif`;

        await this.sendMessage(bot, chatId, statsText);
        return { handled: true };
      }

      // Check custom commands
      if (bot.customCommands) {
        const matched = bot.customCommands.find((c) => c.command.toLowerCase().replace(/^\//, '') === cleanCommand);
        if (matched) {
          await this.sendMessage(bot, chatId, matched.response);
          return { handled: true };
        }
      }

      // Unknown command
      await this.sendMessage(bot, chatId, `❓ Bilinmeyen komut: <b>/${cleanCommand}</b>\nKullanabileceğiniz komutları görmek için <b>/yardim</b> yazabilirsiniz.`);
      return { handled: true };
    }

    return { handled: true };
  }
}
