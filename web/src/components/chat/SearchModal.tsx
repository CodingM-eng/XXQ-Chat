import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { SearchResults, Conversation } from '../../types';
import { Search, X, MessageSquare, Users, User, ArrowRight, Loader2, Calendar } from 'lucide-react';
import { SafeAvatar } from '../common/SafeAvatar';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectConversation: (conversationId: string) => void;
  onStartDirectChat?: (userEmail: string) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  onSelectConversation,
  onStartDirectChat,
}) => {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<'all' | 'messages' | 'conversations' | 'users'>('all');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults(null);
      setError(null);
      return;
    }
  }, [isOpen]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearching(true);
        setError(null);
        const data = await api.search(trimmed, searchType);
        setResults(data);
      } catch (err: any) {
        setError(err.message || 'Arama yapılırken bir hata oluştu.');
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, searchType]);

  if (!isOpen) return null;

  const totalResultsCount =
    (results?.conversations.length || 0) +
    (results?.users.length || 0) +
    (results?.messages.length || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#120f1e] border border-[#2a2244] w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Search Input Header */}
        <div className="p-4 border-b border-[#241c38] flex items-center gap-3 bg-[#0d0a17]">
          <Search className="w-5 h-5 text-purple-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Mesajlarda, sohbetlerde veya kişilerde ara..."
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          {isSearching && <Loader2 className="w-4 h-4 animate-spin text-purple-400 shrink-0" />}
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-[#1b152d]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="px-2.5 py-1 text-xs font-semibold text-slate-400 hover:text-white rounded-lg hover:bg-[#1b152d]"
          >
            Kapat
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-[#201836] bg-[#0f0d1a] overflow-x-auto">
          {(
            [
              { id: 'all', label: 'Tümü' },
              { id: 'messages', label: 'Mesajlar' },
              { id: 'conversations', label: 'Sohbetler' },
              { id: 'users', label: 'Kişiler' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSearchType(tab.id)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
                searchType === tab.id
                  ? 'bg-purple-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-[#181329]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Results Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-300">
              {error}
            </div>
          )}

          {!query.trim() && (
            <div className="text-center py-12 text-slate-500">
              <Search className="w-10 h-10 mx-auto text-purple-900/50 mb-3" />
              <p className="text-xs font-medium text-slate-400">XXQ Chat üzerinde arama yapın</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Kişi adları, sohbet başlıkları veya mesaj içeriklerini yazarak arayabilirsiniz.
              </p>
            </div>
          )}

          {query.trim() && !isSearching && totalResultsCount === 0 && (
            <div className="text-center py-12 text-slate-500">
              <p className="text-xs font-medium text-slate-400">Sonuç bulunamadı</p>
              <p className="text-[11px] text-slate-500 mt-1">"{query}" terimiyle eşleşen bir kayıt bulunamadı.</p>
            </div>
          )}

          {/* Conversations Section */}
          {results && results.conversations.length > 0 && (searchType === 'all' || searchType === 'conversations') && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-purple-300 mb-2 px-1">
                <Users className="w-3.5 h-3.5" />
                <span>Sohbetler ({results.conversations.length})</span>
              </div>
              <div className="space-y-1.5">
                {results.conversations.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      onSelectConversation(c.id);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-2xl bg-[#0e0c18] hover:bg-[#181329] border border-[#201836] hover:border-purple-600/50 text-left transition-all group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-purple-900/60 flex items-center justify-center font-bold text-white text-xs overflow-hidden shrink-0">
                        <SafeAvatar
                          src={c.avatarUrl}
                          alt={c.name}
                          fallbackText={c.name.slice(0, 2).toUpperCase()}
                          fallbackIcon={c.type === 'group' ? <Users className="w-4 h-4 text-purple-200" /> : <User className="w-4 h-4 text-purple-200" />}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-200 group-hover:text-purple-300 truncate">
                          {c.name}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate">
                          {c.type === 'group' ? 'Grup Sohbeti' : 'Direkt Mesaj'}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-purple-400 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Contacts / Users Section */}
          {results && results.users.length > 0 && (searchType === 'all' || searchType === 'users') && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-purple-300 mb-2 px-1">
                <User className="w-3.5 h-3.5" />
                <span>Kişiler ({results.users.length})</span>
              </div>
              <div className="space-y-1.5">
                {results.users.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between p-2.5 rounded-2xl bg-[#0e0c18] hover:bg-[#181329] border border-[#201836] transition-all group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-800 to-indigo-600 flex items-center justify-center font-bold text-white text-xs overflow-hidden shrink-0">
                        <SafeAvatar
                          src={u.avatarUrl}
                          alt={u.displayName}
                          fallbackText={u.displayName.slice(0, 2).toUpperCase()}
                          fallbackIcon={<User className="w-4 h-4 text-purple-200" />}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-200 group-hover:text-purple-300 truncate">
                          {u.displayName}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate">{u.email}</p>
                      </div>
                    </div>

                    {onStartDirectChat && (
                      <button
                        onClick={() => {
                          onStartDirectChat(u.email);
                          onClose();
                        }}
                        className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-[11px] font-semibold transition-colors"
                      >
                        Mesaj At
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Messages Section */}
          {results && results.messages.length > 0 && (searchType === 'all' || searchType === 'messages') && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-purple-300 mb-2 px-1">
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Mesajlar ({results.messages.length})</span>
              </div>
              <div className="space-y-1.5">
                {results.messages.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      onSelectConversation(m.conversationId);
                      onClose();
                    }}
                    className="w-full p-3 rounded-2xl bg-[#0e0c18] hover:bg-[#181329] border border-[#201836] hover:border-purple-600/50 text-left transition-all group space-y-1"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-purple-400 truncate max-w-[200px]">
                        {m.conversationName || 'Sohbet'}
                      </span>
                      <span className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(m.createdAt).toLocaleDateString('tr-TR', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-300 shrink-0">{m.senderName}:</span>
                      <p className="text-xs text-slate-400 group-hover:text-slate-200 truncate">{m.content}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
