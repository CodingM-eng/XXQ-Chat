import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/index.js';
import { enforceWhitelist } from '../middleware/whitelist.js';
import { dataStore, isWhitelistModeEnabled } from '../db/index.js';
import { getSocketServer } from '../sockets/index.js';

import multer from 'multer';
import { GoogleDriveService } from '../services/drive.js';
import { formatMessage } from '../utils/format.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max limit
});

router.use(requireAuth, enforceWhitelist);

// GET /api/conversations - list current user's conversations
router.get('/', async (req, res) => {
  const userId = req.user!.id;
  const conversations = await dataStore.getUserConversations(userId);
  res.json({ conversations });
});

// GET /api/conversations/groups/search - search discoverable groups
router.get('/groups/search', async (req, res) => {
  const query = (req.query.q as string || '').trim();
  const groups = await dataStore.searchDiscoverableGroups(req.user!.id, query);
  res.json({ groups });
});

// GET /api/conversations/:id - get single conversation summary
router.get('/:id', async (req, res) => {
  const convId = req.params.id;
  const userId = req.user!.id;

  const conv = await dataStore.getConversation(convId, userId);
  if (!conv) {
    res.status(404).json({ error: 'CONVERSATION_NOT_FOUND', message: 'Sohbet bulunamadı veya erişim yetkiniz yok.' });
    return;
  }

  res.json({ conversation: conv });
});

// POST /api/conversations/direct - create or get 1-on-1 direct conversation
const directChatSchema = z.object({
  peerId: z.string().optional(),
  peerEmail: z.string().email().optional(),
  targetUserId: z.string().optional(),
  targetEmail: z.string().email().optional(),
}).refine((data) => data.peerId || data.peerEmail || data.targetUserId || data.targetEmail, {
  message: 'Either peerId or peerEmail must be provided',
});

router.post('/direct', async (req, res) => {
  const parseResult = directChatSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const currentUserId = req.user!.id;
  const peerId = parseResult.data.peerId || parseResult.data.targetUserId;
  const peerEmail = parseResult.data.peerEmail || parseResult.data.targetEmail;

  // Find target peer user
  let peer = null;
  if (peerId) {
    peer = await dataStore.getUserById(peerId);
  } else if (peerEmail) {
    peer = await dataStore.getUserByEmail(peerEmail);
  }

  if (!peer) {
    res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Hedef kullanıcı bulunamadı.' });
    return;
  }

  if (peer.id === currentUserId) {
    res.status(400).json({ error: 'INVALID_OPERATION', message: 'Kendinizle sohbet oluşturamazsınız.' });
    return;
  }

  // Aile role protection: Only platform Admin may initiate direct messages to them
  if (peer.isFamily && !req.user!.isAdmin) {
    res.status(403).json({
      error: 'FAMILY_ROLE_PROTECTED',
      message: 'Aile rolündeki kullanıcılara yalnızca platform yöneticisi doğrudan mesaj başlatabilir.',
    });
    return;
  }

  // Block check: Cannot start direct conversation if either user blocked the other
  const areBlocked = await dataStore.areUsersBlocked(currentUserId, peer.id);
  if (areBlocked) {
    res.status(403).json({
      error: 'USER_BLOCKED',
      message: 'Engellenen veya sizi engelleyen bir kullanıcıyla doğrudan sohbet başlatamazsınız.',
    });
    return;
  }

  // Check if direct conversation already exists
  const existingConvId = await dataStore.getDirectConversation(currentUserId, peer.id);

  if (existingConvId) {
    const io = getSocketServer();
    if (io) {
      io.in(`user:${currentUserId}`).socketsJoin(`conversation:${existingConvId}`);
      io.in(`user:${peer.id}`).socketsJoin(`conversation:${existingConvId}`);
    }

    res.json({
      conversationId: existingConvId,
      isNew: false,
      peer: {
        id: peer.id,
        email: peer.email,
        displayName: peer.displayName,
        avatarUrl: peer.avatarUrl,
      },
    });
    return;
  }

  // Create new direct conversation
  const convId = await dataStore.createDirectConversation(currentUserId, peer.id);

  // Notify both participants via Socket.IO
  const io = getSocketServer();
  if (io) {
    io.in(`user:${currentUserId}`).socketsJoin(`conversation:${convId}`);
    io.in(`user:${peer.id}`).socketsJoin(`conversation:${convId}`);

    // Emit conversation:new to both user rooms
    const convUser1 = await dataStore.getConversation(convId, currentUserId);
    const convUser2 = await dataStore.getConversation(convId, peer.id);
    if (convUser1) io.to(`user:${currentUserId}`).emit('conversation:new', convUser1);
    if (convUser2) io.to(`user:${peer.id}`).emit('conversation:new', convUser2);
  }

  res.status(201).json({
    conversationId: convId,
    isNew: true,
    peer: {
      id: peer.id,
      email: peer.email,
      displayName: peer.displayName,
      avatarUrl: peer.avatarUrl,
    },
  });
});

