import { User, Conversation, Message, WhitelistItem, AuditLog, AdminStats, WhitelistStatus } from '../types';

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

  // Users endpoints
  async getMe(): Promise<{ user: User }> {
    return this.request('/api/users/me');
  }

  async updateMe(data: { displayName?: string; avatarUrl?: string }): Promise<{ user: User }> {
    return this.request('/api/users/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async searchUsers(query: string = ''): Promise<{ users: User[] }> {
    return this.request(`/api/users?q=${encodeURIComponent(query)}`);
  }

  // Conversations endpoints
  async getConversations(): Promise<{ conversations: Conversation[] }> {
    return this.request('/api/conversations');
  }

  async createDirectConversation(peerEmail: string): Promise<{ conversationId: string; isNew: boolean; peer: any }> {
    return this.request('/api/conversations/direct', {
      method: 'POST',
      body: JSON.stringify({ peerEmail }),
    });
  }

  async getMessages(conversationId: string, limit: number = 50): Promise<{ messages: Message[] }> {
    return this.request(`/api/conversations/${conversationId}/messages?limit=${limit}`);
  }

  async sendMessage(conversationId: string, content: string, clientMessageId?: string): Promise<{ message: Message }> {
    return this.request(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, clientMessageId }),
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
}

export const api = new ApiService();
