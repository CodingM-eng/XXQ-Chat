import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './context/AuthContext';
import { api } from './services/api';
import { connectSocket, disconnectSocket, getSocket } from './services/socket';
import { Conversation, Message, Server, User } from './types';
import { Header } from './components/common/Header';
import { ServerRail } from './components/chat/ServerRail';
import { ChannelSidebar } from './components/chat/ChannelSidebar';
import { MemberListPanel } from './components/chat/MemberListPanel';
import { ChatPane } from './components/chat/ChatPane';
import { EmptyState } from './components/chat/EmptyState';
import { NewChatModal } from './components/chat/NewChatModal';
import { NewServerModal } from './components/chat/NewServerModal';
import { CreateChannelModal } from './components/chat/CreateChannelModal';
import { ServerInviteModal } from './components/chat/ServerInviteModal';
import { CommunitySettingsModal } from './components/chat/CommunitySettingsModal';
import { JoinCommunityModal } from './components/chat/JoinCommunityModal';
import { FriendsModal } from './components/chat/FriendsModal';
import { InvitationsModal } from './components/chat/InvitationsModal';
import { ProfileEditModal } from './components/common/ProfileEditModal';
import { SearchModal } from './components/chat/SearchModal';
import { AdminPanel } from './components/admin/AdminPanel';
import { AuthModal } from './components/auth/AuthModal';
import { AccessRestricted } from './components/auth/AccessRestricted';
import { OnboardingModal } from './components/auth/OnboardingModal';
import { BrandLogo } from './components/common/BrandLogo';
import { SafeAvatar } from './components/common/SafeAvatar';
import {
  Loader2,
  MessageSquare,
  Users,
  Compass,
  Mail,
  User as UserIcon,
  X,
  Plus,
  Globe,
} from 'lucide-react';
import { IncomingCallModal, IncomingCallData } from './components/chat/IncomingCallModal';
import { ActiveCallModal, ActiveCallState } from './components/chat/ActiveCallModal';