// POST /api/conversations/group - create a new group conversation
const groupChatSchema = z.object({
  name: z.string().min(1, 'Grup adı gereklidir.').max(60),
  memberIds: z.array(z.string()).optional(),
  participantIds: z.array(z.string()).optional(),
  avatarUrl: z.string().nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  rules: z.string().max(2000).nullable().optional(),
  joinPolicy: z.enum(['auto', 'invite', 'request']).optional().default('auto'),
});

router.post(['/group', '/groups'], async (req, res) => {
  const parseResult = groupChatSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const currentUser = req.user!;
  const { name, avatarUrl, description, rules, joinPolicy } = parseResult.data;
  const rawMemberIds = parseResult.data.memberIds || parseResult.data.participantIds || [];

  const convId = await dataStore.createGroupConversation(currentUser.id, name.trim(), rawMemberIds, avatarUrl || null);

  if (description !== undefined || rules !== undefined || joinPolicy !== undefined) {
    await dataStore.updateGroupSettings(convId, {
      description: description || null,
      rules: rules || null,
      joinPolicy: joinPolicy || 'auto',
    });
  }

  await dataStore.recordAuditLog({
    actorId: currentUser.id,
    actorEmail: currentUser.email,
    action: 'GROUP_CREATED',
    target: convId,
    details: `"${name}" adlı grup oluşturuldu (Katılma ilkesi: ${joinPolicy || 'auto'})`,
    ipAddress: req.ip,
  });

  const participantIds = await dataStore.getConversationParticipantIds(convId);

  // Save system message for group creation
  await dataStore.saveMessage({
    conversationId: convId,
    senderId: currentUser.id,
    senderName: 'Sistem',
    content: `"${name}" grubu oluşturuldu.`,
    type: 'system',
    isSystem: true,
    status: 'delivered',
  });

  // System welcome message for each initial member added
  for (const mId of rawMemberIds) {
    if (mId === currentUser.id) continue;
    const mUser = await dataStore.getUserById(mId);
    await dataStore.saveMessage({
      conversationId: convId,
      senderId: mId,
      senderName: 'Sistem',
      content: `Aramıza hoş geldin, ${mUser?.displayName || 'Yeni Üye'}! 🎉`,
      type: 'system',
      isSystem: true,
      status: 'delivered',
    });
  }

  // Notify all participants via Socket.IO
  const io = getSocketServer();
  if (io) {
    participantIds.forEach((pId) => {
      io.in(`user:${pId}`).socketsJoin(`conversation:${convId}`);
    });

    for (const pId of participantIds) {
      const convSummary = await dataStore.getConversation(convId, pId);
      if (convSummary) {
        io.to(`user:${pId}`).emit('conversation:new', convSummary);
      }
    }
  }

  const createdConv = await dataStore.getConversation(convId, currentUser.id);
  res.status(201).json({ conversation: createdConv });
});

// POST /api/conversations/:id/participants - add members to group
const addParticipantsSchema = z.object({
  userIds: z.array(z.string()).min(1),
});

router.post('/:id/participants', async (req, res) => {
  const convId = req.params.id as string;
  const user = req.user!;

  const isAdmin = await dataStore.isConversationAdmin(convId, user.id);
  const isPlatformAdmin = user.isAdmin;
  if (!isAdmin && !isPlatformAdmin) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Yalnızca grup yöneticileri üye ekleyebilir.' });
    return;
  }

  const parseResult = addParticipantsSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const { userIds } = parseResult.data;
  const currentParticipants = await dataStore.getConversationParticipantIds(convId);
  const whitelistEnabled = await isWhitelistModeEnabled();

  const toAdd: string[] = [];
  for (const uid of userIds) {
    if (currentParticipants.includes(uid)) continue;

    const targetUser = await dataStore.getUserById(uid);
    if (!targetUser) continue;

    if (whitelistEnabled && !targetUser.isAdmin) {
      const isWhitelisted = await dataStore.isEmailWhitelisted(targetUser.email);
      if (!isWhitelisted) {
        res.status(400).json({ error: 'USER_NOT_WHITELISTED', message: `${targetUser.displayName} kullanıcısı beyaz listede onaylı değil.` });
        return;
      }
    }

    // Check user's group add privacy preference
    if (!user.isAdmin) {
      if (targetUser.groupAddPrivacy === 'invite_only') {
        res.status(403).json({
          error: 'PRIVACY_RESTRICTION',
          message: `${targetUser.displayName} gizlilik ayarları nedeniyle doğrudan gruba eklenemez (Yalnızca davet linkiyle katılabilir).`,
        });
        return;
      }
      if (targetUser.groupAddPrivacy === 'friends') {
        const isFriend = await dataStore.areFriends(user.id, targetUser.id);
        if (!isFriend) {
          res.status(403).json({
            error: 'PRIVACY_RESTRICTION',
            message: `${targetUser.displayName} yalnızca arkadaşları tarafından gruplara eklenebilir.`,
          });
          return;
        }
      }
    }

    toAdd.push(uid);
  }

  if (toAdd.length === 0) {
    res.status(400).json({ error: 'ALREADY_MEMBERS', message: 'Seçilen tüm kullanıcılar zaten bu grubun üyesidir.' });
    return;
  }

  await dataStore.addConversationParticipants(convId, toAdd);

  await dataStore.recordAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: 'GROUP_MEMBERS_ADDED',
    target: convId,
    details: `${toAdd.length} üye gruba eklendi`,
    ipAddress: req.ip,
  });

  const io = getSocketServer();
  if (io) {
    toAdd.forEach((uId) => io.in(`user:${uId}`).socketsJoin(`conversation:${convId}`));
    const participantIds = await dataStore.getConversationParticipantIds(convId);
    for (const pId of participantIds) {
      const summary = await dataStore.getConversation(convId, pId);
      if (summary) io.to(`user:${pId}`).emit('conversation:updated', summary);
    }

    // System welcome message for each newly joined member: "Aramıza hoş geldin, {Kullanıcı adı}! 🎉"
    for (const addedId of toAdd) {
      const addedUser = await dataStore.getUserById(addedId);
      const welcomeMsg = await dataStore.saveMessage({
        conversationId: convId,
        senderId: addedId,
        senderName: 'Sistem',
        content: `Aramıza hoş geldin, ${addedUser?.displayName || 'Yeni Üye'}! 🎉`,
        type: 'system',
        isSystem: true,
        status: 'delivered',
      });
      io.to(`conversation:${convId}`).emit('message:new', welcomeMsg);
    }
  }

  const updatedConv = await dataStore.getConversation(convId, user.id);
  res.json({ conversation: updatedConv });
});

