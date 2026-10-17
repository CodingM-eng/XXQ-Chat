export interface DbUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName: string;
  avatarUrl?: string | null;
  phoneNumber?: string | null; // private, never returned to other users
  isAdmin: boolean;
  isModerator?: boolean;
  isFamily?: boolean;
  groupAddPrivacy?: 'everyone' | 'friends' | 'invite_only';
  bio?: string | null;
  themePreference?: 'dark' | 'light';
  onboarded: boolean;
  status: 'active' | 'pending' | 'blocked';
  createdAt: string;
  lastActiveAt: string;
}

export interface DbPendingAccessRequest {
  id: string;
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  firstAttemptAt: string;
  lastAttemptAt: string;
  attemptCount: number;
  status: 'pending' | 'approved' | 'rejected';
  resolvedAt?: string | null;
}

export interface DbWhitelistEntry {
  email: string;
  approvedBy: string;
  createdAt: string;
  userId?: string | null;
  displayName?: string;
  avatarUrl?: string | null;
  isAdmin?: boolean;
  isModerator?: boolean;
  isFamily?: boolean;
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

export interface DbSupportReport {
  id: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  title: string;
  description: string;
  diagnostics: {
    appVersion: string;
    platform: string;
    userAgent: string;
    currentPath: string;
    timestamp: string;
    errorCode?: string | null;
  };
  status: 'open' | 'investigating' | 'resolved';
  createdAt: string;
  resolvedAt?: string | null;
}

export interface DbConversationSummary {
  id: string;
  type: 'direct' | 'group' | 'channel';
  name: string;
  avatarUrl?: string | null;
  creatorId?: string | null;
  adminIds?: string[];
  description?: string | null;
  rules?: string | null;
  joinPolicy?: 'auto' | 'invite' | 'request';
  serverId?: string | null;
  isAnnouncementOnly?: boolean;
  participantCount?: number;
  participants?: Array<{
    id: string;
    email: string;
    displayName: string;
    avatarUrl?: string | null;
    isAdmin?: boolean;
    role?: 'owner' | 'admin' | 'moderator' | 'member';
    customTag?: string | null;
    joinedAt?: string;
  }>;
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

export type ServerPurpose = 'gaming' | 'chat' | 'community' | 'business' | 'other';

export interface DbServer {
  id: string;
  name: string;
  description?: string | null;
  purpose: ServerPurpose;
  avatarUrl?: string | null;
  rules?: string | null;
  ownerId: string;
  memberIds: string[];
  channels?: DbConversationSummary[];
  members?: Array<{
    id: string;
    displayName: string;
    avatarUrl?: string | null;
    role: 'owner' | 'admin' | 'moderator' | 'member';
    customTag?: string | null;
    joinedAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface DbMembershipInvitation {
  id: string;
  targetType: 'group' | 'server';
  targetId: string;
  targetName: string;
  userId: string;
  userDisplayName: string;
  type: 'invite' | 'request';
  status: 'pending' | 'accepted' | 'declined' | 'approved' | 'rejected' | 'expired';
  createdById: string;
  createdAt: string;
  resolvedAt?: string | null;
  resolvedById?: string | null;
}

export interface DbMessageReply {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
}

export interface DbMessageForward {
  senderName: string;
}

export interface DbAttachment {
  id: string;
  conversationId: string;
  messageId?: string | null;
  uploaderId: string;
  driveAccountId: string;
  driveAccountEmail?: string;
  driveFileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
}

export interface DbMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  clientMessageId?: string | null;
  content: string;
  type?: 'text' | 'image' | 'video' | 'voice' | 'file' | 'system';
  isSystem?: boolean;
  replyTo?: DbMessageReply | null;
  forwardedFrom?: DbMessageForward | null;
  attachments?: DbAttachment[] | null;
  reactions?: Record<string, string[]>; // { "👍": ["userId1", "userId2"] }
  status: 'pending' | 'sent' | 'delivered' | 'read';
  readBy?: { userId: string; displayName?: string; readAt: string }[];
  createdAt: string;
}

export interface DbServerInvite {
  id: string;
  serverId: string;
  code: string;
  createdById: string;
  maxUses?: number | null;
  usedCount: number;
  expiresAt?: string | null;
  isRevoked: boolean;
  createdAt: string;
}

export interface DbFriendRequest {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  receiverId: string;
  receiverName: string;
  receiverAvatar?: string | null;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

export interface DbBotPoolItem {
  id: string;
  tokenEncrypted: string;
  botName: string;
  username: string;
  isAssigned: boolean;
  assignedName?: string | null;
  assignedConversationId?: string | null;
  createdAt: string;
}

export interface DbGeminiConfig {
  apiKeyEncrypted: string;
  isEnabled: boolean;
  defaultPrompt?: string | null;
  model: string;
  updatedAt: string;
}

export interface DbDriveAccount {
  id: string;
  email: string;
  displayName?: string | null;
  encryptedRefreshToken: string;
  folderId?: string | null;
  spaceUsed?: number | null; // bytes
  spaceTotal?: number | null; // bytes
  createdAt: string;
  updatedAt: string;
}

export interface TelegramCommandConfig {
  command: string; // e.g. 'yardim'
  response: string; // text reply
  description?: string;
}

export interface DbTelegramBot {
  id: string;
  botName: string;
  username: string; // without leading @
  encryptedToken: string;
  webhookSecretToken: string;
  isEnabled: boolean;
  customCommands: TelegramCommandConfig[];
  createdAt: string;
  updatedAt: string;
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

