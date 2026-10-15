import React, { useState, useEffect, useCallback } from 'react';
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
import { BrandLogo } from './components/common/BrandLogo';
import { Loader2 } from 'lucide-react';

export const AppContent: React.FC = () => {
  const { user, whitelist, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState<'chat' | 'admin'>('chat');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);

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

  // Setup Socket connection when user is authenticated
  useEffect(() => {
    if (!user || (whitelist?.modeActive && !whitelist.isApproved)) {
      disconnectSocket();
      return;
    }

    const socket = connectSocket((newMsg: Message) => {
      // Append to active message thread if conversation matches
      setMessages((prev) => {
        if (newMsg.conversationId === selectedConversationId) {
          // Deduplicate if already present
          if (prev.some((m) => m.id === newMsg.id || (newMsg.clientMessageId && m.clientMessageId === newMsg.clientMessageId))) {
            return prev.map((m) => m.clientMessageId === newMsg.clientMessageId ? newMsg : m);
          }
          return [...prev, newMsg];
        }
        return prev;
      });

      // Update sidebar conversation preview
      setConversations((prev) =>
        prev.map((c) => {
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
              unreadCount: newMsg.conversationId === selectedConversationId ? 0 : c.unreadCount + 1,
              updatedAt: newMsg.createdAt,
            };
          }
          return c;
        }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      );
    });

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('typing:status', (data: { conversationId: string; userName: string; isTyping: boolean }) => {
      if (data.conversationId === selectedConversationId) {
        setTypingUser(data.isTyping ? data.userName : null);
      }
    });

    socket.on('message:read_receipt', (data: { conversationId: string; messageId: string }) => {
      if (data.conversationId === selectedConversationId) {
        setMessages((prev) =>
          prev.map((m) => m.id === data.messageId ? { ...m, status: 'read' } : m)
        );
      }
    });

    loadConversations();

    return () => {
      disconnectSocket();
    };
  }, [user, whitelist, selectedConversationId, loadConversations]);

  // Load messages when conversation selection changes
  useEffect(() => {
    if (selectedConversationId) {
      loadMessages(selectedConversationId);
      setTypingUser(null);
    } else {
      setMessages([]);
    }
  }, [selectedConversationId, loadMessages]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        // Focus search input
        const searchInput = document.querySelector('input[placeholder*="Search chats"]') as HTMLInputElement;
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

  const handleSendMessage = async (content: string, clientMessageId?: string) => {
    if (!selectedConversationId) return;

    const socket = getSocket();
    if (socket && socket.connected) {
      // Optimistic message update
      const optimisticMsg: Message = {
        id: 'opt_' + Date.now(),
        conversationId: selectedConversationId,
        senderId: user!.id,
        senderName: user!.displayName,
        senderAvatar: user!.avatarUrl,
        clientMessageId,
        content,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      socket.emit('message:send', {
        conversationId: selectedConversationId,
        content,
        clientMessageId,
      }, (res: any) => {
        if (res?.success && res.message) {
          setMessages((prev) =>
            prev.map((m) => m.clientMessageId === clientMessageId ? res.message : m)
          );
        }
      });
    } else {
      // REST fallback
      const res = await api.sendMessage(selectedConversationId, content, clientMessageId);
      setMessages((prev) => [...prev, res.message]);
    }
  };

  // 1. Loading screen
  if (isLoading) {
    return (
      <div className="min-h-screen bg-chat-bg flex flex-col items-center justify-center p-4">
        <BrandLogo size={64} showText={false} className="animate-pulse mb-4" />
        <Loader2 className="w-6 h-6 animate-spin text-brand-400 mb-2" />
        <span className="text-xs text-slate-400 font-mono tracking-wider">INITIALIZING SECURE SESSION...</span>
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

  const selectedConversation = conversations.find((c) => c.id === selectedConversationId);

  return (
    <div className="h-screen w-screen flex flex-col bg-chat-bg overflow-hidden text-slate-100 font-sans">
      {/* Top Header */}
      <Header
        currentView={currentView}
        onNavigate={(view) => setCurrentView(view)}
        isConnected={isConnected}
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
                onSendMessage={handleSendMessage}
                onBackMobile={() => setSelectedConversationId(null)}
                typingUser={typingUser}
              />
            ) : (
              <EmptyState onOpenNewChat={() => setIsNewChatOpen(true)} />
            )}
          </div>
        </div>
      )}

      {/* New Direct Chat Modal */}
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
