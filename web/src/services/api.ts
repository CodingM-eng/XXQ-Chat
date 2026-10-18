import {
  User,
  Conversation,
  Message,
  WhitelistItem,
  AuditLog,
  AdminStats,
  WhitelistStatus,
  PendingRequest,
  Attachment,
  DriveAccount,
  TelegramBot,
  TelegramCommandConfig,
  SupportReport,
  DriveStatus,
  SearchResults,
  Server,
  ServerPurpose,
  ServerCustomRole,
  ServerPermission,
  ServerJoinQuestion,
  UserRelationship,
  MembershipInvitation,
} from '../types';

export function getBackendBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_API_URL || '').trim();
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    // If running on Render frontend domain (*.onrender.com), point to Render backend domain
    if (window.location.hostname.endsWith('.onrender.com')) {
      return 'https://xxq-chat-backend.onrender.com';
    }
    // If running locally in Vite dev server (port 5173, etc.)
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:4000';
    }
    return window.location.origin.replace(/\/$/, '');
  }
  return 'http://localhost:4000';
}

const API_BASE = getBackendBaseUrl();

class ApiService {
  private token: string | null = null;

  constructor() {
    if (typeof localStorage !== 'undefined') {
      this.token = localStorage.getItem('xxq_chat_token');
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof localStorage !== 'undefined') {
      if (token) {
        localStorage.setItem('xxq_chat_token', token);
      } else {
        localStorage.removeItem('xxq_chat_token');
      }
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('xxq_chat_token');
    }
    return null;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}, retries = 1): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    const currentToken = this.getToken();
    if (currentToken) {
      headers['Authorization'] = `Bearer ${currentToken}`;
    }

    let lastError: any = null;
    const isIdempotent = !options.method || options.method === 'GET' || options.method === 'HEAD';
    const maxAttempts = isIdempotent ? retries + 1 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
          ...options,
          headers,
        });

        if (!response.ok) {
          let errorBody: any;
          try {
            errorBody = await response.json();
          } catch {
            errorBody = { error: 'NETWORK_ERROR', message: response.statusText };
          }
          const err = new Error(errorBody.message || errorBody.error || 'İstek başarısız oldu.');
          (err as any).status = response.status;
          (err as any).code = errorBody.error;
          (err as any).body = errorBody;
          throw err;
        }

        return await response.json();
      } catch (err: any) {
        lastError = err;
        const isNetworkFailure = err.name === 'TypeError' || err.message === 'Failed to fetch' || err.code === 'NETWORK_ERROR';
        if (isNetworkFailure && attempt < maxAttempts) {
          await new Promise((res) => setTimeout(res, 1200));
          continue;
        }
        break;
      }
    }

    if (lastError && (lastError.name === 'TypeError' || lastError.message === 'Failed to fetch')) {
      const friendlyError = new Error('Sunucuya bağlanılamadı. Sunucu uyku modundan (cold-start) uyanıyor veya internet bağlantınız kesilmiş olabilir. Lütfen "Yeniden Dene" seçeneğini kullanın.');
      (friendlyError as any).status = 0;
      (friendlyError as any).code = 'FAILED_TO_FETCH';
      (friendlyError as any).isNetworkError = true;
      throw friendlyError;
    }

    throw lastError;
  }

  // Auth endpoints
  async getSession(): Promise<{ user: User; whitelist: WhitelistStatus }> {
    return this.request('/api/auth/session');
  }

  async devLogin(email: string, displayName?: string): Promise<{ token: string; user: User; whitelist: WhitelistStatus }> {
    const data = await this.request<{ token: string; user: User; whitelist: WhitelistStatus }>('/api/auth/dev-login', {
      method: 'POST',
      body: JSON.stringify({ email, displayName }),
    });
    this.setToken(data.token);
    return data;
  }

  async loginWithGoogle(idToken: string): Promise<{ token: string; user: User; whitelist: WhitelistStatus }> {
    const data = await this.request<{ token: string; user: User; whitelist: WhitelistStatus }>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    });
    this.setToken(data.token);
    return data;
  }

  // Users endpoints
  async getMe(): Promise<{ user: User }> {
    return this.request('/api/users/me');
  }

  async completeOnboarding(data: {
    firstName?: string;
    lastName?: string;
    displayName: string;
    avatarUrl?: string;
    phoneNumber?: string;
  }): Promise<{ user: User }> {
    return this.request('/api/users/onboarding', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateMe(data: {
    firstName?: string;
    lastName?: string;
    displayName?: string;
    avatarUrl?: string | null;
    bannerUrl?: string | null;
    accentColor?: string | null;
    phoneNumber?: string;
    themePreference?: 'dark' | 'light';
    bio?: string | null;
    groupAddPrivacy?: 'everyone' | 'friends' | 'invite_only';
  }): Promise<{ user: User }> {
    return this.request('/api/users/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async getUserProfile(id: string): Promise<{ user: User }> {
    return this.request(`/api/users/${id}`);
  }

  async uploadAvatar(fileOrUrl: File | string): Promise<{ success: boolean; avatarUrl: string; user: User }> {
    if (typeof fileOrUrl === 'string') {
      return this.request('/api/users/avatar', {
        method: 'POST',
        body: JSON.stringify({ avatarUrl: fileOrUrl }),
      });
    }

    const formData = new FormData();
    formData.append('file', fileOrUrl);
    const headers: Record<string, string> = {};
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/api/users/avatar`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Resim yüklenemedi' }));
      throw new Error(err.message || 'Resim yükleme başarısız');
    }
    return res.json();
  }

  async uploadBanner(fileOrUrl: File | string): Promise<{ success: boolean; bannerUrl: string; user: User }> {
    if (typeof fileOrUrl === 'string') {
      return this.request('/api/users/banner', {
        method: 'POST',
        body: JSON.stringify({ bannerUrl: fileOrUrl }),
      });
    }

    const formData = new FormData();
    formData.append('file', fileOrUrl);
    const headers: Record<string, string> = {};
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/api/users/banner`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Afiş yüklenemedi' }));
      throw new Error(err.message || 'Afiş yükleme başarısız');
    }
    return res.json();
  }

  async removeBanner(): Promise<{ success: boolean; user: User; message: string }> {
    return this.request('/api/users/banner', {
      method: 'DELETE',
    });
  }

  async getUserRelationship(targetId: string): Promise<{ success: boolean; relationship: UserRelationship }> {
    return this.request(`/api/users/${targetId}/relationship`);
  }

  async blockUser(targetId: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/users/${targetId}/block`, {
      method: 'POST',
    });
  }

  async unblockUser(targetId: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/users/${targetId}/unblock`, {
      method: 'POST',
    });
  }

  async getBlockedUsers(): Promise<{ success: boolean; blockedUsers: User[] }> {
    return this.request('/api/users/me/blocked');
  }

  async searchUsers(query: string = ''): Promise<{ users: User[] }> {
    return this.request(`/api/users?q=${encodeURIComponent(query)}`);
  }

  // Conversations endpoints
  async getConversations(): Promise<{ conversations: Conversation[] }> {
    return this.request('/api/conversations');
  }

  async getConversation(id: string): Promise<{ conversation: Conversation }> {
    return this.request(`/api/conversations/${id}`);
  }

  async createDirectConversation(
    peerEmailOrTarget?: string | { peerEmail?: string; peerId?: string; targetUserId?: string; targetEmail?: string },
    secondParam?: string
  ): Promise<{ conversationId: string; isNew: boolean; peer: any }> {
    let payload: any = {};
    if (typeof peerEmailOrTarget === 'string') {
      if (secondParam) {
        payload = { peerEmail: peerEmailOrTarget, peerId: secondParam };
      } else if (peerEmailOrTarget.includes('@')) {
        payload = { peerEmail: peerEmailOrTarget };
      } else {
        payload = { peerId: peerEmailOrTarget };
      }
    } else if (peerEmailOrTarget) {
      payload = peerEmailOrTarget;
    } else if (secondParam) {
      payload = { peerId: secondParam };
    }
    return this.request('/api/conversations/direct', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async createGroupConversation(
    name: string,
    memberIds: string[],
    avatarUrl?: string | null,
    description?: string | null,
    rules?: string | null,
    joinPolicy?: 'auto' | 'invite' | 'request'
  ): Promise<{ conversation: Conversation }> {
    return this.request('/api/conversations/group', {
      method: 'POST',
      body: JSON.stringify({ name, memberIds, avatarUrl, description, rules, joinPolicy }),
    });
  }

  async addGroupParticipants(conversationId: string, userIds: string[]): Promise<{ conversation: Conversation }> {
    return this.request(`/api/conversations/${conversationId}/participants`, {
      method: 'POST',
      body: JSON.stringify({ userIds }),
    });
  }

  async removeGroupParticipant(conversationId: string, userId: string): Promise<{ success: boolean }> {
    return this.request(`/api/conversations/${conversationId}/participants/${userId}`, {
      method: 'DELETE',
    });
  }

  async updateGroup(conversationId: string, data: { name?: string; avatarUrl?: string }): Promise<{ conversation: Conversation }> {
    return this.request(`/api/conversations/${conversationId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async updateGroupSettings(
    conversationId: string,
    data: {
      name?: string;
      description?: string | null;
      rules?: string | null;
      avatarUrl?: string | null;
      joinPolicy?: 'auto' | 'invite' | 'request';
    }
  ): Promise<{ success: boolean; conversation: Conversation }> {
    return this.request(`/api/conversations/${conversationId}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async updateParticipantRole(
    conversationId: string,
    userId: string,
    role: 'owner' | 'admin' | 'moderator' | 'member',
    customTag?: string | null
  ): Promise<{ success: boolean; conversation: Conversation }> {
    return this.request(`/api/conversations/${conversationId}/participants/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role, customTag }),
    });
  }

  async inviteToGroup(conversationId: string, userId: string): Promise<{ success: boolean; message: string; autoAdded?: boolean; invitation?: MembershipInvitation }> {
    return this.request(`/api/conversations/${conversationId}/invite`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  async inviteUserToConversation(conversationId: string, userId: string): Promise<{ success: boolean; message: string; autoAdded?: boolean; invitation?: MembershipInvitation }> {
    return this.inviteToGroup(conversationId, userId);
  }

  async requestToJoinGroup(conversationId: string): Promise<{ success: boolean; message: string; autoAdded?: boolean; invitation?: MembershipInvitation }> {
    return this.request(`/api/conversations/${conversationId}/join-request`, {
      method: 'POST',
    });
  }

  // Servers & Channels endpoints
  async getServers(): Promise<{ servers: Server[] }> {
    return this.request('/api/servers');
  }

  async getServer(serverId: string): Promise<{ server: Server }> {
    return this.request(`/api/servers/${serverId}`);
  }

  async createServer(data: {
    name: string;
    description?: string | null;
    purpose: ServerPurpose;
    avatarUrl?: string | null;
    bannerUrl?: string | null;
    welcomeMessage?: string | null;
    rules?: string | null;
    requiresApproval?: boolean;
    joinQuestions?: ServerJoinQuestion[];
  }): Promise<{ server: Server; channels: Conversation[] }> {
    return this.request('/api/servers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateServer(
    serverId: string,
    data: {
      name?: string;
      description?: string | null;
      purpose?: ServerPurpose;
      avatarUrl?: string | null;
      bannerUrl?: string | null;
      welcomeMessage?: string | null;
      rules?: string | null;
      requiresApproval?: boolean;
    }
  ): Promise<{ success: boolean; server: Server }> {
    return this.request(`/api/servers/${serverId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async uploadServerLogo(serverId: string, fileOrUrl: File | string): Promise<{ success: boolean; avatarUrl: string; server: Server }> {
    if (typeof fileOrUrl === 'string') {
      return this.request(`/api/servers/${serverId}/logo`, {
        method: 'POST',
        body: JSON.stringify({ logoUrl: fileOrUrl }),
      });
    }

    const formData = new FormData();
    formData.append('file', fileOrUrl);
    const headers: Record<string, string> = {};
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/api/servers/${serverId}/logo`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Sunucu logosu yüklenemedi' }));
      throw new Error(err.message || 'Sunucu logosu yükleme başarısız');
    }
    return res.json();
  }

  async removeServerLogo(serverId: string): Promise<{ success: boolean; server: Server }> {
    return this.request(`/api/servers/${serverId}/logo`, {
      method: 'DELETE',
    });
  }

  async uploadServerBanner(serverId: string, fileOrUrl: File | string): Promise<{ success: boolean; bannerUrl: string; server: Server }> {
    if (typeof fileOrUrl === 'string') {
      return this.request(`/api/servers/${serverId}/banner`, {
        method: 'POST',
        body: JSON.stringify({ bannerUrl: fileOrUrl }),
      });
    }

    const formData = new FormData();
    formData.append('file', fileOrUrl);
    const headers: Record<string, string> = {};
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/api/servers/${serverId}/banner`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Sunucu afişi yüklenemedi' }));
      throw new Error(err.message || 'Sunucu afişi yükleme başarısız');
    }
    return res.json();
  }

  async removeServerBanner(serverId: string): Promise<{ success: boolean; server: Server }> {
    return this.request(`/api/servers/${serverId}/banner`, {
      method: 'DELETE',
    });
  }

  async getServerQuestions(serverId: string): Promise<{ success: boolean; questions: ServerJoinQuestion[] }> {
    return this.request(`/api/servers/${serverId}/questions`);
  }

  async setServerQuestions(
    serverId: string,
    questions: ServerJoinQuestion[],
    requiresApproval?: boolean
  ): Promise<{ success: boolean; questions: ServerJoinQuestion[]; server: Server; message: string }> {
    return this.request(`/api/servers/${serverId}/questions`, {
      method: 'PUT',
      body: JSON.stringify({ questions, requiresApproval }),
    });
  }

  async getServerJoinRequests(serverId: string): Promise<{ success: boolean; requests: MembershipInvitation[] }> {
    return this.request(`/api/servers/${serverId}/join-requests`);
  }

  async resolveServerJoinRequest(
    serverId: string,
    requestId: string,
    action: 'approve' | 'reject'
  ): Promise<{ success: boolean; request: MembershipInvitation; message: string }> {
    return this.request(`/api/servers/${serverId}/join-requests/${requestId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
  }

  async getServerRoles(serverId: string): Promise<{ success: boolean; roles: ServerCustomRole[] }> {
    return this.request(`/api/servers/${serverId}/roles`);
  }

  async createServerRole(
    serverId: string,
    data: { name: string; color: string; permissions: ServerPermission[]; order?: number }
  ): Promise<{ success: boolean; role: ServerCustomRole }> {
    return this.request(`/api/servers/${serverId}/roles`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateServerRole(
    serverId: string,
    roleId: string,
    data: { name?: string; color?: string; permissions?: ServerPermission[]; order?: number }
  ): Promise<{ success: boolean; role: ServerCustomRole }> {
    return this.request(`/api/servers/${serverId}/roles/${roleId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteServerRole(serverId: string, roleId: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/servers/${serverId}/roles/${roleId}`, {
      method: 'DELETE',
    });
  }

  async assignServerMemberRoles(
    serverId: string,
    userId: string,
    roleIds: string[]
  ): Promise<{ success: boolean; server: Server; message: string }> {
    return this.request(`/api/servers/${serverId}/members/${userId}/roles`, {
      method: 'POST',
      body: JSON.stringify({ roleIds }),
    });
  }

  async createServerChannel(
    serverId: string,
    data: { name: string; isAnnouncementOnly?: boolean }
  ): Promise<{ success: boolean; channel: Conversation }> {
    return this.request(`/api/servers/${serverId}/channels`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async addServerMember(
    serverId: string,
    userId: string,
    role: 'admin' | 'moderator' | 'member' = 'member'
  ): Promise<{ success: boolean; server: Server; message: string }> {
    return this.request(`/api/servers/${serverId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, role }),
    });
  }

  async removeServerMember(serverId: string, userId: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/servers/${serverId}/members/${userId}`, {
      method: 'DELETE',
    });
  }

  async updateServerMemberRole(
    serverId: string,
    userId: string,
    role: 'owner' | 'admin' | 'moderator' | 'member',
    customTag?: string | null
  ): Promise<{ success: boolean; server: Server }> {
    return this.request(`/api/servers/${serverId}/members/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role, customTag }),
    });
  }

  // Membership Invitations & Join Requests
  async getMyInvitations(): Promise<{ invitations: MembershipInvitation[] }> {
    return this.request('/api/invitations/my');
  }

  async respondToInvitation(
    id: string,
    actionOrResponse: 'accept' | 'decline' | 'accepted' | 'rejected'
  ): Promise<{ success: boolean; invitation: MembershipInvitation; message: string }> {
    const action = (actionOrResponse === 'accepted' || actionOrResponse === 'accept') ? 'accept' : 'decline';
    return this.request(`/api/invitations/${id}/respond`, {
      method: 'POST',
      body: JSON.stringify({ action, response: actionOrResponse }),
    });
  }

  async getJoinRequests(
    targetType: 'group' | 'server',
    targetId: string
  ): Promise<{ requests: MembershipInvitation[] }> {
    return this.request(`/api/invitations/requests/${targetType}/${targetId}`);
  }

  async resolveJoinRequest(
    id: string,
    actionOrStatus: 'approve' | 'reject' | 'approved' | 'rejected'
  ): Promise<{ success: boolean; invitation: MembershipInvitation; message: string }> {
    const action = (actionOrStatus === 'approved' || actionOrStatus === 'approve') ? 'approve' : 'reject';
    return this.request(`/api/invitations/requests/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ action, status: actionOrStatus }),
    });
  }

  // Admin Pending Reject & History & Platform Group/Server Management
  async rejectPendingRequest(email: string): Promise<{ success: boolean; email: string; message: string }> {
    return this.request('/api/admin/whitelist/reject', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async getPendingHistory(limit: number = 50): Promise<{ resolvedRequests: PendingRequest[] }> {
    return this.request(`/api/admin/pending/history?limit=${limit}`);
  }

  async getAdminGroups(): Promise<{ groups: Conversation[] }> {
    return this.request('/api/admin/groups');
  }

  async getAdminServers(): Promise<{ servers: Server[] }> {
    return this.request('/api/admin/servers');
  }

  async adminForceAddGroupMember(
    conversationId: string,
    userId: string
  ): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/admin/groups/${conversationId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, confirmation: true }),
    });
  }

  async adminForceAddServerMember(
    serverId: string,
    userId: string
  ): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/admin/servers/${serverId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, confirmation: true }),
    });
  }

  async getMessages(conversationId: string, limit: number = 50): Promise<{ messages: Message[] }> {
    return this.request(`/api/conversations/${conversationId}/messages?limit=${limit}`);
  }

  async sendMessage(
    conversationId: string,
    content: string,
    clientMessageId?: string,
    replyToMessageId?: string,
    forwardedFrom?: { senderName: string },
    attachments?: Attachment[],
    type?: 'text' | 'image' | 'video' | 'voice' | 'file' | 'system'
  ): Promise<{ message: Message }> {
    return this.request(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, clientMessageId, replyToMessageId, forwardedFrom, attachments, type }),
    });
  }

  async deleteMessage(conversationId: string, messageId: string): Promise<{ success: boolean; messageId: string }> {
    return this.request(`/api/conversations/${conversationId}/messages/${messageId}`, {
      method: 'DELETE',
    });
  }

  async uploadAttachment(conversationId: string, file: File): Promise<{ attachment: Attachment }> {
    const formData = new FormData();
    formData.append('file', file);

    const headers: Record<string, string> = {};
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${API_BASE}/api/conversations/${conversationId}/attachments`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        let errorBody: any;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = { message: 'Dosya yükleme başarısız oldu.' };
        }
        throw new Error(errorBody.message || 'Dosya yüklenemedi.');
      }

      return await response.json();
    } catch (err: any) {
      if (err.name === 'TypeError' || err.message === 'Failed to fetch') {
        throw new Error('Dosya yüklenirken sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edip tekrar deneyin.');
      }
      throw err;
    }
  }

  getAttachmentUrl(conversationId: string, attachmentId: string): string {
    const token = this.getToken();
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
    return `${API_BASE}/api/conversations/${conversationId}/attachments/${attachmentId}${tokenParam}`;
  }

  async downloadAttachment(conversationId: string, attachmentId: string, fileName: string): Promise<void> {
    const token = this.getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const res = await fetch(this.getAttachmentUrl(conversationId, attachmentId), {
        headers,
      });

      if (!res.ok) {
        throw new Error('Dosya indirilemedi veya erişim reddedildi.');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      if (err.name === 'TypeError' || err.message === 'Failed to fetch') {
        throw new Error('Dosya indirilirken sunucuya bağlanılamadı.');
      }
      throw err;
    }
  }

  async toggleReaction(
    conversationId: string,
    messageId: string,
    emoji: string
  ): Promise<{ success: boolean; reactions: Record<string, string[]> }> {
    return this.request(`/api/conversations/${conversationId}/messages/${messageId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    });
  }

  // Moderator endpoints
  async getModerators(): Promise<{ moderators: User[] }> {
    return this.request('/api/admin/moderators');
  }

  async addModerator(userId: string): Promise<{ success: boolean; user: User; message: string }> {
    return this.request(`/api/admin/moderators/${userId}`, {
      method: 'POST',
    });
  }

  async removeModerator(userId: string): Promise<{ success: boolean; user: User; message: string }> {
    return this.request(`/api/admin/moderators/${userId}`, {
      method: 'DELETE',
    });
  }

  // Google Drive endpoints
  async getDriveAuthUrl(): Promise<{ authUrl: string }> {
    return this.request('/api/drive/auth-url');
  }

  async connectDrive(code: string): Promise<{ success: boolean; account: DriveAccount; message: string }> {
    return this.request('/api/drive/connect', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  async getDriveAccounts(): Promise<{ accounts: DriveAccount[] }> {
    return this.request('/api/drive/accounts');
  }

  async removeDriveAccount(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/drive/accounts/${id}`, {
      method: 'DELETE',
    });
  }

  // Telegram bot endpoints
  async getTelegramBots(): Promise<{ bots: TelegramBot[] }> {
    return this.request('/api/telegram/bots');
  }

  async addTelegramBot(
    token: string,
    customCommands?: TelegramCommandConfig[]
  ): Promise<{ success: boolean; bot: TelegramBot; message: string }> {
    return this.request('/api/telegram/bots', {
      method: 'POST',
      body: JSON.stringify({ token, customCommands }),
    });
  }

  async toggleTelegramBot(id: string, isEnabled: boolean): Promise<{ success: boolean; isEnabled: boolean }> {
    return this.request(`/api/telegram/bots/${id}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ isEnabled }),
    });
  }

  async updateTelegramBotCommands(
    id: string,
    customCommands: TelegramCommandConfig[]
  ): Promise<{ success: boolean; customCommands: TelegramCommandConfig[] }> {
    return this.request(`/api/telegram/bots/${id}/commands`, {
      method: 'PATCH',
      body: JSON.stringify({ customCommands }),
    });
  }

  async testTelegramBot(id: string): Promise<{
    success: boolean;
    bot: { id: string; botName: string; username: string; isEnabled: boolean };
    webhookInfo?: { url: string; pendingUpdateCount: number; lastErrorDate?: number; lastErrorMessage?: string };
    message: string;
  }> {
    return this.request(`/api/telegram/bots/${id}/test`, {
      method: 'POST',
    });
  }

  async replaceTelegramBotToken(id: string, token: string): Promise<{
    success: boolean;
    bot: TelegramBot;
    message: string;
  }> {
    return this.request(`/api/telegram/bots/${id}/token`, {
      method: 'PUT',
      body: JSON.stringify({ token }),
    });
  }

  async deleteTelegramBot(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/telegram/bots/${id}`, {
      method: 'DELETE',
    });
  }

  // Admin endpoints
  async getAdminStatus(): Promise<{ whitelistMode: boolean; stats: AdminStats; initialAdminEmail: string }> {
    return this.request('/api/admin/status');
  }

  async toggleWhitelist(enabled: boolean): Promise<{ success: boolean; whitelistMode: boolean; message: string }> {
    return this.request('/api/admin/whitelist/toggle', {
      method: 'POST',
      body: JSON.stringify({ enabled, confirmation: true }),
    });
  }

  async getWhitelist(): Promise<{ whitelist: WhitelistItem[] }> {
    return this.request('/api/admin/whitelist');
  }

  async getPendingRequests(): Promise<{ pendingRequests: PendingRequest[] }> {
    return this.request('/api/admin/pending');
  }

  async approvePendingRequest(email: string): Promise<{ success: boolean; email: string; message: string }> {
    return this.request('/api/admin/whitelist/approve', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async addWhitelist(email: string): Promise<{ success: boolean; email: string; message: string }> {
    return this.request('/api/admin/whitelist/add', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async removeWhitelist(email: string): Promise<{ success: boolean; email: string; message: string }> {
    return this.request(`/api/admin/whitelist/${encodeURIComponent(email)}`, {
      method: 'DELETE',
    });
  }

  async getAuditLogs(limit: number = 50): Promise<{ auditLogs: AuditLog[] }> {
    return this.request(`/api/admin/audit-logs?limit=${limit}`);
  }

  async getAdminUsers(): Promise<{ users: User[] }> {
    return this.request('/api/admin/users');
  }

  // Group Avatar endpoints
  async uploadGroupAvatar(conversationId: string, fileOrUrl: File | string): Promise<{ success: boolean; avatarUrl: string; message: string }> {
    if (typeof fileOrUrl === 'string') {
      return this.request(`/api/conversations/${conversationId}/avatar`, {
        method: 'POST',
        body: JSON.stringify({ avatarUrl: fileOrUrl }),
      });
    }

    const formData = new FormData();
    formData.append('file', fileOrUrl);
    const headers: Record<string, string> = {};
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/api/conversations/${conversationId}/avatar`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Grup logosu yüklenemedi' }));
      throw new Error(err.message || 'Grup logosu yükleme başarısız');
    }
    return res.json();
  }

  async removeGroupAvatar(conversationId: string): Promise<{ success: boolean; avatarUrl: null; message: string }> {
    return this.request(`/api/conversations/${conversationId}/avatar`, {
      method: 'DELETE',
    });
  }

  // Search
  async search(query: string, type: 'all' | 'messages' | 'users' | 'conversations' = 'all', conversationId?: string): Promise<SearchResults> {
    const params = new URLSearchParams({ q: query, type });
    if (conversationId) params.append('conversationId', conversationId);
    return this.request(`/api/search?${params.toString()}`);
  }

  // Support / Problem Reports
  async submitSupportReport(data: {
    title: string;
    description: string;
    diagnostics?: any;
  }): Promise<{ success: boolean; report: SupportReport; message: string }> {
    return this.request('/api/support/reports', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getSupportReports(limit: number = 50): Promise<{ reports: SupportReport[] }> {
    return this.request(`/api/support/reports?limit=${limit}`);
  }

  async updateSupportReportStatus(id: string, status: 'open' | 'investigating' | 'resolved'): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/support/reports/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  // Google Drive Status & Quota Sync
  async getDriveStatus(): Promise<DriveStatus> {
    return this.request('/api/drive/status');
  }

  async syncDriveAccountQuota(id: string): Promise<{ success: boolean; quota: { spaceUsed: number; spaceTotal: number }; message: string }> {
    return this.request(`/api/drive/accounts/${id}/sync`, {
      method: 'POST',
    });
  }

  // Discoverable Groups Search
  async searchDiscoverableGroups(query: string = ''): Promise<{ groups: Conversation[] }> {
    return this.request(`/api/conversations/groups/search?q=${encodeURIComponent(query)}`);
  }

  // Server Invites
  async createServerInvite(serverId: string, options?: { maxUses?: number | null; expiresAt?: string | null; expiresInHours?: number }): Promise<{ success: boolean; invite: any }> {
    let expiresAt = options?.expiresAt;
    if (!expiresAt && options?.expiresInHours) {
      const expDate = new Date();
      expDate.setHours(expDate.getHours() + options.expiresInHours);
      expiresAt = expDate.toISOString();
    }
    return this.request(`/api/servers/${serverId}/invites`, {
      method: 'POST',
      body: JSON.stringify({ maxUses: options?.maxUses, expiresAt }),
    });
  }

  async getServerInvites(serverId: string): Promise<{ invites: any[] }> {
    return this.request(`/api/servers/${serverId}/invites`);
  }

  async revokeServerInvite(arg1: string, arg2?: string): Promise<{ success: boolean; message: string }> {
    const inviteId = arg2 || arg1;
    return this.request(`/api/servers/invites/${inviteId}`, {
      method: 'DELETE',
    });
  }

  async getServerInvite(code: string): Promise<{ invite: any }> {
    return this.request(`/api/servers/invite/${code}`);
  }

  async acceptServerInvite(
    code: string,
    answers?: Record<string, string>
  ): Promise<{ success: boolean; serverId?: string; pendingApproval?: boolean; message: string; server?: Server }> {
    return this.request(`/api/servers/invite/${code}/accept`, {
      method: 'POST',
      body: JSON.stringify({ answers: answers || {} }),
    });
  }

  // Friends & Friend Requests
  async getFriends(): Promise<{ friends: User[] }> {
    return this.request('/api/friends');
  }

  async getFriendRequests(): Promise<{ incoming: any[]; outgoing: any[] }> {
    return this.request('/api/friends/requests');
  }

  async sendFriendRequest(target: string | { recipientEmail?: string; recipientId?: string }): Promise<{ success: boolean; request: any; message: string }> {
    const body = typeof target === 'string' ? { targetEmailOrId: target } : target;
    return this.request('/api/friends/request', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async respondFriendRequest(requestId: string, action: 'accept' | 'decline' | 'accepted' | 'declined'): Promise<{ success: boolean; request: any; message: string }> {
    const normAction = action === 'accepted' ? 'accept' : action === 'declined' ? 'decline' : action;
    return this.request(`/api/friends/request/${requestId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ action: normAction }),
    });
  }

  async removeFriend(friendId: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/friends/${friendId}`, {
      method: 'DELETE',
    });
  }

  // Bot Pool (Admin)
  async getBotPool(): Promise<{ botPool: any[] }> {
    return this.request('/api/admin/bot-pool');
  }

  async addBotPoolToken(token: string): Promise<{ success: boolean; bot: any; message: string }> {
    return this.request('/api/admin/bot-pool', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  async deleteBotPoolToken(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/admin/bot-pool/${id}`, {
      method: 'DELETE',
    });
  }

  async assignBotFromPool(poolId: string, conversationId: string, customName?: string): Promise<{ success: boolean; assigned: any }> {
    return this.request(`/api/admin/bot-pool/${poolId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ conversationId, customName }),
    });
  }

  // Gemini AI Config (Admin)
  async getGeminiConfig(): Promise<{ config: any }> {
    return this.request('/api/admin/gemini');
  }

  async updateGeminiConfig(updates: { apiKey?: string; isEnabled?: boolean; defaultPrompt?: string; model?: string }): Promise<{ success: boolean; config: any; message: string }> {
    return this.request('/api/admin/gemini', {
      method: 'POST',
      body: JSON.stringify(updates),
    });
  }

  // Family Role (Admin)
  async setUserFamily(userId: string, isFamily: boolean): Promise<{ success: boolean; user: User; message: string }> {
    return this.request(`/api/admin/users/${userId}/family`, {
      method: 'POST',
      body: JSON.stringify({ isFamily }),
    });
  }
}

export const api = new ApiService();