  // Pending access requests
  recordPendingAccess(email: string, displayName?: string, avatarUrl?: string, ipAddress?: string): Promise<void>;
  getPendingAccessRequests(): Promise<DbPendingAccessRequest[]>;
  getResolvedAccessRequests(limit?: number): Promise<DbPendingAccessRequest[]>;
  resolvePendingAccess(email: string, status: 'approved' | 'rejected'): Promise<void>;
  rejectPendingAccess(email: string): Promise<void>;

  // Users
  getUserById(id: string): Promise<DbUser | null>;
  getUserByEmail(email: string): Promise<DbUser | null>;
  upsertUser(user: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    displayName: string;
    avatarUrl?: string | null;
    phoneNumber?: string | null;
    isAdmin?: boolean;
    isModerator?: boolean;
    onboarded?: boolean;
    status?: 'active' | 'pending' | 'blocked';
  }): Promise<DbUser>;
  updateUserProfile(
    id: string,
    updates: {
      firstName?: string | null;
      lastName?: string | null;
      displayName?: string;
      avatarUrl?: string | null;
      phoneNumber?: string | null;
      themePreference?: 'dark' | 'light';
      bio?: string | null;
      groupAddPrivacy?: 'everyone' | 'friends' | 'invite_only';
    }
  ): Promise<DbUser | null>;
  completeOnboarding(
    userId: string,
    data: {
      firstName?: string | null;
      lastName?: string | null;
      displayName: string;
      avatarUrl?: string | null;
      phoneNumber?: string | null;
    }
  ): Promise<DbUser>;
  updateUserLastActive(id: string): Promise<void>;
  getAllUsers(): Promise<DbUser[]>;
  searchUsers(excludeUserId: string, query?: string): Promise<DbUser[]>;

  // Moderators
  setModerator(userId: string, isModerator: boolean): Promise<DbUser | null>;
  getModerators(): Promise<DbUser[]>;

  // Audit Logs
  recordAuditLog(log: {
    id?: string;
    actorId?: string | null;
    actorEmail: string;
    action: string;
    target?: string | null;
    details?: string | null;
    ipAddress?: string | null;
  }): Promise<void>;
  getAuditLogs(limit?: number): Promise<DbAuditLog[]>;

  // Stats
  getStats(): Promise<{ totalUsers: number; approvedWhitelistCount: number; adminCount: number; totalMessages: number }>;

