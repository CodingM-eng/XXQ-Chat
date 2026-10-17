import React, { useState, useEffect } from 'react';
import { Conversation, User, ConversationParticipant } from '../../types';
import { api } from '../../services/api';
import {
  X,
  Settings,
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  Tag,
  Check,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Lock,
  Mail,
  UserCheck,
  UserX,
  FileText,
} from 'lucide-react';

interface GroupSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversation: Conversation;
  currentUser: User | null;
  onUpdated?: () => void;
}

export const GroupSettingsModal: React.FC<GroupSettingsModalProps> = ({
  isOpen,
  onClose,
  conversation,
  currentUser,
  onUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'settings' | 'members' | 'add_member' | 'requests'>('settings');

  // Form states
  const [name, setName] = useState(conversation.name || '');
  const [description, setDescription] = useState(conversation.description || '');
  const [rules, setRules] = useState(conversation.rules || '');
  const [joinPolicy, setJoinPolicy] = useState<'auto' | 'invite' | 'request'>(conversation.joinPolicy || 'auto');

  // Editing participant roles
  const [editingParticipantRoles, setEditingParticipantRoles] = useState<
    Record<string, { role: 'admin' | 'moderator' | 'member'; customTag: string }>
  >({});
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);

  // Add member states
  const [searchUserQuery, setSearchUserQuery] = useState('');
  const [foundUsers, setFoundUsers] = useState<User[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [addingUserId, setAddingUserId] = useState<string | null>(null);

  // Join requests
  const [joinRequests, setJoinRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [resolvingRequestId, setResolvingRequestId] = useState<string | null>(null);

  // Status
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Determine current user permissions
  const currentParticipant = conversation.participants?.find((p) => p.id === currentUser?.id);
  const isOwner = currentParticipant?.role === 'owner' || conversation.createdById === currentUser?.id || currentUser?.isAdmin;
  const isGroupAdmin = isOwner || currentParticipant?.role === 'admin';
  const isGroupMod = isGroupAdmin || currentParticipant?.role === 'moderator';

  useEffect(() => {
    if (isOpen) {
      setName(conversation.name || '');
      setDescription(conversation.description || '');
      setRules(conversation.rules || '');
      setJoinPolicy(conversation.joinPolicy || 'auto');
      setError(null);
      setSuccessMsg(null);

      // Prepopulate participant role state
      const initialRoles: Record<string, { role: 'admin' | 'moderator' | 'member'; customTag: string }> = {};
      conversation.participants?.forEach((p) => {
        initialRoles[p.id] = {
          role: (p.role === 'owner' ? 'admin' : (p.role || 'member')) as any,
          customTag: p.customTag || '',
        };
      });
      setEditingParticipantRoles(initialRoles);

      if (conversation.joinPolicy === 'request' && isGroupMod) {
        fetchJoinRequests();
      }
    }
  }, [isOpen, conversation]);

  const fetchJoinRequests = async () => {
    try {
      setLoadingRequests(true);
      const res = await api.getJoinRequests('group', conversation.id);
      setJoinRequests(res.requests || []);
    } catch (err: any) {
      console.error('Failed to load join requests:', err);
    } finally {
      setLoadingRequests(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Grup adı boş bırakılamaz.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await api.updateGroupSettings(conversation.id, {
        name: name.trim(),
        description: description.trim(),
        rules: rules.trim(),
        joinPolicy,
      });
      setSuccessMsg('Grup ayarları başarıyla güncellendi.');
      onUpdated?.();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Grup ayarları kaydedilemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveParticipantRole = async (participantId: string) => {
    const roleData = editingParticipantRoles[participantId];
    if (!roleData) return;

    try {
      setSavingRoleId(participantId);
      setError(null);
      await api.updateParticipantRole(conversation.id, participantId, roleData.role, roleData.customTag);
      setSuccessMsg('Üye rolü ve etiketi güncellendi.');
      onUpdated?.();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Üye rolü güncellenemedi.');
    } finally {
      setSavingRoleId(null);
    }
  };

  const handleSearchUsers = async (query: string) => {
    setSearchUserQuery(query);
    if (!query.trim()) {
      setFoundUsers([]);
      return;
    }
    try {
      setSearchingUsers(true);
      const res = await api.searchUsers(query.trim());
      // Filter out existing participants
      const existingIds = new Set(conversation.participants?.map((p) => p.id) || []);
      setFoundUsers((res.users || []).filter((u) => !existingIds.has(u.id)));
    } catch (err: any) {
      console.error(err);
    } finally {
      setSearchingUsers(false);
    }
  };

  const handleAddUser = async (userId: string) => {
    try {
      setAddingUserId(userId);
      setError(null);
      if (conversation.joinPolicy === 'invite') {
        const res = await api.inviteUserToConversation(conversation.id, userId);
        setSuccessMsg(res.message || 'Kullanıcıya davet gönderildi.');
      } else {
        await api.addGroupParticipants(conversation.id, [userId]);
        setSuccessMsg('Kullanıcı gruba başarıyla eklendi.');
      }
      setFoundUsers((prev) => prev.filter((u) => u.id !== userId));
      onUpdated?.();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Kullanıcı eklenemedi/davet edilemedi.');
    } finally {
      setAddingUserId(null);
    }
  };

  const handleResolveRequest = async (requestId: string, status: 'approved' | 'rejected') => {
    try {
      setResolvingRequestId(requestId);
      setError(null);
      await api.resolveJoinRequest(requestId, status);
      setSuccessMsg(status === 'approved' ? 'Katılma isteği onaylandı ve kullanıcı eklendi.' : 'Katılma isteği reddedildi.');
      setJoinRequests((prev) => prev.filter((r) => r.id !== requestId));
      onUpdated?.();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'İstek çözümlenemedi.');
    } finally {
      setResolvingRequestId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
      <div className="bg-[#120f1e] border border-[#2a2244] w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#241c38] flex items-center justify-between bg-gradient-to-r from-purple-950/40 via-[#120f1e] to-[#120f1e]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-900/60 border border-purple-700/50 flex items-center justify-center text-purple-300">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Grup Yönetimi & Ayarları</h2>
              <p className="text-[11px] text-slate-400">{conversation.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#1b152d] hover:bg-[#251d3e] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1.5 px-4 pt-3 pb-2 border-b border-[#201834] bg-[#0d0a17] overflow-x-auto text-xs">
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'settings'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                : 'text-slate-400 hover:text-white hover:bg-[#1a142c]'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Genel Ayarlar</span>
          </button>

          <button
            onClick={() => setActiveTab('members')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'members'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                : 'text-slate-400 hover:text-white hover:bg-[#1a142c]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Üyeler ve Roller ({conversation.participants?.length || 0})</span>
          </button>

          {isGroupAdmin && (
            <button
              onClick={() => setActiveTab('add_member')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'add_member'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                  : 'text-slate-400 hover:text-white hover:bg-[#1a142c]'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Üye Ekle</span>
            </button>
          )}

          {conversation.joinPolicy === 'request' && isGroupMod && (
            <button
              onClick={() => {
                setActiveTab('requests');
                fetchJoinRequests();
              }}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'requests'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                  : 'text-slate-400 hover:text-white hover:bg-[#1a142c]'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Katılma İstekleri</span>
              {joinRequests.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                  {joinRequests.length}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Feedback Alerts */}
        <div className="px-6 pt-3 space-y-2">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* TAB 1: General Settings */}
          {activeTab === 'settings' && (
            <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">Grup Adı</label>
                <input
                  type="text"
                  required
                  disabled={!isGroupAdmin}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#0b0914] border border-[#241c38] rounded-xl text-white focus:outline-none focus:border-purple-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">Grup Açıklaması</label>
                <textarea
                  rows={2}
                  disabled={!isGroupAdmin}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Grup amacı veya konusu..."
                  className="w-full px-3.5 py-2 bg-[#0b0914] border border-[#241c38] rounded-xl text-white focus:outline-none focus:border-purple-500 resize-none disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">Grup Kuralları</label>
                <textarea
                  rows={3}
                  disabled={!isGroupAdmin}
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                  placeholder="Örn: Saygılı iletişim, spam yapmamak..."
                  className="w-full px-3.5 py-2 bg-[#0b0914] border border-[#241c38] rounded-xl text-white focus:outline-none focus:border-purple-500 resize-none disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-2">Katılım ve Üyelik Politikası</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label
                    className={`p-3 rounded-xl border flex flex-col cursor-pointer transition-all ${
                      joinPolicy === 'auto'
                        ? 'bg-purple-950/40 border-purple-500 text-white'
                        : 'bg-[#0b0914] border-[#241c38] text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs">Otomatik Ekleme</span>
                      <input
                        type="radio"
                        name="joinPolicy"
                        value="auto"
                        disabled={!isGroupAdmin}
                        checked={joinPolicy === 'auto'}
                        onChange={() => setJoinPolicy('auto')}
                        className="text-purple-600 focus:ring-0"
                      />
                    </div>
                    <span className="text-[10px] text-slate-400">Üye doğrudan sohbet listesine dahil edilir</span>
                  </label>

                  <label
                    className={`p-3 rounded-xl border flex flex-col cursor-pointer transition-all ${
                      joinPolicy === 'invite'
                        ? 'bg-purple-950/40 border-purple-500 text-white'
                        : 'bg-[#0b0914] border-[#241c38] text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs">Davet Gönder</span>
                      <input
                        type="radio"
                        name="joinPolicy"
                        value="invite"
                        disabled={!isGroupAdmin}
                        checked={joinPolicy === 'invite'}
                        onChange={() => setJoinPolicy('invite')}
                        className="text-purple-600 focus:ring-0"
                      />
                    </div>
                    <span className="text-[10px] text-slate-400">Kullanıcı daveti kabul edene kadar katılmaz</span>
                  </label>

                  <label
                    className={`p-3 rounded-xl border flex flex-col cursor-pointer transition-all ${
                      joinPolicy === 'request'
                        ? 'bg-purple-950/40 border-purple-500 text-white'
                        : 'bg-[#0b0914] border-[#241c38] text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs">Katılma İsteği</span>
                      <input
                        type="radio"
                        name="joinPolicy"
                        value="request"
                        disabled={!isGroupAdmin}
                        checked={joinPolicy === 'request'}
                        onChange={() => setJoinPolicy('request')}
                        className="text-purple-600 focus:ring-0"
                      />
                    </div>
                    <span className="text-[10px] text-slate-400">Yönetici / moderatör onayı gerekir</span>
                  </label>
                </div>
              </div>

              {isGroupAdmin && (
                <div className="flex justify-end pt-3">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-purple-950/50 transition-all disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    <span>Ayarları Kaydet</span>
                  </button>
                </div>
              )}
            </form>
          )}

          {/* TAB 2: Members & Roles */}
          {activeTab === 'members' && (
            <div className="space-y-3">
              <div className="text-[11px] text-slate-400 bg-purple-950/20 border border-purple-800/40 p-3 rounded-2xl">
                Grup yöneticileri üyelere grup-içi moderatörlük rolü atayabilir ve "Oyun Lideri", "Klan Sorumlusu" gibi özel unvanlar belirleyebilir.
              </div>

              <div className="divide-y divide-[#201834]">
                {conversation.participants?.map((participant) => {
                  const roleState = editingParticipantRoles[participant.id] || {
                    role: participant.role || 'member',
                    customTag: participant.customTag || '',
                  };
                  const isParticipantOwner = participant.role === 'owner' || conversation.createdById === participant.id;
                  const canEditThisParticipant = isGroupAdmin && !isParticipantOwner && participant.id !== currentUser?.id;

                  return (
                    <div key={participant.id} className="py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-purple-800 to-indigo-600 flex items-center justify-center font-bold text-white text-xs shrink-0 overflow-hidden">
                          {participant.avatarUrl ? (
                            <img src={participant.avatarUrl} alt={participant.displayName} className="w-full h-full object-cover" />
                          ) : (
                            participant.displayName.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-xs text-white truncate">{participant.displayName}</span>
                            {isParticipantOwner ? (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                                Grup Sahibi
                              </span>
                            ) : participant.role === 'admin' ? (
                              <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-bold border border-purple-500/30">
                                Yönetici
                              </span>
                            ) : participant.role === 'moderator' ? (
                              <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-bold border border-cyan-500/30">
                                Moderatör
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-semibold border border-slate-700">
                                Üye
                              </span>
                            )}
                            {participant.customTag && (
                              <span className="px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 text-[10px] font-semibold border border-indigo-800">
                                {participant.customTag}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 truncate">{participant.email}</p>
                        </div>
                      </div>

                      {canEditThisParticipant && (
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Role Selector */}
                          <select
                            value={roleState.role}
                            onChange={(e) =>
                              setEditingParticipantRoles({
                                ...editingParticipantRoles,
                                [participant.id]: {
                                  ...roleState,
                                  role: e.target.value as any,
                                },
                              })
                            }
                            className="px-2.5 py-1.5 bg-[#1b152d] border border-[#2d2247] rounded-xl text-white text-xs focus:outline-none focus:border-purple-500"
                          >
                            <option value="member">Üye</option>
                            <option value="moderator">Moderatör</option>
                            <option value="admin">Yönetici</option>
                          </select>

                          {/* Custom Tag Input */}
                          <input
                            type="text"
                            placeholder="Özel Unvan (Örn: Oyun Lideri)"
                            value={roleState.customTag}
                            onChange={(e) =>
                              setEditingParticipantRoles({
                                ...editingParticipantRoles,
                                [participant.id]: {
                                  ...roleState,
                                  customTag: e.target.value,
                                },
                              })
                            }
                            className="px-2.5 py-1.5 bg-[#1b152d] border border-[#2d2247] rounded-xl text-white placeholder-slate-500 text-xs w-36 focus:outline-none focus:border-purple-500"
                          />

                          <button
                            type="button"
                            onClick={() => handleSaveParticipantRole(participant.id)}
                            disabled={savingRoleId === participant.id}
                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1 shadow-sm transition-all disabled:opacity-50"
                          >
                            {savingRoleId === participant.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            <span>Kaydet</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: Add Member (Post-creation) */}
          {activeTab === 'add_member' && isGroupAdmin && (
            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  XXQ Chat Kullanıcısı Ara (İsim veya E-posta)
                </label>
                <input
                  type="text"
                  value={searchUserQuery}
                  onChange={(e) => handleSearchUsers(e.target.value)}
                  placeholder="Kullanıcı ara..."
                  className="w-full px-3.5 py-2.5 bg-[#0b0914] border border-[#241c38] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              {searchingUsers ? (
                <div className="py-8 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
                  <span>Kullanıcılar aranıyor...</span>
                </div>
              ) : foundUsers.length === 0 ? (
                <div className="py-8 text-center text-slate-500">
                  {searchUserQuery ? 'Aramanıza uygun yeni kullanıcı bulunamadı.' : 'Arama kutusuna bir kullanıcı adı veya e-posta yazın.'}
                </div>
              ) : (
                <div className="divide-y divide-[#201834] max-h-60 overflow-y-auto">
                  {foundUsers.map((user) => (
                    <div key={user.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-purple-950 border border-purple-800 flex items-center justify-center font-bold text-purple-300 text-xs">
                          {user.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-white text-xs">{user.displayName}</p>
                          <p className="text-[10px] text-slate-400">{user.email}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAddUser(user.id)}
                        disabled={addingUserId === user.id}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
                      >
                        {addingUserId === user.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <UserPlus className="w-3.5 h-3.5" />
                        )}
                        <span>{conversation.joinPolicy === 'invite' ? 'Davet Gönder' : 'Gruba Ekle'}</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Join Requests */}
          {activeTab === 'requests' && conversation.joinPolicy === 'request' && isGroupMod && (
            <div className="space-y-4 text-xs">
              {loadingRequests ? (
                <div className="py-8 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
                  <span>Talepler yükleniyor...</span>
                </div>
              ) : joinRequests.length === 0 ? (
                <div className="py-8 text-center text-slate-500">
                  Bekleyen katılma isteği bulunmuyor.
                </div>
              ) : (
                <div className="divide-y divide-[#201834]">
                  {joinRequests.map((req) => (
                    <div key={req.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <span className="font-bold text-white text-xs">{req.userName || req.userId}</span>
                        {req.message && (
                          <p className="text-[11px] text-slate-300 bg-[#0d0a17] p-2 rounded-lg border border-[#241c38]">
                            "{req.message}"
                          </p>
                        )}
                        <span className="text-[10px] text-slate-500">
                          {req.createdAt ? new Date(req.createdAt).toLocaleString('tr-TR') : ''}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleResolveRequest(req.id, 'approved')}
                          disabled={resolvingRequestId === req.id}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
                        >
                          {resolvingRequestId === req.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <UserCheck className="w-3.5 h-3.5" />
                          )}
                          <span>Onayla</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResolveRequest(req.id, 'rejected')}
                          disabled={resolvingRequestId === req.id}
                          className="px-3 py-1.5 bg-rose-600/80 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          <span>Reddet</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