const handleRemoveParticipant = async (req: any, res: any) => {
  const convId = req.params.id as string;
  const user = req.user!;
  const targetUserId = req.params.userId || user.id;

  const isSelf = user.id === targetUserId;
  const isAdmin = await dataStore.isConversationAdmin(convId, user.id);
  const isPlatformAdmin = user.isAdmin;

  if (!isSelf && !isAdmin && !isPlatformAdmin) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Gruptan üye çıkarma yetkiniz bulunmamaktadır.' });
    return;
  }

  const targetRole = await dataStore.getConversationRole(convId, targetUserId);
  const currentParticipants = await dataStore.getConversationParticipantIds(convId);

  // Ownership transfer rule: if owner is leaving and other participants remain
  if (targetRole === 'owner' && isSelf && currentParticipants.length > 1) {
    res.status(400).json({
      error: 'OWNERSHIP_TRANSFER_REQUIRED',
      message: 'Grup sahibi gruptan ayrılmadan önce grup sahipliğini başka bir üyeye devretmelidir.',
    });
    return;
  }

  if (targetRole === 'owner' && !isSelf && !isPlatformAdmin) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Grup sahibi gruptan çıkarılamaz.' });
    return;
  }

  const targetUser = await dataStore.getUserById(targetUserId);
  const conv = await dataStore.getConversation(convId, user.id);

  await dataStore.removeConversationParticipant(convId, targetUserId);

  await dataStore.recordAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: isSelf ? 'GROUP_LEFT' : 'GROUP_MEMBER_REMOVED',
    target: convId,
    details: isSelf ? `${user.displayName} gruptan ayrıldı` : `${targetUserId} gruptan çıkarıldı`,
    ipAddress: req.ip,
  });

  // System leave message: "{Kullanıcı adı}, {Grup adı} grubundan ayrıldı. Seni özleyeceğiz."
  const leaveMessageContent = isSelf
    ? `${targetUser?.displayName || 'Bir üye'}, ${conv?.name || 'Grup'} grubundan ayrıldı. Seni özleyeceğiz.`
    : `${targetUser?.displayName || 'Bir üye'}, yöneticiler tarafından gruptan çıkarıldı.`;

  const leaveMsg = await dataStore.saveMessage({
    conversationId: convId,
    senderId: targetUserId,
    senderName: 'Sistem',
    content: leaveMessageContent,
    type: 'system',
    isSystem: true,
    status: 'delivered',
  });

  const io = getSocketServer();
  if (io) {
    io.in(`user:${targetUserId}`).socketsLeave(`conversation:${convId}`);
    io.to(`user:${targetUserId}`).emit('conversation:removed', { conversationId: convId });
    io.to(`conversation:${convId}`).emit('message:new', leaveMsg);

    const remainingParticipants = await dataStore.getConversationParticipantIds(convId);
    for (const pId of remainingParticipants) {
      const summary = await dataStore.getConversation(convId, pId);
      if (summary) io.to(`user:${pId}`).emit('conversation:updated', summary);
    }
  }

  res.json({ success: true, message: isSelf ? 'Gruptan ayrıldınız.' : 'Üye gruptan çıkarıldı.' });
};

router.delete('/:id/participants/:userId', handleRemoveParticipant);
router.post('/:id/leave', (req, res) => {
  (req.params as any).userId = req.user!.id;
  return handleRemoveParticipant(req, res);
});

