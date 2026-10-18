import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Server, ServerCustomRole, ServerPermission, ServerJoinQuestion, MembershipInvitation, User } from '../../types';
import { SafeAvatar } from '../common/SafeAvatar';
import { toSafeImageUrl } from '../../utils/sanitizeSvg';
import {
  X,
  Settings,
  Shield,
  HelpCircle,
  Users,
  Image as ImageIcon,
  Upload,
  Trash2,
  Plus,
  Check,
  ChevronUp,
  ChevronDown,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Palette,
  Sparkles,
} from 'lucide-react';

interface CommunitySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  server: Server;
  currentUser: User | null;
  onServerUpdated: (updatedServer: Server) => void;
}

const AVAILABLE_PERMISSIONS: { key: ServerPermission; title: string; desc: string }[] = [
  { key: 'manage_server', title: 'Topluluğu Yönet', desc: 'Sunucu adı, açıklaması, logosu, afişi ve katılım sorularını düzenleyebilir.' },
  { key: 'manage_roles', title: 'Rolleri Yönet', desc: 'Özel roller oluşturabilir, düzenleyebilir ve üyelere atayabilir.' },
  { key: 'manage_channels', title: 'Kanalları Yönet', desc: 'Yeni metin ve duyuru kanalları oluşturabilir veya silebilir.' },
  { key: 'manage_messages', title: 'Mesajları Denetle', desc: 'Kullanıcıların mesajlarını ve uygunsuz içerikleri silebilir.' },
  { key: 'send_announcements', title: 'Duyuru Gönder', desc: 'Salt okunur duyuru kanallarına mesaj ve duyuru gönderebilir.' },
  { key: 'kick_members', title: 'Üyeleri Çıkar', desc: 'Kuralları ihlal eden üyeleri topluluktan çıkarabilir.' },
  { key: 'view_audit_logs', title: 'Kayıtları Gör', desc: 'Topluluk içi rol ve ayar denetim kayıtlarını inceleyebilir.' },
];

const PRESET_COLORS = [
  '#9333ea', // Purple
  '#a855f7', // Light Purple
  '#3b82f6', // Blue
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#f43f5e', // Rose
  '#ec4899', // Pink
  '#64748b', // Slate
];

