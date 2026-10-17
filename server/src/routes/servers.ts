import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { requireAuth } from '../auth/index.js';
import { enforceWhitelist } from '../middleware/whitelist.js';
import { dataStore, isWhitelistModeEnabled } from '../db/index.js';
import { getSocketServer } from '../sockets/index.js';
import { ServerPurpose, ServerPermission, ServerJoinQuestion } from '../db/types.js';

const router = Router();
router.use(requireAuth, enforceWhitelist);

const serverPurposeSchema = z.enum(['gaming', 'chat', 'community', 'business', 'other']);

const permissionEnum = z.enum([
  'manage_server',
  'manage_roles',
  'manage_channels',
  'manage_messages',
  'send_announcements',
  'kick_members',
  'view_audit_logs',
]);

const joinQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1, 'Soru metni gereklidir.').max(300),
  required: z.boolean().default(false),
  order: z.number().int().default(0),
});

const serverLogoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 }, // 1 MB limit for logo
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Yalnızca resim dosyaları (JPEG, PNG, WEBP, GIF) yüklenebilir.'));
    }
    cb(null, true);
  },
});

const serverBannerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB limit for banner
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Yalnızca resim dosyaları (JPEG, PNG, WEBP, GIF) yüklenebilir.'));
    }
    cb(null, true);
  },
});

// GET /api/servers - list servers of current user
router.get('/', async (req, res) => {
  const userId = req.user!.id;
  const servers = await dataStore.getUserServers(userId);
  res.json({ servers });
});

// GET /api/servers/:id - get single server
router.get('/:id', async (req, res) => {
  const serverId = req.params.id as string;
  const user = req.user!;

  const isMember = await dataStore.isServerMember(serverId, user.id);
  const isPlatformAdmin = user.isAdmin;
  if (!isMember && !isPlatformAdmin) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Bu sunucuya erişim yetkiniz yok.' });
    return;
  }

  const server = await dataStore.getServer(serverId, user.id);
  if (!server) {
    res.status(404).json({ error: 'SERVER_NOT_FOUND', message: 'Sunucu bulunamadı.' });
    return;
  }

  res.json({ server });
});

// POST /api/servers - create new server
const createServerSchema = z.object({
  name: z.string().min(1, 'Sunucu adı gereklidir.').max(60),
  description: z.string().max(1000).nullable().optional(),
  purpose: serverPurposeSchema,
  avatarUrl: z.string().nullable().optional(),
  bannerUrl: z.string().nullable().optional(),
  welcomeMessage: z.string().max(1000).nullable().optional(),
  rules: z.string().max(2000).nullable().optional(),
  requiresApproval: z.boolean().optional(),
  joinQuestions: z.array(joinQuestionSchema).optional(),
});

router.post('/', async (req, res) => {
  const parseResult = createServerSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const user = req.user!;
  const { name, description, purpose, avatarUrl, bannerUrl, welcomeMessage, rules, requiresApproval, joinQuestions } = parseResult.data;

  const result = await dataStore.createServer(user.id, {
    name: name.trim(),
    description: description || null,
    purpose: purpose as ServerPurpose,
    avatarUrl: avatarUrl || null,
    bannerUrl: bannerUrl || null,
    welcomeMessage: welcomeMessage || null,
    rules: rules || null,
    requiresApproval: !!requiresApproval || (!!joinQuestions && joinQuestions.length > 0),
    joinQuestions: joinQuestions || [],
  });

  await dataStore.recordAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: 'SERVER_CREATED',
    target: result.server.id,
    details: `"${name}" sunucusu oluşturuldu (Amaç: ${purpose})`,
    ipAddress: req.ip,
  });

  const io = getSocketServer();
  if (io) {
    for (const ch of result.channels) {
      io.in(`user:${user.id}`).socketsJoin(`conversation:${ch.id}`);
    }
    io.to(`user:${user.id}`).emit('server:new', result.server);
  }

  res.status(201).json({
    success: true,
    server: result.server,
    channels: result.channels,
  });
});

// PATCH /api/servers/:id - update server settings
const updateServerSettingsSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  description: z.string().max(1000).nullable().optional(),
  purpose: serverPurposeSchema.optional(),
  avatarUrl: z.string().nullable().optional(),
  bannerUrl: z.string().nullable().optional(),
  welcomeMessage: z.string().max(1000).nullable().optional(),
  rules: z.string().max(2000).nullable().optional(),
  requiresApproval: z.boolean().optional(),
});