  // Conversations & Messages
  getUserConversations(userId: string): Promise<DbConversationSummary[]>;
  getConversation(conversationId: string, userId: string): Promise<DbConversationSummary | null>;
  getDirectConversation(userId1: string, userId2: string): Promise<string | null>;
  createDirectConversation(userId1: string, userId2: string): Promise<string>;
  createGroupConversation(creatorId: string, name: string, memberIds: string[], avatarUrl?: string | null): Promise<string>;
  addConversationParticipants(conversationId: string, userIds: string[]): Promise<void>;
  removeConversationParticipant(conversationId: string, userId: string): Promise<void>;
  updateConversation(conversationId: string, updates: { name?: string; avatarUrl?: string | null }): Promise<void>;
  isConversationParticipant(conversationId: string, userId: string): Promise<boolean>;
  isConversationAdmin(conversationId: string, userId: string): Promise<boolean>;
  getConversationParticipantIds(conversationId: string): Promise<string[]>;
  getConversationMessages(conversationId: string, limit?: number): Promise<DbMessage[]>;
  findMessageByClientId(clientMessageId: string, senderId: string, conversationId?: string): Promise<DbMessage | null>;
  saveMessage(message: {
    id?: string;
    conversationId: string;
    senderId: string;
    senderName: string;
    senderAvatar?: string | null;
    clientMessageId?: string | null;
    content: string;
    replyTo?: DbMessageReply | null;
    forwardedFrom?: DbMessageForward | null;
    attachments?: DbAttachment[] | null;
    status?: 'pending' | 'sent' | 'delivered' | 'read';
    type?: 'text' | 'image' | 'video' | 'voice' | 'file' | 'system';
    isSystem?: boolean;
  }): Promise<DbMessage>;
  markConversationRead(conversationId: string, userId: string, messageId: string): Promise<void>;
  toggleMessageReaction(conversationId: string, messageId: string, userId: string, emoji: string): Promise<Record<string, string[]>>;
  deleteMessage(conversationId: string, messageId: string): Promise<boolean>;

