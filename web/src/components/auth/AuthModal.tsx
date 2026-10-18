import React, { useState } from 'react';
import { BrandLogo } from '../common/BrandLogo';
import { useAuth } from '../../context/AuthContext';
import { Shield, Sparkles, User, AlertCircle, ArrowRight, RefreshCw } from 'lucide-react';

export const AuthModal: React.FC = () => {
  const { loginWithDev, loginWithGoogle, isFirebaseReady, error, retrySession, clearError } = useAuth();
  const [customEmail, setCustomEmail] = useState('');
  const [customName, setCustomName] = useState('');
  const [loading, setLoading] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);

  const handleRetry = async () => {
    try {
      setLoading(true);
      setUiError(null);
      clearError();
      await retrySession();
    } catch (err: any) {
      setUiError(err.message || 'Sunucuya yeniden bağlanılamadı.');
    } finally {
      setLoading(false);
    }
  };

  const handleDevLogin = async (email: string, name?: string) => {
    try {
      setLoading(true);
      setUiError(null);
      clearError();
      await loginWithDev(email, name);
    } catch (err: any) {
      setUiError(err.message || 'Giriş başarısız oldu.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setUiError(null);
      clearError();
      await loginWithGoogle();
    } catch (err: any) {
      setUiError(err.message || 'Google ile giriş başarısız oldu. Firebase yapılandırılmamışsa lütfen Test Girişini kullanın.');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customEmail.trim()) return;
    handleDevLogin(customEmail.trim(), customName.trim() || undefined);
  };

  return (
    <div className="min-h-screen bg-chat-bg flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center animate-fade-in text-slate-100">
        <BrandLogo size={56} className="mb-4" />

        <h1 className="text-2xl font-bold text-white tracking-tight mb-1 text-center">
          XXQ Chat&apos;e Giriş Yap
        </h1>
        <p className="text-xs text-slate-400 mb-6 text-center">
          Yeni nesil güvenli ve gerçek zamanlı mesajlaşma
        </p>

        {(uiError || error) && (
          <div className="w-full p-3 mb-4 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <span className="flex-1 leading-relaxed">{uiError || error}</span>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleRetry}
                disabled={loading}
                className="px-3 py-1.5 bg-rose-900/80 hover:bg-rose-800 text-white rounded-lg font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Yeniden Dene</span>
              </button>
            </div>
          </div>
        )}

        {loading && (
          <div className="w-full p-2.5 mb-4 rounded-xl bg-purple-950/60 border border-purple-800/40 text-purple-200 text-xs flex items-center justify-center gap-2 animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
            <span>Sunucuya bağlanılıyor, lütfen bekleyin...</span>
          </div>
        )}

        {/* Google Authentication Button */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white hover:bg-slate-100 text-slate-900 font-semibold text-xs rounded-xl shadow-lg transition-all mb-4 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Google ile Devam Et</span>
        </button>

        {!isFirebaseReady && (
          <p className="text-[11px] text-slate-500 mb-6 text-center leading-relaxed">
            * Firebase OAuth kimlik bilgileri <code className="text-brand-300">.env</code> dosyasında yapılandırılabilir. Aşağıdaki onaylı test hesaplarını hemen kullanabilirsiniz.
          </p>
        )}

        <div className="w-full flex items-center gap-3 my-2">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-[11px] font-mono text-slate-500 uppercase">Test Kimliği Seçici</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        {/* Quick Test Profiles */}
        <div className="w-full space-y-2 mt-3 mb-6">
          <button
            onClick={() => handleDevLogin('admin@xxqchat.com', 'Sistem Yöneticisi')}
            disabled={loading}
            className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-left transition-colors group"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-sky-950 border border-sky-800 flex items-center justify-center text-sky-400">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <span className="font-semibold text-xs text-white block">Sistem Yöneticisi</span>
                <span className="text-[10px] text-slate-400 font-mono">admin@xxqchat.com</span>
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-brand-400 group-hover:translate-x-0.5 transition-all" />
          </button>

          <button
            onClick={() => handleDevLogin('alice@xxqchat.com', 'Alice (Onaylı)')}
            disabled={loading}
            className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-left transition-colors group"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <span className="font-semibold text-xs text-white block">Alice (Beyaz Liste Üyesi)</span>
                <span className="text-[10px] text-slate-400 font-mono">alice@xxqchat.com</span>
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-brand-400 group-hover:translate-x-0.5 transition-all" />
          </button>

          <button
            onClick={() => handleDevLogin('eve@outsider.com', 'Eve (Onaysız)')}
            disabled={loading}
            className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-left transition-colors group"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-rose-950 border border-rose-800 flex items-center justify-center text-rose-400">
                <User className="w-4 h-4" />
              </div>
              <div>
                <span className="font-semibold text-xs text-white block">Eve (Onaysız Dış Kullanıcı)</span>
                <span className="text-[10px] text-slate-400 font-mono">eve@outsider.com</span>
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-brand-400 group-hover:translate-x-0.5 transition-all" />
          </button>
        </div>

        {/* Custom Email Form */}
        <form onSubmit={handleCustomSubmit} className="w-full space-y-2 pt-2 border-t border-slate-800">
          <input
            type="email"
            value={customEmail}
            onChange={(e) => setCustomEmail(e.target.value)}
            placeholder="Veya özel e-posta ile giriş yapın..."
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            type="submit"
            disabled={loading || !customEmail.trim()}
            className="w-full py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors"
          >
            Özel E-posta ile Giriş Yap
          </button>
        </form>
      </div>
    </div>
  );
};
