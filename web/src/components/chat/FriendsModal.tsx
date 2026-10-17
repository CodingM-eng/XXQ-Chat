import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { User, FriendRequest } from '../../types';
import {
  X,
  Users,
  UserPlus,
  Clock,
  Check,
  XCircle,
  Search,
  Loader2,
  Trash2,
  MessageSquare,
  Shield,
  Heart,
} from 'lucide-react';

interface FriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartDirectChat?: (user: User) => void;
}

export const FriendsModal: React.FC<FriendsModalProps> = ({
  isOpen,
  onClose,
  onStartDirectChat,
}) => {
  const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'add'>('friends');
  const [friends, setFriends] = useState<User[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Add friend state
  const [targetQuery, setTargetQuery] = useState('');
  const [submittingAdd, setSubmittingAdd] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadFriendsData();
    }
  }, [isOpen]);

  const loadFriendsData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [friendsRes, requestsRes] = await Promise.all([
        api.getFriends().catch(() => ({ friends: [] })),
        api.getFriendRequests().catch(() => ({ incoming: [], outgoing: [] })),
      ]);
      setFriends(friendsRes.friends || []);
      setIncomingRequests(requestsRes.incoming || []);
      setOutgoingRequests(requestsRes.outgoing || []);
    } catch (err: any) {
      setError(err.message || 'Arkadaşlar yüklenirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetQuery.trim()) return;

    try {
      setSubmittingAdd(true);
      setError(null);
      await api.sendFriendRequest({ recipientEmail: targetQuery.trim() });
      setSuccessMsg('Arkadaşlık isteği başarıyla gönderildi!');
      setTargetQuery('');
      await loadFriendsData();
      setActiveTab('requests');
    } catch (err: any) {
      setError(err.message || 'Arkadaşlık isteği gönderilemedi.');
    } finally {
      setSubmittingAdd(false);
    }
  };

  const handleRespondRequest = async (requestId: string, response: 'accepted' | 'declined') => {
    try {
      setRespondingId(requestId);
      setError(null);
      await api.respondFriendRequest(requestId, response);
      setSuccessMsg(response === 'accepted' ? 'Arkadaşlık isteği kabul edildi!' : 'İstek reddedildi.');
      await loadFriendsData();
    } catch (err: any) {
      setError(err.message || 'İşlem gerçekleştirilemedi.');
    } finally {
      setRespondingId(null);
    }
  };

  const handleRemoveFriend = async (friendId: string, friendName: string) => {
    if (!window.confirm(`${friendName} isimli kullanıcıyı arkadaş listenizden çıkarmak istediğinize emin misiniz?`)) {
      return;
    }
    try {
      setError(null);
      await api.removeFriend(friendId);
      setSuccessMsg(`${friendName} arkadaş listenizden çıkarıldı.`);
      await loadFriendsData();
    } catch (err: any) {
      setError(err.message || 'Arkadaş çıkarılamadı.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in select-none">
      <div className="bg-[#120f1e] border border-[#2a2244] w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#241c38] flex items-center justify-between bg-gradient-to-r from-purple-950/40 via-[#120f1e] to-[#120f1e]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-900/60 border border-purple-700/50 flex items-center justify-center text-purple-300">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Arkadaşlar & Bağlantılar</h2>
              <p className="text-[11px] text-slate-400">Arkadaş listenizi yönetin ve yeni arkadaşlar ekleyin</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#1b152d] hover:bg-[#251d3e] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-2 px-6 pt-3 pb-2 border-b border-[#241c38] bg-[#0f0d19] text-xs">
          <button
            onClick={() => setActiveTab('friends')}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-2 ${
              activeTab === 'friends'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                : 'text-slate-400 hover:text-white hover:bg-[#1a142c]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Arkadaşlarım ({friends.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('requests')}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-2 relative ${
              activeTab === 'requests'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                : 'text-slate-400 hover:text-white hover:bg-[#1a142c]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>İstekler</span>
            {incomingRequests.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-pink-600 text-white text-[10px] font-extrabold animate-pulse">
                {incomingRequests.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('add')}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-2 ${
              activeTab === 'add'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                : 'text-slate-400 hover:text-white hover:bg-[#1a142c]'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Arkadaş Ekle</span>
          </button>
        </div>

        {/* Body content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-300">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-xs text-emerald-300">
              {successMsg}
            </div>
          )}

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
              <span className="text-xs">Yükleniyor...</span>
            </div>
          ) : activeTab === 'friends' ? (
            /* Friends List */
            friends.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs space-y-2">
                <Users className="w-8 h-8 text-slate-600 mx-auto" />
                <p>Henüz eklenmiş bir arkadaşınız bulunmuyor.</p>
                <button
                  onClick={() => setActiveTab('add')}
                  className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-colors"
                >
                  Arkadaş Ekle
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[#201834]">
                {friends.map((f) => (
                  <div key={f.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-purple-800 to-indigo-600 flex items-center justify-center font-bold text-white text-xs shrink-0 overflow-hidden">
                        {f.avatarUrl ? (
                          <img src={f.avatarUrl} alt={f.displayName} className="w-full h-full object-cover" />
                        ) : (
                          f.displayName?.slice(0, 2).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-white truncate">{f.displayName}</span>
                          {f.isFamily && (
                            <span className="px-1.5 py-0.2 rounded bg-pink-950 text-pink-300 text-[9px] font-bold border border-pink-800 flex items-center gap-0.5 shrink-0">
                              <Heart className="w-2.5 h-2.5 fill-pink-300" />
                              Aile
                            </span>
                          )}
                        </div>
                        {f.bio && <p className="text-[11px] text-slate-400 truncate max-w-xs">{f.bio}</p>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {onStartDirectChat && (
                        <button
                          type="button"
                          onClick={() => {
                            onStartDirectChat(f);
                            onClose();
                          }}
                          className="p-1.5 bg-purple-600/30 hover:bg-purple-600 text-purple-300 hover:text-white border border-purple-500/40 rounded-xl transition-all"
                          title="Sohbet Başlat"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveFriend(f.id, f.displayName)}
                        className="p-1.5 hover:bg-rose-950/60 text-slate-500 hover:text-rose-400 rounded-xl transition-colors"
                        title="Arkadaşlıktan Çıkar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : activeTab === 'requests' ? (
            /* Friend Requests */
            <div className="space-y-6">
              {/* Incoming */}
              <div>
                <h3 className="text-xs font-bold text-slate-300 mb-2">Gelen İstekler ({incomingRequests.length})</h3>
                {incomingRequests.length === 0 ? (
                  <p className="text-[11px] text-slate-500 italic py-2">Bekleyen gelen istek yok.</p>
                ) : (
                  <div className="divide-y divide-[#201834]">
                    {incomingRequests.map((req) => (
                      <div key={req.id} className="py-2.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-purple-950 border border-purple-800 flex items-center justify-center font-bold text-purple-300 text-xs shrink-0">
                            {req.senderName?.charAt(0).toUpperCase() || 'U'}
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-xs text-white truncate block">{req.senderName}</span>
                            <span className="text-[10px] text-slate-500">{new Date(req.createdAt).toLocaleDateString('tr-TR')}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={respondingId === req.id}
                            onClick={() => handleRespondRequest(req.id, 'accepted')}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Kabul Et</span>
                          </button>
                          <button
                            type="button"
                            disabled={respondingId === req.id}
                            onClick={() => handleRespondRequest(req.id, 'declined')}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reddet</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Outgoing */}
              <div>
                <h3 className="text-xs font-bold text-slate-300 mb-2">Gönderilen İstekler ({outgoingRequests.length})</h3>
                {outgoingRequests.length === 0 ? (
                  <p className="text-[11px] text-slate-500 italic py-2">Gönderdiğiniz bekleyen istek yok.</p>
                ) : (
                  <div className="divide-y divide-[#201834]">
                    {outgoingRequests.map((req) => (
                      <div key={req.id} className="py-2.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-400 text-xs shrink-0">
                            {req.recipientName?.charAt(0).toUpperCase() || 'U'}
                          </div>
                          <div>
                            <span className="font-semibold text-xs text-white block">{req.recipientName || 'Kullanıcı'}</span>
                            <span className="text-[10px] text-slate-500">Beklemede • {new Date(req.createdAt).toLocaleDateString('tr-TR')}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Add Friend Form */
            <form onSubmit={handleSendRequest} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Kullanıcı E-Posta Adresi
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    placeholder="ornek@alanadi.com"
                    value={targetQuery}
                    onChange={(e) => setTargetQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-[#171126] border border-[#2a1f42] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Arkadaşlık isteği göndermek istediğiniz kullanıcının kayıtlı e-posta adresini girin.
                </p>
              </div>

              <div className="p-3 bg-purple-950/20 border border-purple-800/40 rounded-xl text-xs text-purple-200/90 space-y-1">
                <p className="font-semibold text-purple-300 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" />
                  <span>Gizlilik ve Koruma</span>
                </p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Aile rolündeki kullanıcılara yalnızca platform yöneticisi doğrudan mesaj başlatabilir. Arkadaşlık istekleri karşı tarafın onayına tabidir.
                </p>
              </div>

              <button
                type="submit"
                disabled={submittingAdd}
                className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 transition-all"
              >
                {submittingAdd ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>İstek Gönderiliyor...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Arkadaşlık İsteği Gönder</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
