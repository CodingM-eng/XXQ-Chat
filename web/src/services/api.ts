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
} from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '';

class ApiService {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('xxq_chat_token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('xxq_chat_token', token);
    } else {
      localStorage.removeItem('xxq_chat_token');
    }
  }

  getToken(): string | null {
    return this.token || localStorage.getItem('xxq_chat_token');
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    const currentToken = this.getToken();
    if (currentToken) {
      headers['Authorization'] = `Bearer ${currentToken}`;
    }

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
      const err = new Error(errorBody.message || errorBody.error || 'API Request Failed');
      (err as any).status = response.status;
      (err as any).code = errorBody.error;
      (err as any).body = errorBody;
      throw err;
    }

    return response.json();
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
    phoneNumber?: string;
    themePreference?: 'dark' | 'light';
  }): Promise<{ user: User }> {
    return this.request('/api/users/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
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

  async createDirectConversation(peerEmail: string): Promise<{ conversationId: string; isNew: boolean; peer: any }> {
    return this.request('/api/conversations/direct', {
      method: 'POST',
      body: JSON.stringify({ peerEmail }),
    });
  }

  async createGroupConversation(
    name: string,
    memberIds: string[],
    avatarUrl?: string
  ): Promise<{ conversation: Conversation }> {
    return this.request('/api/conversations/group', {
      method: 'POST',
      body: JSON.stringify({ name, memberIds, avatarUrl }),
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

  async getMessages(conversationId: string, limit: number = 50): Promise<{ messages: Message[] }> {
    return this.request(`/api/conversations/${conversationId}/messages?limit=${limit}`);
  }

  async sendMessage(
    conversationId: string,
    content: string,
    clientMessageId?: string,
    replyToMessageId?: string,
    forwardedFrom?: { senderName: string },
    attachments?: Attachment[]
  ): Promise<{ message: Message }> {
    return this.request(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, clientMessageId, replyToMessageId, forwardedFrom, attachments }),
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
        errorBody = { message: 'Dosya yükleme başarısız oldu' };
      }
      throw new Error(errorBody.message || 'Dosya yüklenemedi.');
    }

    return response.json();
  }

  getAttachmentUrl(conversationId: string, attachmentId: string): string {
    return `${API_BASE}/api/conversations/${conversationId}/attachments/${attachmentId}`;
  }

  async downloadAttachment(conversationId: string, attachmentId: string, fileName: string): Promise<void> {
    const token = this.getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}/api/conversations/${conversationId}/attachments/${attachmentId}`, {
      headers,
    });

    if (!res.ok) {
      throw new Error('Dosya indirilemedi.');
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
}

export const api = new ApiService();