// PATCH /api/conversations/:id/settings or PATCH /api/conversations/:id - update group settings
const updateGroupSettingsSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  description: z.string().max(1000).nullable().optional(),
  rules: z.string().max(2000).nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  joinPolicy: z.enum(['auto', 'invite', 'request']).optional(),
});

const handleUpdateGroupSettings = async (req: any, res: any) => {
  const convId = req.params.id as string;
  const user = req.user!;

  const isAdmin = await dataStore.isConversationAdmin(convId, user.id);
  const isPlatformAdmin = user.isAdmin;
  if (!isAdmin && !isPlatformAdmin) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Yalnızca grup yöneticileri ayarları güncelleyebilir.' });
    return;
  }

  const parseResult = updateGroupSettingsSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  await dataStore.updateGroupSettings(convId, parseResult.data);

  await dataStore.recordAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: 'GROUP_SETTINGS_UPDATED',
    target: convId,
    details: `Grup ayarları güncellendi: ${Object.keys(parseResult.data).join(', ')}`,
    ipAddress: req.ip,
  });

  const participantIds = await dataStore.getConversationParticipantIds(convId);
  const io = getSocketServer();
  if (io) {
    for (const pId of participantIds) {
      const summary = await dataStore.getConversation(convId, pId);
      if (summary) io.to(`user:${pId}`).emit('conversation:updated', summary);
    }
  }

  const updatedConv = await dataStore.getConversation(convId, user.id);
  res.json({ success: true, conversation: updatedConv });
};

router.patch('/:id/settings', handleUpdateGroupSettings);
router.patch('/:id', handleUpdateGroupSettings);

// PATCH /api/conversations/:id/participants/:userId/role - update role & custom tag
const updateRoleSchema = z.object({
  role: z.enum(['owner', 'admin', 'moderator', 'member']),
  customTag: z.string().max(30).nullable().optional(),
});

router.patch('/:id/participants/:userId/role', async (req, res) => {
  const convId = req.params.id as string;
  const targetUserId = req.params.userId as string;
  const user = req.user!;

  const conv = await dataStore.getConversation(convId, user.id);
  if (!conv) {
    res.status(404).json({ error: 'CONVERSATION_NOT_FOUND', message: 'Grup bulunamadı.' });
    return;
  }

  const actorRole = await dataStore.getConversationRole(convId, user.id);
  const isPlatformAdmin = user.isAdmin;
  const isGroupOwner = actorRole === 'owner' || conv.creatorId === user.id;
  const isGroupAdmin = actorRole === 'admin';

  if (!isPlatformAdmin && !isGroupOwner && !isGroupAdmin) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Yalnızca grup sahipleri veya yöneticileri rol atayabilir.' });
    return;
  }

  const parseResult = updateRoleSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const { role: newRole, customTag } = parseResult.data;

  // Protect owner
  const targetRole = await dataStore.getConversationRole(convId, targetUserId);
  if (targetRole === 'owner' && !isPlatformAdmin && !isGroupOwner) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Grup sahibinin rolü değiştirilemez.' });
    return;
  }

  if (newRole === 'owner' && !isPlatformAdmin && !isGroupOwner) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Yalnızca mevcut grup sahibi sahiplik devredebilir.' });
    return;
  }

  if (newRole === 'owner') {
    if (conv.creatorId && conv.creatorId !== targetUserId) {
      await dataStore.updateParticipantRole(convId, conv.creatorId, 'admin');
    }
  }

  await dataStore.updateParticipantRole(convId, targetUserId, newRole, customTag);

  await dataStore.recordAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: 'GROUP_ROLE_UPDATED',
    target: targetUserId,
    details: `${conv.name} grubunda ${targetUserId} kullanıcısına "${newRole}" rolü ve "${customTag || '-'}" etiketi atandı`,
    ipAddress: req.ip,
  });

  const participantIds = await dataStore.getConversationParticipantIds(convId);
  const io = getSocketServer();
  if (io) {
    for (const pId of participantIds) {
      const summary = await dataStore.getConversation(convId, pId);
      if (summary) io.to(`user:${pId}`).emit('conversation:updated', summary);
    }
  }

  const updatedConv = await dataStore.getConversation(convId, user.id);
  res.json({ success: true, conversation: updatedConv });
});

// POST /api/conversations/:id/invite - send invitation to join group
const inviteSchema = z.object({
  userId: z.string().min(1),
});