  // Google Drive Storage Accounts & Attachments
  addDriveAccount(account: Omit<DbDriveAccount, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<DbDriveAccount>;
  getDriveAccounts(): Promise<DbDriveAccount[]>;
  getDriveAccountById(id: string): Promise<DbDriveAccount | null>;
  removeDriveAccount(id: string): Promise<boolean>;
  updateDriveAccountFolder(id: string, folderId: string): Promise<void>;
  updateDriveAccountQuota(id: string, spaceUsed: number, spaceTotal: number): Promise<void>;

  saveAttachment(attachment: Omit<DbAttachment, 'id' | 'createdAt'> & { id?: string }): Promise<DbAttachment>;
  getAttachmentById(id: string): Promise<DbAttachment | null>;
  getAttachmentsForConversation(conversationId: string): Promise<DbAttachment[]>;
  deleteAttachment(id: string): Promise<boolean>;

  // Telegram Bots
  addTelegramBot(bot: Omit<DbTelegramBot, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<DbTelegramBot>;
  getTelegramBots(): Promise<DbTelegramBot[]>;
  getTelegramBotById(id: string): Promise<DbTelegramBot | null>;
  updateTelegramBot(id: string, updates: Partial<Pick<DbTelegramBot, 'isEnabled' | 'customCommands' | 'encryptedToken' | 'webhookSecretToken' | 'botName' | 'username'>>): Promise<DbTelegramBot | null>;
  deleteTelegramBot(id: string): Promise<boolean>;

  // Support & Problem Reports
  createSupportReport(report: {
    userId: string;
    userEmail: string;
    userDisplayName: string;
    title: string;
    description: string;
    diagnostics: any;
  }): Promise<DbSupportReport>;
  getSupportReports(limit?: number): Promise<DbSupportReport[]>;
  updateSupportReportStatus(id: string, status: 'open' | 'investigating' | 'resolved'): Promise<boolean>;

  // Authorized Message Search
  searchMessages(userId: string, query: string, conversationId?: string): Promise<Array<DbMessage & { conversationName?: string }>>;

  // Groups Management & Roles
  getAllGroups(): Promise<DbConversationSummary[]>;
  updateGroupSettings(conversationId: string, settings: { name?: string; description?: string | null; rules?: string | null; avatarUrl?: string | null; joinPolicy?: 'auto' | 'invite' | 'request' }): Promise<void>;
  updateParticipantRole(conversationId: string, userId: string, role: 'owner' | 'admin' | 'moderator' | 'member', customTag?: string | null): Promise<void>;
  getConversationRole(conversationId: string, userId: string): Promise<'owner' | 'admin' | 'moderator' | 'member' | null>;

  // Servers & Channels
  createServer(ownerId: string, data: { name: string; description?: string | null; purpose: ServerPurpose; avatarUrl?: string | null; rules?: string | null }): Promise<{ server: DbServer; channels: DbConversationSummary[] }>;
  getServer(serverId: string, userId: string): Promise<DbServer | null>;
  getUserServers(userId: string): Promise<DbServer[]>;
  getAllServers(): Promise<DbServer[]>;
  createServerChannel(serverId: string, actorId: string, data: { name: string; isAnnouncementOnly?: boolean }): Promise<DbConversationSummary>;
  addServerMember(serverId: string, userId: string, role?: 'admin' | 'moderator' | 'member'): Promise<void>;
  removeServerMember(serverId: string, userId: string): Promise<void>;
  updateServerMemberRole(serverId: string, userId: string, role: 'owner' | 'admin' | 'moderator' | 'member', customTag?: string | null): Promise<void>;
  updateServerSettings(serverId: string, updates: { name?: string; description?: string | null; rules?: string | null; avatarUrl?: string | null; purpose?: ServerPurpose }): Promise<void>;
  isServerMember(serverId: string, userId: string): Promise<boolean>;
  isServerAdmin(serverId: string, userId: string): Promise<boolean>;

  // Membership Invitations & Join Requests
  createMembershipInvitation(invitation: Omit<DbMembershipInvitation, 'id' | 'createdAt' | 'status'> & { id?: string }): Promise<DbMembershipInvitation>;
  getUserInvitations(userId: string): Promise<DbMembershipInvitation[]>;
  getTargetJoinRequests(targetType: 'group' | 'server', targetId: string): Promise<DbMembershipInvitation[]>;
  resolveMembershipInvitation(id: string, status: 'accepted' | 'declined' | 'approved' | 'rejected', actorId: string): Promise<DbMembershipInvitation | null>;
  hasActiveInvitationOrRequest(targetId: string, userId: string): Promise<boolean>;

  // Family Role & User Profile
  setUserFamily(userId: string, isFamily: boolean): Promise<DbUser | null>;

  // Group Discoverability Search
  searchDiscoverableGroups(userId: string, query: string): Promise<DbConversationSummary[]>;

  // Message Reads Tracking
  recordMessageRead(messageId: string, conversationId: string, userId: string): Promise<void>;
  getMessageReads(messageId: string): Promise<{ userId: string; displayName: string; readAt: string }[]>;

  // Server Invites
  createServerInvite(serverId: string, createdById: string, options?: { maxUses?: number | null; expiresAt?: string | null }): Promise<DbServerInvite>;
  getServerInviteByCode(code: string): Promise<DbServerInvite | null>;
  useServerInvite(code: string, userId: string): Promise<{ success: boolean; serverId: string; message: string }>;
  revokeServerInvite(inviteId: string): Promise<boolean>;
  getServerInvites(serverId: string): Promise<DbServerInvite[]>;

  // Friends & Friend Requests
  sendFriendRequest(senderId: string, targetEmailOrId: string): Promise<DbFriendRequest>;
  getFriendRequests(userId: string): Promise<{ incoming: DbFriendRequest[]; outgoing: DbFriendRequest[] }>;
  respondFriendRequest(requestId: string, userId: string, action: 'accept' | 'decline'): Promise<DbFriendRequest>;
  getFriends(userId: string): Promise<DbUser[]>;
  removeFriend(userId: string, friendId: string): Promise<boolean>;
  areFriends(userId1: string, userId2: string): Promise<boolean>;

  // Bot Pool & Gemini AI Configuration
  addBotPoolToken(encryptedToken: string, botName: string, username: string): Promise<DbBotPoolItem>;
  getBotPool(): Promise<DbBotPoolItem[]>;
  removeBotPoolToken(id: string): Promise<boolean>;
  assignBotFromPool(poolId: string, conversationId: string, customName?: string): Promise<DbBotPoolItem | null>;
  getGeminiConfig(): Promise<DbGeminiConfig | null>;
  updateGeminiConfig(config: { apiKeyEncrypted?: string; isEnabled?: boolean; defaultPrompt?: string | null; model?: string }): Promise<DbGeminiConfig>;
}
