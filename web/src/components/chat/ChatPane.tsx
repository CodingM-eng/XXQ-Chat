import React, { useState, useEffect, useRef } from 'react';
import { Conversation, Message, User, Attachment } from '../../types';
import { api } from '../../services/api';
import { getSocket } from '../../services/socket';
import { EmojiPicker, QuickReactionsBar } from './EmojiPicker';
import { ForwardModal } from './ForwardModal';
import {
  Send,
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  Smile,
  Paperclip,
  Reply,
  Forward,
  X,
  Users,
  Shield,
  Trash2,
  FileText,
  Download,
  Loader2,
  Image as ImageIcon,
  Monitor,
  Camera,
  Phone,
  Video,
  ChevronDown,
  Megaphone,
  Hash,
  Settings,
} from 'lucide-react';
import { ScreenShareModal } from './ScreenShareModal';
import { GroupAvatarModal } from './GroupAvatarModal';
import { GroupSettingsModal } from './GroupSettingsModal';

interface ChatPaneProps {
  conversation: Conversation;
  messages: Message[];
  currentUser: User | null;
  conversations: Conversation[];
  onSendMessage: (
    content: string,
    clientMessageId?: string,
    replyToMessageId?: string,
    forwardedFrom?: { senderName: string },
    attachments?: Attachment[]
  ) => Promise<void>;
  onDeleteMessage?: (messageId: string) => Promise<void>;
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>;
  onBackMobile: () => void;
  typingUser: string | null;
  onRefreshConversations?: () => void;
  onStartCall?: (mode: 'audio' | 'video' | 'screen') => void;
}

