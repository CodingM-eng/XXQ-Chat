import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../auth/index.js';
import { dataStore, isWhitelistModeEnabled } from '../db/index.js';
import { config } from '../config.js';
import { onWhitelistRevoked, onWhitelistModeChanged } from '../sockets/index.js';
import { TelegramBotService } from '../services/telegram.js';
import { encryptSecret } from '../utils/crypto.js';

const router = Router();

// Apply auth and admin checks to all admin endpoints
router.use(requireAuth, requireAdmin);

// GET /api/admin/status
router.get('/status', async (req, res) => {
  const whitelistMode = await isWhitelistModeEnabled();
  const stats = await dataStore.getStats();

  res.json({
    whitelistMode,
    stats,
    initialAdminEmail: config.INITIAL_ADMIN_EMAIL,
  });
});

// POST /api/admin/whitelist/toggle
const toggleSchema = z.object({
  enabled: z.boolean(),
  confirmation: z.literal(true), // Explicit confirmation required
});

router.post('/whitelist/toggle', async (req, res) => {
  const parseResult = toggleSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: 'Beyaz liste modunu değiştirmek için onay gereklidir.' });
    return;
  }

  const { enabled } = parseResult.data;
  const user = req.user!;

  await dataStore.setWhitelistMode(enabled);

  // If enabled, disconnect any active unapproved sockets in real-time
  if (enabled) {
    await onWhitelistModeChanged(true);
  }

  const action = enabled ? 'WHITELIST_ENABLED' : 'WHITELIST_DISABLED';
  await dataStore.recordAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action,
    target: 'SYSTEM',
    details: `Beyaz liste modu ${enabled ? 'ETKİNLEŞTİRİLDİ' : 'DEVRE DIŞI BIRAKILDI'} olarak güncellendi`,
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    whitelistMode: enabled,
    message: `Beyaz liste erişim kontrolü ${enabled ? 'ETKİNLEŞTİRİLDİ' : 'DEVRE DIŞI BIRAKILDI'}.`,
  });
});

// GET /api/admin/whitelist
router.get('/whitelist', async (req, res) => {
  const items = await dataStore.getWhitelist();
  res.json({ whitelist: items });
});

// GET /api/admin/pending - list unapproved users pending admin review
router.get('/pending', async (req, res) => {
  const requests = await dataStore.getPendingAccessRequests();
  res.json({ pendingRequests: requests });
});

// POST /api/admin/whitelist/approve - approve a pending request
const approveSchema = z.object({
  email: z.string().email('Geçerli bir e-posta adresi gereklidir.'),
});

router.post('/whitelist/approve', async (req, res) => {
  const parseResult = approveSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_EMAIL', message: 'Geçerli bir e-posta adresi gereklidir.' });
    return;
  }

  const email = parseResult.data.email.toLowerCase().trim();
  const user = req.user!;

  await dataStore.addToWhitelist(email, user.email);

  await dataStore.recordAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: 'USER_WHITELIST_APPROVED',
    target: email,
    details: `${email} kullanıcısı için uygulama erişimi onaylandı`,
    ipAddress: req.ip,
  });

  res.json({ success: true, email, message: `${email} hesabı başarıyla onaylandı.` });
});

// POST /api/admin/whitelist/add
const addWhitelistSchema = z.object({
  email: z.string().email(),
});

router.post('/whitelist/add', async (req, res) => {
  const parseResult = addWhitelistSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_EMAIL', message: 'Geçerli bir e-posta adresi gereklidir.' });
    return;
  }

  const email = parseResult.data.email.toLowerCase().trim();
  const user = req.user!;

  try {
    await dataStore.addToWhitelist(email, user.email);

    await dataStore.recordAuditLog({
      actorId: user.id,
      actorEmail: user.email,
      action: 'USER_WHITELIST_APPROVED',
      target: email,
      details: `${email} kullanıcısı için uygulama erişimi onaylandı`,
      ipAddress: req.ip,
    });

    res.json({ success: true, email, message: `${email} hesabı başarıyla onaylandı.` });
  } catch (err: any) {
    res.status(500).json({ error: 'DB_ERROR', message: err.message });
  }
});

