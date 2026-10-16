import React, { useState } from 'react';
import { Conversation, User } from '../../types';
import { Search, Plus, MessageCircle, Check, CheckCheck, Clock } from 'lucide-react';

interface SidebarProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenNewChat: () => void;
  currentUser: User | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  selectedId,
  onSelect,
  onOpenNewChat,
  currentUser,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [tab, setTab] = useState<'all' | 'direct' | 'unread'>('all');

  // Filter conversations
  const filtered = conversations.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.lastMessage?.content.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (tab === 'direct') return c.type === 'direct';
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
    <aside className="w-full md:w-80 lg:w-96 border-r border-chat-border bg-slate-900/60 flex flex-col h-full shrink-0 select-none">
      {/* Top Search & Actions */}
      <div className="p-3.5 border-b border-chat-border flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Sohbetlerde ara (Ctrl+K)..."
            className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
          />
        </div>

        <button
          onClick={onOpenNewChat}
          className="p-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl shadow-md shadow-brand-500/20 transition-all shrink-0 focus:outline-none focus:ring-2 focus:ring-brand-400"
          title="Yeni Birebir Sohbet Başlat (Ctrl+N)"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="px-3 py-2 border-b border-slate-800/80 flex items-center gap-1 text-xs">
        <button
          onClick={() => setTab('all')}
          className={`px-3 py-1 rounded-lg font-medium transition-colors ${
            tab === 'all'
              ? 'bg-slate-800 text-brand-300 font-semibold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          Tümü
        </button>
        <button
          onClick={() => setTab('direct')}
          className={`px-3 py-1 rounded-lg font-medium transition-colors ${
            tab === 'direct'
              ? 'bg-slate-800 text-brand-300 font-semibold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          Birebir
        </button>
        <button
          onClick={() => setTab('unread')}
          className={`px-3 py-1 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
            tab === 'unread'
              ? 'bg-slate-800 text-brand-300 font-semibold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <span>Okunmamış</span>
          {conversations.filter((c) => c.unreadCount > 0).length > 0 && (
            <span className="bg-brand-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
              {conversations.filter((c) => c.unreadCount > 0).length}
            </span>
          )}
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40 p-2 space-y-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center text-slate-400">
            <MessageCircle className="w-10 h-10 text-slate-600 mb-2 stroke-[1.5]" />
            <p className="text-sm font-medium text-slate-300">Henüz sohbet yok</p>
            <p className="text-xs text-slate-500 mt-1 max-w-[200px]">
              İlk doğrudan mesajlaşmanızı başlatmak için yukarıdaki + düğmesine tıklayın!
            </p>
          </div>
        ) : (
          filtered.map((conv) => {
            const isSelected = conv.id === selectedId;
            const isSentByMe = conv.lastMessage?.senderId === currentUser?.id;

            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left relative group ${
                  isSelected
                    ? 'bg-slate-800/95 border border-brand-500/40 shadow-sm'
                    : 'hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-brand-700 via-brand-600 to-sky-400 flex items-center justify-center font-bold text-white text-base shadow-inner uppercase overflow-hidden">
                    {conv.peer?.avatarUrl ? (
                      <img src={conv.peer.avatarUrl} alt={conv.name} className="w-full h-full object-cover" />
                    ) : (
                      conv.name.slice(0, 2)
                    )}
                  </div>
                  {/* Subtle Online Badge */}
                  <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-slate-900" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-slate-100 truncate group-hover:text-brand-300 transition-colors">
                      {conv.name}
                    </span>
                    <span className="text-[11px] text-slate-400 shrink-0 font-mono">
                      {formatTimestamp(conv.lastMessage?.createdAt || conv.updatedAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 min-w-0">
                      {isSentByMe && conv.lastMessage && (
                        <span className="text-slate-400 shrink-0">
                          {conv.lastMessage.status === 'read' ? (
                            <CheckCheck className="w-3.5 h-3.5 text-sky-400" />
                          ) : conv.lastMessage.status === 'sent' || conv.lastMessage.status === 'delivered' ? (
                            <Check className="w-3.5 h-3.5 text-slate-400" />
                          ) : (
                            <Clock className="w-3 h-3 text-slate-500" />
                          )}
                        </span>
                      )}
                      <p className="text-xs text-slate-400 truncate leading-relaxed">
                        {conv.lastMessage ? conv.lastMessage.content : 'Henüz mesaj yok'}
                      </p>
                    </div>

                    {conv.unreadCount > 0 && (
                      <span className="bg-brand-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded-full shrink-0 shadow-sm shadow-brand-500/40">
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
