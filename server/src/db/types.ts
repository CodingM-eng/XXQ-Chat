export interface DbUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  isAdmin: boolean;
  createdAt: string;
  lastActiveAt: string;
}

export interface DbWhitelistEntry {
  email: string;
  approvedBy: string;
  createdAt: string;
  displayName?: string;
  avatarUrl?: string | null;
  isAdmin?: boolean;
}

export interface DbAuditLog {
  id: string;
  actorId?: string | null;
  actorEmail: string;
  action: string;
  target?: string | null;
  details?: string | null;
  ipAddress?: string | null;
  createdAt: string;
}

export interface DbConversationSummary {
  id: string;
  type: 'direct' | 'group';
  name: string;
  peer: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl?: string | null;
    lastActiveAt?: string | null;
  } | null;
  lastMessage: {
    id: string;
    senderId: string;
    senderName: string;
    content: string;
    status: string;
    createdAt: string;
  } | null;
  unreadCount: number;
  updatedAt: string;
}

export interface DbMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  clientMessageId?: string | null;
  content: string;
  status: 'pending' | 'sent' | 'delivered' | 'read';
  createdAt: string;
}

export interface DataStore {
  readonly driverName: 'sqlite' | 'firestore';

  init(): Promise<void>;
  close(): Promise<void>;
  checkHealth(): Promise<boolean>;

  // System settings
  isWhitelistModeEnabled(): Promise<boolean>;
  setWhitelistMode(enabled: boolean): Promise<void>;

  // Whitelist
  isEmailWhitelisted(email: string): Promise<boolean>;
  getWhitelist(): Promise<DbWhitelistEntry[]>;
  addToWhitelist(email: string, approvedBy: string): Promise<void>;
  removeFromWhitelist(email: string): Promise<boolean>;

  // Users
  getUserById(id: string): Promise<DbUser | null>;
  getUserByEmail(email: string): Promise<DbUser | null>;
  upsertUser(user: { id: string; email: string; displayName: string; avatarUrl?: string | null; isAdmin?: boolean }): Promise<DbUser>;
  updateUserProfile(id: string, updates: { displayName?: string; avatarUrl?: string }): Promise<DbUser | null>;
  updateUserLastActive(id: string): Promise<void>;
  getAllUsers(): Promise<DbUser[]>;
  searchUsers(excludeUserId: string, query?: string): Promise<DbUser[]>;

  // Audit Logs
  recordAuditLog(log: { id?: string; actorId?: string | null; actorEmail: string; action: string; target?: string | null; details?: string | null; ipAddress?: string | null }): Promise<void>;
  getAuditLogs(limit?: number): Promise<DbAuditLog[]>;

  // Stats
  getStats(): Promise<{ totalUsers: number; approvedWhitelistCount: number; adminCount: number; totalMessages: number }>;

  // Conversations & Messages
  getUserConversations(userId: string): Promise<DbConversationSummary[]>;
  getDirectConversation(userId1: string, userId2: string): Promise<string | null>;
  createDirectConversation(userId1: string, userId2: string): Promise<string>;
  isConversationParticipant(conversationId: string, userId: string): Promise<boolean>;
  getConversationMessages(conversationId: string, limit?: number): Promise<DbMessage[]>;
  findMessageByClientId(clientMessageId: string, senderId: string): Promise<DbMessage | null>;
  saveMessage(message: { id?: string; conversationId: string; senderId: string; senderName: string; senderAvatar?: string | null; clientMessageId?: string | null; content: string; status?: 'pending' | 'sent' | 'delivered' | 'read' }): Promise<DbMessage>;
  markConversationRead(conversationId: string, userId: string, messageId: string): Promise<void>;
}
