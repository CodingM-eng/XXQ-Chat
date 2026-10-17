import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { ServerInvite } from '../../types';
import {
  X,
  Link2,
  Copy,
  Check,
  Clock,
  Users,
  Trash2,
  Loader2,
  Plus,
  Share2,
} from 'lucide-react';

interface ServerInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string;
  serverName: string;
}

export const ServerInviteModal: React.FC<ServerInviteModalProps> = ({
  isOpen,
  onClose,
  serverId,
  serverName,
}) => {
  const [invites, setInvites] = useState<ServerInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // New invite options
  const [expiresInHours, setExpiresInHours] = useState<number>(24);
  const [maxUses, setMaxUses] = useState<number>(0);

  useEffect(() => {
    if (isOpen && serverId) {
      loadInvites();
    }
  }, [isOpen, serverId]);

  const loadInvites = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getServerInvites(serverId);
      setInvites(res.invites || []);
    } catch (err: any) {
      setError(err.message || 'Davet bağlantıları yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreating(true);
      setError(null);
      const res = await api.createServerInvite(serverId, {
        expiresInHours: expiresInHours > 0 ? expiresInHours : undefined,
        maxUses: maxUses > 0 ? maxUses : undefined,
      });
      setSuccessMsg('Yeni davet bağlantısı oluşturuldu!');
      await loadInvites();
      if (res.invite?.code) {
        copyInviteLink(res.invite.code);
      }
    } catch (err: any) {
      setError(err.message || 'Davet bağlantısı oluşturulamadı.');
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      setError(null);
      await api.revokeServerInvite(serverId, inviteId);
      setSuccessMsg('Davet bağlantısı iptal edildi.');
      await loadInvites();
    } catch (err: any) {
      setError(err.message || 'Davet iptal edilemedi.');
    }
  };

  const copyInviteLink = (code: string) => {
    const origin = window.location.origin;
    const url = `${origin}?invite=${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2500);
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in select-none">
      <div className="bg-[#120f1e] border border-[#2a2244] w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#241c38] flex items-center justify-between bg-gradient-to-r from-purple-950/40 via-[#120f1e] to-[#120f1e]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-900/60 border border-purple-700/50 flex items-center justify-center text-purple-300">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Sunucu Davet Bağlantıları</h2>
              <p className="text-[11px] text-slate-400">{serverName} sunucusuna arkadaşlarınızı davet edin</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#1b152d] hover:bg-[#251d3e] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
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

          {/* Create Invite Form */}
          <form onSubmit={handleCreateInvite} className="p-4 bg-[#171126] border border-[#2a1f42] rounded-2xl space-y-3">
            <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-purple-400" />
              <span>Yeni Davet Bağlantısı Oluştur</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Geçerlilik Süresi</label>
                <select
                  value={expiresInHours}
                  onChange={(e) => setExpiresInHours(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#1b152d] border border-[#2d2247] rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  <option value={1}>1 Saat</option>
                  <option value={6}>6 Saat</option>
                  <option value={24}>1 Gün (24 Saat)</option>
                  <option value={168}>7 Gün</option>
                  <option value={0}>Süresiz (Hiçbir zaman)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Maksimum Kullanım</label>
                <select
                  value={maxUses}
                  onChange={(e) => setMaxUses(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#1b152d] border border-[#2d2247] rounded-xl text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  <option value={0}>Sınırsız Kullanım</option>
                  <option value={1}>1 Kullanım (Tek Seferlik)</option>
                  <option value={5}>5 Kullanım</option>
                  <option value={10}>10 Kullanım</option>
                  <option value={25}>25 Kullanım</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={creating}
              className="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              <span>Bağlantı Oluştur ve Kopyala</span>
            </button>
          </form>

          {/* Active Invites List */}
          <div>
            <h3 className="text-xs font-bold text-slate-300 mb-2.5">Mevcut Davet Bağlantıları ({invites.length})</h3>
            {loading ? (
              <div className="py-8 flex items-center justify-center text-slate-500 text-xs">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Yükleniyor...
              </div>
            ) : invites.length === 0 ? (
              <p className="text-[11px] text-slate-500 italic py-2">
                Henüz bu sunucu için aktif bir davet bağlantısı oluşturulmamış.
              </p>
            ) : (
              <div className="divide-y divide-[#201834]">
                {invites.map((inv) => (
                  <div key={inv.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded-lg border border-purple-800/40">
                          {inv.code}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {inv.maxUses ? `${inv.usesCount || 0}/${inv.maxUses} kullanım` : `${inv.usesCount || 0} kullanım (sınırsız)`}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {inv.expiresAt
                          ? `Son geçerlilik: ${new Date(inv.expiresAt).toLocaleString('tr-TR')}`
                          : 'Süresiz geçerli'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => copyInviteLink(inv.code)}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border ${
                          copiedCode === inv.code
                            ? 'bg-emerald-600 text-white border-emerald-500'
                            : 'bg-[#1b152d] hover:bg-purple-600/30 text-purple-300 border-[#2d2247] hover:border-purple-500/50'
                        }`}
                      >
                        {copiedCode === inv.code ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Kopyalandı</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Kopyala</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRevokeInvite(inv.id)}
                        className="p-1.5 hover:bg-rose-950/60 text-slate-500 hover:text-rose-400 rounded-xl transition-colors"
                        title="Daveti İptal Et"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