router.patch('/:id', async (req, res) => {
  const serverId = req.params.id as string;
  const user = req.user!;

  const canManage = user.isAdmin || (await dataStore.hasServerPermission(serverId, user.id, 'manage_server'));
  if (!canManage) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Yalnızca sunucu yöneticileri veya yetkili roller ayarları değiştirebilir.' });
    return;
  }

  const parseResult = updateServerSettingsSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  await dataStore.updateServerSettings(serverId, parseResult.data as any);

  await dataStore.recordAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: 'SERVER_SETTINGS_UPDATED',
    target: serverId,
    details: `Sunucu ayarları güncellendi: ${Object.keys(parseResult.data).join(', ')}`,
    ipAddress: req.ip,
  });

  const updatedServer = await dataStore.getServer(serverId, user.id);
  const io = getSocketServer();
  if (io && updatedServer) {
    for (const mId of updatedServer.memberIds) {
      io.to(`user:${mId}`).emit('server:updated', updatedServer);
    }
  }

  res.json({ success: true, server: updatedServer });
});

// POST /api/servers/:id/logo - update community logo
router.post('/:id/logo', (req, res) => {
  serverLogoUpload.single('file')(req, res, async (err: any) => {
    if (err) {
      res.status(400).json({ error: 'UPLOAD_ERROR', message: err.message || 'Logo yüklenirken hata oluştu.' });
      return;
    }

    const serverId = req.params.id as string;
    const user = req.user!;
    const canManage = user.isAdmin || (await dataStore.hasServerPermission(serverId, user.id, 'manage_server'));
    if (!canManage) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Sunucu logosunu değiştirme yetkiniz yok.' });
      return;
    }

    let newLogoUrl: string | null = null;
    if (req.file) {
      newLogoUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    } else if (req.body && typeof req.body.logoUrl === 'string') {
      const url = req.body.logoUrl.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:image/')) {
        res.status(400).json({ error: 'INVALID_URL', message: 'Geçersiz resim bağlantısı.' });
        return;
      }
      newLogoUrl = url;
    } else {
      res.status(400).json({ error: 'NO_IMAGE', message: 'Bir resim dosyası veya geçerli bir resim bağlantısı sağlamalısınız.' });
      return;
    }

    await dataStore.updateServerSettings(serverId, { avatarUrl: newLogoUrl });
    const updated = await dataStore.getServer(serverId, user.id);
    const io = getSocketServer();
    if (io && updated) {
      for (const mId of updated.memberIds) {
        io.to(`user:${mId}`).emit('server:updated', updated);
      }
    }
    res.json({ success: true, avatarUrl: newLogoUrl, server: updated, message: 'Topluluk logosu güncellendi.' });
  });
});

// DELETE /api/servers/:id/logo - remove community logo
router.delete('/:id/logo', async (req, res) => {
  const serverId = req.params.id as string;
  const user = req.user!;
  const canManage = user.isAdmin || (await dataStore.hasServerPermission(serverId, user.id, 'manage_server'));
  if (!canManage) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Sunucu logosunu kaldırma yetkiniz yok.' });
    return;
  }

  await dataStore.updateServerSettings(serverId, { avatarUrl: null });
  const updated = await dataStore.getServer(serverId, user.id);
  const io = getSocketServer();
  if (io && updated) {
    for (const mId of updated.memberIds) {
      io.to(`user:${mId}`).emit('server:updated', updated);
    }
  }
  res.json({ success: true, server: updated, message: 'Topluluk logosu kaldırıldı.' });
});

// POST /api/servers/:id/banner - update community banner
router.post('/:id/banner', (req, res) => {
  serverBannerUpload.single('file')(req, res, async (err: any) => {
    if (err) {
      res.status(400).json({ error: 'UPLOAD_ERROR', message: err.message || 'Afiş yüklenirken hata oluştu.' });
      return;
    }

    const serverId = req.params.id as string;
    const user = req.user!;
    const canManage = user.isAdmin || (await dataStore.hasServerPermission(serverId, user.id, 'manage_server'));
    if (!canManage) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Sunucu afişini değiştirme yetkiniz yok.' });
      return;
    }

    let newBannerUrl: string | null = null;
    if (req.file) {
      newBannerUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    } else if (req.body && typeof req.body.bannerUrl === 'string') {
      const url = req.body.bannerUrl.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:image/')) {
        res.status(400).json({ error: 'INVALID_URL', message: 'Geçersiz resim bağlantısı.' });
        return;
      }
      newBannerUrl = url;
    } else {
      res.status(400).json({ error: 'NO_IMAGE', message: 'Bir resim dosyası veya geçerli bir afiş bağlantısı sağlamalısınız.' });
      return;
    }

    await dataStore.updateServerSettings(serverId, { bannerUrl: newBannerUrl });
    const updated = await dataStore.getServer(serverId, user.id);
    const io = getSocketServer();
    if (io && updated) {
      for (const mId of updated.memberIds) {
        io.to(`user:${mId}`).emit('server:updated', updated);
      }
    }
    res.json({ success: true, bannerUrl: newBannerUrl, server: updated, message: 'Topluluk afişi güncellendi.' });
  });
});