// DELETE /api/admin/whitelist/:email
router.delete('/whitelist/:email', async (req, res) => {
  const email = req.params.email.toLowerCase().trim();
  const user = req.user!;

  // Prevent removing the bootstrap admin email
  if (email === config.INITIAL_ADMIN_EMAIL.toLowerCase().trim()) {
    res.status(400).json({ error: 'PROTECTED_ACCOUNT', message: 'Birincil sistem yöneticisi hesabı beyaz listeden kaldırılamaz.' });
    return;
  }

  const removed = await dataStore.removeFromWhitelist(email);

  if (!removed) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Kullanıcı beyaz listede bulunamadı.' });
    return;
  }

  // Real-time disconnect any active socket connection for this revoked user
  await onWhitelistRevoked(email);

  await dataStore.recordAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: 'USER_WHITELIST_REVOKED',
    target: email,
    details: `${email} için beyaz liste onayı kaldırıldı`,
    ipAddress: req.ip,
  });

  res.json({ success: true, email, message: `${email} için beyaz liste onayı kaldırıldı.` });
});

// GET /api/admin/audit-logs
router.get('/audit-logs', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const logs = await dataStore.getAuditLogs(limit);
  res.json({
    auditLogs: logs.map((l) => ({
      id: l.id,
      actor_id: l.actorId,
      actorId: l.actorId,
      actor_email: l.actorEmail,
      actorEmail: l.actorEmail,
      action: l.action,
      target: l.target,
      details: l.details,
      ip_address: l.ipAddress,
      ipAddress: l.ipAddress,
      created_at: l.createdAt,
      createdAt: l.createdAt,
    })),
  });
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
  const users = await dataStore.getAllUsers();
  res.json({ users });
});

// GET /api/admin/moderators
router.get('/moderators', async (req, res) => {
  const moderators = await dataStore.getModerators();
  res.json({ moderators });
});

// POST /api/admin/moderators/:userId
router.post('/moderators/:userId', async (req, res) => {
  const { userId } = req.params;
  const adminUser = req.user!;

  const targetUser = await dataStore.getUserById(userId);
  if (!targetUser) {
    res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Kullanıcı bulunamadı.' });
    return;
  }

  const updatedUser = await dataStore.setModerator(userId, true);

  await dataStore.recordAuditLog({
    actorId: adminUser.id,
    actorEmail: adminUser.email,
    action: 'MODERATOR_GRANTED',
    target: targetUser.email,
    details: `${targetUser.displayName || targetUser.email} kullanıcısına moderatör yetkisi verildi`,
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    user: updatedUser,
    message: `${targetUser.displayName || targetUser.email} artık bir moderatör.`,
  });
});

// DELETE /api/admin/moderators/:userId
router.delete('/moderators/:userId', async (req, res) => {
  const { userId } = req.params;
  const adminUser = req.user!;

  const targetUser = await dataStore.getUserById(userId);
  if (!targetUser) {
    res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Kullanıcı bulunamadı.' });
    return;
  }

  const updatedUser = await dataStore.setModerator(userId, false);

  await dataStore.recordAuditLog({
    actorId: adminUser.id,
    actorEmail: adminUser.email,
    action: 'MODERATOR_REVOKED',
    target: targetUser.email,
    details: `${targetUser.displayName || targetUser.email} kullanıcısının moderatör yetkisi kaldırıldı`,
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    user: updatedUser,
    message: `${targetUser.displayName || targetUser.email} kullanıcısının moderatör yetkisi kaldırıldı.`,
  });
});

// POST /api/admin/whitelist/reject - reject a pending access request
const rejectSchema = z.object({
  email: z.string().email(),
});

router.post('/whitelist/reject', async (req, res) => {
  const parseResult = rejectSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_EMAIL', message: 'Geçerli bir e-posta adresi gereklidir.' });
    return;
  }

  const email = parseResult.data.email.toLowerCase().trim();
  const user = req.user!;

  await dataStore.rejectPendingAccess(email);

  await dataStore.recordAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: 'USER_WHITELIST_REJECTED',
    target: email,
    details: `${email} kullanıcısının erişim isteği reddedildi`,
    ipAddress: req.ip,
  });

  res.json({ success: true, email, message: `${email} erişim isteği reddedildi.` });
});

// GET /api/admin/pending/history - view resolved request history
router.get('/pending/history', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const requests = await dataStore.getResolvedAccessRequests(limit);
  res.json({ resolvedRequests: requests });
});

// GET /api/admin/groups - list all groups
router.get('/groups', async (req, res) => {
  const groups = await dataStore.getAllGroups();
  res.json({ groups });
});

// GET /api/admin/servers - list all servers
router.get('/servers', async (req, res) => {
  const servers = await dataStore.getAllServers();
  res.json({ servers });
});

// POST /api/admin/groups/:id/members - Force add approved user to group
const forceAddMemberSchema = z.object({
  userId: z.string().min(1),
  confirmation: z.literal(true),
});

