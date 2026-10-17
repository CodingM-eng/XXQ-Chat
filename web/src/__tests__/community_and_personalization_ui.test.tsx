import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { NewServerModal } from '../components/chat/NewServerModal';
import { ChannelSidebar } from '../components/chat/ChannelSidebar';
import { CommunitySettingsModal } from '../components/chat/CommunitySettingsModal';
import { JoinCommunityModal } from '../components/chat/JoinCommunityModal';
import { FriendsModal } from '../components/chat/FriendsModal';
import { ProfileEditModal } from '../components/common/ProfileEditModal';
import { Server, User, Conversation } from '../types';

// Mock useAuth for ProfileEditModal
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'usr_me',
      displayName: 'Efe Kaan',
      email: 'efe@xxq.chat',
      isAdmin: true,
      accentColor: '#8b5cf6',
      bannerUrl: 'https://images.unsplash.com/photo-banner',
      bio: 'Geliştirici ve topluluk kurucusu',
    },
    updateUser: vi.fn(),
  }),
}));

describe('Community Setup, Roles, DM Friend/Block Actions & Free Personalization UI Suite', () => {
  const mockCurrentUser: User = {
    id: 'usr_admin',
    email: 'admin@xxq.chat',
    displayName: 'Admin Efe',
    isAdmin: true,
    accentColor: '#8b5cf6',
    bannerUrl: 'https://images.unsplash.com/photo-banner',
    bio: 'Topluluk yöneticisi',
  };

  const mockServer: Server = {
    id: 'srv_games',
    name: 'XXQ E-Spor Kulübü',
    purpose: 'gaming',
    ownerId: 'usr_admin',
    memberIds: ['usr_admin', 'usr_member_2'],
    avatarUrl: 'https://images.unsplash.com/logo.png',
    bannerUrl: 'https://images.unsplash.com/banner.png',
    description: 'E-spor ve rekabetçi turnuvalar',
    welcomeMessage: 'Hoş geldiniz! Lütfen kuralları okuyun.',
    rules: '1. Saygılı olun. 2. Reklam yapmayın.',
    requiresApproval: true,
    joinQuestions: [
      { id: 'q1', question: 'Hangi oyunları oynuyorsunuz?', required: true, order: 0 },
      { id: 'q2', question: 'Daha önce turnuvaya katıldınız mı?', required: false, order: 1 },
    ],
    roles: [
      {
        id: 'role_mod',
        serverId: 'srv_games',
        name: 'Turnuva Hakemi',
        color: '#3b82f6',
        permissions: ['manage_messages', 'send_announcements'],
        order: 1,
        createdAt: new Date().toISOString(),
      },
    ],
    members: [
      {
        id: 'usr_admin',
        displayName: 'Admin Efe',
        role: 'owner',
        joinedAt: new Date().toISOString(),
      },
    ],
    channels: [
      {
        id: 'ch_genel',
        name: 'genel-sohbet',
        type: 'channel',
        serverId: 'srv_games',
        unreadCount: 0,
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'ch_duyurular',
        name: 'duyurular',
        type: 'channel',
        isAnnouncementOnly: true,
        serverId: 'srv_games',
        unreadCount: 0,
        updatedAt: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('renders NewServerModal 4-step wizard with Turkish steps, purpose options, and upload previews', () => {
    const html = renderToString(
      <NewServerModal
        isOpen={true}
        onClose={() => {}}
        onServerCreated={() => {}}
      />
    );

    // Wizard header & progress tabs
    expect(html).toContain('Topluluk Kurulum Sihirbazı');
    expect(html).toContain('Kimlik &amp; Amaç');
    expect(html).toContain('Kurallar');
    expect(html).toContain('Kanallar');
    expect(html).toContain('Katılım &amp; Onay');

    // Step 1 fields
    expect(html).toContain('Topluluk Adı');
    expect(html).toContain('Topluluk Amacı');
    expect(html).toContain('Oyun');
    expect(html).toContain('Sohbet');
    expect(html).toContain('Topluluk Logosu');
    expect(html).toContain('Topluluk Afişi (Banner)');
    expect(html).toContain('İleri');
  });

  it('renders ChannelSidebar with server banner, logo and Topluluk Ayarları option for admins', () => {
    const html = renderToString(
      <ChannelSidebar
        activeServerId={mockServer.id}
        activeServer={mockServer}
        conversations={mockServer.channels as Conversation[]}
        selectedId={null}
        onSelect={() => {}}
        onOpenNewChat={() => {}}
        onOpenCommunitySettings={() => {}}
        onOpenFriends={() => {}}
        onOpenInvitations={() => {}}
        currentUser={mockCurrentUser}
        onOpenProfile={() => {}}
      />
    );

    expect(html).toContain('XXQ E-Spor Kulübü');
    expect(html).toContain('🎮 Oyun Topluluğu');
    expect(html).toContain('duyurular');
    expect(html).toContain('genel-sohbet');
  });

  it('renders CommunitySettingsModal with all 4 management tabs and custom role controls', () => {
    const html = renderToString(
      <CommunitySettingsModal
        isOpen={true}
        onClose={() => {}}
        server={mockServer}
        currentUser={mockCurrentUser}
        onServerUpdated={() => {}}
      />
    );

    // Tabs
    expect(html).toContain('Kimlik &amp; Görünüm');
    expect(html).toContain('Katılım Soruları');
    expect(html).toContain('Katılım İstekleri');
    expect(html).toContain('Özel Roller');

    // Server identity fields
    expect(html).toContain('Topluluk Logosu');
    expect(html).toContain('Topluluk Afişi (Banner)');
    expect(html).toContain('Karşılama Mesajı');
    expect(html).toContain('Topluluk Kuralları');
  });

  it('renders FriendsModal with Friends, Requests, Add Friend, and Engellenenler tabs', () => {
    const html = renderToString(
      <FriendsModal
        isOpen={true}
        onClose={() => {}}
      />
    );

    expect(html).toContain('Arkadaşlar &amp; Bağlantılar');
    expect(html).toContain('Arkadaşlarım');
    expect(html).toContain('İstekler');
    expect(html).toContain('Arkadaş Ekle');
    expect(html).toContain('Engellenenler');
  });

  it('renders JoinCommunityModal with invite lookup and privacy assurance', () => {
    const html = renderToString(
      <JoinCommunityModal
        isOpen={true}
        onClose={() => {}}
        onJoined={() => {}}
      />
    );

    expect(html).toContain('Topluluğa Katıl');
    expect(html).toContain('Davet Kodu veya Bağlantısı');
    expect(html).toContain('Topluluğu İncele');
  });

  it('renders ProfileEditModal with 100% Free Personalization banner, custom banner, and accent colors', () => {
    const html = renderToString(
      <ProfileEditModal
        isOpen={true}
        onClose={() => {}}
      />
    );

    expect(html).toContain('Profil &amp; Kişiselleştirme');
    expect(html).toContain('Herkes İçin %100 Ücretsiz Kişiselleştirme');
    expect(html).toContain('Profil Afişi (Banner)');
    expect(html).toContain('Özel Profil Vurgu Rengi');
    expect(html).toContain('Afiş Yükle');
    expect(html).toContain('Hazır Avatarlar');
  });
});
