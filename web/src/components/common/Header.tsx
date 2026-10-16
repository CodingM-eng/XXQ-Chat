import React from 'react';
import { BrandLogo } from './BrandLogo';
import { useAuth } from '../../context/AuthContext';
import { Shield, ShieldAlert, Wifi, WifiOff, LogOut, User as UserIcon } from 'lucide-react';

interface HeaderProps {
  currentView: 'chat' | 'admin';
  onNavigate: (view: 'chat' | 'admin') => void;
  isConnected: boolean;
}

export const Header: React.FC<HeaderProps> = ({ currentView, onNavigate, isConnected }) => {
  const { user, whitelist, logout } = useAuth();

  return (
    <header className="h-16 border-b border-chat-border bg-slate-950/90 backdrop-blur-md px-4 flex items-center justify-between shrink-0 select-none z-20">
      <div className="flex items-center gap-4">
        <button
          onClick={() => onNavigate('chat')}
          className="hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg p-1"
        >
          <BrandLogo size={32} />
        </button>

        {/* Real-time Connection Status Indicator */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-xs text-slate-300">
          {isConnected ? (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Canlı Bağlantı</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>Bağlanıyor...</span>
            </>
          )}
        </div>

        {/* Whitelist Access Status Badge */}
        {whitelist && (
          <div
            className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              whitelist.modeActive
                ? 'bg-purple-950/70 text-purple-300 border-purple-800/60'
                : 'bg-emerald-950/70 text-emerald-300 border-emerald-800/60'
            }`}
          >
            {whitelist.modeActive ? (
              <>
                <Shield className="w-3.5 h-3.5 text-purple-400" />
                <span>Beyaz Liste: Aktif</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
                <span>Açık Erişim: Aktif</span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Admin Navigation Button */}
        {user?.isAdmin && (
          <button
            onClick={() => onNavigate(currentView === 'admin' ? 'chat' : 'admin')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm ${
              currentView === 'admin'
                ? 'bg-brand-600 text-white shadow-purple-900/30'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800'
            }`}
            title="Güvenli Yönetici Paneli"
          >
            <Shield className="w-4 h-4 text-purple-400" />
            <span className="hidden sm:inline">
              {currentView === 'admin' ? 'Sohbete Dön' : 'Yönetici Paneli'}
            </span>
          </button>
        )}

        {/* User Profile Pill */}
        {user && (
          <div className="flex items-center gap-2.5 pl-2 border-l border-slate-800">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-brand-700 to-purple-400 flex items-center justify-center font-bold text-white text-xs shadow-inner uppercase overflow-hidden shrink-0">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.displayName} className="w-full h-full object-cover" />
              ) : (
                user.displayName.slice(0, 2)
              )}
            </div>

            <div className="hidden lg:flex flex-col leading-tight">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1">
                {user.displayName}
                {user.isAdmin && (
                  <span className="bg-purple-500/20 text-purple-300 text-[10px] px-1 py-0.2 rounded font-mono">
                    YÖNETİCİ
                  </span>
                )}
              </span>
              <span className="text-[11px] text-slate-400 truncate max-w-[130px]">{user.email}</span>
            </div>

            <button
              onClick={logout}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
              title="Çıkış Yap"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