router.post('/:id/invite', async (req, res) => {
  const convId = req.params.id as string;
  const user = req.user!;

  const isAdmin = await dataStore.isConversationAdmin(convId, user.id);
  const isPlatformAdmin = user.isAdmin;
  if (!isAdmin && !isPlatformAdmin) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Yalnızca grup yöneticileri davet gönderebilir.' });
    return;
  }

  const parseResult = inviteSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const { userId: targetUserId } = parseResult.data;
  const conv = await dataStore.getConversation(convId, user.id);
  if (!conv) {
    res.status(404).json({ error: 'CONVERSATION_NOT_FOUND', message: 'Grup bulunamadı.' });
    return;
  }

  const isAlreadyMember = await dataStore.isConversationParticipant(convId, targetUserId);
  if (isAlreadyMember) {
    res.status(400).json({ error: 'ALREADY_MEMBER', message: 'Kullanıcı zaten bu grubun üyesidir.' });
    return;
  }

  const targetUser = await dataStore.getUserById(targetUserId);
  if (!targetUser) {
    res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Kullanıcı bulunamadı.' });
    return;
  }

  // Whitelist check
  const whitelistEnabled = await isWhitelistModeEnabled();
  if (whitelistEnabled && !targetUser.isAdmin) {
    const isWhitelisted = await dataStore.isEmailWhitelisted(targetUser.email);
    if (!isWhitelisted) {
      res.status(400).json({ error: 'USER_NOT_WHITELISTED', message: 'Kullanıcı beyaz listede onaylı değil.' });
      return;
    }
  }

  // If join policy is 'auto', directly add!
  if (conv.joinPolicy === 'auto') {
    await dataStore.addConversationParticipants(convId, [targetUserId]);
    const io = getSocketServer();
    if (io) {
      io.in(`user:${targetUserId}`).socketsJoin(`conversation:${convId}`);
      const summary = await dataStore.getConversation(convId, targetUserId);
      if (summary) io.to(`user:${targetUserId}`).emit('conversation:new', summary);
    }
    res.json({ success: true, autoAdded: true, message: `${targetUser.displayName} gruba doğrudan eklendi.` });
    return;
  }

  // Check if active invitation already exists
  const hasActive = await dataStore.hasActiveInvitationOrRequest(convId, targetUserId);
  if (hasActive) {
    res.status(400).json({ error: 'ALREADY_PENDING', message: 'Bu kullanıcı için zaten bekleyen bir davet veya istek bulunmaktadır.' });
    return;
  }

  const invitation = await dataStore.createMembershipInvitation({
    targetType: 'group',
    targetId: convId,
    targetName: conv.name,
    userId: targetUserId,
    userDisplayName: targetUser.displayName,
    type: 'invite',
    createdById: user.id,
  });

  const io = getSocketServer();
  if (io) {
    io.to(`user:${targetUserId}`).emit('invitation:new', invitation);
  }

  res.status(200).json({
    success: true,
    invitation,
    invitationId: invitation.id,
    message: `${targetUser.displayName} kullanıcısına grup daveti gönderildi.`,
  });
});

// POST /api/conversations/:id/join-request - submit a request to join group
router.post('/:id/join-request', async (req, res) => {
  const convId = req.params.id as string;
  const user = req.user!;

  const isAlreadyMember = await dataStore.isConversationParticipant(convId, user.id);
  if (isAlreadyMember) {
    res.status(400).json({ error: 'ALREADY_MEMBER', message: 'Zaten bu grubun üyesisiniz.' });
    return;
  }

  // Find conversation
  const allGroups = await dataStore.getAllGroups();
  const conv = allGroups.find((g) => g.id === convId);
  if (!conv) {
    res.status(404).json({ error: 'CONVERSATION_NOT_FOUND', message: 'Grup bulunamadı.' });
    return;
  }

  // If join policy is 'auto', add immediately!
  if (conv.joinPolicy === 'auto') {
    await dataStore.addConversationParticipants(convId, [user.id]);
    const io = getSocketServer();
    if (io) {
      io.in(`user:${user.id}`).socketsJoin(`conversation:${convId}`);
      const summary = await dataStore.getConversation(convId, user.id);
      if (summary) io.to(`user:${user.id}`).emit('conversation:new', summary);
    }
    res.json({ success: true, autoAdded: true, message: 'Gruba başarıyla katıldınız.' });
    return;
  }

  // Check if active request already exists
  const hasActive = await dataStore.hasActiveInvitationOrRequest(convId, user.id);
  if (hasActive) {
    res.status(400).json({ error: 'ALREADY_PENDING', message: 'Zaten bekleyen bir katılma isteğiniz bulunmaktadır.' });
    return;
  }

  const invitation = await dataStore.createMembershipInvitation({
    targetType: 'group',
    targetId: convId,
    targetName: conv.name,
    userId: user.id,
    userDisplayName: user.displayName,
    type: 'request',
    createdById: user.id,
  });

  // Notify admins
  const io = getSocketServer();
  if (io && conv.adminIds) {
    for (const adminId of conv.adminIds) {
      io.to(`user:${adminId}`).emit('join_request:new', invitation);
    }
  }

  res.status(200).json({
    success: true,
    invitation,
    invitationId: invitation.id,
    message: 'Katılma isteğiniz grup yöneticilerine iletildi.',
  });
});

