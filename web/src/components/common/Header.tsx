import React, { useState } from 'react';
import { BrandLogo } from './BrandLogo';
import { useAuth } from '../../context/AuthContext';
import { Shield, ShieldAlert, LogOut, Settings } from 'lucide-react';
import { ProfileEditModal } from './ProfileEditModal';

interface HeaderProps {
  currentView: 'chat' | 'admin';
  onNavigate: (view: 'chat' | 'admin') => void;
  isConnected: boolean;
}

export const Header: React.FC<HeaderProps> = ({ currentView, onNavigate, isConnected }) => {
  const { user, whitelist, logout } = useAuth();
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  return (
    <>
      <header className="h-16 border-b border-[#241c38] bg-[#0c0a14]/90 backdrop-blur-md px-4 flex items-center justify-between shrink-0 select-none z-20">
        <div className="flex items-center gap-4">
          <button
            onClick={() => onNavigate('chat')}
            className="hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-purple-500 rounded-lg p-1"
          >
            <BrandLogo size={32} />
          </button>

          {/* Real-time Connection Status Indicator */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#151124] border border-[#261e3d] text-xs text-slate-300">
            {isConnected ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] font-medium text-emerald-400">Canlı Bağlantı</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-[11px] font-medium text-amber-400">Bağlanıyor...</span>
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
                  <span className="text-[11px]">Beyaz Liste: Aktif</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[11px]">Açık Erişim: Aktif</span>
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
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-sm ${
                currentView === 'admin'
                  ? 'bg-purple-600 text-white shadow-purple-900/40'
                  : 'bg-[#151124] hover:bg-[#201836] text-slate-200 border border-[#2a2143]'
              }`}
              title="Güvenli Yönetici Paneli"
            >
              <Shield className="w-3.5 h-3.5 text-purple-300" />
              <span className="hidden sm:inline">
                {currentView === 'admin' ? 'Sohbete Dön' : 'Yönetici Paneli'}
              </span>
            </button>
          )}

          {/* User Profile Pill & Settings */}
          {user && (
            <div className="flex items-center gap-2 pl-2 border-l border-[#241c38]">
              <button
                onClick={() => setIsProfileModalOpen(true)}
                className="flex items-center gap-2.5 p-1 rounded-xl hover:bg-[#181329] transition-colors group text-left"
                title="Profilimi Düzenle"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-800 to-purple-400 flex items-center justify-center font-bold text-white text-xs shadow-inner uppercase overflow-hidden shrink-0 ring-1 ring-purple-600/30 group-hover:ring-purple-500">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.displayName} className="w-full h-full object-cover" />
                  ) : (
                    user.displayName.slice(0, 2)
                  )}
                </div>

                <div className="hidden lg:flex flex-col leading-tight">
                  <span className="text-xs font-semibold text-slate-200 flex items-center gap-1 group-hover:text-purple-300 transition-colors">
                    {user.displayName}
                    {user.isAdmin && (
                      <span className="bg-purple-900/60 text-purple-300 text-[9px] px-1.5 py-0.2 rounded font-mono border border-purple-700/50">
                        YÖNETİCİ
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] text-slate-400 truncate max-w-[130px]">{user.email}</span>
                </div>

                <Settings className="w-3.5 h-3.5 text-slate-500 group-hover:text-purple-300 hidden sm:block ml-1 transition-colors" />
              </button>

              <button
                onClick={logout}
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-[#1b152d] rounded-xl transition-colors"
                title="Çıkış Yap"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Profile Edit Modal */}
      <ProfileEditModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />
    </>
  );
};
