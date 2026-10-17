import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/index.js';
import { enforceWhitelist } from '../middleware/whitelist.js';
import { dataStore } from '../db/index.js';
import { getSocketServer } from '../sockets/index.js';

const router = Router();
router.use(requireAuth, enforceWhitelist);

// GET /api/friends - list user's friends
router.get('/', async (req, res) => {
  const user = req.user!;
  const friends = await dataStore.getFriends(user.id);
  res.json({
    friends: friends.map((f) => ({
      id: f.id,
      email: f.email,
      displayName: f.displayName,
      avatarUrl: f.avatarUrl,
      bio: f.bio || null,
      isAdmin: f.isAdmin,
      isModerator: f.isModerator,
      isFamily: !!f.isFamily,
      lastActiveAt: f.lastActiveAt,
    })),
  });
});

// GET /api/friends/requests - list incoming & outgoing friend requests
router.get('/requests', async (req, res) => {
  const user = req.user!;
  const requests = await dataStore.getFriendRequests(user.id);
  res.json(requests);
});

// POST /api/friends/request - send friend request by userId or email
const sendRequestSchema = z.object({
  target: z.string().optional(),
  targetEmailOrId: z.string().optional(),
  recipientEmail: z.string().optional(),
  recipientId: z.string().optional(),
}).refine((d) => d.target || d.targetEmailOrId || d.recipientEmail || d.recipientId, {
  message: 'Hedef kullanıcı ID veya e-posta adresi gereklidir.',
});

router.post('/request', async (req, res) => {
  const parseResult = sendRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: 'Geçerli bir kullanıcı veya e-posta adresi giriniz.' });
    return;
  }

  const user = req.user!;
  const target = (parseResult.data.target || parseResult.data.targetEmailOrId || parseResult.data.recipientEmail || parseResult.data.recipientId) as string;

  try {
    const friendRequest = await dataStore.sendFriendRequest(user.id, target);

    // Real-time socket notification to receiver
    const io = getSocketServer();
    if (io) {
      io.to(`user:${friendRequest.receiverId}`).emit('friend:request_received', friendRequest);
    }

    res.status(201).json({
      success: true,
      request: friendRequest,
      message: `${friendRequest.receiverName} kullanıcısına arkadaşlık isteği gönderildi.`,
    });
  } catch (err: any) {
    res.status(400).json({ error: 'REQUEST_FAILED', message: err.message || 'İstek gönderilemedi.' });
  }
});

// POST /api/friends/request/:id/respond or /api/friends/respond - accept or decline friend request
const handleRespondFriendRequest = async (req: any, res: any) => {
  const user = req.user!;
  const id = req.params.id || req.body.requestId;
  const rawAction = req.body.action || (req.body.response === 'accepted' ? 'accept' : req.body.response === 'declined' ? 'decline' : req.body.response);
  const action = rawAction === 'accepted' ? 'accept' : rawAction === 'declined' ? 'decline' : rawAction;

  if (!id || (action !== 'accept' && action !== 'decline')) {
    res.status(400).json({ error: 'INVALID_INPUT', message: 'Geçersiz işlem veya istek ID.' });
    return;
  }

  try {
    const updated = await dataStore.respondFriendRequest(id, user.id, action);

    // Notify sender in real time
    const io = getSocketServer();
    if (io) {
      io.to(`user:${updated.senderId}`).emit('friend:request_resolved', updated);
      if (action === 'accept') {
        const friendUser = await dataStore.getUserById(user.id);
        io.to(`user:${updated.senderId}`).emit('friend:added', friendUser);
      }
    }

    res.json({
      success: true,
      request: updated,
      message: action === 'accept' ? 'Arkadaşlık isteği kabul edildi.' : 'Arkadaşlık isteği reddedildi.',
    });
  } catch (err: any) {
    res.status(400).json({ error: 'ACTION_FAILED', message: err.message || 'İşlem gerçekleştirilemedi.' });
  }
};

router.post(['/request/:id/respond', '/respond'], handleRespondFriendRequest);

// DELETE /api/friends/:friendId - remove friend
router.delete('/:friendId', async (req, res) => {
  const user = req.user!;
  const { friendId } = req.params;

  const removed = await dataStore.removeFriend(user.id, friendId);

  const io = getSocketServer();
  if (io) {
    io.to(`user:${friendId}`).emit('friend:removed', { friendId: user.id });
  }

  res.json({
    success: true,
    message: removed ? 'Arkadaş listeden kaldırıldı.' : 'Kayıt bulunamadı.',
  });
});

export const friendsRouter = router;
