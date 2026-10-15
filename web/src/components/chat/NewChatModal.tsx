import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { User } from '../../types';
import { X, Search, UserPlus, Loader2, MessageSquare } from 'lucide-react';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectConversation: (conversationId: string) => void;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({ isOpen, onClose, onSelectConversation }) => {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setError(null);
      fetchUsers('');
    }
  }, [isOpen]);

  const fetchUsers = async (searchTerm: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.searchUsers(searchTerm);
      setUsers(res.users);
    } catch (err: any) {
      setError(err.message || 'Failed to search contacts');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    fetchUsers(val);
  };

  const handleStartChat = async (peerEmail: string) => {
    try {
      setCreating(true);
      setError(null);
      const res = await api.createDirectConversation(peerEmail);
      onSelectConversation(res.conversationId);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create conversation');
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-brand-400" />
            <h3 className="font-bold text-slate-100 text-lg">New Direct Chat</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-3 border-b border-slate-800 bg-slate-900/50">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={handleSearchChange}
              placeholder="Search by name or email..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              autoFocus
            />
          </div>
        </div>

        {/* User List */}
        <div className="p-2 overflow-y-auto flex-1 min-h-[220px]">
          {error && (
            <div className="p-3 mb-2 rounded-lg bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
              <span className="text-xs">Finding available contacts...</span>
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              No contacts found matching &ldquo;{query}&rdquo;
            </div>
          ) : (
            <div className="space-y-1">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleStartChat(u.email)}
                  disabled={creating}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-800 transition-colors text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-brand-600 to-sky-400 flex items-center justify-center font-bold text-white text-sm shadow uppercase shrink-0">
                      {u.avatarUrl ? (
                        <img src={u.avatarUrl} alt={u.displayName} className="w-full h-full object-cover rounded-full" />
                      ) : (
                        u.displayName.slice(0, 2)
                      )}
                    </div>
                    <div className="flex flex-col leading-tight">
                      <span className="font-semibold text-sm text-slate-200 group-hover:text-brand-300 transition-colors">
                        {u.displayName}
                      </span>
                      <span className="text-xs text-slate-400">{u.email}</span>
                    </div>
                  </div>

                  <MessageSquare className="w-4 h-4 text-slate-500 group-hover:text-brand-400 transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
