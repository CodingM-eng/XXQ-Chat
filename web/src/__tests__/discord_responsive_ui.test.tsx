import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ServerRail } from '../components/chat/ServerRail';
import { ChannelSidebar } from '../components/chat/ChannelSidebar';
import { MemberListPanel } from '../components/chat/MemberListPanel';
import { CreateChannelModal } from '../components/chat/CreateChannelModal';
import { Server, Conversation, User } from '../types';

describe('Discord-Inspired Responsive UI Suite', () => {
  const mockUser: User = {
    id: 'user_test_1',
    email: 'test@example.com',
    displayName: 'Efe Kaan',
    avatarUrl: null,
    isAdmin: true,
  };

  const mockServer: Server = {
    id: 'server_game_1',
    name: 'XXQ Oyun Topluluğu',
    purpose: 'gaming',
    ownerId: 'user_test_1',
    memberIds: ['user_test_1', 'user_member_2'],
    channels: [
      {
        id: 'ch_announcements',
        name: 'duyurular',
        type: 'channel',
        isAnnouncementOnly: true,
        serverId: 'server_game_1',
        unreadCount: 0,
        updatedAt: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 'ch_general',
        name: 'genel-sohbet',
        type: 'channel',
        isAnnouncementOnly: false,
        serverId: 'server_game_1',
        unreadCount: 3,
        updatedAt: new Date(Date.now() - 1800000).toISOString(),
      },
    ],
    members: [
      {
        id: 'user_test_1',
        displayName: 'Efe Kaan',
        role: 'owner',
        customTag: 'Oyun Lideri',
        joinedAt: new Date().toISOString(),
      },
      {
        id: 'user_member_2',
        displayName: 'Ahmet Yılmaz',
        role: 'member',
        joinedAt: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockConversations: Conversation[] = [
    {
      id: 'conv_dm_1',
      name: 'Zeynep Kaya',
      type: 'direct',
      unreadCount: 2,
      peer: {
        id: 'user_zeynep',
        displayName: 'Zeynep Kaya',
        email: 'zeynep@example.com',
      },
      lastMessage: {
        id: 'm1',
        senderId: 'user_zeynep',
        senderName: 'Zeynep Kaya',
        content: 'Selam, nasılsın?',
        status: 'sent',
        createdAt: new Date(Date.now() - 600000).toISOString(),
      },
      updatedAt: new Date(Date.now() - 600000).toISOString(),
    },
    {
      id: 'conv_grp_1',
      name: 'Yazılım Grubu',
      type: 'group',
      unreadCount: 0,
      participants: [
        {
          id: 'user_test_1',
          displayName: 'Efe Kaan',
          email: 'test@example.com',
          isAdmin: true,
        },
      ],
      lastMessage: {
        id: 'm2',
        senderId: 'user_test_1',
        senderName: 'Efe Kaan',
        content: 'Yeni versiyon yayında!',
        status: 'delivered',
        createdAt: new Date(Date.now() - 1200000).toISOString(),
      },
      updatedAt: new Date(Date.now() - 1200000).toISOString(),
    },
    ...mockServer.channels!,
  ];

  it('renders ServerRail with Home pill, active servers, add server, and admin button', () => {
    const html = renderToString(
      <ServerRail
        servers={[mockServer]}
        activeServerId={null}
        onSelectHome={() => {}}
        onSelectServer={() => {}}
        onOpenNewServer={() => {}}
        unreadHomeCount={2}
        serverUnreadCounts={{ [mockServer.id]: 3 }}
        isAdmin={true}
        onOpenAdmin={() => {}}
        currentUser={mockUser}
      />
    );

    expect(html).toContain('Ana Sayfa');
    expect(html).toContain('XXQ Oyun Topluluğu');
    expect(html).toContain('Yeni Topluluk / Sunucu Oluştur');
    expect(html).toContain('Platform Yönetim Paneli');
    expect(html).toContain('2'); // unread badge for home
    expect(html).toContain('3'); // unread badge for server
  });

  it('renders ChannelSidebar in Home Mode with friends, invites, and direct message list', () => {
    const html = renderToString(
      <ChannelSidebar
        activeServerId={null}
        conversations={mockConversations}
        selectedId={'conv_dm_1'}
        onSelect={() => {}}
        onOpenNewChat={() => {}}
        onOpenFriends={() => {}}
        onOpenInvitations={() => {}}
        pendingFriendRequestsCount={4}
        pendingInvitationsCount={1}
        currentUser={mockUser}
        onOpenProfile={() => {}}
      />
    );

    expect(html).toContain('Sohbetlerde ara');
    expect(html).toContain('Arkadaşlar');
    expect(html).toContain('4'); // 4 pending friend requests
    expect(html).toContain('Grup ve Davetler');
    expect(html).toContain('1'); // 1 pending invite
    expect(html).toContain('Direkt Mesajlar &amp; Gruplar');
    expect(html).toContain('Zeynep Kaya');
    expect(html).toContain('Selam, nasılsın?');
    expect(html).toContain('Yazılım Grubu');
    expect(html).toContain('Efe Kaan'); // current user bar
  });

  it('renders ChannelSidebar in Server Mode with announcements and text channels', () => {
    const html = renderToString(
      <ChannelSidebar
        activeServerId={mockServer.id}
        activeServer={mockServer}
        conversations={mockConversations}
        selectedId={'ch_general'}
        onSelect={() => {}}
        onOpenNewChat={() => {}}
        onOpenFriends={() => {}}
        onOpenInvitations={() => {}}
        currentUser={mockUser}
        onOpenProfile={() => {}}
      />
    );

    expect(html).toContain('XXQ Oyun Topluluğu');
    expect(html).toContain('Oyun Topluluğu');
    expect(html).toContain('Duyuru &amp; Kurallar');
    expect(html).toContain('duyurular');
    expect(html).toContain('Metin Kanalları');
    expect(html).toContain('genel-sohbet');
  });

  it('renders MemberListPanel with categorized roles and custom tag labels', () => {
    const html = renderToString(
      <MemberListPanel
        conversation={mockServer.channels![1]}
        server={mockServer}
        currentUser={mockUser}
        onInspectUser={() => {}}
      />
    );

    expect(html).toContain('Üyeler');
    expect(html).toContain('Sunucu / Grup Sahibi');
    expect(html).toContain('Efe Kaan');
    expect(html).toContain('Oyun Lideri'); // Custom tag
    expect(html).toContain('Ahmet Yılmaz');
    expect(html).toContain('(Sen)');
  });

  it('renders CreateChannelModal with Metin Kanalı and Duyuru Kanalı options', () => {
    const html = renderToString(
      <CreateChannelModal
        isOpen={true}
        onClose={() => {}}
        serverId={mockServer.id}
        serverName={mockServer.name}
        onChannelCreated={() => {}}
      />
    );

    expect(html).toContain('Yeni Kanal Oluştur');
    expect(html).toContain('Metin Kanalı');
    expect(html).toContain('Duyuru Kanalı');
    expect(html).toContain('yeni-kanal');
    expect(html).toContain('Kanalı Oluştur');
  });
});
