import React, { useState } from 'react';
import { BrandLogo } from '../common/BrandLogo';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck, AlertCircle, RefreshCw, X, LogIn, UserPlus } from 'lucide-react';

export const AuthModal: React.FC = () => {
  const {
    loginWithGoogle,
    isFirebaseReady,
    error,
    retrySession,
    clearError,
    isWakingServer,
    serverStatusMessage,
    cancelWakeUp,
  } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
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

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setUiError(null);
      clearError();
      await loginWithGoogle();
    } catch (err: any) {
      setUiError(err.message || 'Google ile kimlik doğrulama başarısız oldu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07050d] flex items-center justify-center p-4">
      <div className="bg-[#120e24] border border-[#2b224c] w-full max-w-md rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center animate-fade-in text-slate-100">
        <BrandLogo size={56} className="mb-4" />

        {/* Tab Selection: Giriş Yap vs Kayıt Ol */}
        <div className="w-full flex items-center bg-[#0a0716] p-1 rounded-2xl border border-[#251d3f] mb-6">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setUiError(null);
              clearError();
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
              mode === 'login'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/50'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Giriş Yap</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setUiError(null);
              clearError();
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
              mode === 'register'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/50'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Kayıt Ol</span>
          </button>
        </div>

        {/* Dynamic Header */}
        <h1 className="text-2xl font-bold text-white tracking-tight mb-1 text-center">
          {mode === 'login' ? "XXQ Chat'e Giriş Yap" : "XXQ Chat'e Kayıt Ol"}
        </h1>
        <p className="text-xs text-slate-400 mb-6 text-center leading-relaxed max-w-sm">
          {mode === 'login'
            ? 'Onaylı Google hesabınızla güvenli bir şekilde oturum açın.'
            : 'Beyaz liste onayına başvurmak için Google hesabınızla kaydolun.'}
        </p>

        {/* Server Cold-Start Waking Banner */}
        {isWakingServer && (
          <div className="w-full p-3.5 mb-4 rounded-xl bg-purple-950/80 border border-purple-700/60 text-purple-200 text-xs flex flex-col gap-2.5 shadow-lg shadow-purple-950/50 animate-fade-in">
            <div className="flex items-start gap-2.5">
              <RefreshCw className="w-4 h-4 animate-spin text-purple-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-purple-100">
                  {serverStatusMessage || 'Sunucu uyandırılıyor...'}
                </p>
                <p className="text-[11px] text-purple-300/80 mt-0.5">
                  Render Free servisleri uyku modundan çıkarken 30-50 saniye sürebilir.
                </p>
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={cancelWakeUp}
                className="px-3 py-1 bg-purple-900/60 hover:bg-purple-800 border border-purple-600/40 text-purple-200 hover:text-white rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                <span>İptal Et</span>
              </button>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {(uiError || error) && !isWakingServer && (
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

        {loading && !isWakingServer && (
          <div className="w-full p-2.5 mb-4 rounded-xl bg-purple-950/60 border border-purple-800/40 text-purple-200 text-xs flex items-center justify-center gap-2 animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
            <span>Kimlik doğrulanıyor, lütfen bekleyin...</span>
          </div>
        )}

        {/* Registration Whitelist Information Card */}
        {mode === 'register' && (
          <div className="w-full p-3.5 mb-5 rounded-2xl bg-purple-950/30 border border-purple-800/40 text-slate-300 text-xs flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-white">Kapalı Devre Topluluk & Güvenlik</p>
              <p className="text-[11px] text-purple-200/80 leading-relaxed">
                XXQ Chat güvenli ve kapalı devre bir iletişim ağıdır. Kayıt olduğunuzda erişim talebiniz platform Yöneticisi ve yetkili Moderatörlerin inceleme sırasına alınır. Onaylandığında tüm sohbet ve topluluk özelliklerine erişebilirsiniz.
              </p>
            </div>
          </div>
        )}

        {/* Official Google Authentication Button */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading || isWakingServer}
          className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-white hover:bg-slate-100 disabled:opacity-60 text-slate-900 font-bold text-xs rounded-2xl shadow-xl shadow-purple-950/40 transition-all hover:scale-[1.01] active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-purple-500"
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
          <span>{mode === 'login' ? 'Google ile Giriş Yap' : 'Google ile Kaydol'}</span>
        </button>

        {!isFirebaseReady && (
          <p className="text-[11px] text-amber-300/90 mt-4 text-center leading-relaxed bg-amber-950/40 border border-amber-600/30 p-2.5 rounded-xl">
            Firebase istemci bağlantısı bekleniyor. Lütfen ağ bağlantınızı ve çevre değişkenlerini kontrol edin.
          </p>
        )}

        {/* Mode Switcher Footer */}
        <div className="w-full text-center mt-6 pt-5 border-t border-[#251d3f]">
          {mode === 'login' ? (
            <p className="text-xs text-slate-400">
              Henüz bir hesabınız yok mu?{' '}
              <button
                type="button"
                onClick={() => setMode('register')}
                className="text-purple-400 hover:text-purple-300 font-semibold underline ml-1"
              >
                Kayıt Olun
              </button>
            </p>
          ) : (
            <p className="text-xs text-slate-400">
              Zaten bir hesabınız veya başvurunuz var mı?{' '}
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-purple-400 hover:text-purple-300 font-semibold underline ml-1"
              >
                Giriş Yapın
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
