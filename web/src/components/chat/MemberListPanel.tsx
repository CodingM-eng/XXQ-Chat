import React, { useState } from 'react';
import { Conversation, Server, User } from '../../types';
import {
  Users,
  Crown,
  Shield,
  Search,
  X,
  MessageCircle,
  Heart,
  User as UserIcon,
} from 'lucide-react';
import { SafeAvatar } from '../common/SafeAvatar';

interface MemberListPanelProps {
  conversation: Conversation;
  server?: Server | null;
  currentUser: User | null;
  onInspectUser: (userId: string) => void;
  onClose?: () => void;
  isMobileOrDrawer?: boolean;
  onStartDirectChat?: (userId: string) => void;
}

export const MemberListPanel: React.FC<MemberListPanelProps> = ({
  conversation,
  server,
  currentUser,
  onInspectUser,
  onClose,
  isMobileOrDrawer = false,
  onStartDirectChat,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Collect member entries from server or conversation participants
  type MemberItem = {
    id: string;
    displayName: string;
    avatarUrl?: string | null;
    role?: 'owner' | 'admin' | 'moderator' | 'member';
    customTag?: string | null;
    isAdmin?: boolean;
    isFamily?: boolean;
    isModerator?: boolean;
    isOnline?: boolean;
  };

  let members: MemberItem[] = [];

  if (server && server.members && server.members.length > 0) {
    members = server.members.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      avatarUrl: m.avatarUrl,
      role: m.role || (m.id === server.ownerId ? 'owner' : 'member'),
      customTag: m.customTag,
      isAdmin: m.role === 'admin' || m.role === 'owner',
      isModerator: m.role === 'moderator',
      isOnline: true,
    }));
  } else if (conversation.participants && conversation.participants.length > 0) {
    members = conversation.participants.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl,
      role: p.role || (p.isAdmin ? 'admin' : 'member'),
      customTag: p.customTag,
      isAdmin: p.isAdmin,
      isModerator: p.role === 'moderator',
      isOnline: true,
    }));
  } else if (conversation.peer) {
    members = [
      {
        id: conversation.peer.id,
        displayName: conversation.peer.displayName,
        avatarUrl: conversation.peer.avatarUrl,
        role: 'member',
        isOnline: true,
      },
      ...(currentUser
        ? [
            {
              id: currentUser.id,
              displayName: currentUser.displayName,
              avatarUrl: currentUser.avatarUrl,
              role: 'member' as const,
              isOnline: true,
            },
          ]
        : []),
    ];
  }

  // Filter members by search
  const filtered = members.filter((m) =>
    m.displayName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group members into categories
  const owners = filtered.filter(
    (m) => m.role === 'owner' || (server && m.id === server.ownerId) || (conversation.creatorId && m.id === conversation.creatorId)
  );

  const moderatorsAndAdmins = filtered.filter(
    (m) =>
      !owners.some((o) => o.id === m.id) &&
      (m.role === 'admin' || m.role === 'moderator' || m.isAdmin || m.isModerator)
  );

  const regularMembers = filtered.filter(
    (m) => !owners.some((o) => o.id === m.id) && !moderatorsAndAdmins.some((a) => a.id === m.id)
  );

  const renderMemberRow = (member: MemberItem) => {
    const isMe = member.id === currentUser?.id;

    return (
      <div
        key={member.id}
        onClick={() => onInspectUser(member.id)}
        className="w-full flex items-center justify-between p-2 rounded-2xl hover:bg-[#161226] cursor-pointer transition-all group relative border border-transparent hover:border-purple-900/30"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Avatar with Status Dot */}
          <div className="relative shrink-0">
            <div className="w-9 h-9 rounded-xl bg-purple-900/50 flex items-center justify-center font-bold text-white text-xs overflow-hidden border border-purple-500/30">
              <SafeAvatar
                src={member.avatarUrl}
                alt={member.displayName}
                fallbackText={member.displayName.slice(0, 2).toUpperCase()}
                fallbackIcon={<UserIcon className="w-4 h-4 text-purple-200" />}
                className="w-full h-full object-cover"
              />
            </div>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#0c0a14]" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-200 group-hover:text-purple-200 truncate">
                {member.displayName}
              </span>
              {isMe && (
                <span className="text-[9px] text-purple-400 font-mono">(Sen)</span>
              )}
            </div>

            {/* Custom Tag or Role Badge */}
            <div className="flex items-center gap-1 mt-0.5">
              {member.customTag ? (
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-purple-950/80 text-purple-300 border border-purple-800/50 truncate max-w-[120px]">
                  {member.customTag}
                </span>
              ) : member.role === 'owner' || (server && member.id === server.ownerId) ? (
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-amber-950/80 text-amber-300 border border-amber-800/50 flex items-center gap-1">
                  <Crown className="w-2.5 h-2.5" />
                  <span>Sahip</span>
                </span>
              ) : member.role === 'admin' || member.isAdmin ? (
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-indigo-950/80 text-indigo-300 border border-indigo-800/50 flex items-center gap-1">
                  <Shield className="w-2.5 h-2.5" />
                  <span>Yönetici</span>
                </span>
              ) : member.role === 'moderator' || member.isModerator ? (
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-blue-950/80 text-blue-300 border border-blue-800/50">
                  Moderatör
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Quick Message Trigger on Hover */}
        {!isMe && onStartDirectChat && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStartDirectChat(member.id);
            }}
            className="p-1.5 text-slate-500 hover:text-purple-300 hover:bg-[#231a3d] rounded-xl opacity-0 group-hover:opacity-100 transition-all shrink-0"
            title={`${member.displayName} kullanıcısına mesaj gönder`}
          >
            <MessageCircle className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  };

  return (
    <aside
      aria-label="Üye Listesi Paneli"
      className="w-full md:w-60 lg:w-64 bg-[#0c0a14] border-l border-[#1f1930] flex flex-col h-full select-none shrink-0"
    >
      {/* Header */}
      <div className="p-3.5 border-b border-[#241c38] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-purple-400" />
          <h3 className="text-xs font-bold text-slate-200">
            Üyeler — {members.length}
          </h3>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-[#1a142c] transition-colors"
            title="Paneli Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Member Search */}
      <div className="p-2.5 border-b border-[#201833]">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Üyelerde ara..."
            className="w-full bg-[#120f1e] border border-[#261d3d] rounded-xl pl-8 pr-2.5 py-1.5 text-[11px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-purple-500 transition-all"
          />
        </div>
      </div>

      {/* Categorized Member List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3 custom-scrollbar">
        {/* 1. Owners */}
        {owners.length > 0 && (
          <div>
            <div className="px-2 py-1 text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
              <Crown className="w-3 h-3" />
              <span>Sunucu / Grup Sahibi — {owners.length}</span>
            </div>
            <div className="space-y-0.5">
              {owners.map(renderMemberRow)}
            </div>
          </div>
        )}

        {/* 2. Admins & Moderators */}
        {moderatorsAndAdmins.length > 0 && (
          <div>
            <div className="px-2 py-1 text-[10px] font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1">
              <Shield className="w-3 h-3" />
              <span>Yöneticiler & Moderatörler — {moderatorsAndAdmins.length}</span>
            </div>
            <div className="space-y-0.5">
              {moderatorsAndAdmins.map(renderMemberRow)}
            </div>
          </div>
        )}

        {/* 3. Members */}
        {regularMembers.length > 0 && (
          <div>
            <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Çevrim İçi Üyeler — {regularMembers.length}
            </div>
            <div className="space-y-0.5">
              {regularMembers.map(renderMemberRow)}
            </div>
          </div>
        )}

        {filtered.length === 0 && (
          <div className="py-8 text-center text-slate-500 text-xs">
            Eşleşen üye bulunamadı
          </div>
        )}
      </div>
    </aside>
  );
};
