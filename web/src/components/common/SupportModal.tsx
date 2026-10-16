import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { X, HelpCircle, Send, CheckCircle2, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const diagnosticsInfo = {
    appVersion: '1.0.0',
    platform: typeof window !== 'undefined' && (window as any).electronAPI ? 'Windows Masaüstü' : 'Modern Web',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Bilinmeyen',
    currentPath: typeof window !== 'undefined' ? window.location.pathname : '/',
    timestamp: new Date().toLocaleString('tr-TR'),
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Lütfen sorunu özetleyen bir başlık girin.');
      return;
    }
    if (description.trim().length < 5) {
      setError('Lütfen sorunu en az 5 karakterle açıklayın.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const res = await api.submitSupportReport({
        title: title.trim(),
        description: description.trim(),
        diagnostics: diagnosticsInfo,
      });

      setSuccessMessage(res.message || 'Sorun bildiriminiz başarıyla iletildi.');
      setTimeout(() => {
        setSuccessMessage(null);
        setTitle('');
        setDescription('');
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Sorun bildirimi gönderilemedi. Lütfen tekrar deneyin.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#120f1e] border border-[#2a2244] w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#241c38] flex items-center justify-between bg-gradient-to-r from-purple-950/40 via-[#120f1e] to-[#120f1e]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-900/60 border border-purple-700/50 flex items-center justify-center text-purple-300">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Sorun Bildir & İletişim</h2>
              <p className="text-[11px] text-slate-400">Teknik hata veya geri bildiriminizi yöneticilere iletin</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#1b152d] hover:bg-[#251d3e] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[80vh]">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Sorun Başlığı <span className="text-purple-400">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Örn: Dosya yüklerken bağlantı zaman aşımına uğruyor"
              className="w-full px-3.5 py-2.5 bg-[#0b0914] border border-[#241c38] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Sorun Açıklaması <span className="text-purple-400">*</span>
            </label>
            <textarea
              required
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Karşılaştığınız hatayı, ne yapmaya çalıştığınızı ve sorunun nasıl yeniden oluştuğunu tarif edin..."
              className="w-full px-3.5 py-2.5 bg-[#0b0914] border border-[#241c38] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none transition-colors"
            />
          </div>

          {/* Diagnostic Info Box */}
          <div className="p-3.5 bg-[#090710] border border-[#241c38] rounded-2xl space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
              <span>Otomatik Eklenen Teşhis Bilgileri</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-tight">
              Sorunu hızla çözebilmemiz için sistem ve cihaz bilgileriniz rapora iliştirilir. Özel şifre veya kimlik anahtarları asla dahil edilmez.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] font-mono text-slate-400 border-t border-[#1c172e]">
              <div>
                <span className="text-slate-500">Platform: </span>
                {diagnosticsInfo.platform}
              </div>
              <div>
                <span className="text-slate-500">Sürüm: </span>
                v{diagnosticsInfo.appVersion}
              </div>
              <div className="col-span-2 truncate">
                <span className="text-slate-500">Kullanıcı: </span>
                {user?.email || 'Giriş yapılmadı'}
              </div>
              <div className="col-span-2 truncate">
                <span className="text-slate-500">Zaman: </span>
                {diagnosticsInfo.timestamp}
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-[#1b152d] transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-900/30 transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Gönderiliyor...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Sorun Bildir</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
