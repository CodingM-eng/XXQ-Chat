import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../auth/index.js';
import { dataStore, isWhitelistModeEnabled } from '../db/index.js';
import { config } from '../config.js';
import { onWhitelistRevoked, onWhitelistModeChanged } from '../sockets/index.js';

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

export const adminRouter = router;