export const CommunitySettingsModal: React.FC<CommunitySettingsModalProps> = ({
  isOpen,
  onClose,
  server,
  currentUser,
  onServerUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'identity' | 'questions' | 'requests' | 'roles'>('identity');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Tab 1: Identity State
  const [name, setName] = useState(server.name || '');
  const [description, setDescription] = useState(server.description || '');
  const [rules, setRules] = useState(server.rules || '');
  const [welcomeMessage, setWelcomeMessage] = useState(server.welcomeMessage || '');
  const [avatarUrl, setAvatarUrl] = useState(server.avatarUrl || '');
  const [bannerUrl, setBannerUrl] = useState(server.bannerUrl || '');
  const [savingIdentity, setSavingIdentity] = useState(false);

  // Tab 2: Join Questions State
  const [questions, setQuestions] = useState<ServerJoinQuestion[]>(server.joinQuestions || []);
  const [requiresApproval, setRequiresApproval] = useState(!!server.requiresApproval);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionRequired, setNewQuestionRequired] = useState(true);
  const [savingQuestions, setSavingQuestions] = useState(false);

  // Tab 3: Join Requests State
  const [joinRequests, setJoinRequests] = useState<MembershipInvitation[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Tab 4: Roles State
  const [roles, setRoles] = useState<ServerCustomRole[]>(server.roles || []);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleColor, setRoleColor] = useState('#9333ea');
  const [rolePermissions, setRolePermissions] = useState<ServerPermission[]>([]);
  const [savingRole, setSavingRole] = useState(false);

  // Member role assignment state
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [selectedMemberRoles, setSelectedMemberRoles] = useState<string[]>([]);
  const [savingMemberRoles, setSavingMemberRoles] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(server.name || '');
      setDescription(server.description || '');
      setRules(server.rules || '');
      setWelcomeMessage(server.welcomeMessage || '');
      setAvatarUrl(server.avatarUrl || '');
      setBannerUrl(server.bannerUrl || '');
      setQuestions(server.joinQuestions || []);
      setRequiresApproval(!!server.requiresApproval);
      loadServerRoles();
      loadJoinRequests();
    }
  }, [isOpen, server.id]);

  const loadServerRoles = async () => {
    try {
      setLoadingRoles(true);
      const res = await api.getServerRoles(server.id);
      setRoles(res.roles || []);
    } catch {
      // Ignore background error
    } finally {
      setLoadingRoles(false);
    }
  };

  const loadJoinRequests = async () => {
    try {
      setLoadingRequests(true);
      const res = await api.getServerJoinRequests(server.id);
      setJoinRequests(res.requests || []);
    } catch {
      // Ignore background error
    } finally {
      setLoadingRequests(false);
    }
  };

  if (!isOpen) return null;

  // Handle Identity Save
  const handleSaveIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Sunucu adı boş bırakılamaz.');
      return;
    }

    try {
      setSavingIdentity(true);
      setError(null);
      const res = await api.updateServer(server.id, {
        name: name.trim(),
        description: description.trim() || null,
        rules: rules.trim() || null,
        welcomeMessage: welcomeMessage.trim() || null,
        avatarUrl: toSafeImageUrl(avatarUrl.trim()) || null,
        bannerUrl: toSafeImageUrl(bannerUrl.trim()) || null,
      });
      setSuccessMsg('Topluluk kimlik bilgileri güncellendi.');
      onServerUpdated(res.server);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Kimlik bilgileri güncellenemedi.');
    } finally {
      setSavingIdentity(false);
    }
  };

  // Logo upload
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setError(null);
      const res = await api.uploadServerLogo(server.id, file);
      setAvatarUrl(res.avatarUrl);
      onServerUpdated(res.server);
      setSuccessMsg('Topluluk logosu yüklendi.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Logo yüklenemedi.');
    }
  };

  const handleRemoveLogo = async () => {
    try {
      setError(null);
      const res = await api.removeServerLogo(server.id);
      setAvatarUrl('');
      onServerUpdated(res.server);
      setSuccessMsg('Logo kaldırıldı.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Logo kaldırılamadı.');
    }
  };

  // Banner upload
  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setError(null);
      const res = await api.uploadServerBanner(server.id, file);
      setBannerUrl(res.bannerUrl);
      onServerUpdated(res.server);
      setSuccessMsg('Topluluk afişi yüklendi.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Afiş yüklenemedi.');
    }
  };

  const handleRemoveBanner = async () => {
    try {
      setError(null);
      const res = await api.removeServerBanner(server.id);
      setBannerUrl('');
      onServerUpdated(res.server);
      setSuccessMsg('Afiş kaldırıldı.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Afiş kaldırılamadı.');
    }
  };

  // Questions management
  const handleAddQuestion = () => {
    if (!newQuestionText.trim()) return;
    const newQ: ServerJoinQuestion = {
      id: 'q_' + Date.now().toString(36),
      question: newQuestionText.trim(),
      required: newQuestionRequired,
      order: questions.length,
    };
    setQuestions([...questions, newQ]);
    setNewQuestionText('');
  };

  const handleRemoveQuestion = (id: string) => {
    setQuestions(questions.filter((q) => q.id !== id).map((q, idx) => ({ ...q, order: idx })));
  };

  const handleMoveQuestion = (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= questions.length) return;
    const copy = [...questions];
    const [moved] = copy.splice(idx, 1);
    copy.splice(targetIdx, 0, moved);
    setQuestions(copy.map((q, i) => ({ ...q, order: i })));
  };

  const handleSaveQuestions = async () => {
    try {
      setSavingQuestions(true);
      setError(null);
      const res = await api.setServerQuestions(server.id, questions, requiresApproval);
      onServerUpdated(res.server);
      setSuccessMsg('Katılım soruları ve onay ayarları kaydedildi.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Sorular kaydedilemedi.');
    } finally {
      setSavingQuestions(false);
    }
  };

  // Join Requests Resolve
  const handleResolveRequest = async (requestId: string, action: 'approve' | 'reject') => {
    try {
      setResolvingId(requestId);
      setError(null);
      await api.resolveServerJoinRequest(server.id, requestId, action);
      setJoinRequests((prev) => prev.filter((r) => r.id !== requestId));
      setSuccessMsg(action === 'approve' ? 'Katılım isteği onaylandı ve üye eklendi.' : 'Katılım isteği reddedildi.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'İstek işlenirken hata oluştu.');
    } finally {
      setResolvingId(null);
    }
  };

  // Roles CRUD
  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleName.trim()) {
      setError('Rol adı gereklidir.');
      return;
    }

    try {
      setSavingRole(true);
      setError(null);
      if (editingRoleId) {
        await api.updateServerRole(server.id, editingRoleId, {
          name: roleName.trim(),
          color: roleColor,
          permissions: rolePermissions,
        });
        setSuccessMsg('Rol başarıyla güncellendi.');
      } else {
        await api.createServerRole(server.id, {
          name: roleName.trim(),
          color: roleColor,
          permissions: rolePermissions,
          order: roles.length,
        });
        setSuccessMsg('Yeni rol oluşturuldu.');
      }
      setRoleName('');
      setRolePermissions([]);
      setEditingRoleId(null);
      await loadServerRoles();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Rol kaydedilemedi.');
    } finally {
      setSavingRole(false);
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!window.confirm('Bu rolü silmek istediğinize emin misiniz?')) return;
    try {
      setError(null);
      await api.deleteServerRole(server.id, roleId);
      await loadServerRoles();
      setSuccessMsg('Rol silindi.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Rol silinemedi.');
    }
  };

  const handleSaveMemberRoles = async () => {
    if (!selectedMemberId) return;
    try {
      setSavingMemberRoles(true);
      setError(null);
      const res = await api.assignServerMemberRoles(server.id, selectedMemberId, selectedMemberRoles);
      onServerUpdated(res.server);
      setSuccessMsg('Üye rolleri güncellendi.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Üye rolleri atanamadı.');
    } finally {
      setSavingMemberRoles(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in select-none">
      <div className="bg-[#120f1e] border border-[#2a2244] w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#241c38] flex items-center justify-between bg-gradient-to-r from-purple-950/40 via-[#120f1e] to-[#120f1e]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-900/60 border border-purple-700/50 flex items-center justify-center text-purple-300">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Topluluk ve Sunucu Ayarları</h2>
              <p className="text-[11px] text-slate-400">{server.name} — Kimlik, Katılım Soruları, İstekler & Roller</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#1b152d] hover:bg-[#251d3e] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-3 pb-2 border-b border-[#241c38] bg-[#0d0a17] text-xs overflow-x-auto custom-scrollbar">
          <button
            onClick={() => setActiveTab('identity')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl font-semibold transition-all shrink-0 ${
              activeTab === 'identity'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                : 'text-slate-400 hover:text-white hover:bg-[#181329]'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Kimlik & Görünüm</span>
          </button>

          <button
            onClick={() => setActiveTab('questions')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl font-semibold transition-all shrink-0 ${
              activeTab === 'questions'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                : 'text-slate-400 hover:text-white hover:bg-[#181329]'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Katılım Soruları ({questions.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('requests')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl font-semibold transition-all shrink-0 relative ${
              activeTab === 'requests'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                : 'text-slate-400 hover:text-white hover:bg-[#181329]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Katılım İstekleri</span>
            {joinRequests.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-pink-600 text-white text-[10px] font-bold">
                {joinRequests.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('roles')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl font-semibold transition-all shrink-0 ${
              activeTab === 'roles'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                : 'text-slate-400 hover:text-white hover:bg-[#181329]'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Özel Roller ({roles.length})</span>
          </button>
        </div>

        {/* Modal Alerts */}
        <div className="px-6 pt-3">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* TAB 1: IDENTITY */}
          {activeTab === 'identity' && (
            <form onSubmit={handleSaveIdentity} className="space-y-5">
              {/* Logo & Banner Section */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Logo Box */}
                <div className="p-4 bg-[#0d0a17] border border-[#241c38] rounded-2xl space-y-3">
                  <label className="block text-slate-300 font-bold">Topluluk Logosu</label>
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-2xl border-2 border-purple-500 bg-[#171128] overflow-hidden flex items-center justify-center text-white text-lg font-bold shrink-0 shadow-md">
                      <SafeAvatar
                        src={avatarUrl}
                        alt="Logo"
                        className="w-full h-full object-cover"
                        fallbackText={name}
                        size={64}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs cursor-pointer transition-colors shadow-sm">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Resim Yükle</span>
                        <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                      </label>
                      {avatarUrl && (
                        <button
                          type="button"
                          onClick={handleRemoveLogo}
                          className="block text-[11px] text-red-400 hover:text-red-300 transition-colors"
                        >
                          Logoyu Kaldır
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1">veya Resim URL'si:</span>
                    <input
                      type="text"
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full px-3 py-1.5 bg-[#140f24] border border-[#241c38] rounded-xl text-white placeholder-slate-500 text-xs"
                    />
                  </div>
                </div>

                {/* Banner Box */}
                <div className="p-4 bg-[#0d0a17] border border-[#241c38] rounded-2xl space-y-3">
                  <label className="block text-slate-300 font-bold">Topluluk Afişi (Banner)</label>
                  <div className="w-full h-16 rounded-xl border border-purple-500/60 bg-[#171128] overflow-hidden flex items-center justify-center text-slate-400 relative">
                    {toSafeImageUrl(bannerUrl) ? (
                      <img
                        src={toSafeImageUrl(bannerUrl)!}
                        alt="Banner"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className="text-[11px]">Afiş Eklenmedi</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs cursor-pointer transition-colors shadow-sm">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Afiş Yükle</span>
                      <input type="file" accept="image/*" onChange={handleBannerUpload} className="hidden" />
                    </label>
                    {bannerUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveBanner}
                        className="text-[11px] text-red-400 hover:text-red-300 transition-colors"
                      >
                        Afişi Kaldır
                      </button>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1">veya Afiş URL'si:</span>
                    <input
                      type="text"
                      value={bannerUrl}
                      onChange={(e) => setBannerUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full px-3 py-1.5 bg-[#140f24] border border-[#241c38] rounded-xl text-white placeholder-slate-500 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Name & Description */}
              <div className="space-y-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Topluluk Adı</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#0b0914] border border-[#241c38] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Açıklama</label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Topluluk hakkında özet bilgi..."
                    className="w-full px-3.5 py-2 bg-[#0b0914] border border-[#241c38] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Karşılama Mesajı</label>
                  <textarea
                    rows={2}
                    value={welcomeMessage}
                    onChange={(e) => setWelcomeMessage(e.target.value)}
                    placeholder="Yeni katılan üyelere gösterilecek sıcak bir hoş geldin mesajı..."
                    className="w-full px-3.5 py-2 bg-[#0b0914] border border-[#241c38] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Topluluk Kuralları</label>
                  <textarea
                    rows={3}
                    value={rules}
                    onChange={(e) => setRules(e.target.value)}
                    placeholder="1. Saygılı ve yapıcı dil kullanın&#10;2. Spam ve izinsiz reklam yapmayın&#10;3. Gizlilik kurallarına uyun"
                    className="w-full px-3.5 py-2 bg-[#0b0914] border border-[#241c38] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingIdentity}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-purple-950/50 transition-all disabled:opacity-50"
                >
                  {savingIdentity ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Değişiklikleri Kaydet</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: JOIN QUESTIONS */}
          {activeTab === 'questions' && (
            <div className="space-y-5">
              {/* Approval Policy Switch */}
              <div className="p-4 bg-[#0d0a17] border border-[#241c38] rounded-2xl flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-white">Yönetici Onayı Zorunluluğu</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Yeni üyeler davet linkiyle geldiğinde doğrudan katılmak yerine soruları yanıtlayıp onay beklesin.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requiresApproval}
                    onChange={(e) => setRequiresApproval(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-[#211a36] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>

              {/* Add New Question */}
              <div className="p-4 bg-[#0d0a17] border border-[#241c38] rounded-2xl space-y-3">
                <h4 className="font-bold text-white flex items-center gap-2">
                  <Plus className="w-4 h-4 text-purple-400" />
                  <span>Yeni Katılım Sorusu Ekle</span>
                </h4>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={newQuestionText}
                    onChange={(e) => setNewQuestionText(e.target.value)}
                    placeholder="Örn: Bu topluluğa katılma amacınız nedir?"
                    className="flex-1 px-3.5 py-2.5 bg-[#140f24] border border-[#241c38] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 text-xs"
                  />
                  <label className="flex items-center gap-2 text-slate-300 px-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newQuestionRequired}
                      onChange={(e) => setNewQuestionRequired(e.target.checked)}
                      className="rounded border-[#241c38] text-purple-600 focus:ring-0"
                    />
                    <span>Zorunlu Soru</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleAddQuestion}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shrink-0 transition-colors"
                  >
                    Ekle
                  </button>
                </div>
              </div>

              {/* Configured Questions List */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-300">Mevcut Katılım Soruları ({questions.length})</h4>
                {questions.length === 0 ? (
                  <p className="text-slate-500 italic p-4 text-center bg-[#0d0a17] rounded-xl border border-[#1e172e]">
                    Henüz soru tanımlanmadı. Katılmak isteyenlere soru sormak için yukarıdan ekleyin.
                  </p>
                ) : (
                  questions.map((q, idx) => (
                    <div
                      key={q.id}
                      className="p-3 bg-[#0d0a17] border border-[#241c38] rounded-2xl flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-6 h-6 rounded-lg bg-[#1e1732] text-purple-300 flex items-center justify-center font-mono font-bold text-xs shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-white font-semibold truncate">{q.question}</p>
                          <span className={`text-[10px] font-bold ${q.required ? 'text-amber-400' : 'text-slate-400'}`}>
                            {q.required ? '★ Yanıtlanması Zorunlu' : 'İsteğe Bağlı'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleMoveQuestion(idx, -1)}
                          disabled={idx === 0}
                          className="p-1.5 rounded-lg bg-[#161129] hover:bg-[#251d3e] text-slate-300 disabled:opacity-30"
                          title="Yukarı Taşı"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveQuestion(idx, 1)}
                          disabled={idx === questions.length - 1}
                          className="p-1.5 rounded-lg bg-[#161129] hover:bg-[#251d3e] text-slate-300 disabled:opacity-30"
                          title="Aşağı Taşı"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveQuestion(q.id)}
                          className="p-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400"
                          title="Soruyu Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSaveQuestions}
                  disabled={savingQuestions}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-purple-950/50 transition-all disabled:opacity-50"
                >
                  {savingQuestions ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Soruları & Politikayı Kaydet</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: JOIN REQUESTS */}
          {activeTab === 'requests' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-white">Bekleyen Katılım İstekleri ({joinRequests.length})</h4>
                <button
                  type="button"
                  onClick={loadJoinRequests}
                  className="text-xs text-purple-400 hover:text-purple-300 font-semibold"
                >
                  Yenile
                </button>
              </div>

              {loadingRequests ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                </div>
              ) : joinRequests.length === 0 ? (
                <div className="p-8 text-center bg-[#0d0a17] border border-[#241c38] rounded-2xl text-slate-400">
                  <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="font-semibold text-white">Şu an bekleyen katılım isteği bulunmuyor.</p>
                  <p className="text-[11px] mt-1">Yeni adaylar katılım isteği gönderdiğinde cevaplarıyla birlikte burada listelenecektir.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {joinRequests.map((req) => (
                    <div
                      key={req.id}
                      className="p-4 bg-[#0d0a17] border border-[#241c38] rounded-2xl space-y-3 animate-fade-in"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-purple-900/60 border border-purple-700/50 flex items-center justify-center text-white font-bold text-xs">
                            {req.userDisplayName.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <h5 className="font-bold text-white text-xs">{req.userDisplayName}</h5>
                            <span className="text-[10px] text-slate-400">
                              Başvuru: {new Date(req.createdAt).toLocaleString('tr-TR')}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={resolvingId === req.id}
                            onClick={() => handleResolveRequest(req.id, 'reject')}
                            className="px-3 py-1.5 bg-red-950/60 hover:bg-red-900 text-red-300 font-bold rounded-xl text-xs transition-colors border border-red-800/60"
                          >
                            Reddet
                          </button>
                          <button
                            type="button"
                            disabled={resolvingId === req.id}
                            onClick={() => handleResolveRequest(req.id, 'approve')}
                            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-colors shadow-sm"
                          >
                            Kabul Et
                          </button>
                        </div>
                      </div>

                      {/* Candidate Answers (Private to admins/mods) */}
                      {req.answers && Object.keys(req.answers).length > 0 ? (
                        <div className="p-3 bg-[#130f21] border border-[#231b36] rounded-xl space-y-2">
                          <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block">
                            Adayın Katılım Cevapları:
                          </span>
                          {Object.entries(req.answers).map(([qId, ans]) => {
                            const questionObj = questions.find((q) => q.id === qId);
                            const qText = questionObj?.question || qId;
                            return (
                              <div key={qId} className="text-[11px] border-b border-[#1c152e] pb-1.5 last:border-0 last:pb-0">
                                <span className="font-semibold text-slate-300 block">{qText}</span>
                                <p className="text-slate-100 mt-0.5 whitespace-pre-wrap">{ans}</p>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-500 italic">Cevaplanan soru bulunmuyor.</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ROLES */}
          {activeTab === 'roles' && (
            <div className="space-y-6">
              {/* Notice */}
              <div className="p-3 rounded-2xl bg-indigo-950/20 border border-indigo-800/40 text-[11px] text-indigo-300 leading-relaxed">
                <Sparkles className="w-3.5 h-3.5 inline mr-1 text-indigo-400" />
                Topluluk rolleri yalnızca bu sunucu içinde geçerlidir. Platform yönetici izinlerinden tamamen ayrıdır.
              </div>

              {/* Role Creation / Editing Form */}
              <form onSubmit={handleSaveRole} className="p-4 bg-[#0d0a17] border border-[#241c38] rounded-2xl space-y-4">
                <h4 className="font-bold text-white flex items-center justify-between">
                  <span>{editingRoleId ? 'Rolü Düzenle' : 'Yeni Özel Rol Oluştur'}</span>
                  {editingRoleId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRoleId(null);
                        setRoleName('');
                        setRolePermissions([]);
                      }}
                      className="text-[11px] text-slate-400 hover:text-white"
                    >
                      İptal Et
                    </button>
                  )}
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Rol Adı</label>
                    <input
                      type="text"
                      required
                      value={roleName}
                      onChange={(e) => setRoleName(e.target.value)}
                      placeholder="Örn: Oyun Moderatörü, VIP, Etkinlik Sorumlusu"
                      className="w-full px-3 py-2 bg-[#140f24] border border-[#241c38] rounded-xl text-white placeholder-slate-500 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Rol Rengi</label>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {PRESET_COLORS.map((c) => (
                          <div
                            key={c}
                            onClick={() => setRoleColor(c)}
                            style={{ backgroundColor: c }}
                            className={`w-6 h-6 rounded-lg cursor-pointer transition-transform ${
                              roleColor === c ? 'scale-110 ring-2 ring-white' : 'hover:scale-105'
                            }`}
                          />
                        ))}
                      </div>
                      <input
                        type="color"
                        value={roleColor}
                        onChange={(e) => setRoleColor(e.target.value)}
                        className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-transparent"
                      />
                    </div>
                  </div>
                </div>

                {/* Permissions checkboxes */}
                <div>
                  <label className="block text-slate-300 font-bold mb-2">Rol Yetkileri & İzinleri</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {AVAILABLE_PERMISSIONS.map((perm) => {
                      const isChecked = rolePermissions.includes(perm.key);
                      return (
                        <label
                          key={perm.key}
                          className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                            isChecked
                              ? 'bg-purple-950/40 border-purple-500 text-white'
                              : 'bg-[#120f21] border-[#221a36] text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setRolePermissions([...rolePermissions, perm.key]);
                              } else {
                                setRolePermissions(rolePermissions.filter((p) => p !== perm.key));
                              }
                            }}
                            className="mt-0.5 rounded border-[#241c38] text-purple-600 focus:ring-0"
                          />
                          <div>
                            <h5 className="font-bold text-xs">{perm.title}</h5>
                            <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{perm.desc}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={savingRole}
                    className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-purple-950/50 transition-all disabled:opacity-50"
                  >
                    {savingRole ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    <span>{editingRoleId ? 'Rolü Güncelle' : 'Rolü Oluştur'}</span>
                  </button>
                </div>
              </form>

              {/* Roles List */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-300">Sunucu Rolleri ({roles.length})</h4>
                {roles.length === 0 ? (
                  <p className="text-slate-500 italic p-4 text-center bg-[#0d0a17] rounded-xl border border-[#1e172e]">
                    Henüz özel rol oluşturulmadı.
                  </p>
                ) : (
                  roles.map((r) => (
                    <div
                      key={r.id}
                      className="p-3 bg-[#0d0a17] border border-[#241c38] rounded-2xl flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-4 h-4 rounded-full shrink-0"
                          style={{ backgroundColor: r.color }}
                        />
                        <div className="min-w-0">
                          <h5 className="font-bold text-white text-xs truncate">{r.name}</h5>
                          <span className="text-[10px] text-slate-400">
                            {r.permissions.length} yetki tanımlı
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRoleId(r.id);
                            setRoleName(r.name);
                            setRoleColor(r.color);
                            setRolePermissions(r.permissions);
                          }}
                          className="px-2.5 py-1 bg-[#1e1732] hover:bg-[#2b2148] text-purple-300 font-semibold rounded-lg text-xs transition-colors"
                        >
                          Düzenle
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRole(r.id)}
                          className="p-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 transition-colors"
                          title="Rolü Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Member Role Assignment Section */}
              {server.members && server.members.length > 0 && roles.length > 0 && (
                <div className="p-4 bg-[#0d0a17] border border-[#241c38] rounded-2xl space-y-3">
                  <h4 className="font-bold text-white">Üyeye Rol Ata</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 font-semibold mb-1">Üye Seçin</label>
                      <select
                        value={selectedMemberId || ''}
                        onChange={(e) => {
                          const mId = e.target.value;
                          setSelectedMemberId(mId);
                          const targetM = server.members?.find((m) => m.id === mId);
                          setSelectedMemberRoles(targetM?.roleIds || []);
                        }}
                        className="w-full px-3 py-2 bg-[#140f24] border border-[#241c38] rounded-xl text-white text-xs"
                      >
                        <option value="">Üye Seçiniz...</option>
                        {server.members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.displayName} ({m.role})
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedMemberId && (
                      <div>
                        <label className="block text-slate-400 font-semibold mb-1">Atanacak Roller</label>
                        <div className="flex flex-wrap gap-1.5 p-2 bg-[#140f24] border border-[#241c38] rounded-xl max-h-32 overflow-y-auto">
                          {roles.map((r) => {
                            const isAssigned = selectedMemberRoles.includes(r.id);
                            return (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => {
                                  if (isAssigned) {
                                    setSelectedMemberRoles(selectedMemberRoles.filter((id) => id !== r.id));
                                  } else {
                                    setSelectedMemberRoles([...selectedMemberRoles, r.id]);
                                  }
                                }}
                                style={{
                                  borderColor: r.color,
                                  backgroundColor: isAssigned ? r.color : 'transparent',
                                }}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                                  isAssigned ? 'text-white' : 'text-slate-300'
                                }`}
                              >
                                {r.name} {isAssigned && '✓'}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {selectedMemberId && (
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={handleSaveMemberRoles}
                        disabled={savingMemberRoles}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl flex items-center gap-2 transition-all disabled:opacity-50"
                      >
                        {savingMemberRoles ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        <span>Rolleri Ata</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
