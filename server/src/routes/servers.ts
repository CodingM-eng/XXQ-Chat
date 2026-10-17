import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/index.js';
import { enforceWhitelist } from '../middleware/whitelist.js';
import { dataStore, isWhitelistModeEnabled } from '../db/index.js';
import { getSocketServer } from '../sockets/index.js';
import { ServerPurpose } from '../db/types.js';

const router = Router();
router.use(requireAuth, enforceWhitelist);

const serverPurposeSchema = z.enum(['gaming', 'chat', 'community', 'business', 'other']);

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
  rules: z.string().max(2000).nullable().optional(),
});

router.post('/', async (req, res) => {
  const parseResult = createServerSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const user = req.user!;
  const { name, description, purpose, avatarUrl, rules } = parseResult.data;

  const result = await dataStore.createServer(user.id, {
    name: name.trim(),
    description: description || null,
    purpose: purpose as ServerPurpose,
    avatarUrl: avatarUrl || null,
    rules: rules || null,
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
  rules: z.string().max(2000).nullable().optional(),
});

router.patch('/:id', async (req, res) => {
  const serverId = req.params.id as string;
  const user = req.user!;

  const isAdmin = await dataStore.isServerAdmin(serverId, user.id);
  const isPlatformAdmin = user.isAdmin;
  if (!isAdmin && !isPlatformAdmin) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Yalnızca sunucu yöneticileri ayarları değiştirebilir.' });
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

// POST /api/servers/:id/channels - create text channel
const createChannelSchema = z.object({
  name: z.string().min(1, 'Kanal adı gereklidir.').max(50),
  isAnnouncementOnly: z.boolean().optional().default(false),
});

router.post('/:id/channels', async (req, res) => {
  const serverId = req.params.id as string;
  const user = req.user!;

  const isAdmin = await dataStore.isServerAdmin(serverId, user.id);
  const isPlatformAdmin = user.isAdmin;
  if (!isAdmin && !isPlatformAdmin) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Yalnızca sunucu yöneticileri kanal oluşturabilir.' });
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

  const isAdmin = await dataStore.isServerAdmin(serverId, user.id);
  const isPlatformAdmin = user.isAdmin;
  if (!isAdmin && !isPlatformAdmin) {
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
  const isAdmin = await dataStore.isServerAdmin(serverId, user.id);
  const isPlatformAdmin = user.isAdmin;

  if (!isSelf && !isAdmin && !isPlatformAdmin) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Sunucudan üye çıkarma yetkiniz yok.' });
    return;
  }

  const server = await dataStore.getServer(serverId, user.id);
  if (!server) {
    res.status(404).json({ error: 'SERVER_NOT_FOUND', message: 'Sunucu bulunamadı.' });
    return;
  }

  if (server.ownerId === targetUserId && !isPlatformAdmin) {
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

export const serversRouter = router;