// DELETE /api/servers/:id/banner - remove community banner
router.delete('/:id/banner', async (req, res) => {
  const serverId = req.params.id as string;
  const user = req.user!;
  const canManage = user.isAdmin || (await dataStore.hasServerPermission(serverId, user.id, 'manage_server'));
  if (!canManage) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Sunucu afişini kaldırma yetkiniz yok.' });
    return;
  }

  await dataStore.updateServerSettings(serverId, { bannerUrl: null });
  const updated = await dataStore.getServer(serverId, user.id);
  const io = getSocketServer();
  if (io && updated) {
    for (const mId of updated.memberIds) {
      io.to(`user:${mId}`).emit('server:updated', updated);
    }
  }
  res.json({ success: true, server: updated, message: 'Topluluk afişi kaldırıldı.' });
});

// GET /api/servers/:id/questions - get join questions
router.get('/:id/questions', async (req, res) => {
  const serverId = req.params.id as string;
  const user = req.user!;
  const isMember = await dataStore.isServerMember(serverId, user.id);
  if (!isMember && !user.isAdmin) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Bu sunucunun sorularını görüntüleme yetkiniz yok.' });
    return;
  }
  const questions = await dataStore.getServerJoinQuestions(serverId);
  res.json({ success: true, questions });
});

// PUT /api/servers/:id/questions - set join questions
const setQuestionsSchema = z.object({
  questions: z.array(joinQuestionSchema),
  requiresApproval: z.boolean().optional(),
});

router.put('/:id/questions', async (req, res) => {
  const serverId = req.params.id as string;
  const user = req.user!;
  const canManage = user.isAdmin || (await dataStore.hasServerPermission(serverId, user.id, 'manage_server'));
  if (!canManage) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Katılım sorularını düzenleme yetkiniz yok.' });
    return;
  }

  const parseResult = setQuestionsSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const { questions, requiresApproval } = parseResult.data;
  await dataStore.setServerJoinQuestions(serverId, questions);
  if (requiresApproval !== undefined) {
    await dataStore.updateServerSettings(serverId, { requiresApproval });
  }

  await dataStore.recordAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: 'SERVER_JOIN_QUESTIONS_UPDATED',
    target: serverId,
    details: `${questions.length} adet katılım sorusu yapılandırıldı`,
    ipAddress: req.ip,
  });

  const updatedServer = await dataStore.getServer(serverId, user.id);
  const io = getSocketServer();
  if (io && updatedServer) {
    for (const mId of updatedServer.memberIds) {
      io.to(`user:${mId}`).emit('server:updated', updatedServer);
    }
  }

  res.json({ success: true, questions, server: updatedServer, message: 'Katılım soruları kaydedildi.' });
});

// GET /api/servers/:id/join-requests - list pending join requests
router.get('/:id/join-requests', async (req, res) => {
  const serverId = req.params.id as string;
  const user = req.user!;
  const canManage = user.isAdmin || (await dataStore.hasServerPermission(serverId, user.id, 'manage_server'));
  if (!canManage) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Katılım isteklerini görüntüleme yetkiniz yok.' });
    return;
  }

  const requests = await dataStore.getTargetJoinRequests('server', serverId);
  res.json({ success: true, requests });
});

// POST /api/servers/:id/join-requests/:requestId/resolve - approve or reject request
const resolveJoinRequestSchema = z.object({
  action: z.enum(['approve', 'reject']),
});

