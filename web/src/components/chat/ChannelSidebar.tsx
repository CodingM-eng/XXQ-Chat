import React, { useState } from 'react';
import { Conversation, Server, User } from '../../types';
import {
  Search,
  Plus,
  MessageCircle,
  Users,
  Mail,
  Hash,
  Megaphone,
  ChevronDown,
  Settings,
  Share2,
  Mic,
  MicOff,
  Headphones,
  Check,
  CheckCheck,
  Clock,
  Sparkles,
} from 'lucide-react';

interface ChannelSidebarProps {
  activeServerId: string | null;
  activeServer?: Server | null;
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenNewChat: () => void;
  onOpenNewChannel?: () => void;
  onOpenServerInvite?: () => void;
  onOpenFriends: () => void;
  onOpenInvitations: () => void;
  pendingFriendRequestsCount?: number;
  pendingInvitationsCount?: number;
  currentUser: User | null;
  onOpenProfile: () => void;
  className?: string;
}

export const ChannelSidebar: React.FC<ChannelSidebarProps> = ({
  activeServerId,
  activeServer,
  conversations,
  selectedId,
  onSelect,
  onOpenNewChat,
  onOpenNewChannel,
  onOpenServerInvite,
  onOpenFriends,
  onOpenInvitations,
  pendingFriendRequestsCount = 0,
  pendingInvitationsCount = 0,
  currentUser,
  onOpenProfile,
  className = '',
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [tab, setTab] = useState<'all' | 'direct' | 'group' | 'unread'>('all');
  const [isServerMenuOpen, setIsServerMenuOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);

  const isHome = activeServerId === null;

  // Filter conversations for Home mode (direct messages and standalone groups)
  const homeConversations = conversations.filter((c) => {
    // Only standalone conversations or non-server channels
    if (c.serverId) return false;

    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.lastMessage?.content.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (tab === 'direct') return c.type === 'direct';
    if (tab === 'group') return c.type === 'group';
    if (tab === 'unread') return c.unreadCount > 0;
    return true;
  });

  // Filter channels for Server mode
  const serverChannels = conversations.filter(
    (c) => c.serverId === activeServerId || (activeServer?.channels && activeServer.channels.some((sc) => sc.id === c.id))
  );

  const announcementChannels = serverChannels.filter((c) => c.isAnnouncementOnly);
  const textChannels = serverChannels.filter((c) => !c.isAnnouncementOnly);

  const formatTimestamp = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('tr-TR', { month: 'short', day: 'numeric' });
  };

  const isServerAdmin =
    activeServer &&
    currentUser &&
    (activeServer.ownerId === currentUser.id ||
      currentUser.isAdmin ||
      activeServer.members?.some((m) => m.id === currentUser.id && (m.role === 'admin' || m.role === 'owner')));

  return (
    <aside
      aria-label="Kanal ve Sohbet Gezinme Paneli"
      className={`w-full md:w-60 lg:w-64 bg-[#0c0a14] border-r border-[#1e172e] flex flex-col h-full select-none shrink-0 transition-colors ${className}`}
    >
      {/* ======================================================== */}
      {/* 1. TOP HEADER (HOME SEARCH vs. SERVER BANNER) */}
      {/* ======================================================== */}
      {isHome ? (
        <div className="p-3 border-b border-[#211a33] space-y-2 shrink-0">
          {/* Search Bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Sohbetlerde ara (Ctrl+K)..."
              className="w-full bg-[#130f21] border border-[#241c38] rounded-xl pl-8 pr-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-purple-500 transition-all"
            />
          </div>

          {/* Quick Nav: Friends & Invites */}
          <div className="space-y-1 pt-1">
            <button
              onClick={onOpenFriends}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-[#161129] transition-colors group"
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-purple-400 group-hover:text-purple-300" />
                <span>Arkadaşlar</span>
              </div>
              {pendingFriendRequestsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-pink-600 text-white text-[10px] font-bold animate-pulse">
                  {pendingFriendRequestsCount}
                </span>
              )}
            </button>

            <button
              onClick={onOpenInvitations}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-[#161129] transition-colors group"
            >
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-purple-400 group-hover:text-purple-300" />
                <span>Grup ve Davetler</span>
              </div>
              {pendingInvitationsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-purple-600 text-white text-[10px] font-bold animate-pulse">
                  {pendingInvitationsCount}
                </span>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="relative shrink-0 border-b border-[#211a33]">
          {/* Server Title Banner Button */}
          <button
            onClick={() => setIsServerMenuOpen(!isServerMenuOpen)}
            className="w-full p-3.5 flex items-center justify-between hover:bg-[#161129] transition-colors text-left"
          >
            <div className="min-w-0 pr-2">
              <h2 className="text-sm font-bold text-white truncate">
                {activeServer?.name || 'Topluluk Sunucusu'}
              </h2>
              <span className="text-[10px] text-purple-400 font-medium capitalize">
                {activeServer?.purpose === 'gaming'
                  ? '🎮 Oyun Topluluğu'
                  : activeServer?.purpose === 'chat'
                  ? '💬 Sohbet ve Muhabbet'
                  : activeServer?.purpose === 'business'
                  ? '💼 İş ve Proje'
                  : '📢 Duyuru ve Topluluk'}
              </span>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${
                isServerMenuOpen ? 'rotate-180 text-purple-300' : ''
              }`}
            />
          </button>

          {/* Server Options Dropdown */}
          {isServerMenuOpen && (
            <div className="absolute top-full left-2 right-2 mt-1 bg-[#130f21] border border-[#2b2144] rounded-2xl shadow-2xl p-1.5 space-y-1 z-40 animate-fade-in backdrop-blur-md">
              {onOpenServerInvite && (
                <button
                  onClick={() => {
                    setIsServerMenuOpen(false);
                    onOpenServerInvite();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-purple-300 hover:text-white hover:bg-purple-950/60 transition-colors font-medium text-left"
                >
                  <Share2 className="w-3.5 h-3.5 text-purple-400" />
                  <span>Davet Bağlantısı Oluştur</span>
                </button>
              )}

              {isServerAdmin && onOpenNewChannel && (
                <button
                  onClick={() => {
                    setIsServerMenuOpen(false);
                    onOpenNewChannel();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-200 hover:text-white hover:bg-[#1e1733] transition-colors font-medium text-left"
                >
                  <Plus className="w-3.5 h-3.5 text-purple-400" />
                  <span>Yeni Kanal Ekle</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. MAIN LIST (CONVERSATIONS OR CHANNELS) */}
      {/* ======================================================== */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
        {isHome ? (
          <>
            {/* Section Header */}
            <div className="px-2 pt-2 pb-1 flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <span>Direkt Mesajlar & Gruplar</span>
              <button
                onClick={onOpenNewChat}
                className="p-1 hover:text-white text-slate-400 hover:bg-[#1c162e] rounded-lg transition-colors"
                title="Yeni Sohbet Başlat"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 px-1 py-1 text-[11px] overflow-x-auto">
              <button
                onClick={() => setTab('all')}
                className={`px-2 py-0.5 rounded-lg transition-colors ${
                  tab === 'all'
                    ? 'bg-[#1b152d] text-purple-300 font-semibold border border-purple-800/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Tümü
              </button>
              <button
                onClick={() => setTab('direct')}
                className={`px-2 py-0.5 rounded-lg transition-colors ${
                  tab === 'direct'
                    ? 'bg-[#1b152d] text-purple-300 font-semibold border border-purple-800/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Birebir
              </button>
              <button
                onClick={() => setTab('group')}
                className={`px-2 py-0.5 rounded-lg transition-colors ${
                  tab === 'group'
                    ? 'bg-[#1b152d] text-purple-300 font-semibold border border-purple-800/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Gruplar
              </button>
              <button
                onClick={() => setTab('unread')}
                className={`px-2 py-0.5 rounded-lg transition-colors flex items-center gap-1 ${
                  tab === 'unread'
                    ? 'bg-[#1b152d] text-purple-300 font-semibold border border-purple-800/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Okunmamış</span>
              </button>
            </div>

            {/* Conversation rows */}
            {homeConversations.length === 0 ? (
              <div className="py-12 px-2 text-center text-slate-500 text-xs">
                <MessageCircle className="w-8 h-8 mx-auto mb-2 text-slate-600 stroke-[1.5]" />
                <p>Henüz sohbet yok</p>
                <button
                  onClick={onOpenNewChat}
                  className="mt-2 text-purple-400 hover:text-purple-300 text-xs font-semibold underline"
                >
                  İlk sohbeti başlat
                </button>
              </div>
            ) : (
              homeConversations.map((conv) => {
                const isSelected = conv.id === selectedId;
                const isSentByMe = conv.lastMessage?.senderId === currentUser?.id;
                const isGroup = conv.type === 'group';

                return (
                  <button
                    key={conv.id}
                    onClick={() => onSelect(conv.id)}
                    className={`w-full flex items-center gap-2.5 p-2 rounded-2xl transition-all text-left relative group ${
                      isSelected
                        ? 'bg-[#1b152d] border border-purple-500/50 shadow-md shadow-purple-950/40'
                        : 'hover:bg-[#140f21] border border-transparent'
                    }`}
                  >
                    {/* Avatar with Presence Indicator */}
                    <div className="relative shrink-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-xs shadow-inner uppercase overflow-hidden ${
                          isGroup
                            ? 'bg-gradient-to-tr from-purple-800 to-indigo-600'
                            : 'bg-gradient-to-tr from-purple-900 via-purple-700 to-sky-500'
                        }`}
                      >
                        {isGroup ? (
                          conv.avatarUrl ? (
                            <img src={conv.avatarUrl} alt={conv.name} className="w-full h-full object-cover" />
                          ) : (
                            <Users className="w-4 h-4 text-purple-200" />
                          )
                        ) : conv.peer?.avatarUrl ? (
                          <img src={conv.peer.avatarUrl} alt={conv.name} className="w-full h-full object-cover" />
                        ) : (
                          conv.name.slice(0, 2).toUpperCase()
                        )}
                      </div>
                      {!isGroup && (
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#0c0a14]" />
                      )}
                    </div>

                    {/* Content Preview */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                          {conv.name}
                        </span>
                        {conv.lastMessage && (
                          <span className="text-[10px] text-slate-500 shrink-0 ml-1">
                            {formatTimestamp(conv.lastMessage.createdAt)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <p className="truncate pr-1">
                          {isSentByMe && <span className="text-purple-400 font-medium">Sen: </span>}
                          {conv.lastMessage ? conv.lastMessage.content : 'Henüz mesaj yok'}
                        </p>

                        {conv.unreadCount > 0 && (
                          <span className="bg-purple-600 text-white font-extrabold text-[10px] min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center shrink-0">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </>
        ) : (
          /* ==================== SERVER CHANNELS ==================== */
          <>
            {/* Announcement Channels Category */}
            {announcementChannels.length > 0 && (
              <div className="mb-3">
                <div className="px-2 py-1 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <span>Duyuru & Kurallar</span>
                </div>
                <div className="space-y-0.5">
                  {announcementChannels.map((channel) => {
                    const isSelected = channel.id === selectedId;
                    return (
                      <button
                        key={channel.id}
                        onClick={() => onSelect(channel.id)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all group ${
                          isSelected
                            ? 'bg-[#1b152d] text-white font-bold border border-purple-500/40 shadow-sm'
                            : 'text-slate-300 hover:text-white hover:bg-[#151024]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Megaphone className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-amber-300' : 'text-amber-400'}`} />
                          <span className="truncate">{channel.name}</span>
                        </div>
                        {channel.unreadCount > 0 && (
                          <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Text Channels Category */}
            <div>
              <div className="px-2 py-1 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Metin Kanalları</span>
                {isServerAdmin && onOpenNewChannel && (
                  <button
                    onClick={onOpenNewChannel}
                    className="p-1 hover:text-white text-slate-400 hover:bg-[#1c162e] rounded-lg transition-colors"
                    title="Kanal Ekle"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="space-y-0.5">
                {textChannels.map((channel) => {
                  const isSelected = channel.id === selectedId;
                  return (
                    <button
                      key={channel.id}
                      onClick={() => onSelect(channel.id)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all group ${
                        isSelected
                          ? 'bg-[#1b152d] text-white font-bold border border-purple-500/40 shadow-sm'
                          : 'text-slate-300 hover:text-white hover:bg-[#151024]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Hash className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-purple-300' : 'text-purple-400'}`} />
                        <span className="truncate">{channel.name}</span>
                      </div>
                      {channel.unreadCount > 0 && (
                        <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ======================================================== */}
      {/* 3. USER STATUS BAR (DISCORD-STYLE BOTTOM DOCK) */}
      {/* ======================================================== */}
      {currentUser && (
        <div className="p-2 border-t border-[#1f1830] bg-[#090710] flex items-center justify-between shrink-0">
          {/* User info */}
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-2 p-1 rounded-xl hover:bg-[#171226] transition-colors min-w-0 text-left group"
            title="Profilini Düzenle"
          >
            <div className="relative shrink-0">
              <div className="w-8 h-8 rounded-xl bg-purple-900 flex items-center justify-center font-bold text-white text-xs overflow-hidden border border-purple-500/40">
                {currentUser.avatarUrl ? (
                  <img src={currentUser.avatarUrl} alt={currentUser.displayName} className="w-full h-full object-cover" />
                ) : (
                  currentUser.displayName.slice(0, 2).toUpperCase()
                )}
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-[#090710]" />
            </div>

            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-200 group-hover:text-purple-300 truncate">
                {currentUser.displayName}
              </p>
              <p className="text-[10px] text-slate-500 truncate">Çevrim içi</p>
            </div>
          </button>

          {/* Quick Audio Controls & Settings */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`p-1.5 rounded-lg transition-colors ${
                isMuted ? 'text-red-400 bg-red-950/40 hover:bg-red-900/50' : 'text-slate-400 hover:text-white hover:bg-[#1a142c]'
              }`}
              title={isMuted ? 'Mikrofonun Sesini Aç' : 'Mikrofonu Sustur'}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setIsDeafened(!isDeafened)}
              className={`p-1.5 rounded-lg transition-colors ${
                isDeafened ? 'text-red-400 bg-red-950/40 hover:bg-red-900/50' : 'text-slate-400 hover:text-white hover:bg-[#1a142c]'
              }`}
              title={isDeafened ? 'Sağırlaştırılmış (Kapat)' : 'Kulaklığı Kapat'}
            >
              <Headphones className="w-4 h-4" />
            </button>

            <button
              onClick={onOpenProfile}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-[#1a142c] transition-colors"
              title="Kullanıcı Ayarları"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};