// GET /api/conversations/:id/messages - get conversation message history
router.get('/:id/messages', async (req, res) => {
  const convId = req.params.id;
  const userId = req.user!.id;
  const limit = Math.min(Number(req.query.limit) || 50, 100);

  // Check participant authorization
  const isParticipant = await dataStore.isConversationParticipant(convId, userId);

  if (!isParticipant) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Bu sohbete erişim yetkiniz yok.' });
    return;
  }

  const messages = await dataStore.getConversationMessages(convId, limit);

  // Update participant's read receipt
  if (messages.length > 0) {
    const lastMsg = messages[messages.length - 1];
    await dataStore.markConversationRead(convId, userId, lastMsg.id);
  }

  res.json({
    messages: messages.map(formatMessage),
  });
});

// POST /api/conversations/:id/attachments - upload an attachment to connected Google Drive
router.post('/:id/attachments', upload.single('file'), async (req, res) => {
  const convId = req.params.id as string;
  const user = req.user!;

  const isParticipant = await dataStore.isConversationParticipant(convId, user.id);
  if (!isParticipant) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Bu sohbete dosya yükleme yetkiniz yok.' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'NO_FILE', message: 'Yüklenecek bir dosya seçilmedi.' });
    return;
  }

  const accounts = await dataStore.getDriveAccounts();
  if (!accounts || accounts.length === 0) {
    res.status(400).json({
      error: 'NO_DRIVE_ACCOUNT',
      message: 'Dosya yüklemek için önce bir Google Drive hesabı bağlanmalıdır. Lütfen yönetici ile iletişime geçin.',
    });
    return;
  }

  // Use the primary or first active drive account
  const driveAccount = accounts[0];

  try {
    const uploaded = await GoogleDriveService.uploadFile(driveAccount, {
      buffer: req.file.buffer,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
    });

    const attachment = await dataStore.saveAttachment({
      conversationId: convId,
      uploaderId: user.id,
      driveAccountId: driveAccount.id,
      driveAccountEmail: driveAccount.email,
      driveFileId: uploaded.driveFileId,
      fileName: req.file.originalname,
      fileSize: uploaded.size,
      mimeType: req.file.mimetype || 'application/octet-stream',
    });

    res.status(201).json({ attachment });
  } catch (err: any) {
    console.error('[ATTACHMENT UPLOAD ERROR]', err);
    res.status(500).json({ error: 'UPLOAD_FAILED', message: err.message || 'Dosya yüklenirken bir hata oluştu.' });
  }
});

