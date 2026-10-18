import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Server, ServerJoinQuestion } from '../../types';
import { SafeAvatar } from '../common/SafeAvatar';
import { toSafeImageUrl } from '../../utils/sanitizeSvg';
import {
  X,
  Layers,
  Users,
  Shield,
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
  HelpCircle,
  Lock,
} from 'lucide-react';

interface JoinCommunityModalProps {
  isOpen: boolean;
  onClose: () => void;
  inviteCode?: string;
  onJoined: (server: Server) => void;
}

export const JoinCommunityModal: React.FC<JoinCommunityModalProps> = ({
  isOpen,
  onClose,
  inviteCode: initialCode = '',
  onJoined,
}) => {
  const [code, setCode] = useState(initialCode);
  const [loadingInvite, setLoadingInvite] = useState(false);
  const [inviteData, setInviteData] = useState<{
    code: string;
    serverId: string;
    serverName: string;
    serverAvatar?: string | null;
    serverBanner?: string | null;
    serverDescription?: string | null;
    welcomeMessage?: string | null;
    requiresApproval: boolean;
    joinQuestions: ServerJoinQuestion[];
    memberCount: number;
    expiresAt?: string | null;
  } | null>(null);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState(false);

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
      fetchInviteInfo(initialCode);
    }
  }, [initialCode]);

  if (!isOpen) return null;

  const fetchInviteInfo = async (c: string) => {
    if (!c.trim()) return;
    try {
      setLoadingInvite(true);
      setError(null);
      setPendingApproval(false);
      const res = await api.getServerInvite(c.trim());
      setInviteData(res.invite);
      // Pre-fill empty answers
      const initialAnswers: Record<string, string> = {};
      if (res.invite.joinQuestions) {
        res.invite.joinQuestions.forEach((q: ServerJoinQuestion) => {
          initialAnswers[q.id] = '';
        });
      }
      setAnswers(initialAnswers);
    } catch (err: any) {
      setError(err.message || 'Davet bağlantısı geçersiz veya süresi dolmuş.');
      setInviteData(null);
    } finally {
      setLoadingInvite(false);
    }
  };

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    fetchInviteInfo(code);
  };

  const handleAnswerChange = (questionId: string, val: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: val }));
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteData) return;

    // Validate required questions
    if (inviteData.joinQuestions && inviteData.joinQuestions.length > 0) {
      for (const q of inviteData.joinQuestions) {
        if (q.required && (!answers[q.id] || !answers[q.id].trim())) {
          setError(`Lütfen "${q.question}" sorusunu yanıtlayın.`);
          return;
        }
      }
    }

    try {
      setSubmitting(true);
      setError(null);
      const res = await api.acceptServerInvite(inviteData.code, answers);

      if (res.pendingApproval) {
        setPendingApproval(true);
      } else if (res.server) {
        onJoined(res.server);
        onClose();
      } else if (res.serverId) {
        const fullServer = await api.getServer(res.serverId).catch(() => null);
        if (fullServer?.server) {
          onJoined(fullServer.server);
        }
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Topluluğa katılırken bir hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in select-none">
      <div className="bg-[#120f1e] border border-[#2a2244] w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#241c38] flex items-center justify-between bg-gradient-to-r from-purple-950/40 via-[#120f1e] to-[#120f1e]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-900/60 border border-purple-700/50 flex items-center justify-center text-purple-300">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Topluluğa Katıl</h2>
              <p className="text-[11px] text-slate-400">Davet bağlantısı ile topluluğa giriş yapın</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#1b152d] hover:bg-[#251d3e] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Pending Approval Success Screen */}
          {pendingApproval ? (
            <div className="py-8 text-center space-y-3 animate-fade-in">
              <div className="w-14 h-14 rounded-2xl bg-purple-950/80 border border-purple-600/50 flex items-center justify-center mx-auto text-purple-300 shadow-xl shadow-purple-950/50">
                <Clock className="w-7 h-7 text-purple-400 animate-pulse" />
              </div>
              <h3 className="text-base font-bold text-white">Katılım Başvurunuz İletildi!</h3>
              <p className="text-xs text-slate-300 max-w-sm mx-auto leading-relaxed">
                Topluluğun giriş sorularına verdiğiniz yanıtlar güvenli ve gizli bir şekilde topluluk yöneticilerine iletildi. Başvurunuz onaylandığında topluluğa otomatik olarak ekleneceksiniz.
              </p>
              <div className="pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-lg transition-all"
                >
                  Tamam
                </button>
              </div>
            </div>
          ) : !inviteData ? (
            /* Invite Code Input */
            <form onSubmit={handleLookup} className="space-y-4">
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Davet Kodu veya Bağlantısı
                </label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Örn: 9a7b2c veya https://xxq.chat/invite/..."
                  className="w-full px-3.5 py-2.5 bg-[#0b0914] border border-[#241c38] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <button
                type="submit"
                disabled={loadingInvite || !code.trim()}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-purple-950/50 transition-all disabled:opacity-50"
              >
                {loadingInvite ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Davet Bilgileri Alınıyor...</span>
                  </>
                ) : (
                  <>
                    <span>Topluluğu İncele</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Server Preview & Questions Form */
            <form onSubmit={handleJoin} className="space-y-4">
              {/* Community Banner & Identity Box */}
              <div
                className="w-full h-24 rounded-2xl bg-[#1a1330] border border-[#2e234c] overflow-hidden relative bg-cover bg-center flex items-end p-3 shadow-inner"
                style={{
                  backgroundImage: toSafeImageUrl(inviteData.serverBanner) ? `url(${toSafeImageUrl(inviteData.serverBanner)})` : undefined,
                }}
              >
                <div className="w-12 h-12 rounded-xl overflow-hidden border-2 border-purple-500 bg-[#120f1e] flex items-center justify-center text-white font-bold text-base shadow-lg shrink-0">
                  <SafeAvatar
                    src={inviteData.serverAvatar}
                    alt={inviteData.serverName}
                    className="w-full h-full object-cover"
                    fallbackText={inviteData.serverName}
                    size={48}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white">{inviteData.serverName}</h3>
                  <span className="text-[11px] text-purple-300 bg-purple-950/80 px-2 py-0.5 rounded-full border border-purple-800/50 flex items-center gap-1 font-semibold">
                    <Users className="w-3 h-3" />
                    <span>{inviteData.memberCount} Üye</span>
                  </span>
                </div>
                {inviteData.serverDescription && (
                  <p className="text-xs text-slate-300 leading-relaxed">{inviteData.serverDescription}</p>
                )}
              </div>

              {/* Welcome Message */}
              {inviteData.welcomeMessage && (
                <div className="p-3 bg-purple-950/30 border border-purple-800/40 rounded-2xl text-xs text-purple-200 space-y-1">
                  <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block">
                    Hoş Geldin Mesajı
                  </span>
                  <p className="leading-relaxed whitespace-pre-wrap">{inviteData.welcomeMessage}</p>
                </div>
              )}

              {/* Questions Section */}
              {inviteData.joinQuestions && inviteData.joinQuestions.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-[#241c38]">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-white text-xs">Katılım Başvuru Soruları</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Topluluğa katılabilmek için aşağıdaki soruları yanıtlayın.
                      </p>
                    </div>
                    <span className="text-[10px] text-purple-400 bg-purple-950/80 px-2 py-0.5 rounded-full border border-purple-800/50 flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      <span>Yöneticilere Özel</span>
                    </span>
                  </div>

                  <div className="space-y-3">
                    {inviteData.joinQuestions.map((q, idx) => (
                      <div key={q.id} className="space-y-1.5 p-3 rounded-2xl bg-[#0d0a17] border border-[#241c38]">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className="text-white flex items-center gap-1.5">
                            <span className="w-4 h-4 rounded-full bg-purple-950 text-purple-400 text-[10px] flex items-center justify-center font-bold">
                              {idx + 1}
                            </span>
                            <span>{q.question}</span>
                          </span>
                          {q.required ? (
                            <span className="text-[10px] text-red-400 font-bold">Zorunlu</span>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-normal">İsteğe Bağlı</span>
                          )}
                        </div>
                        <textarea
                          rows={2}
                          required={q.required}
                          value={answers[q.id] || ''}
                          onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                          placeholder="Yanıtınızı buraya yazın..."
                          className="w-full px-3 py-2 bg-[#080611] border border-[#211833] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 resize-none text-xs"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="p-2.5 bg-[#0e0a1b] border border-[#231b36] rounded-xl text-[10px] text-slate-400 flex items-start gap-2">
                    <Shield className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
                    <span>
                      Yanıtlarınız asla halka açık paylaşılmaz; yalnızca bu topluluğun yetkili yöneticileri tarafından incelenir.
                    </span>
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#241c38]">
                <button
                  type="button"
                  onClick={() => setInviteData(null)}
                  className="px-4 py-2 bg-[#1b152d] hover:bg-[#251d3e] text-slate-300 rounded-xl font-semibold transition-colors"
                >
                  Farklı Kod Gir
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-purple-950/50 transition-all disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{inviteData.requiresApproval ? 'Başvuru Gönderiliyor...' : 'Katılınıyor...'}</span>
                    </>
                  ) : (
                    <>
                      <span>{inviteData.requiresApproval ? 'Katılım Başvurusunu Gönder' : 'Topluluğa Katıl'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
