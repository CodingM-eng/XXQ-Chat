import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/index.js';
import { enforceWhitelist } from '../middleware/whitelist.js';
import { dataStore } from '../db/index.js';
import { getSocketServer } from '../sockets/index.js';

const router = Router();
router.use(requireAuth, enforceWhitelist);

// GET /api/invitations/my - list pending invitations for current user
router.get('/my', async (req, res) => {
  const userId = req.user!.id;
  const invitations = await dataStore.getUserInvitations(userId);
  res.json({ invitations });
});

// POST /api/invitations/:id/respond - accept or decline an invitation
const respondSchema = z.object({
  action: z.enum(['accept', 'decline', 'accepted', 'declined', 'rejected']).optional(),
  response: z.enum(['accept', 'decline', 'accepted', 'declined', 'rejected']).optional(),
});

router.post('/:id/respond', async (req, res) => {
  const invId = req.params.id as string;
  const user = req.user!;

  const parseResult = respondSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const rawAction = parseResult.data.action || parseResult.data.response;
  if (!rawAction) {
    res.status(400).json({ error: 'INVALID_INPUT', message: 'Yanıt gereklidir.' });
    return;
  }

  const myInvitations = await dataStore.getUserInvitations(user.id);
  const invitation = myInvitations.find((i) => i.id === invId);

  if (!invitation) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Bekleyen davet bulunamadı.' });
    return;
  }

  const isAccept = rawAction === 'accept' || rawAction === 'accepted';
  const newStatus = isAccept ? 'accepted' : 'declined';
  const resolved = await dataStore.resolveMembershipInvitation(invId, newStatus, user.id);

  if (isAccept) {
    if (invitation.targetType === 'group') {
      await dataStore.addConversationParticipants(invitation.targetId, [user.id]);
      const io = getSocketServer();
      if (io) {
        io.in(`user:${user.id}`).socketsJoin(`conversation:${invitation.targetId}`);
        const summary = await dataStore.getConversation(invitation.targetId, user.id);
        if (summary) io.to(`user:${user.id}`).emit('conversation:new', summary);
      }
    } else if (invitation.targetType === 'server') {
      await dataStore.addServerMember(invitation.targetId, user.id, 'member');
      const io = getSocketServer();
      if (io) {
        const server = await dataStore.getServer(invitation.targetId, user.id);
        if (server) {
          if (server.channels) {
            for (const ch of server.channels) {
              io.in(`user:${user.id}`).socketsJoin(`conversation:${ch.id}`);
            }
          }
          io.to(`user:${user.id}`).emit('server:new', server);
        }
      }
    }
  }

  await dataStore.recordAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: isAccept ? 'INVITATION_ACCEPTED' : 'INVITATION_DECLINED',
    target: invitation.targetId,
    details: `${invitation.targetName} için davet ${isAccept ? 'kabul edildi' : 'reddedildi'}`,
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    invitation: resolved,
    message: isAccept ? 'Davet kabul edildi, topluluğa katıldınız.' : 'Davet reddedildi.',
  });
});

// GET /api/invitations/requests/:targetType/:targetId - list pending join requests
router.get('/requests/:targetType/:targetId', async (req, res) => {
  const targetType = req.params.targetType as 'group' | 'server';
  const targetId = req.params.targetId as string;
  const user = req.user!;

  if (targetType === 'group') {
    const isAdmin = await dataStore.isConversationAdmin(targetId, user.id);
    if (!isAdmin && !user.isAdmin) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Yetkiniz bulunmuyor.' });
      return;
    }
  } else if (targetType === 'server') {
    const isAdmin = await dataStore.isServerAdmin(targetId, user.id);
    if (!isAdmin && !user.isAdmin) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Yetkiniz bulunmuyor.' });
      return;
    }
  } else {
    res.status(400).json({ error: 'INVALID_TARGET_TYPE' });
    return;
  }

  const requests = await dataStore.getTargetJoinRequests(targetType, targetId);
  res.json({ requests });
});

// POST /api/invitations/requests/:id/resolve - approve or reject a join request
const resolveRequestSchema = z.object({
  action: z.enum(['approve', 'reject']),
});

router.post('/requests/:id/resolve', async (req, res) => {
  const reqId = req.params.id as string;
  const user = req.user!;

  const parseResult = resolveRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const { action } = parseResult.data;
  const status = action === 'approve' ? 'approved' : 'rejected';
  const resolved = await dataStore.resolveMembershipInvitation(reqId, status, user.id);

  if (!resolved) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'İstek bulunamadı.' });
    return;
  }

  if (action === 'approve') {
    if (resolved.targetType === 'group') {
      await dataStore.addConversationParticipants(resolved.targetId, [resolved.userId]);
      const io = getSocketServer();
      if (io) {
        io.in(`user:${resolved.userId}`).socketsJoin(`conversation:${resolved.targetId}`);
        const summary = await dataStore.getConversation(resolved.targetId, resolved.userId);
        if (summary) io.to(`user:${resolved.userId}`).emit('conversation:new', summary);
      }
    } else if (resolved.targetType === 'server') {
      await dataStore.addServerMember(resolved.targetId, resolved.userId, 'member');
      const io = getSocketServer();
      if (io) {
        const server = await dataStore.getServer(resolved.targetId, resolved.userId);
        if (server) {
          if (server.channels) {
            for (const ch of server.channels) {
              io.in(`user:${resolved.userId}`).socketsJoin(`conversation:${ch.id}`);
            }
          }
          io.to(`user:${resolved.userId}`).emit('server:new', server);
        }
      }
    }
  }

  await dataStore.recordAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: action === 'approve' ? 'JOIN_REQUEST_APPROVED' : 'JOIN_REQUEST_REJECTED',
    target: resolved.targetId,
    details: `${resolved.userDisplayName} kullanıcısının ${resolved.targetName} için katılma isteği ${action === 'approve' ? 'onaylandı' : 'reddedildi'}`,
    ipAddress: req.ip,
  });

  const io = getSocketServer();
  if (io) {
    io.to(`user:${resolved.userId}`).emit('join_request:resolved', {
      requestId: resolved.id,
      targetType: resolved.targetType,
      targetId: resolved.targetId,
      targetName: resolved.targetName,
      status: resolved.status,
    });
  }

  res.json({
    success: true,
    invitation: resolved,
    message: action === 'approve' ? 'Katılma isteği onaylandı ve kullanıcı eklendi.' : 'Katılma isteği reddedildi.',
  });
});

export const invitationsRouter = router;