router.post('/:id/join-requests/:requestId/resolve', async (req, res) => {
  const serverId = req.params.id as string;
  const requestId = req.params.requestId as string;
  const user = req.user!;
  const canManage = user.isAdmin || (await dataStore.hasServerPermission(serverId, user.id, 'manage_server'));
  if (!canManage) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Katılım isteklerini onaylama yetkiniz yok.' });
    return;
  }

  const parseResult = resolveJoinRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const { action } = parseResult.data;
  const status = action === 'approve' ? 'approved' : 'rejected';
  const resolved = await dataStore.resolveMembershipInvitation(requestId, status, user.id);
  if (!resolved) {
    res.status(404).json({ error: 'REQUEST_NOT_FOUND', message: 'Katılım isteği bulunamadı.' });
    return;
  }

  const io = getSocketServer();

  if (action === 'approve') {
    await dataStore.addServerMember(serverId, resolved.userId, 'member');
    const updatedServer = await dataStore.getServer(serverId, user.id);
    if (io && updatedServer) {
      if (updatedServer.channels) {
        for (const ch of updatedServer.channels) {
          io.in(`user:${resolved.userId}`).socketsJoin(`conversation:${ch.id}`);
        }
      }
      for (const mId of updatedServer.memberIds) {
        io.to(`user:${mId}`).emit('server:updated', updatedServer);
      }
      io.to(`user:${resolved.userId}`).emit('server:new', updatedServer);
      io.to(`user:${resolved.userId}`).emit('server:join_approved', {
        serverId,
        serverName: updatedServer.name,
      });
    }

    await dataStore.recordAuditLog({
      actorId: user.id,
      actorEmail: user.email,
      action: 'SERVER_JOIN_REQUEST_APPROVED',
      target: resolved.userId,
      details: `${resolved.userDisplayName} kullanıcısının katılım isteği onaylandı`,
      ipAddress: req.ip,
    });
  } else {
    if (io) {
      io.to(`user:${resolved.userId}`).emit('server:join_rejected', {
        serverId,
        serverName: resolved.targetName,
      });
    }
    await dataStore.recordAuditLog({
      actorId: user.id,
      actorEmail: user.email,
      action: 'SERVER_JOIN_REQUEST_REJECTED',
      target: resolved.userId,
      details: `${resolved.userDisplayName} kullanıcısının katılım isteği reddedildi`,
      ipAddress: req.ip,
    });
  }

  res.json({
    success: true,
    request: resolved,
    message: action === 'approve' ? 'Katılım isteği onaylandı ve üye topluluğa eklendi.' : 'Katılım isteği reddedildi.',
  });
});

// Custom Roles Routes
const createRoleSchema = z.object({
  name: z.string().min(1, 'Rol adı gereklidir.').max(40),
  color: z.string().min(1, 'Renk gereklidir.').max(20),
  permissions: z.array(permissionEnum).default([]),
  order: z.number().int().optional().default(0),
});

// GET /api/servers/:id/roles
router.get('/:id/roles', async (req, res) => {
  const serverId = req.params.id as string;
  const user = req.user!;
  const isMember = await dataStore.isServerMember(serverId, user.id);
  if (!isMember && !user.isAdmin) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Rolleri görüntüleme yetkiniz yok.' });
    return;
  }
  const roles = await dataStore.getServerRoles(serverId);
  res.json({ success: true, roles });
});

// POST /api/servers/:id/roles
router.post('/:id/roles', async (req, res) => {
  const serverId = req.params.id as string;
  const user = req.user!;
  const canManage = user.isAdmin || (await dataStore.hasServerPermission(serverId, user.id, 'manage_roles'));
  if (!canManage) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Rol oluşturma yetkiniz yok.' });
    return;
  }

  const parseResult = createRoleSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const role = await dataStore.createServerRole(serverId, parseResult.data as any);
  await dataStore.recordAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: 'SERVER_ROLE_CREATED',
    target: role.id,
    details: `"${role.name}" rolü oluşturuldu`,
    ipAddress: req.ip,
  });

  const updatedServer = await dataStore.getServer(serverId, user.id);
  const io = getSocketServer();
  if (io && updatedServer) {
    for (const mId of updatedServer.memberIds) {
      io.to(`user:${mId}`).emit('server:updated', updatedServer);
    }
  }

  res.status(201).json({ success: true, role });
});

// PATCH /api/servers/:id/roles/:roleId
const updateRoleSchema = z.object({
  name: z.string().min(1).max(40).optional(),
  color: z.string().min(1).max(20).optional(),
  permissions: z.array(permissionEnum).optional(),
  order: z.number().int().optional(),
});