export const ChatPane: React.FC<ChatPaneProps> = ({
  conversation,
  messages,
  currentUser,
  conversations,
  onSendMessage,
  onDeleteMessage,
  onToggleReaction,
  onBackMobile,
  typingUser,
  onRefreshConversations,
  onStartCall,
}) => {
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [forwardTarget, setForwardTarget] = useState<Message | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [showGroupMembersModal, setShowGroupMembersModal] = useState(false);
  const [isScreenShareOpen, setIsScreenShareOpen] = useState(false);
  const [isGroupAvatarOpen, setIsGroupAvatarOpen] = useState(false);
  const [isGroupSettingsOpen, setIsGroupSettingsOpen] = useState(false);
  const [isCallMenuOpen, setIsCallMenuOpen] = useState(false);
  const callMenuRef = useRef<HTMLDivElement>(null);

  // File upload state
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUser]);

  // Close call dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (callMenuRef.current && !callMenuRef.current.contains(e.target as Node)) {
        setIsCallMenuOpen(false);
      }
    };
    if (isCallMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCallMenuOpen]);

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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    // 25 MB max size check
    if (file.size > 25 * 1024 * 1024) {
      setUploadError('Dosya boyutu 25 MB limitini aşamaz.');
      return;
    }

    try {
      setIsUploading(true);
      setUploadError(null);
      const res = await api.uploadAttachment(conversation.id, file);
      setPendingAttachments((prev) => [...prev, res.attachment]);
    } catch (err: any) {
      setUploadError(err.message || 'Dosya yükleme başarısız oldu.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSend = async () => {
    const trimmed = inputText.trim();
    const hasAttachments = pendingAttachments.length > 0;
    if ((!trimmed && !hasAttachments) || sending) return;

    try {
      setSending(true);
      setInputText('');
      const attachmentsToSend = [...pendingAttachments];
      setPendingAttachments([]);

      const clientMsgId = 'client_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
      const replyId = replyTarget?.id;
      setReplyTarget(null);

      await onSendMessage(trimmed, clientMsgId, replyId, undefined, attachmentsToSend);

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
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const isGroup = conversation.type === 'group';
  const isChannel = conversation.type === 'channel';
  const currentParticipant = conversation.participants?.find((p) => p.id === currentUser?.id);
  const isOwnerOrAdmin =
    currentParticipant?.role === 'owner' ||
    currentParticipant?.role === 'admin' ||
    currentParticipant?.isAdmin ||
    conversation.createdById === currentUser?.id ||
    currentUser?.isAdmin;
  const isAnnouncementOnlyRestricted = conversation.isAnnouncementOnly && !isOwnerOrAdmin;

  return (
    <main className="flex-1 flex flex-col h-full bg-[#0c0a13] relative overflow-hidden">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Chat Header */}
      <div className="h-16 border-b border-[#26203b] bg-[#151221]/90 backdrop-blur-md px-4 flex items-center justify-between shrink-0 select-none z-10">
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile Back Button */}
          <button
            onClick={onBackMobile}
            className="md:hidden p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Conversation Avatar */}
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-800 to-indigo-600 flex items-center justify-center font-bold text-white text-sm shadow overflow-hidden border border-purple-500/30">
              {isGroup ? (
                conversation.avatarUrl ? (
                  <img src={conversation.avatarUrl} alt={conversation.name} className="w-full h-full object-cover" />
                ) : (
                  <Users className="w-5 h-5 text-purple-200" />
                )
              ) : conversation.peer?.avatarUrl ? (
                <img src={conversation.peer.avatarUrl} alt={conversation.name} className="w-full h-full object-cover" />
              ) : (
                conversation.name.slice(0, 2).toUpperCase()
              )}
            </div>
            {!isGroup && (
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#151221]" />
            )}
          </div>

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              {isChannel && <Hash className="w-4 h-4 text-purple-400 shrink-0" />}
              <h2 className="font-bold text-slate-100 text-sm leading-tight truncate">{conversation.name}</h2>
              {isGroup && (
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-purple-950/80 text-purple-300 border border-purple-800/40">
                  Grup
                </span>
              )}
              {isChannel && (
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-indigo-950/80 text-indigo-300 border border-indigo-800/40">
                  Kanal
                </span>
              )}
              {conversation.isAnnouncementOnly && (
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-950/80 text-amber-300 border border-amber-800/40 flex items-center gap-1">
                  <Megaphone className="w-3 h-3 text-amber-400" />
                  <span>Duyuru Kanalı</span>
                </span>
              )}
            </div>
            <span className="text-[11px] text-purple-400 font-medium leading-none mt-1 truncate">
              {typingUser
                ? `${typingUser} yazıyor...`
                : isGroup
                ? `${conversation.participantCount || conversation.participants?.length || 2} üye`
                : 'çevrimiçi'}
            </span>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          {!isGroup ? (
            <div className="relative" ref={callMenuRef}>
              <div className="flex items-center bg-[#1c182b] border border-[#2e2648] rounded-xl overflow-hidden p-0.5 shadow-sm">
                <button
                  type="button"
                  onClick={() => onStartCall?.('audio')}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-[#28223d] text-xs font-semibold text-slate-300 hover:text-purple-300 rounded-lg transition-colors"
                  title="Sesli Arama"
                >
                  <Phone className="w-4 h-4 text-purple-400" />
                  <span className="hidden sm:inline">Sesli</span>
                </button>
                <button
                  type="button"
                  onClick={() => onStartCall?.('video')}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-[#28223d] text-xs font-semibold text-slate-300 hover:text-purple-300 rounded-lg transition-colors"
                  title="Görüntülü Arama"
                >
                  <Video className="w-4 h-4 text-purple-400" />
                  <span className="hidden sm:inline">Görüntülü</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCallMenuOpen(!isCallMenuOpen)}
                  className="px-1.5 py-1.5 hover:bg-[#28223d] text-slate-400 hover:text-white rounded-lg transition-colors"
                  title="Arama Seçenekleri"
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isCallMenuOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* Call Options Dropdown (1. Sesli arama, 2. Görüntülü arama, 3. Ekran paylaşımı) */}
              {isCallMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-[#151221] border border-[#2b2444] rounded-2xl shadow-2xl z-30 p-1.5 space-y-1 animate-fade-in backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCallMenuOpen(false);
                      onStartCall?.('audio');
                    }}
                    className="w-full flex items-start gap-3 p-2.5 rounded-xl hover:bg-[#201a35] text-left transition-colors group"
                  >
                    <div className="p-2 rounded-lg bg-purple-950/80 border border-purple-800 text-purple-400 group-hover:text-purple-300">
                      <Phone className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-200 group-hover:text-white">1. Sesli arama</div>
                      <div className="text-[11px] text-slate-400">Yalnızca sesli iletişim</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsCallMenuOpen(false);
                      onStartCall?.('video');
                    }}
                    className="w-full flex items-start gap-3 p-2.5 rounded-xl hover:bg-[#201a35] text-left transition-colors group"
                  >
                    <div className="p-2 rounded-lg bg-blue-950/80 border border-blue-800 text-blue-400 group-hover:text-blue-300">
                      <Video className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-200 group-hover:text-white">2. Görüntülü arama</div>
                      <div className="text-[11px] text-slate-400">Kamera ve mikrofon ile görüşme</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsCallMenuOpen(false);
                      onStartCall?.('screen');
                    }}
                    className="w-full flex items-start gap-3 p-2.5 rounded-xl hover:bg-[#201a35] text-left transition-colors group"
                  >
                    <div className="p-2 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-400 group-hover:text-emerald-300">
                      <Monitor className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-200 group-hover:text-white">3. Ekran paylaşımı</div>
                      <div className="text-[11px] text-slate-400">Ekranınızı paylaşarak arama başlatın</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Screen Share Button for Group */}
              <button
                type="button"
                onClick={() => setIsScreenShareOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1c182b] hover:bg-[#26203b] border border-[#2e2648] text-xs font-semibold text-slate-300 hover:text-purple-300 transition-colors"
                title="Canlı Ekran Paylaşımı"
              >
                <Monitor className="w-4 h-4 text-purple-400" />
                <span className="hidden sm:inline">Ekran Paylaş</span>
              </button>

              {/* Group Logo Button for Groups */}
              <button
                type="button"
                onClick={() => setIsGroupAvatarOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1c182b] hover:bg-[#26203b] border border-[#2e2648] text-xs font-semibold text-slate-300 hover:text-purple-300 transition-colors"
                title="Grup Logosunu Değiştir"
              >
                <Camera className="w-4 h-4 text-purple-400" />
                <span className="hidden sm:inline">Grup Logosu</span>
              </button>

              <button
                type="button"
                onClick={() => setShowGroupMembersModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1c182b] hover:bg-[#26203b] border border-[#2e2648] text-xs font-semibold text-slate-300 hover:text-white transition-colors"
              >
                <Users className="w-4 h-4 text-purple-400" />
                <span className="hidden sm:inline">Üyeler</span>
              </button>

              <button
                type="button"
                onClick={() => setIsGroupSettingsOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1c182b] hover:bg-[#26203b] border border-[#2e2648] text-xs font-semibold text-slate-300 hover:text-purple-300 transition-colors"
                title="Grup Yönetimi & Ayarları"
              >
                <Settings className="w-4 h-4 text-purple-400" />
                <span className="hidden sm:inline">Grup Ayarları</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, idx) => {
          const isMe = msg.senderId === currentUser?.id;
          const isHovered = hoveredMessageId === msg.id;
          const canDelete = isMe || currentUser?.isAdmin || currentUser?.isModerator;

          return (
            <div
              key={msg.id || idx}
              onMouseEnter={() => setHoveredMessageId(msg.id)}
              onMouseLeave={() => setHoveredMessageId(null)}
              className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group relative animate-fade-in`}
            >
              {/* Message Bubble Container */}
              <div className="relative max-w-[85%] sm:max-w-[70%]">
                {/* Floating Quick Action Bar on Hover */}
                {isHovered && (
                  <div
                    className={`absolute -top-9 z-20 flex items-center gap-1 bg-[#151221] border border-[#2b2444] rounded-full px-2 py-1 shadow-2xl backdrop-blur-md ${
                      isMe ? 'right-0' : 'left-0'
                    }`}
                  >
                    <QuickReactionsBar onReact={(emoji) => onToggleReaction(msg.id, emoji)} />
                    <button
                      type="button"
                      onClick={() => setReplyTarget(msg)}
                      className="p-1 hover:bg-[#2b2444] rounded-full text-slate-400 hover:text-purple-300 transition-colors"
                      title="Cevapla"
                    >
                      <Reply className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setForwardTarget(msg)}
                      className="p-1 hover:bg-[#2b2444] rounded-full text-slate-400 hover:text-purple-300 transition-colors"
                      title="İlet"
                    >
                      <Forward className="w-3.5 h-3.5" />
                    </button>
                    {canDelete && onDeleteMessage && (
                      <button
                        type="button"
                        onClick={() => onDeleteMessage(msg.id)}
                        className="p-1 hover:bg-rose-950/80 rounded-full text-slate-400 hover:text-rose-400 transition-colors"
                        title="Mesajı Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}

                {/* Message Bubble */}
                <div
                  className={`rounded-2xl px-4 py-2.5 shadow-md relative break-words select-text ${
                    isMe
                      ? 'bg-purple-600 text-white rounded-tr-sm shadow-purple-900/20'
                      : 'bg-[#181427] text-slate-100 border border-[#292243] rounded-tl-sm'
                  }`}
                >
                  {/* Sender Name in Group Chats */}
                  {!isMe && isGroup && (
                    <span className="block text-[11px] font-bold text-purple-400 mb-1">
                      {msg.senderName}
                    </span>
                  )}

                  {/* Forwarded From Indicator */}
                  {msg.forwardedFrom && (
                    <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-medium text-purple-300/80 italic">
                      <Forward className="w-3 h-3" />
                      <span>İletildi ({msg.forwardedFrom.senderName})</span>
                    </div>
                  )}

                  {/* Quoted Reply Reference */}
                  {msg.replyTo && (
                    <div className="mb-2 p-2 rounded-xl bg-black/25 border-l-4 border-purple-400 text-xs text-slate-300 select-none">
                      <span className="font-bold text-[11px] text-purple-300 block mb-0.5">
                        {msg.replyTo.senderName}
                      </span>
                      <p className="line-clamp-2 italic text-[11px] opacity-90">{msg.replyTo.content}</p>
                    </div>
                  )}

                  {/* Attachments Section */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="space-y-2 mb-2">
                      {msg.attachments.map((att) => {
                        const isImg = att.mimeType?.startsWith('image/');
                        return (
                          <div key={att.id} className="rounded-xl overflow-hidden bg-black/20 border border-white/10">
                            {isImg ? (
                              <div className="relative group/att">
                                <img
                                  src={api.getAttachmentUrl(conversation.id, att.id)}
                                  alt={att.fileName}
                                  loading="lazy"
                                  className="max-h-60 w-auto rounded-lg object-contain cursor-pointer"
                                  onClick={() => window.open(api.getAttachmentUrl(conversation.id, att.id), '_blank')}
                                />
                                <button
                                  type="button"
                                  onClick={() => api.downloadAttachment(conversation.id, att.id, att.fileName)}
                                  className="absolute bottom-2 right-2 p-1.5 bg-black/70 hover:bg-black/90 text-white rounded-lg opacity-0 group-hover/att:opacity-100 transition-opacity"
                                  title="Görseli İndir"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <div className="p-2.5 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-8 h-8 rounded-lg bg-purple-950 flex items-center justify-center text-purple-300 shrink-0">
                                    <FileText className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold truncate text-white">{att.fileName}</p>
                                    <p className="text-[10px] text-slate-300">{formatBytes(att.fileSize)}</p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => api.downloadAttachment(conversation.id, att.id, att.fileName)}
                                  className="p-1.5 hover:bg-white/10 rounded-lg text-slate-200 hover:text-white transition-colors"
                                  title="Dosyayı İndir"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Message Content */}
                  {msg.content && <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>}

                  {/* Timestamp & Status */}
                  <div
                    className={`flex items-center justify-end gap-1 mt-1 text-[10px] font-mono select-none ${
                      isMe ? 'text-purple-200' : 'text-slate-400'
                    }`}
                  >
                    <span>{formatMessageTime(msg.createdAt)}</span>
                    {isMe && (
                      <span>
                        {msg.status === 'read' ? (
                          <CheckCheck className="w-3.5 h-3.5 text-purple-200" />
                        ) : msg.status === 'sent' || msg.status === 'delivered' ? (
                          <Check className="w-3.5 h-3.5 text-purple-300" />
                        ) : (
                          <Clock className="w-3 h-3 text-purple-300" />
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {/* Emoji Reactions Badges */}
                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Object.entries(msg.reactions).map(([emoji, userIds]) => {
                      const count = userIds.length;
                      if (count === 0) return null;
                      const hasReacted = currentUser && userIds.includes(currentUser.id);

                      return (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => onToggleReaction(msg.id, emoji)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border transition-all ${
                            hasReacted
                              ? 'bg-purple-950/80 border-purple-500 text-purple-200 shadow-sm shadow-purple-500/20'
                              : 'bg-[#151221] border-[#2b2444] text-slate-300 hover:border-slate-600'
                          }`}
                        >
                          <span>{emoji}</span>
                          <span className="text-[10px]">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Real-time Typing indicator wave */}
        {typingUser && (
          <div className="flex items-center gap-2 p-2 bg-[#151221] border border-[#2b2444] rounded-2xl w-fit text-xs text-slate-300">
            <span className="font-semibold text-purple-400">{typingUser}</span>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce [animation-delay:0.4s]" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Reply Preview Banner */}
      {replyTarget && (
        <div className="px-4 py-2 bg-[#181427] border-t border-[#26203b] flex items-center justify-between text-xs text-slate-300 animate-fade-in">
          <div className="flex items-center gap-2 min-w-0">
            <Reply className="w-4 h-4 text-purple-400 flex-shrink-0" />
            <div className="min-w-0">
              <span className="font-bold text-purple-300">{replyTarget.senderName}</span> kişisine cevap veriliyor:
              <p className="text-[11px] text-slate-400 italic truncate max-w-lg">{replyTarget.content}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReplyTarget(null)}
            className="p-1 hover:bg-[#2b2444] rounded-lg text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Upload Error Banner */}
      {uploadError && (
        <div className="px-4 py-2 bg-rose-950/80 border-t border-rose-800 flex items-center justify-between text-xs text-rose-200">
          <span>{uploadError}</span>
          <button type="button" onClick={() => setUploadError(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pending Attachments Strip */}
      {pendingAttachments.length > 0 && (
        <div className="px-4 py-2 bg-[#141021] border-t border-[#26203b] flex items-center gap-2 overflow-x-auto">
          {pendingAttachments.map((att) => (
            <div key={att.id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#1f1833] border border-purple-800/40 text-xs text-white">
              <Paperclip className="w-3.5 h-3.5 text-purple-400" />
              <span className="max-w-[150px] truncate">{att.fileName}</span>
              <span className="text-[10px] text-slate-400 font-mono">({formatBytes(att.fileSize)})</span>
              <button
                type="button"
                onClick={() => removePendingAttachment(att.id)}
                className="hover:text-rose-400 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Message Input Bar or Announcement Restricted Banner */}
      {isAnnouncementOnlyRestricted ? (
        <div className="p-4 border-t border-[#26203b] bg-[#120e20]/95 backdrop-blur-md text-center shrink-0">
          <div className="max-w-lg mx-auto py-2.5 px-4 rounded-2xl bg-purple-950/40 border border-purple-800/40 text-purple-300 text-xs flex items-center justify-center gap-2 shadow-sm">
            <Megaphone className="w-4 h-4 text-purple-400 shrink-0" />
            <span>Bu kanal duyuru kanalıdır. Yalnızca yetkili yöneticiler mesaj gönderebilir.</span>
          </div>
        </div>
      ) : (
        <div className="p-3 border-t border-[#26203b] bg-[#151221]/95 backdrop-blur-md shrink-0 relative">
          {/* Emoji Picker Popover */}
          {showEmojiPicker && (
            <div className="absolute bottom-16 right-4 z-40">
              <EmojiPicker
                onSelect={(emoji) => setInputText((prev) => prev + emoji)}
                onClose={() => setShowEmojiPicker(false)}
              />
            </div>
          )}

          <div className="max-w-4xl mx-auto flex items-end gap-2 bg-[#1b172a] border border-[#2b2444] rounded-2xl p-2 focus-within:ring-2 focus-within:ring-purple-500 focus-within:border-transparent transition-all">
            {/* File Attachment Button */}
            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-[#26203b] rounded-xl transition-colors shrink-0"
              title="Dosya veya Görsel Ekle (Google Drive)"
            >
              {isUploading ? <Loader2 className="w-5 h-5 animate-spin text-purple-400" /> : <Paperclip className="w-5 h-5" />}
            </button>

            <textarea
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Bir mesaj yazın... (Göndermek için Enter, yeni satır için Shift+Enter)"
              rows={1}
              className="flex-1 bg-transparent border-0 text-slate-100 placeholder:text-slate-500 text-xs sm:text-sm focus:outline-none resize-none max-h-32 py-1.5 px-2 leading-relaxed"
            />

            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className={`p-2 transition-colors rounded-xl ${
                showEmojiPicker ? 'text-purple-400 bg-purple-950/60' : 'text-slate-400 hover:text-slate-200 hover:bg-[#26203b]'
              }`}
              title="Emoji Ekle"
            >
              <Smile className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={handleSend}
              disabled={(!inputText.trim() && pendingAttachments.length === 0) || sending || isUploading}
              className={`p-2.5 rounded-xl transition-all shadow-md shrink-0 ${
                (inputText.trim() || pendingAttachments.length > 0) && !sending && !isUploading
                  ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/30 active:scale-95'
                  : 'bg-slate-800 text-slate-600 cursor-not-allowed'
              }`}
              title="Mesajı Gönder"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Forward Modal */}
      {forwardTarget && (
        <ForwardModal
          message={forwardTarget}
          conversations={conversations}
          onClose={() => setForwardTarget(null)}
          onForwardSuccess={() => setForwardTarget(null)}
        />
      )}

      {/* Group Members Modal */}
      {showGroupMembersModal && isGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl p-5 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-bold text-white">Grup Üyeleri</h3>
              </div>
              <button
                onClick={() => setShowGroupMembersModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {conversation.participants?.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-purple-900/50 flex items-center justify-center font-bold text-white text-xs overflow-hidden shrink-0">
                      {p.avatarUrl ? (
                        <img src={p.avatarUrl} alt={p.displayName} className="w-full h-full object-cover" />
                      ) : (
                        p.displayName.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-200 truncate">{p.displayName}</p>
                      <p className="text-[10px] text-slate-500 truncate">{p.email}</p>
                    </div>
                  </div>
                  {p.isAdmin && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800/60 flex items-center gap-1 shrink-0">
                      <Shield className="w-3 h-3 text-purple-400" /> Yönetici
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Screen Share Modal */}
      <ScreenShareModal
        isOpen={isScreenShareOpen}
        onClose={() => setIsScreenShareOpen(false)}
        conversationId={conversation.id}
        currentUser={currentUser}
      />

      {/* Group Avatar Modal */}
      {isGroup && (
        <GroupAvatarModal
          isOpen={isGroupAvatarOpen}
          onClose={() => setIsGroupAvatarOpen(false)}
          conversation={conversation}
          onAvatarUpdated={(newUrl) => {
            conversation.avatarUrl = newUrl;
            onRefreshConversations?.();
          }}
        />
      )}

      {/* Group Settings Modal */}
      {isGroup && (
        <GroupSettingsModal
          isOpen={isGroupSettingsOpen}
          onClose={() => setIsGroupSettingsOpen(false)}
          conversation={conversation}
          currentUser={currentUser}
          onUpdated={() => {
            onRefreshConversations?.();
          }}
        />
      )}
    </main>
  );
};
