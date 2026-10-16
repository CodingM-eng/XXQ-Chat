export interface User {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName: string;
  avatarUrl?: string | null;
  phoneNumber?: string | null;
  isAdmin: boolean;
  isModerator?: boolean;
  onboarded?: boolean;
  status?: 'active' | 'pending' | 'blocked';
  createdAt?: string;
  lastActiveAt?: string;
}

export interface WhitelistStatus {
  modeActive: boolean;
  isApproved: boolean;
  canAccessApp: boolean;
}

export interface MessageReply {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
}

export interface MessageForward {
  senderName: string;
}

export interface Attachment {
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

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  clientMessageId?: string;
  content: string;
  replyTo?: MessageReply | null;
  forwardedFrom?: MessageForward | null;
  attachments?: Attachment[] | null;
  reactions?: Record<string, string[]>; // { "👍": ["userId1", "userId2"] }
  status: 'pending' | 'sent' | 'delivered' | 'read';
  createdAt: string;
}

export interface ConversationParticipant {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  isAdmin?: boolean;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  name: string;
  avatarUrl?: string | null;
  creatorId?: string | null;
  adminIds?: string[];
  participantCount?: number;
  participants?: ConversationParticipant[];
  peer?: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl?: string | null;
    lastActiveAt?: string;
  } | null;
  lastMessage?: {
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

export interface PendingRequest {
  id: string;
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  firstAttemptAt: string;
  lastAttemptAt: string;
  attemptCount: number;
  status: 'pending' | 'approved' | 'rejected';
}

export interface WhitelistItem {
  email: string;
  approved_by: string;
  created_at: string;
  display_name?: string | null;
  avatar_url?: string | null;
  is_admin?: number;
  is_moderator?: number;
  isAdmin?: boolean;
  isModerator?: boolean;
}

export interface AuditLog {
  id: string;
  actor_id: string;
  actor_email: string;
  action: string;
  target?: string | null;
  details?: string | null;
  ip_address?: string;
  created_at: string;
}

export interface AdminStats {
  totalUsers: number;
  approvedWhitelistCount: number;
  adminCount: number;
  totalMessages: number;
}

export interface DriveAccount {
  id: string;
  email: string;
  displayName?: string | null;
  folderId?: string | null;
  spaceUsed?: number | null;
  spaceTotal?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TelegramCommandConfig {
  command: string;
  response: string;
  description?: string;
}

export interface TelegramBot {
  id: string;
  botName: string;
  username: string;
  isEnabled: boolean;
  customCommands: TelegramCommandConfig[];
  createdAt: string;
  updatedAt: string;
}