router.patch('/:id/roles/:roleId', async (req, res) => {
  const serverId = req.params.id as string;
  const roleId = req.params.roleId as string;
  const user = req.user!;
  const canManage = user.isAdmin || (await dataStore.hasServerPermission(serverId, user.id, 'manage_roles'));
  if (!canManage) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Rol düzenleme yetkiniz yok.' });
    return;
  }

  const parseResult = updateRoleSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const updated = await dataStore.updateServerRole(serverId, roleId, parseResult.data as any);
  if (!updated) {
    res.status(404).json({ error: 'ROLE_NOT_FOUND', message: 'Rol bulunamadı.' });
    return;
  }

  await dataStore.recordAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: 'SERVER_ROLE_UPDATED',
    target: roleId,
    details: `"${updated.name}" rolü güncellendi`,
    ipAddress: req.ip,
  });

  const updatedServer = await dataStore.getServer(serverId, user.id);
  const io = getSocketServer();
  if (io && updatedServer) {
    for (const mId of updatedServer.memberIds) {
      io.to(`user:${mId}`).emit('server:updated', updatedServer);
    }
  }

  res.json({ success: true, role: updated });
});

// DELETE /api/servers/:id/roles/:roleId
router.delete('/:id/roles/:roleId', async (req, res) => {
  const serverId = req.params.id as string;
  const roleId = req.params.roleId as string;
  const user = req.user!;
  const canManage = user.isAdmin || (await dataStore.hasServerPermission(serverId, user.id, 'manage_roles'));
  if (!canManage) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Rol silme yetkiniz yok.' });
    return;
  }

  const deleted = await dataStore.deleteServerRole(serverId, roleId);
  if (!deleted) {
    res.status(404).json({ error: 'ROLE_NOT_FOUND', message: 'Rol bulunamadı.' });
    return;
  }

  await dataStore.recordAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: 'SERVER_ROLE_DELETED',
    target: roleId,
    details: `Rol silindi (${roleId})`,
    ipAddress: req.ip,
  });

  const updatedServer = await dataStore.getServer(serverId, user.id);
  const io = getSocketServer();
  if (io && updatedServer) {
    for (const mId of updatedServer.memberIds) {
      io.to(`user:${mId}`).emit('server:updated', updatedServer);
    }
  }

  res.json({ success: true, message: 'Rol silindi.' });
});

// POST /api/servers/:id/members/:userId/roles - assign custom roles to a member
const assignRolesSchema = z.object({
  roleIds: z.array(z.string()),
});

router.post('/:id/members/:userId/roles', async (req, res) => {
  const serverId = req.params.id as string;
  const targetUserId = req.params.userId as string;
  const user = req.user!;
  const canManage = user.isAdmin || (await dataStore.hasServerPermission(serverId, user.id, 'manage_roles'));
  if (!canManage) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Üye rollerini değiştirme yetkiniz yok.' });
    return;
  }

  const parseResult = assignRolesSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const { roleIds } = parseResult.data;
  await dataStore.setServerMemberCustomRoles(serverId, targetUserId, roleIds);

  await dataStore.recordAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: 'SERVER_MEMBER_ROLES_ASSIGNED',
    target: targetUserId,
    details: `${targetUserId} kullanıcısına ${roleIds.length} adet rol atandı`,
    ipAddress: req.ip,
  });

  const updatedServer = await dataStore.getServer(serverId, user.id);
  const io = getSocketServer();
  if (io && updatedServer) {
    for (const mId of updatedServer.memberIds) {
      io.to(`user:${mId}`).emit('server:updated', updatedServer);
    }
  }

  res.json({ success: true, server: updatedServer, message: 'Üye rolleri güncellendi.' });
});

// POST /api/servers/:id/channels - create text channel
const createChannelSchema = z.object({
  name: z.string().min(1, 'Kanal adı gereklidir.').max(50),
  isAnnouncementOnly: z.boolean().optional().default(false),
});

router.post('/:id/channels', async (req, res) => {
  const serverId = req.params.id as string;
  const user = req.user!;

  const canManage = user.isAdmin || (await dataStore.hasServerPermission(serverId, user.id, 'manage_channels'));
  if (!canManage) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Yalnızca sunucu yöneticileri veya kanal yönetme yetkisine sahip roller kanal oluşturabilir.' });
    return;
  }

  const parseResult = createChannelSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const { name, isAnnouncementOnly } = parseResult.data;
  const channel = await dataStore.createServerChannel(serverId, user.id, {
    name,
    isAnnouncementOnly,
  });

  await dataStore.recordAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: 'SERVER_CHANNEL_CREATED',
    target: serverId,
    details: `"${channel.name}" kanalı oluşturuldu (${isAnnouncementOnly ? 'Salt okunur duyuru' : 'Genel'})`,
    ipAddress: req.ip,
  });

  const server = await dataStore.getServer(serverId, user.id);
  const io = getSocketServer();
  if (io && server) {
    for (const mId of server.memberIds) {
      io.in(`user:${mId}`).socketsJoin(`conversation:${channel.id}`);
      io.to(`user:${mId}`).emit('server:channel_created', { serverId, channel });
      io.to(`user:${mId}`).emit('conversation:new', channel);
    }
  }

  res.status(201).json({ success: true, channel });
});

