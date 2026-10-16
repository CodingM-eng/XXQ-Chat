import { Router } from 'express';
import { requireAuth } from '../auth/index.js';
import { enforceWhitelist } from '../middleware/whitelist.js';
import { dataStore } from '../db/index.js';

const router = Router();

router.use(requireAuth, enforceWhitelist);

// GET /api/search?q=...&type=all|messages|users|conversations&conversationId=...
router.get('/', async (req, res) => {
  const user = req.user!;
  const query = (req.query.q as string || '').trim();
  const type = (req.query.type as string || 'all').toLowerCase();
  const conversationId = req.query.conversationId as string | undefined;

  if (!query) {
    res.json({
      query: '',
      conversations: [],
      users: [],
      messages: [],
    });
    return;
  }

  const results: {
    query: string;
    conversations: any[];
    users: any[];
    messages: any[];
  } = {
    query,
    conversations: [],
    users: [],
    messages: [],
  };

  const lowerQuery = query.toLowerCase();

  // Search Conversations
  if (type === 'all' || type === 'conversations') {
    const userConvs = await dataStore.getUserConversations(user.id);
    results.conversations = userConvs
      .filter((c) => {
        const title = (c.name || (c.peer ? c.peer.displayName : '')).toLowerCase();
        return title.includes(lowerQuery);
      })
      .slice(0, 20);
  }

  // Search Users / Contacts (only approved active users, never leaking private phone numbers)
  if (type === 'all' || type === 'users') {
    const matchedUsers = await dataStore.searchUsers(user.id, query);
    results.users = matchedUsers.slice(0, 20).map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      isAdmin: u.isAdmin,
    }));
  }

  // Search Messages (strictly restricted to conversations user participates in)
  if (type === 'all' || type === 'messages') {
    results.messages = await dataStore.searchMessages(user.id, query, conversationId);
  }

  res.json(results);
});

export const searchRouter = router;
