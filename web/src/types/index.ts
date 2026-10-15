export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  isAdmin: boolean;
  createdAt?: string;
  lastActiveAt?: string;
}

export interface WhitelistStatus {
  modeActive: boolean;
  isApproved: boolean;
  canAccessApp: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  clientMessageId?: string;
  content: string;
  status: 'pending' | 'sent' | 'delivered' | 'read';
  createdAt: string;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  name: string;
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

export interface WhitelistItem {
  email: string;
  approved_by: string;
  created_at: string;
  display_name?: string | null;
  avatar_url?: string | null;
  is_admin?: number;
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
