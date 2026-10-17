import React, { useState, useEffect, useRef } from 'react';
import { Conversation, Message, User, Attachment, UserRelationship } from '../../types';
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
  Mic,
  Play,
  Pause,
  Square,
  StopCircle,
  UserCheck,
  UserPlus,
  UserX,
  Ban,
  CheckCircle2,
  Sparkles,
  Info,
  Share2,
} from 'lucide-react';
import { ScreenShareModal } from './ScreenShareModal';
import { GroupAvatarModal } from './GroupAvatarModal';
import { GroupSettingsModal } from './GroupSettingsModal';
import { ServerInviteModal } from './ServerInviteModal';

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
    attachments?: Attachment[],
    type?: 'text' | 'image' | 'video' | 'voice' | 'file' | 'system'
  ) => Promise<void>;
  onDeleteMessage?: (messageId: string) => Promise<void>;
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>;
  onBackMobile: () => void;
  typingUser: string | null;
  onRefreshConversations?: () => void;
  onStartCall?: (mode: 'audio' | 'video' | 'screen') => void;
  isMemberListOpen?: boolean;
  onToggleMemberList?: () => void;
  draftText?: string;
  onDraftChange?: (text: string) => void;
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
  isMemberListOpen = false,
  onToggleMemberList,
  draftText = '',
  onDraftChange,
}) => {
  const [inputText, setInputText] = useState(draftText);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setInputText(draftText || '');
  }, [conversation.id]);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [forwardTarget, setForwardTarget] = useState<Message | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [showGroupMembersModal, setShowGroupMembersModal] = useState(false);
  const [isScreenShareOpen, setIsScreenShareOpen] = useState(false);
  const [isGroupAvatarOpen, setIsGroupAvatarOpen] = useState(false);
  const [isGroupSettingsOpen, setIsGroupSettingsOpen] = useState(false);
  const [isServerInviteOpen, setIsServerInviteOpen] = useState(false);
  const [isCallMenuOpen, setIsCallMenuOpen] = useState(false);
  const callMenuRef = useRef<HTMLDivElement>(null);

  // File upload state
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Voice Recording state
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  // Read receipts popover
  const [selectedReadByMsg, setSelectedReadByMsg] = useState<Message | null>(null);

  // User profile inspect modal & relationships
  const [inspectedUser, setInspectedUser] = useState<User | null>(null);
  const [isLoadingInspectedUser, setIsLoadingInspectedUser] = useState(false);
  const [userRelationship, setUserRelationship] = useState<UserRelationship | null>(null);
  const [relActionLoading, setRelActionLoading] = useState(false);
  const [relFeedback, setRelFeedback] = useState<string | null>(null);

  const handleInspectUser = async (userId: string) => {
    try {
      setIsLoadingInspectedUser(true);
      setRelFeedback(null);
      const [userRes, relRes] = await Promise.all([
        api.getUserProfile(userId),
        currentUser && currentUser.id !== userId
          ? api.getUserRelationship(userId).catch(() => ({ relationship: null }))
          : Promise.resolve({ relationship: null }),
      ]);
      setInspectedUser(userRes.user);
      setUserRelationship((relRes as any)?.relationship || null);
    } catch (err) {
      console.error('Failed to load user profile:', err);
    } finally {
      setIsLoadingInspectedUser(false);
    }
  };

  const handleSendFriendReq = async (targetId: string) => {
    try {
      setRelActionLoading(true);
      setRelFeedback(null);
      await api.sendFriendRequest({ recipientId: targetId });
      setUserRelationship((prev) =>
        prev
          ? { ...prev, friendRequestStatus: 'sent' }
          : { isFriend: false, isBlocked: false, isBlockedBy: false, friendRequestStatus: 'sent', friendRequestId: null }
      );
      setRelFeedback('Arkadaşlık isteği gönderildi!');
    } catch (err: any) {
      setRelFeedback(err.message || 'Arkadaşlık isteği gönderilemedi.');
    } finally {
      setRelActionLoading(false);
    }
  };

  const handleRespondFriendReq = async (requestId: string, action: 'accept' | 'decline') => {
    try {
      setRelActionLoading(true);
      setRelFeedback(null);
      await api.respondFriendRequest(requestId, action);
      setUserRelationship((prev) =>
        prev
          ? {
              ...prev,
              isFriend: action === 'accept',
              friendRequestStatus: 'none',
              friendRequestId: null,
            }
          : null
      );
      setRelFeedback(action === 'accept' ? 'Arkadaşlık isteği kabul edildi!' : 'İstek reddedildi.');
    } catch (err: any) {
      setRelFeedback(err.message || 'İstek yanıtlanamadı.');
    } finally {
      setRelActionLoading(false);
    }
  };

  const handleBlockUser = async (targetId: string) => {
    if (!window.confirm('Bu kullanıcıyı engellemek istediğinize emin misiniz? Karşılıklı mesajlaşma durdurulacaktır.')) return;
    try {
      setRelActionLoading(true);
      setRelFeedback(null);
      await api.blockUser(targetId);
      setUserRelationship((prev) =>
        prev
          ? {
              ...prev,
              isBlocked: true,
              isFriend: false,
              friendRequestStatus: 'none',
            }
          : { isFriend: false, isBlocked: true, isBlockedBy: false, friendRequestStatus: 'none', friendRequestId: null }
      );
      setRelFeedback('Kullanıcı engellendi.');
    } catch (err: any) {
      setRelFeedback(err.message || 'Kullanıcı engellenemedi.');
    } finally {
      setRelActionLoading(false);
    }
  };

  const handleUnblockUser = async (targetId: string) => {
    try {
      setRelActionLoading(true);
      setRelFeedback(null);
      await api.unblockUser(targetId);
      setUserRelationship((prev) =>
        prev ? { ...prev, isBlocked: false } : null
      );
      setRelFeedback('Kullanıcının engeli kaldırıldı.');
    } catch (err: any) {
      setRelFeedback(err.message || 'Engel kaldırılamadı.');
    } finally {
      setRelActionLoading(false);
    }
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);

        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.onloadend = async () => {
            const dataUrl = reader.result as string;
            await onSendMessage(
              '🎤 Sesli Mesaj',
              undefined,
              replyTarget?.id,
              undefined,
              [
                {
                  id: 'voice_' + Date.now(),
                  conversationId: conversation.id,
                  uploaderId: currentUser?.id || 'me',
                  driveAccountId: 'voice_local',
                  driveFileId: dataUrl,
                  fileName: 'sesli-mesaj.webm',
                  fileSize: audioBlob.size,
                  mimeType: 'audio/webm',
                  createdAt: new Date().toISOString(),
                },
              ],
              'voice'
            );
          };
          reader.readAsDataURL(audioBlob);
        }
        setIsRecordingVoice(false);
        setRecordingDuration(0);
      };

      mediaRecorder.start();
      setIsRecordingVoice(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch (err: any) {
      alert('Mikrofon erişim izni alınamadı: ' + err.message);
    }
  };

  const stopAndSendVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const cancelVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      audioChunksRef.current = [];
      mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecordingVoice(false);
    setRecordingDuration(0);
  };

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
    onDraftChange?.(val);

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
      onDraftChange?.('');
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

          {/* Conversation Avatar & Name Header */}
          <div
            onClick={() => {
              if (!isGroup && !isChannel && conversation.peer?.id) {
                handleInspectUser(conversation.peer.id);
              }
            }}
            className={`flex items-center gap-3 min-w-0 ${
              !isGroup && !isChannel && conversation.peer?.id
                ? 'cursor-pointer hover:opacity-90 transition-opacity'
                : ''
            }`}
            title={!isGroup && !isChannel && conversation.peer?.id ? 'Kullanıcı profilini ve arkadaşlık durumunu görüntüle' : undefined}
          >
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
                  : 'çevrimiçi • profili gör'}
              </span>
            </div>
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

              {(conversation.serverId || isChannel) && (
                <button
                  type="button"
                  onClick={() => setIsServerInviteOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1c182b] hover:bg-[#26203b] border border-[#2e2648] text-xs font-semibold text-slate-300 hover:text-purple-300 transition-colors"
                  title="Sunucu Davet Bağlantısı Oluştur"
                >
                  <Share2 className="w-4 h-4 text-purple-400" />
                  <span className="hidden sm:inline">Sunucu Daveti</span>
                </button>
              )}
            </>
          )}

          {/* Member List Toggle Button */}
          {onToggleMemberList && (
            <button
              type="button"
              onClick={onToggleMemberList}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                isMemberListOpen
                  ? 'bg-purple-950/70 border-purple-500 text-purple-300 shadow-sm'
                  : 'bg-[#1c182b] hover:bg-[#26203b] border-[#2e2648] text-slate-300 hover:text-white'
              }`}
              title="Üye Listesi Paneli (Göster/Gizle)"
            >
              <Users className="w-4 h-4 text-purple-400" />
              <span className="hidden sm:inline">Üyeler</span>
            </button>
          )}
        </div>
      </div>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, idx) => {
          // Distinct System Message rendering
          if (msg.isSystem || msg.type === 'system') {
            return (
              <div key={msg.id || idx} className="flex justify-center my-3 select-none animate-fade-in">
                <div className="px-4 py-1.5 rounded-full bg-[#1b152d] border border-purple-800/40 text-xs font-medium text-purple-200 shadow-md flex items-center gap-2 max-w-md text-center">
                  <span>{msg.content}</span>
                  <span className="text-[10px] text-purple-400 font-mono">({formatMessageTime(msg.createdAt)})</span>
                </div>
              </div>
            );
          }

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
                    <button
                      type="button"
                      onClick={() => handleInspectUser(msg.senderId)}
                      className="p-1 hover:bg-[#2b2444] rounded-full text-slate-400 hover:text-purple-300 transition-colors"
                      title="Kullanıcı Profilini Görüntüle"
                    >
                      <Info className="w-3.5 h-3.5" />
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
                  {/* Sender Name in Group Chats with Profile Inspect */}
                  {!isMe && isGroup && (
                    <button
                      type="button"
                      onClick={() => handleInspectUser(msg.senderId)}
                      className="block text-[11px] font-bold text-purple-400 hover:text-purple-300 hover:underline mb-1 text-left"
                      title="Profili İncele"
                    >
                      {msg.senderName}
                    </button>
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
                        const isVideo = att.mimeType?.startsWith('video/');
                        const isAudio = att.mimeType?.startsWith('audio/') || msg.type === 'voice';

                        if (isImg) {
                          return (
                            <div key={att.id} className="rounded-xl overflow-hidden bg-black/20 border border-white/10 relative group/att">
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
                          );
                        }

                        if (isVideo) {
                          return (
                            <div key={att.id} className="rounded-xl overflow-hidden bg-black/40 border border-purple-500/30 max-w-md">
                              <video
                                controls
                                playsInline
                                src={api.getAttachmentUrl(conversation.id, att.id)}
                                className="w-full max-h-72 object-contain bg-black rounded-t-xl"
                              />
                              <div className="p-2 flex items-center justify-between bg-[#120e22] text-xs">
                                <span className="truncate text-slate-200 font-semibold">{att.fileName}</span>
                                <button
                                  type="button"
                                  onClick={() => api.downloadAttachment(conversation.id, att.id, att.fileName)}
                                  className="p-1 hover:bg-white/10 rounded text-slate-300 hover:text-white transition-colors"
                                  title="Videoyu İndir"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        }

                        if (isAudio) {
                          const audioSrc = att.driveFileId?.startsWith('data:') ? att.driveFileId : api.getAttachmentUrl(conversation.id, att.id);
                          return (
                            <div key={att.id} className="p-3 rounded-2xl bg-purple-950/80 border border-purple-700/50 flex flex-col gap-2 min-w-[240px] max-w-xs shadow-inner">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center text-white shrink-0 shadow">
                                  <Mic className="w-3.5 h-3.5" />
                                </div>
                                <span className="text-xs font-bold text-purple-200">Sesli Mesaj</span>
                              </div>
                              <audio controls src={audioSrc} className="w-full h-8 accent-purple-500 rounded" />
                            </div>
                          );
                        }

                        return (
                          <div key={att.id} className="rounded-xl overflow-hidden bg-black/20 border border-white/10 p-2.5 flex items-center justify-between gap-3">
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
                        );
                      })}
                    </div>
                  )}

                  {/* Message Content */}
                  {msg.content && <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>}

                  {/* Timestamp & Truthful Status Checkmarks */}
                  <div
                    className={`flex items-center justify-end gap-1 mt-1 text-[10px] font-mono select-none ${
                      isMe ? 'text-purple-200' : 'text-slate-400'
                    }`}
                  >
                    <span>{formatMessageTime(msg.createdAt)}</span>
                    {isMe && (
                      <span
                        className="cursor-pointer relative inline-flex items-center"
                        onClick={() => {
                          if (msg.readBy && msg.readBy.length > 0) {
                            setSelectedReadByMsg(selectedReadByMsg?.id === msg.id ? null : msg);
                          }
                        }}
                        title={
                          msg.readBy && msg.readBy.length > 0
                            ? `${msg.readBy.length} kişi okudu (Detaylar için tıklayın)`
                            : msg.status === 'read'
                            ? 'Okundu'
                            : msg.status === 'delivered'
                            ? 'İletildi'
                            : 'Gönderildi'
                        }
                      >
                        {msg.status === 'read' || (msg.readBy && msg.readBy.length > 0) ? (
                          <CheckCheck className="w-3.5 h-3.5 text-purple-200" />
                        ) : msg.status === 'delivered' ? (
                          <CheckCheck className="w-3.5 h-3.5 text-slate-400" />
                        ) : msg.status === 'sent' ? (
                          <Check className="w-3.5 h-3.5 text-slate-400" />
                        ) : (
                          <Clock className="w-3 h-3 text-purple-300" />
                        )}

                        {/* Read By Popover */}
                        {selectedReadByMsg?.id === msg.id && msg.readBy && msg.readBy.length > 0 && (
                          <div className="absolute bottom-6 right-0 z-30 p-3 bg-[#120f20] border border-[#2e2448] rounded-2xl shadow-2xl min-w-[200px] text-xs animate-fade-in select-none">
                            <div className="flex items-center justify-between pb-1.5 border-b border-[#251c38] mb-1.5 font-bold text-[11px] text-purple-300">
                              <span>Okuyanlar ({msg.readBy.length})</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedReadByMsg(null);
                                }}
                                className="text-slate-400 hover:text-white"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="space-y-1.5 max-h-40 overflow-y-auto">
                              {msg.readBy.map((rb, rIdx) => (
                                <div key={rIdx} className="flex items-center justify-between text-[11px] text-slate-200">
                                  <span className="truncate font-semibold">{rb.displayName}</span>
                                  <span className="text-slate-400 font-mono text-[9px] shrink-0 ml-2">
                                    {formatMessageTime(rb.readAt)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
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

            {isRecordingVoice ? (
              <div className="flex-1 flex items-center gap-2.5 px-3 py-1.5 animate-pulse bg-rose-950/40 border border-rose-800/50 rounded-xl">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping shrink-0" />
                <span className="text-xs font-semibold text-rose-300">
                  Ses Kaydediliyor: {Math.floor(recordingDuration / 60).toString().padStart(2, '0')}:{(recordingDuration % 60).toString().padStart(2, '0')}
                </span>
                <span className="text-[11px] text-slate-400 italic hidden sm:inline">(Göndermek için sağdaki butona tıklayın)</span>
              </div>
            ) : (
              <textarea
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Bir mesaj yazın... (Göndermek için Enter, yeni satır için Shift+Enter)"
                rows={1}
                className="flex-1 bg-transparent border-0 text-slate-100 placeholder:text-slate-500 text-xs sm:text-sm focus:outline-none resize-none max-h-32 py-1.5 px-2 leading-relaxed"
              />
            )}

            {!isRecordingVoice && (
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
            )}

            {isRecordingVoice ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={cancelVoiceRecording}
                  className="p-2 text-rose-400 hover:bg-rose-950/60 rounded-xl transition-colors"
                  title="Ses Kaydını İptal Et"
                >
                  <X className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={stopAndSendVoiceRecording}
                  className="p-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white shadow-md transition-all active:scale-95"
                  title="Sesli Mesajı Gönder"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            ) : !inputText.trim() && pendingAttachments.length === 0 ? (
              <button
                type="button"
                onClick={startVoiceRecording}
                className="p-2.5 text-purple-400 hover:text-white hover:bg-purple-600/30 border border-purple-500/30 rounded-xl transition-all shrink-0 active:scale-95 shadow-sm"
                title="Sesli Mesaj Kaydet"
              >
                <Mic className="w-4 h-4" />
              </button>
            ) : (
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
            )}
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

      {/* Server Invite Modal */}
      {isServerInviteOpen && (conversation.serverId || conversation.id) && (
        <ServerInviteModal
          isOpen={isServerInviteOpen}
          onClose={() => setIsServerInviteOpen(false)}
          serverId={conversation.serverId || conversation.id}
          serverName={conversation.name}
        />
      )}
      {/* User Profile View Modal (Hakkımda, Rol, Katılım, Arkadaş & Engelleme vb.) */}
      {inspectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
          <div className="bg-[#120f1e] border border-[#2a2244] w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl flex flex-col text-left relative">
            {/* Profile Banner */}
            <div
              className="w-full h-24 bg-gradient-to-r from-purple-900 to-indigo-900 bg-cover bg-center relative"
              style={{
                backgroundColor: inspectedUser.accentColor || '#3b2361',
                backgroundImage: inspectedUser.bannerUrl ? `url(${inspectedUser.bannerUrl})` : undefined,
              }}
            >
              <button
                onClick={() => setInspectedUser(null)}
                className="absolute top-3 right-3 p-1.5 rounded-xl bg-black/60 hover:bg-black/80 text-white/80 hover:text-white transition-colors backdrop-blur-sm z-10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Profile Header (Avatar overlapping banner) */}
            <div className="px-5 pt-0 pb-4 relative">
              <div className="flex items-end justify-between -mt-10 mb-3">
                <div
                  className="w-20 h-20 rounded-2xl overflow-hidden border-4 border-[#120f1e] shadow-xl bg-[#181329] flex items-center justify-center text-white font-bold text-2xl"
                  style={{
                    borderColor: inspectedUser.accentColor || '#7c3aed',
                  }}
                >
                  {inspectedUser.avatarUrl ? (
                    <img src={inspectedUser.avatarUrl} alt={inspectedUser.displayName} className="w-full h-full object-cover" />
                  ) : (
                    inspectedUser.displayName.slice(0, 2).toUpperCase()
                  )}
                </div>

                {/* Free Personalization Badge */}
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-950/80 text-purple-300 border border-purple-800/60 flex items-center gap-1 shadow-sm">
                  <Sparkles className="w-3 h-3 text-purple-400" />
                  <span>Ücretsiz Profil</span>
                </span>
              </div>

              {/* User Name & Details */}
              <div className="mb-3">
                <h3 className="text-base font-bold text-white leading-tight flex items-center gap-1.5">
                  <span>{inspectedUser.displayName}</span>
                  {inspectedUser.accentColor && (
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/40"
                      style={{ backgroundColor: inspectedUser.accentColor }}
                      title="Özel Vurgu Rengi"
                    />
                  )}
                </h3>
                <p className="text-[11px] text-slate-400">{inspectedUser.email}</p>
              </div>

              {/* Role badge */}
              <div className="mb-3">
                {inspectedUser.isAdmin ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-700/60">
                    Platform Yöneticisi
                  </span>
                ) : inspectedUser.isFamily ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-pink-950/80 text-pink-300 border border-pink-700/60">
                    Aile Üyesi
                  </span>
                ) : inspectedUser.isModerator ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-950/80 text-blue-300 border border-blue-700/60">
                    Moderatör
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-[#1e1732] text-slate-300 border border-[#31254e]">
                    Kullanıcı
                  </span>
                )}
              </div>

              {/* Relationship feedback message */}
              {relFeedback && (
                <div className="mb-3 p-2 rounded-xl bg-purple-950/80 border border-purple-800 text-[11px] text-purple-200">
                  {relFeedback}
                </div>
              )}

              {/* Relationship actions: Friend & Block controls */}
              {currentUser && currentUser.id !== inspectedUser.id && (
                <div className="mb-3.5 p-3 rounded-2xl bg-[#0c0a16] border border-[#231b36] space-y-2">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Arkadaşlık & İletişim
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {userRelationship?.isBlocked ? (
                      <div className="flex items-center justify-between w-full">
                        <span className="px-2 py-1 rounded-xl bg-red-950/80 text-red-300 border border-red-800 text-xs font-semibold flex items-center gap-1.5">
                          <Ban className="w-3.5 h-3.5" />
                          <span>Engellendi</span>
                        </span>
                        <button
                          type="button"
                          disabled={relActionLoading}
                          onClick={() => handleUnblockUser(inspectedUser.id)}
                          className="px-3 py-1.5 rounded-xl bg-[#1d1730] hover:bg-[#271f42] text-slate-200 text-xs font-semibold transition-colors disabled:opacity-50"
                        >
                          Engeli Kaldır
                        </button>
                      </div>
                    ) : userRelationship?.isBlockedBy ? (
                      <span className="text-xs text-red-400 font-medium">
                        Bu kullanıcı tarafından engellendiniz.
                      </span>
                    ) : (
                      <>
                        {userRelationship?.isFriend ? (
                          <span className="px-2.5 py-1.5 rounded-xl bg-emerald-950/80 text-emerald-300 border border-emerald-800 text-xs font-bold flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Arkadaş</span>
                          </span>
                        ) : userRelationship?.friendRequestStatus === 'sent' ? (
                          <span className="px-2.5 py-1.5 rounded-xl bg-purple-950/80 text-purple-300 border border-purple-800 text-xs font-bold flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-purple-400" />
                            <span>İstek Gönderildi</span>
                          </span>
                        ) : userRelationship?.friendRequestStatus === 'received' && userRelationship.friendRequestId ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={relActionLoading}
                              onClick={() => handleRespondFriendReq(userRelationship.friendRequestId!, 'accept')}
                              className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-colors flex items-center gap-1.5 disabled:opacity-50"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Kabul Et</span>
                            </button>
                            <button
                              type="button"
                              disabled={relActionLoading}
                              onClick={() => handleRespondFriendReq(userRelationship.friendRequestId!, 'decline')}
                              className="px-3 py-1.5 rounded-xl bg-[#1d1730] hover:bg-[#271f42] text-slate-300 text-xs font-semibold transition-colors disabled:opacity-50"
                            >
                              Reddet
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={relActionLoading}
                            onClick={() => handleSendFriendReq(inspectedUser.id)}
                            className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-md shadow-purple-950/50 disabled:opacity-50"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>Arkadaş Ekle</span>
                          </button>
                        )}

                        {/* Block action button */}
                        <button
                          type="button"
                          disabled={relActionLoading}
                          onClick={() => handleBlockUser(inspectedUser.id)}
                          className="px-2.5 py-1.5 rounded-xl bg-red-950/30 hover:bg-red-950/70 border border-red-900/40 text-red-400 hover:text-red-300 text-xs font-semibold transition-colors ml-auto flex items-center gap-1 disabled:opacity-50"
                          title="Kullanıcıyı Engelle"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>Engelle</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Hakkımda (Bio) */}
              <div className="w-full p-3 bg-[#0c0a16] border border-[#231b36] rounded-2xl text-left mb-3">
                <span className="text-[10px] font-bold text-purple-400 block mb-1 uppercase tracking-wider">Hakkımda</span>
                <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {inspectedUser.bio || 'Bu kullanıcı henüz hakkında bilgisi eklemedi.'}
                </p>
              </div>

              {/* Account Metadata */}
              <div className="w-full text-[11px] text-slate-400 flex items-center justify-between px-1">
                <span>Kayıt Tarihi:</span>
                <span className="font-mono text-slate-300">
                  {inspectedUser.createdAt ? new Date(inspectedUser.createdAt).toLocaleDateString('tr-TR') : 'Bilinmiyor'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