export const AppContent: React.FC = () => {
  const { user, whitelist, isLoading, refreshSession, theme, toggleTheme } = useAuth();
  const [currentView, setCurrentView] = useState<'chat' | 'admin'>('chat');
  const [servers, setServers] = useState<Server[]>([]);
  const [activeServerId, setActiveServerId] = useState<string | null>(null); // null = Home (DMs & Groups)
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);

  // Drafts preserved per conversation ID
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Modals & Panels
  const [isMemberListOpen, setIsMemberListOpen] = useState(false);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isNewServerOpen, setIsNewServerOpen] = useState(false);
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
  const [isServerInviteOpen, setIsServerInviteOpen] = useState(false);
  const [isCommunitySettingsOpen, setIsCommunitySettingsOpen] = useState(false);
  const [isJoinCommunityOpen, setIsJoinCommunityOpen] = useState(false);
  const [isFriendsOpen, setIsFriendsOpen] = useState(false);
  const [isInvitationsOpen, setIsInvitationsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [inspectedUser, setInspectedUser] = useState<User | null>(null);

  // Badges & Counts
  const [pendingInvitationsCount, setPendingInvitationsCount] = useState(0);
  const [pendingFriendRequestsCount, setPendingFriendRequestsCount] = useState(0);

  // Call states
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);
  const activeCallRef = useRef<ActiveCallState | null>(null);
  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  // Keep a ref to the selected conversation so socket listeners always see the current ID
  const selectedConvIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedConvIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

  // Load servers
  const loadServers = useCallback(async () => {
    try {
      const res = await api.getServers();
      setServers(res.servers || []);
    } catch (err) {
      console.error('Failed to load servers:', err);
    }
  }, []);

  // Load conversations
  const loadConversations = useCallback(async () => {
    try {
      const res = await api.getConversations();
      setConversations(res.conversations || []);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  }, []);

  // Load messages for selected conversation
  const loadMessages = useCallback(async (convId: string) => {
    try {
      const res = await api.getMessages(convId);
      setMessages(res.messages || []);
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  }, []);

  // Load pending badges
  const loadBadges = useCallback(async () => {
    if (!user) return;
    try {
      const [invRes, friendsRes] = await Promise.all([
        api.getMyInvitations().catch(() => ({ invitations: [] })),
        api.getFriendRequests().catch(() => ({ incoming: [] })),
      ]);
      const count = invRes.invitations?.filter((i: any) => i.status === 'pending').length || 0;
      setPendingInvitationsCount(count);
      setPendingFriendRequestsCount(friendsRes.incoming?.length || 0);
    } catch {
      // Ignore background errors
    }
  }, [user?.id]);

  useEffect(() => {
    loadBadges();
    const interval = setInterval(loadBadges, 30000);
    return () => clearInterval(interval);
  }, [loadBadges]);

  // Setup persistent Socket connection when user is authenticated
  useEffect(() => {
    if (!user || (whitelist?.modeActive && !whitelist.isApproved)) {
      disconnectSocket();
      return;
    }

    const socket = connectSocket();

    socket.on('message:new', (newMsg: Message) => {
      // Append to active message thread if conversation matches
      if (newMsg.conversationId === selectedConvIdRef.current) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id || (newMsg.clientMessageId && m.clientMessageId === newMsg.clientMessageId))) {
            return prev.map((m) =>
              (m.clientMessageId === newMsg.clientMessageId || m.id === newMsg.id) ? newMsg : m
            );
          }
          return [...prev, newMsg];
        });
      }

      // Update conversation preview
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === newMsg.conversationId);
        if (!exists) {
          loadConversations();
          return prev;
        }

        return prev.map((c) => {
          if (c.id === newMsg.conversationId) {
            return {
              ...c,
              lastMessage: {
                id: newMsg.id,
                senderId: newMsg.senderId,
                senderName: newMsg.senderName,
                content: newMsg.content,
                status: newMsg.status,
                createdAt: newMsg.createdAt,
              },
              unreadCount: newMsg.conversationId === selectedConvIdRef.current ? 0 : c.unreadCount + 1,
              updatedAt: newMsg.createdAt,
            };
          }
          return c;
        }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      });
    });

    socket.on('connect', () => {
      setIsConnected(true);
      if (selectedConvIdRef.current) {
        socket.emit('conversation:join', { conversationId: selectedConvIdRef.current });
        loadMessages(selectedConvIdRef.current);
      }
    });

    socket.on('disconnect', () => setIsConnected(false));

    socket.on('call:incoming', (data: IncomingCallData) => {
      if (activeCallRef.current) {
        socket.emit('call:reject', {
          conversationId: data.conversationId,
          callerId: data.callerId,
          reason: 'busy',
        });
        return;
      }
      setIncomingCall(data);
    });

    socket.on('call:ended', () => {
      setIncomingCall(null);
      setActiveCall(null);
    });

    socket.on('typing:status', (data: { conversationId: string; userName: string; isTyping: boolean }) => {
      if (data.conversationId === selectedConvIdRef.current) {
        setTypingUser(data.isTyping ? data.userName : null);
      }
    });

    socket.on('message:read_receipt', (data: { conversationId: string; messageId: string }) => {
      if (data.conversationId === selectedConvIdRef.current) {
        setMessages((prev) =>
          prev.map((m) => (m.id === data.messageId ? { ...m, status: 'read' } : m))
        );
      }
    });

    socket.on('message:reaction', (data: { conversationId: string; messageId: string; reactions: Record<string, string[]> }) => {
      if (data.conversationId === selectedConvIdRef.current) {
        setMessages((prev) =>
          prev.map((m) => (m.id === data.messageId ? { ...m, reactions: data.reactions } : m))
        );
      }
    });

    socket.on('message:deleted', (data: { conversationId: string; messageId: string }) => {
      if (data.conversationId === selectedConvIdRef.current) {
        setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
      }
    });

    socket.on('conversation:new', () => {
      loadConversations();
    });

    socket.on('conversation:updated', () => {
      loadConversations();
    });

    socket.on('server:new', () => {
      loadServers();
      loadConversations();
    });

    socket.on('server:updated', () => {
      loadServers();
      loadConversations();
    });

    socket.on('auth:revoked', () => {
      refreshSession();
    });

    loadConversations();
    loadServers();

    return () => {
      disconnectSocket();
    };
  }, [user?.id, whitelist?.isApproved, whitelist?.modeActive, loadConversations, loadServers, refreshSession]);

  // Load messages when conversation selection changes
  useEffect(() => {
    if (selectedConversationId) {
      loadMessages(selectedConversationId);
      setTypingUser(null);

      const socket = getSocket();
      if (socket && socket.connected) {
        socket.emit('conversation:join', { conversationId: selectedConversationId });
      }

      // Reset unread count locally in conversation list
      setConversations((prev) =>
        prev.map((c) => (c.id === selectedConversationId ? { ...c, unreadCount: 0 } : c))
      );
    } else {
      setMessages([]);
    }
  }, [selectedConversationId, loadMessages]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchModalOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setIsNewChatOpen(true);
      } else if (e.key === 'Escape') {
        setIsNewChatOpen(false);
        setIsSearchModalOpen(false);
        setInspectedUser(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleDraftChange = (convId: string, text: string) => {
    setDrafts((prev) => ({
      ...prev,
      [convId]: text,
    }));
  };

  const handleSendMessage = async (
    content: string,
    clientMessageId?: string,
    replyToMessageId?: string,
    forwardedFrom?: { senderName: string },
    attachments?: any[],
    type?: 'text' | 'image' | 'video' | 'voice' | 'file' | 'system'
  ) => {
    if (!selectedConversationId) return;

    const socket = getSocket();
    const clientMsgId =
      clientMessageId ||
      'client_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);

    // Clear draft on send
    handleDraftChange(selectedConversationId, '');

    // Optimistic message update
    const replyTarget = replyToMessageId ? messages.find((m) => m.id === replyToMessageId) : null;
    const msgType = type || (attachments && attachments.length > 0 ? (attachments[0].mimeType?.startsWith('image') ? 'image' : attachments[0].mimeType?.startsWith('video') ? 'video' : attachments[0].mimeType?.startsWith('audio') ? 'voice' : 'file') : 'text');
    const optimisticMsg: Message = {
      id: 'opt_' + Date.now(),
      conversationId: selectedConversationId,
      senderId: user!.id,
      senderName: user!.displayName,
      senderAvatar: user!.avatarUrl,
      clientMessageId: clientMsgId,
      content,
      type: msgType,
      replyTo: replyTarget
        ? {
            id: replyTarget.id,
            senderId: replyTarget.senderId,
            senderName: replyTarget.senderName,
            content: replyTarget.content,
          }
        : null,
      forwardedFrom: forwardedFrom || null,
      attachments: attachments || null,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    if (socket && socket.connected) {
      socket.emit(
        'message:send',
        {
          conversationId: selectedConversationId,
          content,
          clientMessageId: clientMsgId,
          replyToMessageId,
          forwardedFrom,
          attachments,
          type: msgType,
        },
        (res: any) => {
          if (res?.success && res.message) {
            setMessages((prev) =>
              prev.map((m) => (m.clientMessageId === clientMsgId || m.id === res.message.id ? res.message : m))
            );
          }
        }
      );
    } else {
      // REST fallback
      const res = await api.sendMessage(
        selectedConversationId,
        content,
        clientMsgId,
        replyToMessageId,
        forwardedFrom,
        attachments,
        msgType
      );
      setMessages((prev) =>
        prev.map((m) => (m.clientMessageId === clientMsgId || m.id === res.message.id ? res.message : m))
      );
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!selectedConversationId) return;
    try {
      const socket = getSocket();
      if (socket && socket.connected) {
        socket.emit('message:delete', {
          conversationId: selectedConversationId,
          messageId,
        });
      } else {
        await api.deleteMessage(selectedConversationId, messageId);
      }
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  };

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    if (!selectedConversationId) return;

    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('message:react', {
        conversationId: selectedConversationId,
        messageId,
        emoji,
      });
    } else {
      const res = await api.toggleReaction(selectedConversationId, messageId, emoji);
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions: res.reactions } : m))
      );
    }
  };

  // Call Handlers
  const handleStartCall = (mode: 'audio' | 'video' | 'screen') => {
    const selectedConv = conversations.find((c) => c.id === selectedConversationId);
    if (!selectedConv || selectedConv.type === 'group') return;
    const peer = selectedConv.peer || selectedConv.participants?.find((p) => p.id !== user?.id);
    if (!peer) return;

    setActiveCall({
      conversationId: selectedConv.id,
      targetUser: {
        id: peer.id,
        displayName: peer.displayName || selectedConv.name,
        avatarUrl: peer.avatarUrl,
      },
      mode,
      isInitiator: true,
    });
  };

  const handleAcceptIncomingCall = (call: IncomingCallData) => {
    setIncomingCall(null);
    setActiveCall({
      conversationId: call.conversationId,
      targetUser: {
        id: call.callerId,
        displayName: call.callerName,
        avatarUrl: call.callerAvatar,
      },
      mode: call.mode,
      isInitiator: false,
    });
  };

  const handleRejectIncomingCall = (call: IncomingCallData) => {
    const socket = getSocket();
    if (socket) {
      socket.emit('call:reject', {
        conversationId: call.conversationId,
        callerId: call.callerId,
        reason: 'declined',
      });
    }
    setIncomingCall(null);
  };

  // Server selection handler
  const handleSelectServer = (serverId: string) => {
    setActiveServerId(serverId);
    const targetServer = servers.find((s) => s.id === serverId);
    const channels = conversations.filter((c) => c.serverId === serverId);
    if (channels.length > 0) {
      // Prefer general text channel or first channel
      const general = channels.find((c) => !c.isAnnouncementOnly) || channels[0];
      setSelectedConversationId(general.id);
    }
  };

  const handleSelectHome = () => {
    setActiveServerId(null);
  };

  const handleInspectUser = async (userId: string) => {
    try {
      const res = await api.getUserProfile(userId);
      setInspectedUser(res.user);
    } catch (err) {
      console.error('Failed to load user profile:', err);
    }
  };

  const handleStartDirectChatFromMember = async (userId: string) => {
    try {
      const res = await api.createDirectConversation(userId);
      await loadConversations();
      setActiveServerId(null);
      setSelectedConversationId(res.conversationId);
      setInspectedUser(null);
      setIsMemberListOpen(false);
    } catch (err) {
      console.error('Failed to start chat from member:', err);
    }
  };

  // 1. Loading screen
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#07050d] flex flex-col items-center justify-center p-4">
        <BrandLogo size={64} showText={false} className="animate-pulse mb-4" />
        <Loader2 className="w-6 h-6 animate-spin text-purple-400 mb-2" />
        <span className="text-xs text-purple-300 font-mono tracking-wider">GÜVENLİ OTURUM BAŞLATILIYOR...</span>
      </div>
    );
  }

  // 2. Unauthenticated -> Auth modal
  if (!user) {
    return <AuthModal />;
  }

  // 3. Whitelist active and user not approved -> Restricted screen
  if (whitelist?.modeActive && !whitelist.isApproved) {
    return <AccessRestricted />;
  }

  // 4. Authorized user but onboarding incomplete -> Profile onboarding modal
  if (user && user.onboarded === false) {
    return <OnboardingModal />;
  }

  const selectedConversation = conversations.find((c) => c.id === selectedConversationId);
  const activeServer = activeServerId ? servers.find((s) => s.id === activeServerId) || null : null;

  // Calculate unread counts
  const unreadHomeCount = conversations
    .filter((c) => !c.serverId)
    .reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  const serverUnreadCounts: Record<string, number> = {};
  for (const s of servers) {
    serverUnreadCounts[s.id] = conversations
      .filter((c) => c.serverId === s.id)
      .reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#07050d] overflow-hidden text-slate-100 font-sans">
      {/* Top Header (Visible on Desktop/Tablet, or Mobile when in channel list) */}
      <div className={`${selectedConversationId ? 'hidden md:block' : 'block'}`}>
        <Header
          currentView={currentView}
          onNavigate={(view) => setCurrentView(view)}
          isConnected={isConnected}
          onSelectConversation={(id) => {
            setSelectedConversationId(id);
            setCurrentView('chat');
          }}
          onStartDirectChat={async (email) => {
            try {
              const res = await api.createDirectConversation(email);
              await loadConversations();
              setSelectedConversationId(res.conversationId);
              setCurrentView('chat');
            } catch (err) {
              console.error('Failed to start chat from search:', err);
            }
          }}
        />
      </div>

      {/* Main Content Area */}
      {currentView === 'admin' ? (
        <AdminPanel onBackToChat={() => setCurrentView('chat')} />
      ) : (
        <div className="flex-1 flex overflow-hidden relative">
          {/* ========================================================= */}
          {/* 1. COMPACT NAVIGATION RAIL (SERVERS & HOME) */}
          {/* ========================================================= */}
          {/* Desktop & Tablet: Always visible on left */}
          <div className="hidden md:flex h-full">
            <ServerRail
              servers={servers}
              activeServerId={activeServerId}
              onSelectHome={handleSelectHome}
              onSelectServer={handleSelectServer}
              onOpenNewServer={() => setIsNewServerOpen(true)}
              onOpenJoinCommunity={() => setIsJoinCommunityOpen(true)}
              unreadHomeCount={unreadHomeCount}
              serverUnreadCounts={serverUnreadCounts}
              theme={theme}
              onToggleTheme={toggleTheme}
              isAdmin={user?.isAdmin}
              onOpenAdmin={() => setCurrentView('admin')}
              currentUser={user}
              onOpenProfile={() => setIsProfileOpen(true)}
            />
          </div>

          {/* ========================================================= */}
          {/* 2. CHANNEL / SUB-NAVIGATION SIDEBAR */}
          {/* ========================================================= */}
          {/* On Mobile: Visible when no conversation is selected */}
          {/* On Tablet & Desktop: Visible as second column */}
          <div
            className={`${
              selectedConversationId ? 'hidden md:flex' : 'flex'
            } w-full md:w-60 lg:w-64 h-full shrink-0`}
          >
            <ChannelSidebar
              activeServerId={activeServerId}
              activeServer={activeServer}
              conversations={conversations}
              selectedId={selectedConversationId}
              onSelect={(id) => setSelectedConversationId(id)}
              onOpenNewChat={() => setIsNewChatOpen(true)}
              onOpenNewChannel={() => setIsCreateChannelOpen(true)}
              onOpenServerInvite={() => setIsServerInviteOpen(true)}
              onOpenCommunitySettings={() => setIsCommunitySettingsOpen(true)}
              onOpenFriends={() => setIsFriendsOpen(true)}
              onOpenInvitations={() => setIsInvitationsOpen(true)}
              pendingFriendRequestsCount={pendingFriendRequestsCount}
              pendingInvitationsCount={pendingInvitationsCount}
              currentUser={user}
              onOpenProfile={() => setIsProfileOpen(true)}
            />
          </div>

          {/* ========================================================= */}
          {/* 3. ACTIVE CHAT PANE (MAIN CONTENT) */}
          {/* ========================================================= */}
          <div
            className={`${
              !selectedConversationId ? 'hidden md:flex' : 'flex'
            } flex-1 h-full min-w-0 overflow-hidden flex-col`}
          >
            {selectedConversation ? (
              <ChatPane
                conversation={selectedConversation}
                messages={messages}
                currentUser={user}
                conversations={conversations}
                onSendMessage={handleSendMessage}
                onDeleteMessage={handleDeleteMessage}
                onToggleReaction={handleToggleReaction}
                onBackMobile={() => setSelectedConversationId(null)}
                typingUser={typingUser}
                onRefreshConversations={() => {
                  loadConversations();
                  loadServers();
                }}
                onStartCall={handleStartCall}
                isMemberListOpen={isMemberListOpen}
                onToggleMemberList={() => setIsMemberListOpen(!isMemberListOpen)}
                draftText={drafts[selectedConversation.id] || ''}
                onDraftChange={(text) => handleDraftChange(selectedConversation.id, text)}
              />
            ) : (
              <EmptyState onOpenNewChat={() => setIsNewChatOpen(true)} />
            )}
          </div>

          {/* ========================================================= */}
          {/* 4. MEMBER LIST PANEL (DESKTOP DOCKED vs TABLET/MOBILE DRAWER) */}
          {/* ========================================================= */}
          {selectedConversation && isMemberListOpen && (
            <>
              {/* Desktop View: Pinned column */}
              <div className="hidden lg:flex h-full shrink-0">
                <MemberListPanel
                  conversation={selectedConversation}
                  server={activeServer}
                  currentUser={user}
                  onInspectUser={handleInspectUser}
                  onClose={() => setIsMemberListOpen(false)}
                  onStartDirectChat={handleStartDirectChatFromMember}
                />
              </div>

              {/* Tablet & Mobile: Slide-in Drawer with Backdrop */}
              <div className="lg:hidden fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
                <div className="w-72 sm:w-80 h-full bg-[#0c0a14] shadow-2xl animate-slide-left">
                  <MemberListPanel
                    conversation={selectedConversation}
                    server={activeServer}
                    currentUser={user}
                    onInspectUser={handleInspectUser}
                    onClose={() => setIsMemberListOpen(false)}
                    isMobileOrDrawer={true}
                    onStartDirectChat={handleStartDirectChatFromMember}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* 5. MOBILE BOTTOM NAVIGATION BAR */}
      {/* ========================================================= */}
      {/* Visible only on mobile when not in active chat */}
      <div className={`md:hidden ${selectedConversationId ? 'hidden' : 'block'} border-t border-[#1f1930] bg-[#0c0a14] px-3 py-2 z-30 shrink-0`}>
        <div className="flex items-center justify-around text-xs">
          {/* Home / Chats */}
          <button
            onClick={() => handleSelectHome()}
            className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-colors ${
              activeServerId === null ? 'text-purple-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <MessageSquare className="w-5 h-5" />
              {unreadHomeCount > 0 && (
                <span className="absolute -top-1 -right-1.5 w-3.5 h-3.5 bg-pink-600 rounded-full text-[9px] text-white font-bold flex items-center justify-center">
                  {unreadHomeCount}
                </span>
              )}
            </div>
            <span className="text-[10px]">Sohbetler</span>
          </button>

          {/* Servers */}
          <button
            onClick={() => {
              if (servers.length > 0) {
                // cycle or pick first server
                handleSelectServer(servers[0].id);
              } else {
                setIsNewServerOpen(true);
              }
            }}
            className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-colors ${
              activeServerId !== null ? 'text-purple-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-5 h-5" />
            <span className="text-[10px]">Sunucular</span>
          </button>

          {/* Friends */}
          <button
            onClick={() => setIsFriendsOpen(true)}
            className="flex flex-col items-center gap-1 p-1.5 rounded-xl text-slate-400 hover:text-slate-200 transition-colors"
          >
            <div className="relative">
              <Users className="w-5 h-5" />
              {pendingFriendRequestsCount > 0 && (
                <span className="absolute -top-1 -right-1.5 w-3.5 h-3.5 bg-pink-600 rounded-full text-[9px] text-white font-bold flex items-center justify-center">
                  {pendingFriendRequestsCount}
                </span>
              )}
            </div>
            <span className="text-[10px]">Arkadaşlar</span>
          </button>

          {/* Invitations */}
          <button
            onClick={() => setIsInvitationsOpen(true)}
            className="flex flex-col items-center gap-1 p-1.5 rounded-xl text-slate-400 hover:text-slate-200 transition-colors"
          >
            <div className="relative">
              <Mail className="w-5 h-5" />
              {pendingInvitationsCount > 0 && (
                <span className="absolute -top-1 -right-1.5 w-3.5 h-3.5 bg-purple-600 rounded-full text-[9px] text-white font-bold flex items-center justify-center">
                  {pendingInvitationsCount}
                </span>
              )}
            </div>
            <span className="text-[10px]">Davetler</span>
          </button>

          {/* Profile */}
          <button
            onClick={() => setIsProfileOpen(true)}
            className="flex flex-col items-center gap-1 p-1.5 rounded-xl text-slate-400 hover:text-slate-200 transition-colors"
          >
            <UserIcon className="w-5 h-5" />
            <span className="text-[10px]">Profil</span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 6. MODALS & OVERLAYS */}
      {/* ========================================================= */}
      {/* New Direct/Group Chat Modal */}
      <NewChatModal
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
        onSelectConversation={(id) => {
          loadConversations();
          setSelectedConversationId(id);
        }}
      />

      {/* New Discord-Style Server Modal */}
      <NewServerModal
        isOpen={isNewServerOpen}
        onClose={() => setIsNewServerOpen(false)}
        onServerCreated={(server) => {
          loadServers();
          loadConversations();
          setActiveServerId(server.id);
          if (server.channels && server.channels.length > 0) {
            setSelectedConversationId(server.channels[0].id);
          }
        }}
      />

      {/* Create Channel Modal */}
      {activeServer && (
        <CreateChannelModal
          isOpen={isCreateChannelOpen}
          onClose={() => setIsCreateChannelOpen(false)}
          serverId={activeServer.id}
          serverName={activeServer.name}
          onChannelCreated={(channel) => {
            loadConversations();
            loadServers();
            setSelectedConversationId(channel.id);
          }}
        />
      )}

      {/* Server Invite Modal */}
      {isServerInviteOpen && (
        <ServerInviteModal
          isOpen={isServerInviteOpen}
          onClose={() => setIsServerInviteOpen(false)}
          serverId={activeServerId || selectedConversation?.serverId || selectedConversation?.id || ''}
          serverName={activeServer?.name || selectedConversation?.name || 'XXQ Topluluğu'}
        />
      )}

      {/* Community Settings Modal */}
      {isCommunitySettingsOpen && activeServer && (
        <CommunitySettingsModal
          isOpen={isCommunitySettingsOpen}
          onClose={() => setIsCommunitySettingsOpen(false)}
          server={activeServer}
          currentUser={user}
          onServerUpdated={(updated) => {
            setServers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
          }}
        />
      )}

      {/* Join Community Modal */}
      {isJoinCommunityOpen && (
        <JoinCommunityModal
          isOpen={isJoinCommunityOpen}
          onClose={() => setIsJoinCommunityOpen(false)}
          onJoined={(newServer) => {
            loadServers();
            loadConversations();
            handleSelectServer(newServer.id);
          }}
        />
      )}

      {/* Friends Modal */}
      <FriendsModal
        isOpen={isFriendsOpen}
        onClose={() => {
          setIsFriendsOpen(false);
          loadBadges();
        }}
        onStartDirectChat={async (targetUser: User) => {
          try {
            const res = await api.createDirectConversation(targetUser.id);
            await loadConversations();
            setActiveServerId(null);
            setSelectedConversationId(res.conversationId);
            setIsFriendsOpen(false);
          } catch (err) {
            console.error('Failed to start chat from friends:', err);
          }
        }}
      />

      {/* Group & Server Invitations Modal */}
      <InvitationsModal
        isOpen={isInvitationsOpen}
        onClose={() => {
          setIsInvitationsOpen(false);
          loadBadges();
          loadConversations();
          loadServers();
        }}
        onInvitationAccepted={(targetId: string, targetType: 'group' | 'server') => {
          loadConversations();
          loadServers();
          if (targetType === 'server') {
            handleSelectServer(targetId);
          } else {
            setActiveServerId(null);
            setSelectedConversationId(targetId);
          }
          setIsInvitationsOpen(false);
        }}
      />

      {/* Profile Edit Modal */}
      <ProfileEditModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
      />

      {/* Quick Search Modal */}
      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onSelectConversation={(id) => {
          setSelectedConversationId(id);
          setIsSearchModalOpen(false);
        }}
        onStartDirectChat={async (email) => {
          try {
            const res = await api.createDirectConversation(email);
            await loadConversations();
            setSelectedConversationId(res.conversationId);
            setIsSearchModalOpen(false);
          } catch (err) {
            console.error('Failed to start chat from search:', err);
          }
        }}
      />

      {/* Inspected User Profile Modal */}
      {inspectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
          <div className="bg-[#120f1e] border border-[#2a2244] w-full max-w-sm rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center relative">
            <button
              onClick={() => setInspectedUser(null)}
              className="absolute top-4 right-4 p-1.5 rounded-xl bg-[#1b152d] hover:bg-[#251d3e] text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-purple-500 shadow-xl shadow-purple-950/50 mb-3 bg-[#181329] flex items-center justify-center text-white font-bold text-2xl">
              <SafeAvatar
                src={inspectedUser.avatarUrl}
                alt={inspectedUser.displayName}
                className="w-full h-full object-cover"
                fallbackText={inspectedUser.displayName}
                size={80}
              />
            </div>

            <h3 className="text-base font-bold text-white mb-1">{inspectedUser.displayName}</h3>

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

            {/* Hakkımda (Bio) */}
            <div className="w-full p-3 bg-[#0c0a16] border border-[#231b36] rounded-2xl text-left mb-3">
              <span className="text-[10px] font-bold text-purple-400 block mb-1 uppercase tracking-wider">Hakkımda</span>
              <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                {inspectedUser.bio || 'Bu kullanıcı henüz hakkında bilgisi eklemedi.'}
              </p>
            </div>

            {/* Send DM button */}
            {inspectedUser.id !== user?.id && (
              <button
                onClick={() => handleStartDirectChatFromMember(inspectedUser.id)}
                className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-colors shadow-md shadow-purple-950/50 flex items-center justify-center gap-2"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Mesaj Gönder</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Incoming Call Overlay */}
      <IncomingCallModal
        incomingCall={incomingCall}
        onAccept={handleAcceptIncomingCall}
        onReject={handleRejectIncomingCall}
      />

      {/* Active Call Modal */}
      <ActiveCallModal
        callState={activeCall}
        currentUser={user}
        onEndCall={() => setActiveCall(null)}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return <AppContent />;
};

export default App;