// GET /api/conversations/:id/attachments/:attachmentId - stream file securely to conversation participant
router.get('/:id/attachments/:attachmentId', async (req, res) => {
  const convId = req.params.id as string;
  const attachmentId = req.params.attachmentId as string;
  const user = req.user!;

  const isParticipant = await dataStore.isConversationParticipant(convId, user.id);
  if (!isParticipant) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Bu dosyaya erişim yetkiniz yok.' });
    return;
  }

  try {
    const attachment = await dataStore.getAttachmentById(attachmentId);
    if (!attachment || attachment.conversationId !== convId) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Ek dosya bulunamadı.' });
      return;
    }

    const driveAccount = await dataStore.getDriveAccountById(attachment.driveAccountId);
    if (!driveAccount) {
      res.status(500).json({ error: 'DRIVE_ACCOUNT_MISSING', message: 'Bağlı Drive hesabı bulunamadı.' });
      return;
    }

    const fileData = await GoogleDriveService.getFileStream(driveAccount, attachment.driveFileId);

    res.setHeader('Content-Type', fileData.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(fileData.fileName)}`);
    if (fileData.size) {
      res.setHeader('Content-Length', fileData.size);
    }

    fileData.stream.pipe(res);
  } catch (err: any) {
    console.error('[ATTACHMENT STREAM ERROR]', err);
    res.status(500).json({ error: 'STREAM_FAILED', message: 'Dosya indirilemedi.' });
  }
});

// POST /api/conversations/:id/messages - send a message (supporting reply, forward & attachments)
const sendMessageSchema = z
  .object({
    content: z.string().max(5000).default(''),
    clientMessageId: z.string().max(100).optional(),
    replyToMessageId: z.string().optional(),
    forwardedFrom: z.object({ senderName: z.string() }).optional(),
    type: z.enum(['text', 'image', 'video', 'voice', 'file', 'system']).optional(),
    attachments: z
      .array(
        z.object({
          id: z.string(),
          conversationId: z.string(),
          uploaderId: z.string(),
          driveAccountId: z.string(),
          driveAccountEmail: z.string().optional(),
          driveFileId: z.string(),
          fileName: z.string(),
          fileSize: z.number(),
          mimeType: z.string(),
          createdAt: z.string(),
        })
      )
      .optional(),
  })
  .refine((data) => data.content.trim().length > 0 || (data.attachments && data.attachments.length > 0) || data.type === 'voice', {
    message: 'Mesaj içeriği veya dosya eki zorunludur.',
  });

router.post('/:id/messages', async (req, res) => {
  const convId = req.params.id as string;
  const user = req.user!;

  const parseResult = sendMessageSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_MESSAGE', details: parseResult.error.format() });
    return;
  }

  // Check participant authorization
  const isParticipant = await dataStore.isConversationParticipant(convId, user.id);

  if (!isParticipant) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Bu sohbete mesaj gönderme yetkiniz yok.' });
    return;
  }

  const conv = await dataStore.getConversation(convId, user.id);

  // Aile role & block guard for direct messaging
  if (conv && conv.type === 'direct') {
    const participants = await dataStore.getConversationParticipantIds(convId);
    const peerId = participants.find((id) => id !== user.id);
    if (peerId) {
      const areBlocked = await dataStore.areUsersBlocked(user.id, peerId);
      if (areBlocked) {
        res.status(403).json({
          error: 'USER_BLOCKED',
          message: 'Engellenen veya sizi engelleyen bir kullanıcıya mesaj gönderemezsiniz.',
        });
        return;
      }

      if (!user.isAdmin) {
        const peer = await dataStore.getUserById(peerId);
        if (peer && peer.isFamily) {
          res.status(403).json({
            error: 'FAMILY_ROLE_PROTECTED',
            message: 'Aile rolündeki kullanıcılara yalnızca platform yöneticisi mesaj gönderebilir.',
          });
          return;
        }
      }
    }
  }

  // Check announcement-only channel permission
  if (conv && conv.isAnnouncementOnly) {
    const role = await dataStore.getConversationRole(convId, user.id);
    let canSend = role === 'owner' || role === 'admin' || user.isAdmin;
    if (!canSend && conv.serverId) {
      canSend = await dataStore.hasServerPermission(conv.serverId, user.id, 'send_announcements');
    }
    if (!canSend) {
      res.status(403).json({
        error: 'ANNOUNCEMENT_ONLY',
        message: 'Bu kanal salt okunur duyuru kanalıdır. Yalnızca yöneticiler veya yetkili roller mesaj gönderebilir.',
      });
      return;
    }
  }

  const { content, clientMessageId, replyToMessageId, forwardedFrom, attachments, type } = parseResult.data;

  // Deduplication check
  if (clientMessageId) {
    const existing = await dataStore.findMessageByClientId(clientMessageId, user.id, convId);
    if (existing) {
      res.json({ message: formatMessage(existing), deduplicated: true });
      return;
    }
  }

  let replyTo = null;
  if (replyToMessageId) {
    const convMessages = await dataStore.getConversationMessages(convId, 100);
    const parentMsg = convMessages.find((m) => m.id === replyToMessageId);
    if (parentMsg) {
      replyTo = {
        id: parentMsg.id,
        senderId: parentMsg.senderId,
        senderName: parentMsg.senderName,
        content: parentMsg.content,
      };
    }
  }

  const savedMessage = await dataStore.saveMessage({
    conversationId: convId,
    senderId: user.id,
    senderName: user.displayName,
    senderAvatar: user.avatarUrl || null,
    clientMessageId: clientMessageId || null,
    content: content || '',
    type: type || 'text',
    isSystem: type === 'system',
    replyTo,
    forwardedFrom: forwardedFrom || null,
    attachments: attachments || null,
    status: 'sent',
  });

  const formatted = formatMessage(savedMessage);

  // Broadcast to Socket.IO room if running
  const io = getSocketServer();
  if (io) {
    const participantIds = await dataStore.getConversationParticipantIds(convId);
    await Promise.all(
      participantIds.map((pId) => io.in(`user:${pId}`).socketsJoin(`conversation:${convId}`))
    );
    const targetRooms = [`conversation:${convId}`, ...participantIds.map((pId) => `user:${pId}`)];
    io.to(targetRooms).emit('message:new', formatted);
  }

  res.status(201).json({ message: formatted });
});

// DELETE /api/conversations/:id/messages/:messageId - delete a message (Author, Admin, or Moderator)
router.delete('/:id/messages/:messageId', async (req, res) => {
  const convId = req.params.id as string;
  const messageId = req.params.messageId as string;
  const user = req.user!;

  const isParticipant = await dataStore.isConversationParticipant(convId, user.id);
  if (!isParticipant) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Bu sohbete erişim yetkiniz yok.' });
    return;
  }

  const messages = await dataStore.getConversationMessages(convId, 100);
  const targetMsg = messages.find((m) => m.id === messageId);

  if (!targetMsg) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Mesaj bulunamadı.' });
    return;
  }

  const isAuthor = targetMsg.senderId === user.id;
  const isModeratorOrAdmin = user.isAdmin || user.isModerator;

  if (!isAuthor && !isModeratorOrAdmin) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Bu mesajı silme yetkiniz yok.' });
    return;
  }

  const deleted = await dataStore.deleteMessage(convId, messageId);

  if (deleted) {
    const io = getSocketServer();
    if (io) {
      const participantIds = await dataStore.getConversationParticipantIds(convId);
      const targetRooms = [`conversation:${convId}`, ...participantIds.map((pId) => `user:${pId}`)];
      io.to(targetRooms).emit('message:deleted', {
        conversationId: convId,
        messageId,
      });
    }
  }

  res.json({ success: true, messageId });
});

// POST /api/conversations/:id/messages/:messageId/reactions - toggle emoji reaction
const reactionSchema = z.object({
  emoji: z.string().min(1).max(10),
});

router.post('/:id/messages/:messageId/reactions', async (req, res) => {
  const convId = req.params.id as string;
  const messageId = req.params.messageId as string;
  const user = req.user!;

  const isParticipant = await dataStore.isConversationParticipant(convId, user.id);
  if (!isParticipant) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Tepki verme yetkiniz yok.' });
    return;
  }

  const parseResult = reactionSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const { emoji } = parseResult.data;
  const reactions = await dataStore.toggleMessageReaction(convId, messageId, user.id, emoji);

  const io = getSocketServer();
  if (io) {
    const participantIds = await dataStore.getConversationParticipantIds(convId);
    const targetRooms = [`conversation:${convId}`, ...participantIds.map((pId) => `user:${pId}`)];
    io.to(targetRooms).emit('message:reaction', {
      conversationId: convId,
      messageId,
      reactions,
    });
  }

  res.json({ success: true, reactions });
});

// POST /api/conversations/:id/avatar - update group logo / conversation avatar
router.post('/:id/avatar', (req, res) => {
  upload.single('file')(req, res, async (err: any) => {
    if (err) {
      res.status(400).json({ error: 'UPLOAD_ERROR', message: err.message || 'Resim yüklenirken hata oluştu.' });
      return;
    }

    const convId = req.params.id as string;
    const user = req.user!;

    const isParticipant = await dataStore.isConversationParticipant(convId, user.id);
    if (!isParticipant) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Bu sohbette grup logosunu değiştirme yetkiniz yok.' });
      return;
    }

    const conv = await dataStore.getConversation(convId, user.id);
    if (!conv) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Sohbet bulunamadı.' });
      return;
    }

    // If group, verify admin or creator or member
    if (conv.type === 'group') {
      const isAdmin = await dataStore.isConversationAdmin(convId, user.id);
      const isCreator = conv.creatorId === user.id;
      if (!isAdmin && !isCreator && !user.isAdmin) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Yalnızca grup yöneticileri veya grup kurucusu logoyu değiştirebilir.' });
        return;
      }
    }

    let newAvatarUrl: string | null = null;
    if (req.file) {
      if (!req.file.mimetype.startsWith('image/')) {
        res.status(400).json({ error: 'INVALID_FILE_TYPE', message: 'Yalnızca resim dosyası yüklenebilir.' });
        return;
      }
      newAvatarUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    } else if (req.body && typeof req.body.avatarUrl === 'string') {
      const url = req.body.avatarUrl.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:image/')) {
        res.status(400).json({ error: 'INVALID_URL', message: 'Geçersiz resim bağlantısı.' });
        return;
      }
      newAvatarUrl = url;
    } else {
      res.status(400).json({ error: 'NO_IMAGE', message: 'Bir resim dosyası veya geçerli bir resim bağlantısı belirtilmelidir.' });
      return;
    }

    await dataStore.updateConversation(convId, { avatarUrl: newAvatarUrl });

    const io = getSocketServer();
    if (io) {
      const participantIds = await dataStore.getConversationParticipantIds(convId);
      const targetRooms = [`conversation:${convId}`, ...participantIds.map((pId) => `user:${pId}`)];
      io.to(targetRooms).emit('conversation:updated', {
        conversationId: convId,
        avatarUrl: newAvatarUrl,
      });
    }

    res.json({
      success: true,
      avatarUrl: newAvatarUrl,
      message: 'Grup logosu başarıyla güncellendi.',
    });
  });
});

// DELETE /api/conversations/:id/avatar - remove group logo
router.delete('/:id/avatar', async (req, res) => {
  const convId = req.params.id as string;
  const user = req.user!;

  const isParticipant = await dataStore.isConversationParticipant(convId, user.id);
  if (!isParticipant) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Yetkiniz yok.' });
    return;
  }

  const conv = await dataStore.getConversation(convId, user.id);
  if (!conv) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Sohbet bulunamadı.' });
    return;
  }

  if (conv.type === 'group') {
    const isAdmin = await dataStore.isConversationAdmin(convId, user.id);
    const isCreator = conv.creatorId === user.id;
    if (!isAdmin && !isCreator && !user.isAdmin) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Yalnızca grup yöneticileri logoyu kaldırabilir.' });
      return;
    }
  }

  await dataStore.updateConversation(convId, { avatarUrl: null });

  const io = getSocketServer();
  if (io) {
    const participantIds = await dataStore.getConversationParticipantIds(convId);
    const targetRooms = [`conversation:${convId}`, ...participantIds.map((pId) => `user:${pId}`)];
    io.to(targetRooms).emit('conversation:updated', {
      conversationId: convId,
      avatarUrl: null,
    });
  }

  res.json({
    success: true,
    avatarUrl: null,
    message: 'Grup logosu başarıyla kaldırıldı.',
  });
});

export const conversationsRouter = router;