// POST /api/servers/:id/members - add member directly or send invite
const addServerMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['admin', 'moderator', 'member']).optional().default('member'),
});

router.post('/:id/members', async (req, res) => {
  const serverId = req.params.id as string;
  const user = req.user!;

  const canManage = user.isAdmin || (await dataStore.hasServerPermission(serverId, user.id, 'manage_server'));
  if (!canManage) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Yalnızca sunucu yöneticileri üye ekleyebilir.' });
    return;
  }

  const parseResult = addServerMemberSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const { userId: targetUserId, role } = parseResult.data;
  const isMember = await dataStore.isServerMember(serverId, targetUserId);
  if (isMember) {
    res.status(400).json({ error: 'ALREADY_MEMBER', message: 'Kullanıcı zaten sunucu üyesidir.' });
    return;
  }

  const targetUser = await dataStore.getUserById(targetUserId);
  if (!targetUser) {
    res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Kullanıcı bulunamadı.' });
    return;
  }

  const whitelistEnabled = await isWhitelistModeEnabled();
  if (whitelistEnabled && !targetUser.isAdmin) {
    const isWhitelisted = await dataStore.isEmailWhitelisted(targetUser.email);
    if (!isWhitelisted) {
      res.status(400).json({ error: 'USER_NOT_WHITELISTED', message: 'Kullanıcı beyaz listede onaylı değil.' });
      return;
    }
  }

  await dataStore.addServerMember(serverId, targetUserId, role);

  await dataStore.recordAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: 'SERVER_MEMBER_ADDED',
    target: serverId,
    details: `${targetUser.displayName} sunucuya eklendi (Rol: ${role})`,
    ipAddress: req.ip,
  });

  const updatedServer = await dataStore.getServer(serverId, user.id);
  const io = getSocketServer();
  if (io && updatedServer) {
    if (updatedServer.channels) {
      for (const ch of updatedServer.channels) {
        io.in(`user:${targetUserId}`).socketsJoin(`conversation:${ch.id}`);
      }
    }
    for (const mId of updatedServer.memberIds) {
      io.to(`user:${mId}`).emit('server:updated', updatedServer);
    }
    io.to(`user:${targetUserId}`).emit('server:new', updatedServer);
  }

  res.json({ success: true, server: updatedServer, message: `${targetUser.displayName} sunucuya eklendi.` });
});

// DELETE /api/servers/:id/members/:userId - remove member or leave server
router.delete('/:id/members/:userId', async (req, res) => {
  const serverId = req.params.id as string;
  const user = req.user!;
  const targetUserId = req.params.userId as string;

  const isSelf = user.id === targetUserId;
  const canKick = user.isAdmin || (await dataStore.hasServerPermission(serverId, user.id, 'kick_members'));

  if (!isSelf && !canKick) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Sunucudan üye çıkarma yetkiniz yok.' });
    return;
  }

  const server = await dataStore.getServer(serverId, user.id);
  if (!server) {
    res.status(404).json({ error: 'SERVER_NOT_FOUND', message: 'Sunucu bulunamadı.' });
    return;
  }

  if (server.ownerId === targetUserId && !user.isAdmin) {
    res.status(400).json({ error: 'CANNOT_REMOVE_OWNER', message: 'Sunucu sahibi sunucudan çıkarılamaz.' });
    return;
  }

  await dataStore.removeServerMember(serverId, targetUserId);

  await dataStore.recordAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: isSelf ? 'SERVER_LEFT' : 'SERVER_MEMBER_REMOVED',
    target: serverId,
    details: isSelf ? `${user.displayName} sunucudan ayrıldı` : `${targetUserId} sunucudan çıkarıldı`,
    ipAddress: req.ip,
  });

  const io = getSocketServer();
  if (io) {
    io.to(`user:${targetUserId}`).emit('server:removed', { serverId });
    if (server.channels) {
      for (const ch of server.channels) {
        io.in(`user:${targetUserId}`).socketsLeave(`conversation:${ch.id}`);
      }
    }
    const updatedServer = await dataStore.getServer(serverId, user.id);
    if (updatedServer) {
      for (const mId of updatedServer.memberIds) {
        io.to(`user:${mId}`).emit('server:updated', updatedServer);
      }
    }
  }

  res.json({ success: true, message: isSelf ? 'Sunucudan ayrıldınız.' : 'Üye sunucudan çıkarıldı.' });
});

