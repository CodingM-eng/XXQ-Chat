import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './context/AuthContext';
import { api } from './services/api';
import { connectSocket, disconnectSocket, getSocket } from './services/socket';
import { Conversation, Message } from './types';
import { Header } from './components/common/Header';
import { Sidebar } from './components/chat/Sidebar';
import { ChatPane } from './components/chat/ChatPane';
import { EmptyState } from './components/chat/EmptyState';
import { NewChatModal } from './components/chat/NewChatModal';
import { AdminPanel } from './components/admin/AdminPanel';
import { AuthModal } from './components/auth/AuthModal';
import { AccessRestricted } from './components/auth/AccessRestricted';
import { OnboardingModal } from './components/auth/OnboardingModal';
import { BrandLogo } from './components/common/BrandLogo';
import { Loader2 } from 'lucide-react';

export const AppContent: React.FC = () => {
  const { user, whitelist, isLoading, refreshSession } = useAuth();
  const [currentView, setCurrentView] = useState<'chat' | 'admin'>('chat');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);

  // Keep a ref to the selected conversation so socket listeners always see the current ID
  const selectedConvIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedConvIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

  // Load conversations
  const loadConversations = useCallback(async () => {
    try {
      const res = await api.getConversations();
      setConversations(res.conversations);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  }, []);

  // Load messages for selected conversation
  const loadMessages = useCallback(async (convId: string) => {
    try {
      const res = await api.getMessages(convId);
      setMessages(res.messages);
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  }, []);

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

      // Update sidebar conversation preview
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === newMsg.conversationId);
        if (!exists) {
          // If conversation is not in sidebar list yet, reload to fetch complete details
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

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

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

    socket.on('auth:revoked', () => {
      refreshSession();
    });

    loadConversations();

    return () => {
      disconnectSocket();
    };
  }, [user?.id, whitelist?.isApproved, whitelist?.modeActive, loadConversations, refreshSession]);

  // Load messages when conversation selection changes
  useEffect(() => {
    if (selectedConversationId) {
      loadMessages(selectedConversationId);
      setTypingUser(null);

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
        const searchInput = document.querySelector('input[placeholder*="Sohbetlerde ara"]') as HTMLInputElement;
        searchInput?.focus();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setIsNewChatOpen(true);
      } else if (e.key === 'Escape') {
        setIsNewChatOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSendMessage = async (
    content: string,
    clientMessageId?: string,
    replyToMessageId?: string,
    forwardedFrom?: { senderName: string },
    attachments?: any[]
  ) => {
    if (!selectedConversationId) return;

    const socket = getSocket();
    const clientMsgId =
      clientMessageId ||
      'client_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);

    // Optimistic message update
    const replyTarget = replyToMessageId ? messages.find((m) => m.id === replyToMessageId) : null;
    const optimisticMsg: Message = {
      id: 'opt_' + Date.now(),
      conversationId: selectedConversationId,
      senderId: user!.id,
      senderName: user!.displayName,
      senderAvatar: user!.avatarUrl,
      clientMessageId: clientMsgId,
      content,
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
        attachments
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

  return (
    <div className="h-screen w-screen flex flex-col bg-[#07050d] overflow-hidden text-slate-100 font-sans">
      {/* Top Header */}
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

      {/* Main Content Area */}
      {currentView === 'admin' ? (
        <AdminPanel onBackToChat={() => setCurrentView('chat')} />
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Responsive Sidebar */}
          <div className={`${selectedConversationId ? 'hidden md:flex' : 'flex'} w-full md:w-auto h-full`}>
            <Sidebar
              conversations={conversations}
              selectedId={selectedConversationId}
              onSelect={(id) => setSelectedConversationId(id)}
              onOpenNewChat={() => setIsNewChatOpen(true)}
              currentUser={user}
            />
          </div>

          {/* Active Chat or Empty Screen */}
          <div className={`${!selectedConversationId ? 'hidden md:flex' : 'flex'} flex-1 h-full`}>
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
                onRefreshConversations={loadConversations}
              />
            ) : (
              <EmptyState onOpenNewChat={() => setIsNewChatOpen(true)} />
            )}
          </div>
        </div>
      )}

      {/* New Direct/Group Chat Modal */}
      <NewChatModal
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
        onSelectConversation={(id) => {
          loadConversations();
          setSelectedConversationId(id);
        }}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return <AppContent />;
};

export default App;
