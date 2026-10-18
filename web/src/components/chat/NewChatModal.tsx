import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { User } from '../../types';
import { SafeAvatar } from '../common/SafeAvatar';
import { X, Search, UserPlus, Users, Loader2, MessageSquare, Check, ArrowRight } from 'lucide-react';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectConversation: (conversationId: string) => void;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({ isOpen, onClose, onSelectConversation }) => {
  const [activeTab, setActiveTab] = useState<'direct' | 'group'>('direct');
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Group creation state
  const [groupName, setGroupName] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setGroupName('');
      setSelectedUserIds(new Set());
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
      setError(err.message || 'Kişiler aranırken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    fetchUsers(val);
  };

  const handleStartDirectChat = async (peerEmail: string) => {
    try {
      setCreating(true);
      setError(null);
      const res = await api.createDirectConversation(peerEmail);
      onSelectConversation(res.conversationId);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Sohbet başlatılamadı');
    } finally {
      setCreating(false);
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) {
      setError('Lütfen bir grup adı belirleyin.');
      return;
    }
    if (selectedUserIds.size === 0) {
      setError('Lütfen gruba eklemek için en az bir üye seçin.');
      return;
    }

    try {
      setCreating(true);
      setError(null);
      const res = await api.createGroupConversation(groupName.trim(), Array.from(selectedUserIds));
      onSelectConversation(res.conversation.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Grup oluşturulamadı');
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-white text-base">Yeni Sohbet Başlat</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-2 gap-1 bg-slate-950/80 border-b border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('direct')}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'direct'
                ? 'bg-purple-950/80 text-purple-300 border border-purple-800/60 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Birebir Sohbet</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('group')}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'group'
                ? 'bg-purple-950/80 text-purple-300 border border-purple-800/60 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Yeni Grup ({selectedUserIds.size})</span>
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-red-950/60 border border-red-800/80 text-red-300 text-xs">
            {error}
          </div>
        )}

        {/* Tab 1: Direct Chat */}
        {activeTab === 'direct' && (
          <>
            {/* Search Input */}
            <div className="p-3 border-b border-slate-800 bg-slate-900/50">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={handleSearchChange}
                  placeholder="İsim veya e-posta ile ara..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  autoFocus
                />
              </div>
            </div>

            {/* User List */}
            <div className="p-2 overflow-y-auto flex-1 min-h-[240px]">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                  <span className="text-xs">Kişiler aranıyor...</span>
                </div>
              ) : users.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  {query ? `"${query}" ile eşleşen kullanıcı bulunamadı.` : 'Kayıtlı aktif kullanıcı bulunamadı.'}
                </div>
              ) : (
                <div className="space-y-1">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleStartDirectChat(u.email)}
                      disabled={creating}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-800/60 transition-colors text-left group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-700 to-indigo-600 flex items-center justify-center font-bold text-white text-xs shadow overflow-hidden shrink-0">
                          <SafeAvatar
                            src={u.avatarUrl}
                            alt={u.displayName}
                            className="w-full h-full object-cover"
                            fallbackText={u.displayName}
                            size={40}
                          />
                        </div>
                        <div className="flex flex-col leading-tight">
                          <span className="font-semibold text-xs text-slate-200 group-hover:text-purple-300 transition-colors">
                            {u.displayName}
                          </span>
                          <span className="text-[11px] text-slate-500">{u.email}</span>
                        </div>
                      </div>

                      <MessageSquare className="w-4 h-4 text-slate-600 group-hover:text-purple-400 transition-colors" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Tab 2: Group Creation */}
        {activeTab === 'group' && (
          <form onSubmit={handleCreateGroup} className="flex flex-col flex-1 overflow-hidden">
            <div className="p-4 border-b border-slate-800 space-y-3 bg-slate-950/40">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Grup Adı</label>
                <input
                  type="text"
                  required
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Örn: Proje Ekibi veya Arkadaşlar"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    value={query}
                    onChange={handleSearchChange}
                    placeholder="Gruba eklenecek kişileri ara..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>
            </div>

            {/* Members Checklist */}
            <div className="p-2 overflow-y-auto flex-1 min-h-[180px] space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 px-2 block mb-1">
                Kişi Listesi ({selectedUserIds.size} seçildi):
              </span>

              {users.map((u) => {
                const isSelected = selectedUserIds.has(u.id);
                return (
                  <div
                    key={u.id}
                    onClick={() => toggleUserSelection(u.id)}
                    className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors ${
                      isSelected ? 'bg-purple-950/40 border border-purple-800/40' : 'hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-purple-900/40 border border-purple-700/40 flex items-center justify-center font-bold text-white text-xs overflow-hidden shrink-0">
                        <SafeAvatar
                          src={u.avatarUrl}
                          alt={u.displayName}
                          className="w-full h-full object-cover"
                          fallbackText={u.displayName}
                          size={32}
                        />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-200">{u.displayName}</p>
                        <p className="text-[10px] text-slate-500">{u.email}</p>
                      </div>
                    </div>

                    <div
                      className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-purple-600 border-purple-500 text-white shadow-sm shadow-purple-500/50'
                          : 'border-slate-700 bg-slate-950'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer Submit */}
            <div className="p-3 border-t border-slate-800 bg-slate-950/80">
              <button
                type="submit"
                disabled={creating || !groupName.trim() || selectedUserIds.size === 0}
                className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-600/25 flex items-center justify-center gap-2 transition-all"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Grup Oluşturuluyor...</span>
                  </>
                ) : (
                  <>
                    <span>Grubu Oluştur ve Sohbeti Başlat</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