router.post('/groups/:id/members', async (req, res) => {
  const parseResult = forceAddMemberSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'CONFIRMATION_REQUIRED', message: 'Zorunlu kullanıcı ekleme işlemi için onay gereklidir.' });
    return;
  }

  const conversationId = req.params.id as string;
  const { userId } = parseResult.data;
  const adminUser = req.user!;

  const targetUser = await dataStore.getUserById(userId);
  if (!targetUser) {
    res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Kullanıcı bulunamadı.' });
    return;
  }

  const whitelistEnabled = await isWhitelistModeEnabled();
  if (whitelistEnabled) {
    const isWhitelisted = await dataStore.isEmailWhitelisted(targetUser.email);
    if (!isWhitelisted && !targetUser.isAdmin) {
      res.status(400).json({ error: 'USER_NOT_WHITELISTED', message: 'Kullanıcı beyaz listede onaylı değil.' });
      return;
    }
  }

  const isMember = await dataStore.isConversationParticipant(conversationId, userId);
  if (isMember) {
    res.status(400).json({ error: 'ALREADY_MEMBER', message: 'Kullanıcı zaten bu grubun üyesidir.' });
    return;
  }

  await dataStore.addConversationParticipants(conversationId, [userId]);

  await dataStore.recordAuditLog({
    actorId: adminUser.id,
    actorEmail: adminUser.email,
    action: 'ADMIN_FORCE_ADD_GROUP_MEMBER',
    target: targetUser.email,
    details: `Yönetici ${targetUser.displayName || targetUser.email} kullanıcısını ${conversationId} grubuna zorunlu olarak ekledi`,
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    message: `${targetUser.displayName || targetUser.email} gruba başarıyla eklendi.`,
  });
});

// POST /api/admin/servers/:id/members - Force add approved user to server
router.post('/servers/:id/members', async (req, res) => {
  const parseResult = forceAddMemberSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'CONFIRMATION_REQUIRED', message: 'Zorunlu kullanıcı ekleme işlemi için onay gereklidir.' });
    return;
  }

  const serverId = req.params.id as string;
  const { userId } = parseResult.data;
  const adminUser = req.user!;

  const targetUser = await dataStore.getUserById(userId);
  if (!targetUser) {
    res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Kullanıcı bulunamadı.' });
    return;
  }

  const whitelistEnabled = await isWhitelistModeEnabled();
  if (whitelistEnabled) {
    const isWhitelisted = await dataStore.isEmailWhitelisted(targetUser.email);
    if (!isWhitelisted && !targetUser.isAdmin) {
      res.status(400).json({ error: 'USER_NOT_WHITELISTED', message: 'Kullanıcı beyaz listede onaylı değil.' });
      return;
    }
  }

  const isMember = await dataStore.isServerMember(serverId, userId);
  if (isMember) {
    res.status(400).json({ error: 'ALREADY_MEMBER', message: 'Kullanıcı zaten bu sunucunun üyesidir.' });
    return;
  }

  await dataStore.addServerMember(serverId, userId, 'member');

  await dataStore.recordAuditLog({
    actorId: adminUser.id,
    actorEmail: adminUser.email,
    action: 'ADMIN_FORCE_ADD_SERVER_MEMBER',
    target: targetUser.email,
    details: `Yönetici ${targetUser.displayName || targetUser.email} kullanıcısını ${serverId} sunucusuna zorunlu olarak ekledi`,
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    message: `${targetUser.displayName || targetUser.email} sunucuya başarıyla eklendi.`,
  });
});

// POST /api/admin/users/:userId/family - toggle Aile role (Admin only)
const toggleFamilySchema = z.object({
  isFamily: z.boolean(),
});

router.post('/users/:userId/family', async (req, res) => {
  const { userId } = req.params;
  const parseResult = toggleFamilySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: 'Geçersiz parametre.' });
    return;
  }

  const { isFamily } = parseResult.data;
  const targetUser = await dataStore.getUserById(userId);
  if (!targetUser) {
    res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Kullanıcı bulunamadı.' });
    return;
  }

  const updated = await dataStore.setUserFamily(userId, isFamily);

  await dataStore.recordAuditLog({
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    action: isFamily ? 'USER_FAMILY_ROLE_GRANTED' : 'USER_FAMILY_ROLE_REVOKED',
    target: targetUser.email,
    details: `${targetUser.displayName || targetUser.email} için Aile rolü ${isFamily ? 'verildi' : 'kaldırıldı'}`,
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    user: updated,
    message: `${targetUser.displayName} için Aile rolü ${isFamily ? 'etkinleştirildi' : 'kaldırıldı'}.`,
  });
});

