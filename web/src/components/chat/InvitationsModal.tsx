import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { MembershipInvitation } from '../../types';
import {
  X,
  Mail,
  Check,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Users,
  Layers,
} from 'lucide-react';

interface InvitationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvitationAccepted: (targetId: string, targetType: 'group' | 'server') => void;
}

export const InvitationsModal: React.FC<InvitationsModalProps> = ({
  isOpen,
  onClose,
  onInvitationAccepted,
}) => {
  const [invitations, setInvitations] = useState<MembershipInvitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadInvitations();
    }
  }, [isOpen]);

  const loadInvitations = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getMyInvitations();
      setInvitations(res.invitations || []);
    } catch (err: any) {
      setError(err.message || 'Davetler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  const handleRespond = async (inv: MembershipInvitation, response: 'accepted' | 'rejected') => {
    try {
      setRespondingId(inv.id);
      setError(null);
      await api.respondToInvitation(inv.id, response);
      setSuccessMsg(
        response === 'accepted'
          ? `"${inv.targetName || 'Topluluk'}" davetini kabul ettiniz!`
          : `"${inv.targetName || 'Topluluk'}" daveti reddedildi.`
      );
      // Update local state
      setInvitations((prev) =>
        prev.map((item) => (item.id === inv.id ? { ...item, status: response } : item))
      );
      if (response === 'accepted') {
        onInvitationAccepted(inv.targetId, inv.targetType);
      }
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Davet yanıtlanırken hata oluştu.');
    } finally {
      setRespondingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
      <div className="bg-[#120f1e] border border-[#2a2244] w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#241c38] flex items-center justify-between bg-gradient-to-r from-purple-950/40 via-[#120f1e] to-[#120f1e]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-900/60 border border-purple-700/50 flex items-center justify-center text-purple-300">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Grup ve Sunucu Davetleri</h2>
              <p className="text-[11px] text-slate-400">Size gönderilen katılım teklifleri</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#1b152d] hover:bg-[#251d3e] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Alerts */}
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

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 text-xs">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
              <span>Davetler yükleniyor...</span>
            </div>
          ) : invitations.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <Mail className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              <p className="text-sm font-semibold text-slate-400">Bekleyen davetiniz bulunmuyor.</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Bir grup veya sunucuya davet edildiğinizde burada listelenecektir.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#201834]">
              {invitations.map((inv) => (
                <div key={inv.id} className="py-3.5 flex flex-col gap-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-2xl bg-purple-950 border border-purple-800 flex items-center justify-center font-bold text-purple-300 text-xs shrink-0 mt-0.5">
                        {inv.targetType === 'server' ? (
                          <Layers className="w-4 h-4" />
                        ) : (
                          <Users className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-xs truncate">
                            {inv.targetName || (inv.targetType === 'server' ? 'Sunucu Daveti' : 'Grup Daveti')}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                            {inv.targetType === 'server' ? 'Sunucu' : 'Grup'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Davet eden: <strong className="text-slate-200">{inv.inviterName || 'Topluluk Yöneticisi'}</strong>
                        </p>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div>
                      {inv.status === 'accepted' ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                          Kabul edildi
                        </span>
                      ) : inv.status === 'rejected' ? (
                        <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-bold border border-rose-500/30">
                          Reddedildi
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                          Bekliyor
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions for pending invitations */}
                  {inv.status === 'pending' && (
                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#1c172e]">
                      <button
                        type="button"
                        onClick={() => handleRespond(inv, 'rejected')}
                        disabled={respondingId === inv.id}
                        className="px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 rounded-xl font-semibold transition-colors disabled:opacity-50"
                      >
                        Reddet
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRespond(inv, 'accepted')}
                        disabled={respondingId === inv.id}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                      >
                        {respondingId === inv.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        <span>Kabul et</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
