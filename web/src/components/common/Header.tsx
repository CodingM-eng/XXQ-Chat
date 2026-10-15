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
    <header className="h-16 border-b border-chat-border bg-slate-900/90 backdrop-blur-md px-4 flex items-center justify-between shrink-0 select-none z-20">
      <div className="flex items-center gap-4">
        <button
          onClick={() => onNavigate('chat')}
          className="hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-lg p-1"
        >
          <BrandLogo size={32} />
        </button>

        {/* Real-time Connection Status Indicator */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs text-slate-300">
          {isConnected ? (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live Gateway</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>Connecting...</span>
            </>
          )}
        </div>

        {/* Whitelist Access Status Badge */}
        {whitelist && (
          <div
            className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              whitelist.modeActive
                ? 'bg-blue-950/70 text-blue-300 border-blue-800/60'
                : 'bg-emerald-950/70 text-emerald-300 border-emerald-800/60'
            }`}
          >
            {whitelist.modeActive ? (
              <>
                <Shield className="w-3.5 h-3.5 text-blue-400" />
                <span>Whitelist Mode: Active</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
                <span>Open Mode: Active</span>
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
                ? 'bg-brand-600 text-white shadow-brand-500/20'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
            title="Secure Admin Web Panel"
          >
            <Shield className="w-4 h-4 text-sky-400" />
            <span className="hidden sm:inline">
              {currentView === 'admin' ? 'Back to Chat' : 'Admin Panel'}
            </span>
          </button>
        )}

        {/* User Profile Pill */}
        {user && (
          <div className="flex items-center gap-2.5 pl-2 border-l border-slate-800">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-brand-600 to-sky-400 flex items-center justify-center font-bold text-white text-xs shadow-inner uppercase overflow-hidden shrink-0">
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
                  <span className="bg-sky-500/20 text-sky-400 text-[10px] px-1 py-0.2 rounded font-mono">
                    ADMIN
                  </span>
                )}
              </span>
              <span className="text-[11px] text-slate-400 truncate max-w-[130px]">{user.email}</span>
            </div>

            <button
              onClick={logout}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