// GET /api/admin/bot-pool - get bot pool
router.get('/bot-pool', async (req, res) => {
  const pool = await dataStore.getBotPool();
  const mapped = pool.map((item) => ({
    id: item.id,
    botName: item.botName,
    username: item.username,
    isAssigned: item.isAssigned,
    assignedName: item.assignedName,
    assignedConversationId: item.assignedConversationId,
    createdAt: item.createdAt,
  }));
  res.json({
    pool: mapped,
    botPool: mapped,
  });
});

// POST /api/admin/bot-pool - add bot to pool
const addBotPoolSchema = z.object({
  token: z.string().min(10, 'Geçerli bir bot belirteci gereklidir.'),
});

router.post('/bot-pool', async (req, res) => {
  const parseResult = addBotPoolSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: 'Geçerli bir bot belirteci giriniz.' });
    return;
  }

  const { token } = parseResult.data;
  try {
    const { botName, username } = await TelegramBotService.validateToken(token);
    const encrypted = encryptSecret(token.trim());
    const item = await dataStore.addBotPoolToken(encrypted, botName, username);

    await dataStore.recordAuditLog({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'BOT_POOL_TOKEN_ADDED',
      target: `@${username}`,
      details: `${botName} (@${username}) bot havuzuna eklendi`,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      bot: {
        id: item.id,
        botName: item.botName,
        username: item.username,
        isAssigned: false,
        createdAt: item.createdAt,
      },
      message: `${botName} (@${username}) başarıyla bot havuzuna eklendi.`,
    });
  } catch (err: any) {
    res.status(400).json({ error: 'VALIDATION_FAILED', message: err.message || 'Bot belirteci doğrulanamadı.' });
  }
});

// DELETE /api/admin/bot-pool/:id - remove bot from pool
router.delete('/bot-pool/:id', async (req, res) => {
  const { id } = req.params;
  const removed = await dataStore.removeBotPoolToken(id);
  if (!removed) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Bot havuzunda kayıt bulunamadı.' });
    return;
  }
  res.json({ success: true, message: 'Bot havuzdan kaldırıldı.' });
});

// POST /api/admin/bot-pool/:id/assign - assign bot to conversation
const assignBotSchema = z.object({
  conversationId: z.string().min(1),
  customName: z.string().optional(),
});

router.post('/bot-pool/:id/assign', async (req, res) => {
  const parseResult = assignBotSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: 'Geçersiz parametre.' });
    return;
  }
  const { conversationId, customName } = parseResult.data;
  const assigned = await dataStore.assignBotFromPool(req.params.id, conversationId, customName);
  if (!assigned) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Bot bulunamadı.' });
    return;
  }
  res.json({ success: true, bot: assigned });
});

// GET /api/admin/gemini - get Gemini configuration (never reveals key)
router.get('/gemini', async (req, res) => {
  const geminiConfig = await dataStore.getGeminiConfig();
  res.json({
    config: {
      isConfigured: !!geminiConfig?.apiKeyEncrypted,
      isEnabled: !!geminiConfig?.isEnabled,
      defaultPrompt: geminiConfig?.defaultPrompt || null,
      model: geminiConfig?.model || 'gemini-1.5-flash',
      updatedAt: geminiConfig?.updatedAt || null,
    },
  });
});

// POST /api/admin/gemini - update Gemini configuration
const updateGeminiSchema = z.object({
  apiKey: z.string().optional(),
  isEnabled: z.boolean().optional(),
  defaultPrompt: z.string().optional().nullable(),
  model: z.string().optional(),
});

router.post('/gemini', async (req, res) => {
  const parseResult = updateGeminiSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: 'Geçersiz parametreler.' });
    return;
  }

  const { apiKey, isEnabled, defaultPrompt, model } = parseResult.data;
  const updateData: any = {};
  if (apiKey !== undefined && apiKey.trim().length > 0) {
    updateData.apiKeyEncrypted = encryptSecret(apiKey.trim());
  }
  if (isEnabled !== undefined) updateData.isEnabled = isEnabled;
  if (defaultPrompt !== undefined) updateData.defaultPrompt = defaultPrompt;
  if (model !== undefined) updateData.model = model;

  const saved = await dataStore.updateGeminiConfig(updateData);

  await dataStore.recordAuditLog({
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    action: 'GEMINI_CONFIG_UPDATED',
    details: `Gemini AI yapılandırması güncellendi (Etkin: ${saved.isEnabled})`,
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    config: {
      isConfigured: !!saved.apiKeyEncrypted,
      isEnabled: saved.isEnabled,
      defaultPrompt: saved.defaultPrompt,
      model: saved.model,
      updatedAt: saved.updatedAt,
    },
    message: 'Gemini AI ayarları başarıyla kaydedildi.',
  });
});

export const adminRouter = router;

