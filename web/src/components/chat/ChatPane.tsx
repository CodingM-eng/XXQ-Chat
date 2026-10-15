import React, { useState, useEffect, useRef } from 'react';
import { Conversation, Message, User } from '../../types';
import { getSocket } from '../../services/socket';
import { Send, ArrowLeft, Check, CheckCheck, Clock, Smile, Paperclip } from 'lucide-react';

interface ChatPaneProps {
  conversation: Conversation;
  messages: Message[];
  currentUser: User | null;
  onSendMessage: (content: string, clientMessageId?: string) => Promise<void>;
  onBackMobile: () => void;
  typingUser: string | null;
}

export const ChatPane: React.FC<ChatPaneProps> = ({
  conversation,
  messages,
  currentUser,
  onSendMessage,
  onBackMobile,
  typingUser,
}) => {
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUser]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);

    const socket = getSocket();
    if (socket && conversation) {
      socket.emit('typing:start', { conversationId: conversation.id });

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing:stop', { conversationId: conversation.id });
      }, 1500);
    }
  };

  const handleSend = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || sending) return;

    try {
      setSending(true);
      setInputText('');

      const clientMsgId = 'client_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
      await onSendMessage(trimmed, clientMsgId);

      const socket = getSocket();
      if (socket) {
        socket.emit('typing:stop', { conversationId: conversation.id });
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatMessageTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <main className="flex-1 flex flex-col h-full bg-chat-bg relative overflow-hidden">
      {/* Chat Header */}
      <div className="h-16 border-b border-chat-border bg-slate-900/80 backdrop-blur-md px-4 flex items-center justify-between shrink-0 select-none z-10">
        <div className="flex items-center gap-3">
          {/* Mobile Back Button */}
          <button
            onClick={onBackMobile}
            className="md:hidden p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Peer Avatar */}
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-brand-600 to-sky-400 flex items-center justify-center font-bold text-white text-sm shadow-inner uppercase overflow-hidden">
              {conversation.peer?.avatarUrl ? (
                <img src={conversation.peer.avatarUrl} alt={conversation.name} className="w-full h-full object-cover" />
              ) : (
                conversation.name.slice(0, 2)
              )}
            </div>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-900" />
          </div>

          <div className="flex flex-col">
            <h2 className="font-bold text-slate-100 text-sm leading-tight">{conversation.name}</h2>
            <span className="text-[11px] text-emerald-400 font-medium leading-none mt-0.5">
              {typingUser ? `${typingUser} is typing...` : 'online'}
            </span>
          </div>
        </div>
      </div>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, idx) => {
          const isMe = msg.senderId === currentUser?.id;

          return (
            <div
              key={msg.id || idx}
              className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-fade-in`}
            >
              <div
                className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 shadow-md relative break-words select-text ${
                  isMe
                    ? 'bg-brand-600 text-white rounded-tr-sm'
                    : 'bg-chat-card text-slate-100 border border-slate-700/60 rounded-tl-sm'
                }`}
              >
                {!isMe && (
                  <span className="block text-[11px] font-bold text-sky-400 mb-0.5">
                    {msg.senderName}
                  </span>
                )}

                {/* Safe text rendering */}
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>

                <div
                  className={`flex items-center justify-end gap-1 mt-1 text-[10px] font-mono select-none ${
                    isMe ? 'text-blue-200' : 'text-slate-400'
                  }`}
                >
                  <span>{formatMessageTime(msg.createdAt)}</span>
                  {isMe && (
                    <span>
                      {msg.status === 'read' ? (
                        <CheckCheck className="w-3.5 h-3.5 text-sky-300" />
                      ) : msg.status === 'sent' || msg.status === 'delivered' ? (
                        <Check className="w-3.5 h-3.5 text-blue-200" />
                      ) : (
                        <Clock className="w-3 h-3 text-blue-300" />
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Real-time Typing indicator wave */}
        {typingUser && (
          <div className="flex items-center gap-2 p-2 bg-slate-800/60 border border-slate-700/40 rounded-2xl w-fit text-xs text-slate-300">
            <span className="font-semibold text-brand-400">{typingUser}</span>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce [animation-delay:0.4s]" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input Bar */}
      <div className="p-3 border-t border-chat-border bg-slate-900/90 backdrop-blur-md shrink-0">
        <div className="max-w-4xl mx-auto flex items-end gap-2 bg-slate-800/80 border border-slate-700/80 rounded-2xl p-2 focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-transparent transition-all">
          <button
            type="button"
            className="p-2 text-slate-400 hover:text-slate-200 transition-colors rounded-xl hover:bg-slate-700/50"
            title="Attach Media"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          <textarea
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Write a message... (Enter to send, Shift+Enter for newline)"
            rows={1}
            className="flex-1 bg-transparent border-0 text-slate-100 placeholder:text-slate-500 text-sm focus:outline-none resize-none max-h-32 py-1.5 px-1 leading-relaxed"
          />

          <button
            type="button"
            className="p-2 text-slate-400 hover:text-slate-200 transition-colors rounded-xl hover:bg-slate-700/50"
            title="Emoji"
          >
            <Smile className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={handleSend}
            disabled={!inputText.trim() || sending}
            className={`p-2.5 rounded-xl transition-all shadow-md shrink-0 ${
              inputText.trim() && !sending
                ? 'bg-brand-600 hover:bg-brand-500 text-white shadow-brand-500/20 active:scale-95'
                : 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
            }`}
            title="Send Message"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </main>
  );
};
