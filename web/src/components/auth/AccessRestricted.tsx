import React, { useState } from 'react';
import { BrandLogo } from '../common/BrandLogo';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import {
  ShieldAlert,
  Clock,
  RefreshCw,
  LogOut,
  MessageSquare,
  X,
  Send,
  CheckCircle2,
  AlertTriangle,
  User,
} from 'lucide-react';

export const AccessRestricted: React.FC = () => {
  const { user, whitelist, refreshSession, logout } = useAuth();
  const [checking, setChecking] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);

  // Support form states
  const [supportTitle, setSupportTitle] = useState('Beyaz Liste Erişim İnceleme Talebi');
  const [supportMessage, setSupportMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [supportError, setSupportError] = useState<string | null>(null);
  const [supportSuccess, setSupportSuccess] = useState<string | null>(null);

  const isRejected = user?.status === 'rejected' || whitelist?.status === 'rejected';

  const handleRefresh = async () => {
    try {
      setChecking(true);
      await refreshSession();
    } finally {
      setChecking(false);
    }
  };

  const handleSendSupport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportMessage.trim()) {
      setSupportError('Lütfen yöneticiye iletmek istediğiniz mesajınızı yazın.');
      return;
    }

    try {
      setIsSending(true);
      setSupportError(null);

      const res = await api.submitSupportReport({
        title: supportTitle.trim(),
        description: supportMessage.trim(),
        diagnostics: {
          platform: 'web',
          appVersion: '1.0.1',
          errorCode: isRejected ? 'ACCESS_DENIED_REJECTED' : 'ACCESS_DENIED_NOT_WHITELISTED',
        },
      });

      setSupportSuccess(
        res.message ||
          'Destek mesajınız başarıyla kaydedildi ve yönetici incelemesine iletildi. İnceleme tamamlandığında durumunuz güncellenecektir.'
      );
      setSupportMessage('');
    } catch (err: any) {
      setSupportError(err.message || 'Destek mesajı iletilemedi. Lütfen daha sonra tekrar deneyin.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07050d] flex items-center justify-center p-4">
      <div className="bg-[#120e24] border border-[#2b224c] w-full max-w-md rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center animate-fade-in text-slate-100">
        <BrandLogo size={52} className="mb-6" />

        {/* State Icon */}
        {isRejected ? (
          <div className="w-16 h-16 rounded-2xl bg-rose-950/60 border border-rose-800/60 flex items-center justify-center text-rose-400 mb-4 shadow-lg shadow-rose-950/40">
            <ShieldAlert className="w-9 h-9" />
          </div>
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-amber-950/60 border border-amber-800/60 flex items-center justify-center text-amber-400 mb-4 shadow-lg shadow-amber-950/40">
            <Clock className="w-9 h-9 animate-pulse" />
          </div>
        )}

        {/* Status Badge */}
        <div className="mb-3">
          {isRejected ? (
            <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-rose-950 text-rose-300 border border-rose-700/60">
              Durum: Reddedildi
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-950 text-amber-300 border border-amber-700/60">
              Durum: Onay Bekliyor (Sırada)
            </span>
          )}
        </div>

        {/* Main Header & Explanation */}
        <h2 className="text-xl font-bold text-white mb-2">
          {isRejected ? 'Erişim Talebiniz Onaylanmadı' : 'Erişim Onayı Bekleniyor'}
        </h2>

        <p className="text-xs text-slate-300 mb-4 leading-relaxed">
          {isRejected
            ? 'Beyaz liste erişim başvurunuz bir platform Yöneticisi veya yetkili Moderatör tarafından incelenmiş ve onaylanmamıştır. Kapalı devre topluluk ve sohbetlere erişim izniniz bulunmamaktadır.'
            : 'XXQ Chat şu anda kısıtlı Beyaz Liste Modunda çalışmaktadır. Google hesabınızla ilk erişim talebiniz başarıyla oluşturulmuştur. Hesabınız platform Yöneticisi veya yetkili Moderatörler tarafından incelenmekte olup onaylandığında tüm özelliklere erişebileceksiniz.'}
        </p>

        {user && (
          <div className="w-full p-3 rounded-2xl bg-[#090715] border border-[#251d3f] mb-5 flex flex-col items-center">
            <span className="text-[10px] text-slate-500 uppercase font-mono tracking-wider">İncelenen Hesap</span>
            <span className="text-xs font-semibold text-purple-200 mt-0.5">{user.email}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col w-full gap-2.5">
          <button
            type="button"
            onClick={() => {
              setShowSupportModal(true);
              setSupportSuccess(null);
              setSupportError(null);
            }}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-2xl shadow-lg shadow-purple-950/50 transition-all hover:scale-[1.01] active:scale-[0.99]"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Destekle Konuş</span>
          </button>

          {!isRejected && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={checking}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#1a1435] hover:bg-[#251d4b] border border-[#3b2d6a] disabled:opacity-50 text-purple-200 font-semibold text-xs rounded-2xl transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
              <span>{checking ? 'Kontrol Ediliyor...' : 'Onay Durumunu Kontrol Et'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#0d0a1c] hover:bg-[#16112c] text-slate-400 hover:text-slate-200 font-medium text-xs rounded-2xl border border-[#231b3b] transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Çıkış Yap / Hesap Değiştir</span>
          </button>
        </div>

        <p className="text-[11px] text-slate-500 mt-5 leading-relaxed">
          {isRejected
            ? 'Bu kararla ilgili itiraz etmek veya durumunuzu netleştirmek için "Destekle Konuş" seçeneğini kullanabilirsiniz.'
            : 'Yöneticiler başvurunuzu onayladığında sayfayı yenileyerek veya oturumunuzu tazeleyerek doğrudan giriş yapabilirsiniz.'}
        </p>
      </div>

      {/* Contact Support Modal */}
      {showSupportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
          <div className="bg-[#120e24] border border-[#2b224c] w-full max-w-lg rounded-3xl p-6 sm:p-7 shadow-2xl flex flex-col text-slate-100 relative max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setShowSupportModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white transition-colors"
              title="Kapat"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400 shrink-0">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Yöneticiye Destek Mesajı İlet</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Erişim başvurunuzla ilgili detayları ve notunuzu iletin.
                </p>
              </div>
            </div>

            {/* Applicant Profile Bar (Showing displayName, not email in title) */}
            <div className="mb-4 p-3 rounded-2xl bg-[#0a0718] border border-[#271d43] flex items-center gap-2.5 text-xs text-slate-300">
              <div className="w-7 h-7 rounded-xl bg-purple-900/60 border border-purple-600/40 flex items-center justify-center text-purple-300 font-bold text-xs shrink-0">
                <User className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] text-slate-500 block uppercase font-mono">Başvuru Sahibi</span>
                <span className="font-semibold text-white truncate block">
                  {user?.displayName || user?.email?.split('@')[0] || 'Kullanıcı'}
                </span>
              </div>
            </div>

            {/* Disclaimer Alert */}
            <div className="mb-4 p-3 rounded-2xl bg-amber-950/30 border border-amber-800/40 text-[11px] text-amber-200/90 leading-relaxed flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p>
                <strong>Önemli Bilgilendirme:</strong> Destekle iletişime geçmek başvurunuzu otomatik olarak onaylamaz. İlettiğiniz mesaj platform Yöneticisi ve yetkili Moderatörler tarafından incelenmek üzere güvenli destek sistemine kaydedilir.
              </p>
            </div>

            {supportSuccess ? (
              <div className="p-4 rounded-2xl bg-emerald-950/50 border border-emerald-700/60 text-xs text-emerald-200 space-y-3">
                <div className="flex items-center gap-2 font-bold text-emerald-100">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Mesajınız Kaydedildi</span>
                </div>
                <p className="text-[11px] text-emerald-300/90 leading-relaxed">
                  {supportSuccess}
                </p>
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowSupportModal(false)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors"
                  >
                    Kapat
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSendSupport} className="space-y-4">
                {supportError && (
                  <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-800 text-xs text-rose-200">
                    {supportError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Konu</label>
                  <input
                    type="text"
                    required
                    value={supportTitle}
                    onChange={(e) => setSupportTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#0b0817] border border-[#271f42] rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
                    placeholder="Konu başlığı..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Mesajınız</label>
                  <textarea
                    required
                    rows={4}
                    value={supportMessage}
                    onChange={(e) => setSupportMessage(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#0b0817] border border-[#271f42] rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 resize-none leading-relaxed"
                    placeholder="Erişim talebiniz, kim olduğunuz veya inceleme için eklemek istediğiniz bilgileri yazın..."
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#251d3f]">
                  <button
                    type="button"
                    onClick={() => setShowSupportModal(false)}
                    disabled={isSending}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
                  >
                    İptal
                  </button>
                  <button
                    type="submit"
                    disabled={isSending || !supportMessage.trim()}
                    className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-purple-950/50 transition-all"
                  >
                    {isSending ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>İletiliyor...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Destek Mesajını Gönder</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
