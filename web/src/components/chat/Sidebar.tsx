import React, { useState } from 'react';
import { Conversation, User } from '../../types';
import {
  Search,
  Plus,
  MessageCircle,
  Check,
  CheckCheck,
  Clock,
  Users,
  User as UserIcon,
  Layers,
  Hash,
  Megaphone,
} from 'lucide-react';
import { SafeAvatar } from '../common/SafeAvatar';

interface SidebarProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenNewChat: () => void;
  onOpenNewServer?: () => void;
  currentUser: User | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  selectedId,
  onSelect,
  onOpenNewChat,
  onOpenNewServer,
  currentUser,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [tab, setTab] = useState<'all' | 'direct' | 'group' | 'channel' | 'unread'>('all');

  // Filter conversations
  const filtered = conversations.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.lastMessage?.content.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (tab === 'direct') return c.type === 'direct';
    if (tab === 'group') return c.type === 'group';
    if (tab === 'channel') return c.type === 'channel';
    if (tab === 'unread') return c.unreadCount > 0;
    return true;
  });

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

  return (
    <aside className="w-full md:w-80 lg:w-96 border-r border-[#241c38] bg-[#0c0a14] flex flex-col h-full shrink-0 select-none">
      {/* Top Search & Actions */}
      <div className="p-3.5 border-b border-[#241c38] flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Sohbetlerde ara (Ctrl+K)..."
            className="w-full bg-[#141021] border border-[#261e3d] rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-purple-500 transition-all"
          />
        </div>

        {onOpenNewServer && (
          <button
            onClick={onOpenNewServer}
            className="p-2 bg-[#171226] hover:bg-[#231b3b] text-purple-300 hover:text-white border border-[#2b2144] rounded-xl shadow-md transition-all shrink-0 focus:outline-none focus:ring-2 focus:ring-purple-400"
            title="Yeni Discord-Tarzı Sunucu Oluştur"
          >
            <Layers className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={onOpenNewChat}
          className="p-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl shadow-md shadow-purple-950/50 transition-all shrink-0 focus:outline-none focus:ring-2 focus:ring-purple-400"
          title="Yeni Sohbet veya Grup Başlat (Ctrl+N)"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="px-3 py-2 border-b border-[#241c38] flex items-center gap-1 text-xs overflow-x-auto">
        <button
          onClick={() => setTab('all')}
          className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
            tab === 'all'
              ? 'bg-[#1b152d] text-purple-300 font-semibold border border-purple-800/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#151124]'
          }`}
        >
          Tümü
        </button>
        <button
          onClick={() => setTab('direct')}
          className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
            tab === 'direct'
              ? 'bg-[#1b152d] text-purple-300 font-semibold border border-purple-800/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#151124]'
          }`}
        >
          Birebir
        </button>
        <button
          onClick={() => setTab('group')}
          className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
            tab === 'group'
              ? 'bg-[#1b152d] text-purple-300 font-semibold border border-purple-800/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#151124]'
          }`}
        >
          Gruplar
        </button>
        <button
          onClick={() => setTab('channel')}
          className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
            tab === 'channel'
              ? 'bg-[#1b152d] text-purple-300 font-semibold border border-purple-800/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#151124]'
          }`}
        >
          Kanallar
        </button>
        <button
          onClick={() => setTab('unread')}
          className={`px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
            tab === 'unread'
              ? 'bg-[#1b152d] text-purple-300 font-semibold border border-purple-800/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#151124]'
          }`}
        >
          <span>Okunmamış</span>
          {conversations.filter((c) => c.unreadCount > 0).length > 0 && (
            <span className="bg-purple-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
              {conversations.filter((c) => c.unreadCount > 0).length}
            </span>
          )}
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#1e172e]/50 p-2 space-y-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center text-slate-400">
            <MessageCircle className="w-10 h-10 text-slate-600 mb-2 stroke-[1.5]" />
            <p className="text-sm font-medium text-slate-300">Henüz sohbet yok</p>
            <p className="text-xs text-slate-500 mt-1 max-w-[200px]">
              Yeni bir mesajlaşma veya grup başlatmak için yukarıdaki + düğmesine tıklayın!
            </p>
          </div>
        ) : (
          filtered.map((conv) => {
            const isSelected = conv.id === selectedId;
            const isSentByMe = conv.lastMessage?.senderId === currentUser?.id;
            const isGroup = conv.type === 'group';
            const isChannel = conv.type === 'channel';

            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all text-left relative group ${
                  isSelected
                    ? 'bg-[#1b152d] border border-purple-500/50 shadow-lg shadow-purple-950/30'
                    : 'hover:bg-[#141021] border border-transparent'
                }`}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-white text-base shadow-inner uppercase overflow-hidden ${
                      isChannel
                        ? 'bg-gradient-to-tr from-indigo-950 to-purple-900 border border-indigo-700/50'
                        : isGroup
                        ? 'bg-gradient-to-tr from-purple-800 to-indigo-600'
                        : 'bg-gradient-to-tr from-purple-900 via-purple-700 to-sky-500'
                    }`}
                  >
                    {isChannel ? (
                      conv.isAnnouncementOnly ? (
                        <Megaphone className="w-5 h-5 text-amber-300" />
                      ) : (
                        <Hash className="w-5 h-5 text-purple-300" />
                      )
                    ) : (
                      <SafeAvatar
                        src={conv.avatarUrl || conv.peer?.avatarUrl}
                        alt={conv.name}
                        fallbackText={!isGroup ? conv.name.slice(0, 2).toUpperCase() : undefined}
                        fallbackIcon={isGroup ? <Users className="w-5 h-5 text-purple-200" /> : <UserIcon className="w-5 h-5 text-purple-200" />}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>

                  {/* Group / Channel / Online Badge */}
                  {isChannel ? (
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-indigo-700 border-2 border-[#0c0a14] flex items-center justify-center text-[9px] text-white">
                      <Hash className="w-2.5 h-2.5" />
                    </span>
                  ) : isGroup ? (
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-purple-700 border-2 border-[#0c0a14] flex items-center justify-center text-[9px] text-white">
                      <Users className="w-2.5 h-2.5" />
                    </span>
                  ) : (
                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#0c0a14]" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-slate-100 truncate group-hover:text-purple-300 transition-colors flex items-center gap-1.5">
                      {conv.name}
                    </span>
                    <span className="text-[11px] text-slate-500 shrink-0 font-mono">
                      {formatTimestamp(conv.lastMessage?.createdAt || conv.updatedAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 min-w-0">
                      {isSentByMe && conv.lastMessage && (
                        <span className="text-slate-400 shrink-0">
                          {conv.lastMessage.status === 'read' ? (
                            <CheckCheck className="w-3.5 h-3.5 text-purple-400" />
                          ) : conv.lastMessage.status === 'sent' || conv.lastMessage.status === 'delivered' ? (
                            <Check className="w-3.5 h-3.5 text-slate-400" />
                          ) : (
                            <Clock className="w-3 h-3 text-slate-500" />
                          )}
                        </span>
                      )}
                      <p className="text-xs text-slate-400 truncate leading-relaxed">
                        {conv.lastMessage ? (
                          <>
                            {isGroup && conv.lastMessage.senderName && !isSentByMe && (
                              <span className="text-purple-400/90 font-medium mr-1">
                                {conv.lastMessage.senderName}:
                              </span>
                            )}
                            {conv.lastMessage.content}
                          </>
                        ) : (
                          'Henüz mesaj yok'
                        )}
                      </p>
                    </div>

                    {conv.unreadCount > 0 && (
                      <span className="bg-purple-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded-full shrink-0 shadow-sm shadow-purple-600/40">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
};
