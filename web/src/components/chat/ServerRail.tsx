import React from 'react';
import { Server, User } from '../../types';
import { BrandLogo } from '../common/BrandLogo';
import {
  Plus,
  Compass,
  Moon,
  Sun,
  Shield,
  MessageSquare,
  Users,
} from 'lucide-react';

interface ServerRailProps {
  servers: Server[];
  activeServerId: string | null; // null represents "Home" (DMs & Groups)
  onSelectHome: () => void;
  onSelectServer: (serverId: string) => void;
  onOpenNewServer: () => void;
  unreadHomeCount?: number;
  serverUnreadCounts?: Record<string, number>;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  isAdmin?: boolean;
  onOpenAdmin?: () => void;
  currentUser?: User | null;
  onOpenProfile?: () => void;
  className?: string;
}

export const ServerRail: React.FC<ServerRailProps> = ({
  servers,
  activeServerId,
  onSelectHome,
  onSelectServer,
  onOpenNewServer,
  unreadHomeCount = 0,
  serverUnreadCounts = {},
  theme = 'dark',
  onToggleTheme,
  isAdmin = false,
  onOpenAdmin,
  currentUser,
  onOpenProfile,
  className = '',
}) => {
  const isHomeActive = activeServerId === null;

  return (
    <nav
      aria-label="Sunucu Gezinme Çubuğu"
      className={`w-[72px] bg-[#07050d] border-r border-[#1e172e] flex flex-col items-center py-3 select-none h-full shrink-0 z-30 transition-colors ${className}`}
    >
      {/* 1. Home / DM Button (XXQ Icon) */}
      <div className="relative group w-full flex items-center justify-center">
        {/* Active Pill Indicator */}
        <span
          className={`absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200 ${
            isHomeActive
              ? 'h-10 opacity-100'
              : 'h-2 opacity-0 group-hover:opacity-100 group-hover:h-5'
          }`}
        />

        <button
          onClick={onSelectHome}
          className={`relative w-12 h-12 flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-400 ${
            isHomeActive
              ? 'rounded-2xl bg-purple-600 text-white shadow-lg shadow-purple-900/50'
              : 'rounded-[24px] hover:rounded-2xl bg-[#140f24] text-purple-300 hover:bg-purple-600 hover:text-white'
          }`}
          title="Ana Sayfa (Direkt Mesajlar ve Arkadaşlar)"
        >
          <BrandLogo size={28} showText={false} />

          {/* Unread Badge */}
          {unreadHomeCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-pink-600 text-white font-extrabold text-[10px] min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center border-2 border-[#07050d] shadow-sm animate-pulse">
              {unreadHomeCount > 99 ? '99+' : unreadHomeCount}
            </span>
          )}
        </button>
      </div>

      {/* Separator */}
      <div className="h-[2px] w-8 bg-[#211a33] rounded-full my-2.5 shrink-0" />

      {/* 2. Scrollable Server List */}
      <div className="flex-1 w-full overflow-y-auto overflow-x-hidden space-y-2 py-1 flex flex-col items-center custom-scrollbar">
        {servers.map((server) => {
          const isActive = activeServerId === server.id;
          const unreadCount = serverUnreadCounts[server.id] || 0;
          const initials = server.name
            .split(' ')
            .slice(0, 2)
            .map((w) => w[0])
            .join('')
            .toUpperCase() || server.name.slice(0, 2).toUpperCase();

          return (
            <div key={server.id} className="relative group w-full flex items-center justify-center">
              {/* Active Pill Indicator on left edge */}
              <span
                className={`absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200 ${
                  isActive
                    ? 'h-10 opacity-100'
                    : 'h-2 opacity-0 group-hover:opacity-100 group-hover:h-5'
                }`}
              />

              <button
                onClick={() => onSelectServer(server.id)}
                className={`relative w-12 h-12 flex items-center justify-center font-bold text-sm tracking-wide transition-all duration-200 overflow-hidden focus:outline-none focus:ring-2 focus:ring-purple-400 ${
                  isActive
                    ? 'rounded-2xl bg-gradient-to-tr from-purple-700 to-indigo-600 text-white shadow-lg shadow-purple-950/60 border border-purple-400/40'
                    : 'rounded-[24px] hover:rounded-2xl bg-[#140f24] hover:bg-gradient-to-tr hover:from-purple-800 hover:to-indigo-700 text-slate-200 hover:text-white border border-[#22183b]'
                }`}
                title={`${server.name} (${server.purpose})`}
              >
                {server.avatarUrl ? (
                  <img src={server.avatarUrl} alt={server.name} className="w-full h-full object-cover" />
                ) : (
                  <span>{initials}</span>
                )}

                {/* Server Unread Badge */}
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-purple-600 text-white font-extrabold text-[10px] min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center border-2 border-[#07050d] shadow-sm">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            </div>
          );
        })}

        {/* 3. Add New Server (+) */}
        <div className="relative group w-full flex items-center justify-center pt-1">
          <span className="absolute left-0 w-1 bg-emerald-400 rounded-r-full h-2 opacity-0 group-hover:opacity-100 group-hover:h-5 transition-all duration-200" />
          <button
            onClick={onOpenNewServer}
            className="w-12 h-12 rounded-[24px] hover:rounded-2xl bg-[#120e21] hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-900/40 hover:border-emerald-500 flex items-center justify-center transition-all duration-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            title="Yeni Topluluk / Sunucu Oluştur"
          >
            <Plus className="w-5 h-5 transition-transform group-hover:rotate-90" />
          </button>
        </div>
      </div>

      {/* Separator */}
      <div className="h-[2px] w-8 bg-[#211a33] rounded-full my-2 shrink-0" />

      {/* 4. Bottom Controls */}
      <div className="space-y-2 flex flex-col items-center shrink-0">
        {/* Admin Panel Button */}
        {isAdmin && onOpenAdmin && (
          <button
            onClick={onOpenAdmin}
            className="w-10 h-10 rounded-xl bg-[#171129] hover:bg-amber-600/30 text-amber-400 border border-amber-800/40 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400"
            title="Platform Yönetim Paneli"
          >
            <Shield className="w-4 h-4" />
          </button>
        )}

        {/* Theme Toggle Button */}
        {onToggleTheme && (
          <button
            onClick={onToggleTheme}
            className="w-10 h-10 rounded-xl bg-[#171129] hover:bg-[#251b42] text-slate-300 hover:text-white border border-[#261d40] flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-purple-400"
            title={theme === 'dark' ? 'Açık Temaya Geç' : 'Koyu Temaya Geç'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-purple-400" />}
          </button>
        )}

        {/* User Profile Mini Avatar */}
        {currentUser && onOpenProfile && (
          <button
            onClick={onOpenProfile}
            className="relative w-10 h-10 rounded-xl overflow-hidden border-2 border-purple-500/50 hover:border-purple-400 transition-all focus:outline-none focus:ring-2 focus:ring-purple-400 shadow-md group"
            title={`${currentUser.displayName} (Profil Ayarları)`}
          >
            {currentUser.avatarUrl ? (
              <img src={currentUser.avatarUrl} alt={currentUser.displayName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-purple-900 flex items-center justify-center font-bold text-white text-xs">
                {currentUser.displayName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-[#07050d]" />
          </button>
        )}
      </div>
    </nav>
  );
};