// PATCH /api/servers/:id/members/:userId/role - update role and custom tag
const updateServerMemberRoleSchema = z.object({
  role: z.enum(['owner', 'admin', 'moderator', 'member']),
  customTag: z.string().max(30).nullable().optional(),
});

router.patch('/:id/members/:userId/role', async (req, res) => {
  const serverId = req.params.id as string;
  const targetUserId = req.params.userId as string;
  const user = req.user!;

  const server = await dataStore.getServer(serverId, user.id);
  if (!server) {
    res.status(404).json({ error: 'SERVER_NOT_FOUND', message: 'Sunucu bulunamadı.' });
    return;
  }

  const isOwner = server.ownerId === user.id;
  const isPlatformAdmin = user.isAdmin;
  const isAdmin = await dataStore.isServerAdmin(serverId, user.id);

  if (!isOwner && !isPlatformAdmin && !isAdmin) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Yalnızca sunucu sahipleri veya yöneticileri rol atayabilir.' });
    return;
  }

  const parseResult = updateServerMemberRoleSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const { role: newRole, customTag } = parseResult.data;

  // Cannot modify server owner unless owner or platform admin
  if (server.ownerId === targetUserId && !isOwner && !isPlatformAdmin) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Sunucu sahibinin rolü değiştirilemez.' });
    return;
  }

  if (newRole === 'owner' && !isOwner && !isPlatformAdmin) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Yalnızca mevcut sunucu sahibi sahiplik devredebilir.' });
    return;
  }

  await dataStore.updateServerMemberRole(serverId, targetUserId, newRole, customTag);

  await dataStore.recordAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: 'SERVER_ROLE_UPDATED',
    target: targetUserId,
    details: `${server.name} sunucusunda ${targetUserId} kullanıcısına "${newRole}" rolü ve "${customTag || '-'}" etiketi atandı`,
    ipAddress: req.ip,
  });

  const updatedServer = await dataStore.getServer(serverId, user.id);
  const io = getSocketServer();
  if (io && updatedServer) {
    for (const mId of updatedServer.memberIds) {
      io.to(`user:${mId}`).emit('server:updated', updatedServer);
    }
  }

  res.json({ success: true, server: updatedServer });
});

// POST /api/servers/:id/invites - create a server invite link
const createInviteSchema = z.object({
  maxUses: z.number().int().positive().nullable().optional(),
  expiresInHours: z.number().positive().nullable().optional(),
});

router.post('/:id/invites', async (req, res) => {
  const serverId = req.params.id as string;
  const user = req.user!;

  const canManage = user.isAdmin || (await dataStore.hasServerPermission(serverId, user.id, 'manage_server'));
  if (!canManage) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Yalnızca sunucu yöneticileri davet linki oluşturabilir.' });
    return;
  }

  const parseResult = createInviteSchema.safeParse(req.body);
  const maxUses = parseResult.success ? parseResult.data.maxUses : null;
  const expiresInHours = parseResult.success ? parseResult.data.expiresInHours : null;

  let expiresAt: string | null = null;
  if (expiresInHours) {
    expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
  }

  const invite = await dataStore.createServerInvite(serverId, user.id, {
    maxUses: maxUses || null,
    expiresAt,
  });

  res.status(201).json({ success: true, invite });
});

// GET /api/servers/:id/invites - list invites for a server
router.get('/:id/invites', async (req, res) => {
  const serverId = req.params.id as string;
  const user = req.user!;

  const canManage = user.isAdmin || (await dataStore.hasServerPermission(serverId, user.id, 'manage_server'));
  if (!canManage) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Davet listesini görüntüleme yetkiniz yok.' });
    return;
  }

  const invites = await dataStore.getServerInvites(serverId);
  res.json({ invites });
});

// DELETE /api/servers/invites/:inviteId - revoke invite link
router.delete('/invites/:inviteId', async (req, res) => {
  const { inviteId } = req.params;
  const revoked = await dataStore.revokeServerInvite(inviteId);
  res.json({ success: revoked, message: revoked ? 'Davet linki iptal edildi.' : 'Davet bulunamadı.' });
});

