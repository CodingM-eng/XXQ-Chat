import React, { useState } from 'react';
import { Conversation, Message } from '../../types';
import { api } from '../../services/api';
import { Forward, X, Check, Search, Users, User, Loader2 } from 'lucide-react';

interface ForwardModalProps {
  message: Message;
  conversations: Conversation[];
  onClose: () => void;
  onForwardSuccess?: (targetConvId: string) => void;
}

export const ForwardModal: React.FC<ForwardModalProps> = ({
  message,
  conversations,
  onClose,
  onForwardSuccess,
}) => {
  const [search, setSearch] = useState('');
  const [forwardingIds, setForwardingIds] = useState<Set<string>>(new Set());
  const [forwardedIds, setForwardedIds] = useState<Set<string>>(new Set());

  const filtered = conversations.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleForward = async (targetConv: Conversation) => {
    if (forwardedIds.has(targetConv.id) || forwardingIds.has(targetConv.id)) return;

    try {
      setForwardingIds((prev) => new Set(prev).add(targetConv.id));

      await api.sendMessage(
        targetConv.id,
        message.content,
        undefined,
        undefined,
        { senderName: message.senderName }
      );

      setForwardedIds((prev) => new Set(prev).add(targetConv.id));
      if (onForwardSuccess) {
        onForwardSuccess(targetConv.id);
      }
    } catch (err) {
      console.error('Failed to forward message:', err);
    } finally {
      setForwardingIds((prev) => {
        const next = new Set(prev);
        next.delete(targetConv.id);
        return next;
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[80vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <Forward className="w-4 h-4 text-purple-400" />
            <span>Mesajı İlet</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message Preview */}
        <div className="px-5 py-3 bg-slate-950/60 border-b border-slate-800/80">
          <span className="text-[11px] text-purple-400 font-semibold block mb-0.5">
            İletilecek Mesaj ({message.senderName}):
          </span>
          <p className="text-xs text-slate-300 italic line-clamp-2 bg-slate-900/80 p-2 rounded-xl border border-slate-800">
            "{message.content}"
          </p>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-slate-800">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sohbet veya kişi ara..."
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Sohbet bulunamadı.
            </div>
          ) : (
            filtered.map((conv) => {
              const isSending = forwardingIds.has(conv.id);
              const isSent = forwardedIds.has(conv.id);

              return (
                <div
                  key={conv.id}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-purple-950/50 border border-purple-800/40 flex items-center justify-center text-purple-300 flex-shrink-0">
                      {conv.type === 'group' ? (
                        <Users className="w-4 h-4" />
                      ) : (
                        <User className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-200 truncate">{conv.name}</p>
                      <span className="text-[10px] text-slate-500">
                        {conv.type === 'group' ? 'Grup Sohbeti' : 'Birebir Sohbet'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleForward(conv)}
                    disabled={isSending || isSent}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      isSent
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60 cursor-default'
                        : 'bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/20'
                    }`}
                  >
                    {isSending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isSent ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>İletildi</span>
                      </>
                    ) : (
                      <>
                        <Forward className="w-3.5 h-3.5" />
                        <span>İlet</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