// GET /api/servers/invite/:code - preview invite info
router.get('/invite/:code', async (req, res) => {
  const { code } = req.params;
  const invite = await dataStore.getServerInviteByCode(code);
  if (!invite) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Davet linki geçersiz veya süresi dolmuş.' });
    return;
  }

  const server = await dataStore.getServer(invite.serverId, req.user!.id);
  res.json({
    invite: {
      code: invite.code,
      serverId: invite.serverId,
      serverName: server?.name || 'Sunucu',
      serverAvatar: server?.avatarUrl || null,
      serverBanner: server?.bannerUrl || null,
      serverDescription: server?.description || null,
      welcomeMessage: server?.welcomeMessage || null,
      requiresApproval: !!server?.requiresApproval,
      joinQuestions: server?.joinQuestions || [],
      memberCount: server?.memberIds?.length || 0,
      expiresAt: invite.expiresAt,
    },
  });
});

// POST /api/servers/invite/:code/accept or /api/servers/join/:code - accept invite or submit join request with answers
router.post(['/invite/:code/accept', '/join/:code'], async (req, res) => {
  const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
  const user = req.user!;
  const answers = (req.body?.answers as Record<string, string>) || {};

  const invite = await dataStore.getServerInviteByCode(code);
  if (!invite) {
    res.status(404).json({ error: 'INVITE_ERROR', message: 'Davet linki geçersiz veya süresi dolmuş.' });
    return;
  }

  const isMember = await dataStore.isServerMember(invite.serverId, user.id);
  if (isMember) {
    res.status(400).json({ error: 'ALREADY_MEMBER', message: 'Zaten bu sunucunun üyesisiniz.' });
    return;
  }

  const server = await dataStore.getServer(invite.serverId, user.id);
  if (!server) {
    res.status(404).json({ error: 'SERVER_NOT_FOUND', message: 'Sunucu bulunamadı.' });
    return;
  }

  // Check required questions
  if (server.joinQuestions && server.joinQuestions.length > 0) {
    for (const q of server.joinQuestions) {
      if (q.required && (!answers[q.id] || !answers[q.id].trim())) {
        res.status(400).json({
          error: 'MISSING_REQUIRED_ANSWER',
          message: `"${q.question}" sorusunun yanıtlanması zorunludur.`,
        });
        return;
      }
    }
  }

  // Check if requires approval
  if (server.requiresApproval) {
    const hasPending = await dataStore.hasActiveInvitationOrRequest(server.id, user.id);
    if (hasPending) {
      res.status(400).json({
        error: 'PENDING_REQUEST_EXISTS',
        message: 'Bu topluluk için zaten bekleyen bir katılım isteğiniz bulunmaktadır.',
      });
      return;
    }

    const invitation = await dataStore.createMembershipInvitation({
      targetType: 'server',
      targetId: server.id,
      targetName: server.name,
      userId: user.id,
      userDisplayName: user.displayName,
      type: 'request',
      answers,
      createdById: user.id,
    });

    await dataStore.recordAuditLog({
      actorId: user.id,
      actorEmail: user.email,
      action: 'SERVER_JOIN_REQUEST_SUBMITTED',
      target: server.id,
      details: `${user.displayName} katılım isteği ve cevaplarını gönderdi`,
      ipAddress: req.ip,
    });

    const io = getSocketServer();
    if (io) {
      for (const mId of server.memberIds) {
        const canManage = await dataStore.hasServerPermission(server.id, mId, 'manage_server');
        if (canManage) {
          io.to(`user:${mId}`).emit('server:join_request_received', invitation);
        }
      }
    }

    res.json({
      success: true,
      pendingApproval: true,
      serverId: server.id,
      message: 'Katılım isteğiniz ve cevaplarınız topluluk yöneticilerine iletildi. Onaylandıktan sonra topluluğa ekleneceksiniz.',
    });
    return;
  }

  const result = await dataStore.useServerInvite(code, user.id);
  if (!result.success) {
    res.status(400).json({ error: 'INVITE_ERROR', message: result.message });
    return;
  }

  const updatedServer = await dataStore.getServer(result.serverId, user.id);
  const io = getSocketServer();
  if (io && updatedServer) {
    for (const ch of updatedServer.channels || []) {
      io.in(`user:${user.id}`).socketsJoin(`conversation:${ch.id}`);
    }
    for (const mId of updatedServer.memberIds) {
      io.to(`user:${mId}`).emit('server:updated', updatedServer);
    }
  }

  res.json({ success: true, server: updatedServer, serverId: result.serverId, message: result.message });
});

export const serversRouter = router;
