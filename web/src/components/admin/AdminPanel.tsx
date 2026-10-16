import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import {
  AdminStats,
  WhitelistItem,
  AuditLog,
  PendingRequest,
  User,
  DriveAccount,
  TelegramBot,
  TelegramCommandConfig,
  SupportReport,
  DriveStatus,
} from '../../types';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Users,
  MessageSquare,
  Search,
  UserPlus,
  Trash2,
  AlertTriangle,
  Loader2,
  CheckCircle,
  X,
  UserCheck,
  Clock,
  RefreshCw,
  HardDrive,
  Bot,
  Plus,
  ExternalLink,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  HelpCircle,
} from 'lucide-react';

interface AdminPanelProps {
  onBackToChat: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onBackToChat }) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [whitelistMode, setWhitelistMode] = useState<boolean>(true);
  const [whitelist, setWhitelist] = useState<WhitelistItem[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [moderators, setModerators] = useState<User[]>([]);
  const [driveAccounts, setDriveAccounts] = useState<DriveAccount[]>([]);
  const [telegramBots, setTelegramBots] = useState<TelegramBot[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [supportReports, setSupportReports] = useState<SupportReport[]>([]);
  const [driveStatus, setDriveStatus] = useState<DriveStatus | null>(null);
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState<'pending' | 'whitelist' | 'moderators' | 'drive' | 'telegram' | 'audit' | 'reports'>('pending');

  // Search & input states
  const [searchQuery, setSearchQuery] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [approvingEmail, setApprovingEmail] = useState<string | null>(null);

  // Confirmation Modals
  const [confirmToggleModal, setConfirmToggleModal] = useState<boolean>(false);
  const [userToRevoke, setUserToRevoke] = useState<string | null>(null);

  // Drive Connect Modal
  const [driveModalOpen, setDriveModalOpen] = useState(false);
  const [driveAuthUrl, setDriveAuthUrl] = useState<string | null>(null);
  const [driveAuthCode, setDriveAuthCode] = useState('');
  const [driveConnecting, setDriveConnecting] = useState(false);

  // Telegram Connect Modal
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);
  const [telegramToken, setTelegramToken] = useState('');
  const [customCommandInput, setCustomCommandInput] = useState({ command: '', response: '', description: '' });
  const [customCommandsList, setCustomCommandsList] = useState<TelegramCommandConfig[]>([]);
  const [telegramConnecting, setTelegramConnecting] = useState(false);

  // Moderator Assign Modal
  const [moderatorModalOpen, setModeratorModalOpen] = useState(false);
  const [selectedUserIdForMod, setSelectedUserIdForMod] = useState('');

  useEffect(() => {
    loadAdminData();
  }, []);

  const loadAdminData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [statusRes, whitelistRes, pendingRes, logsRes, modsRes, driveRes, botsRes, usersRes, reportsRes, driveStatusRes] = await Promise.all([
        api.getAdminStatus(),
        api.getWhitelist(),
        api.getPendingRequests().catch(() => ({ pendingRequests: [] })),
        api.getAuditLogs(50).catch(() => ({ auditLogs: [] })),
        api.getModerators().catch(() => ({ moderators: [] })),
        api.getDriveAccounts().catch(() => ({ accounts: [] })),
        api.getTelegramBots().catch(() => ({ bots: [] })),
        api.getAdminUsers().catch(() => ({ users: [] })),
        api.getSupportReports(50).catch(() => ({ reports: [] })),
        api.getDriveStatus().catch(() => null),
      ]);

      setStats(statusRes.stats);
      setWhitelistMode(statusRes.whitelistMode);
      setWhitelist(whitelistRes.whitelist || []);
      setPendingRequests(pendingRes.pendingRequests || []);
      setAuditLogs(logsRes.auditLogs || []);
      setModerators(modsRes.moderators || []);
      setDriveAccounts(driveRes.accounts || []);
      setTelegramBots(botsRes.bots || []);
      setAllUsers(usersRes.users || []);
      setSupportReports(reportsRes.reports || []);
      setDriveStatus(driveStatusRes);
    } catch (err: any) {
      setError(err.message || 'Yönetim verileri yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleWhitelist = async () => {
    try {
      setIsSubmitting(true);
      const newMode = !whitelistMode;
      const res = await api.toggleWhitelist(newMode);
      setWhitelistMode(res.whitelistMode);
      setConfirmToggleModal(false);
      setSuccessMsg(`Beyaz liste modu başarıyla ${res.whitelistMode ? 'ETKİNLEŞTİRİLDİ' : 'DEVRE DIŞI BIRAKILDI'}`);
      loadAdminData();
    } catch (err: any) {
      setError(err.message || 'Beyaz liste modu değiştirilemedi');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddWhitelist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setError(null);
      await api.addWhitelist(newEmail.trim());
      setSuccessMsg(`${newEmail} başarıyla onaylandı ve beyaz listeye eklendi`);
      setNewEmail('');
      loadAdminData();
    } catch (err: any) {
      setError(err.message || 'Hesap onaylanamadı');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprovePending = async (email: string) => {
    try {
      setApprovingEmail(email);
      setError(null);
      await api.approvePendingRequest(email);
      setSuccessMsg(`${email} kullanıcısının erişim talebi onaylandı ve beyaz listeye eklendi`);
      loadAdminData();
    } catch (err: any) {
      setError(err.message || 'Erişim talebi onaylanırken bir hata oluştu');
    } finally {
      setApprovingEmail(null);
    }
  };

  const handleRevokeWhitelist = async () => {
    if (!userToRevoke || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setError(null);
      await api.removeWhitelist(userToRevoke);
      setSuccessMsg(`${userToRevoke} için beyaz liste erişimi kaldırıldı`);
      setUserToRevoke(null);
      loadAdminData();
    } catch (err: any) {
      setError(err.message || 'Beyaz liste erişimi kaldırılamadı');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Moderator Handlers
  const handleAssignModerator = async (userId: string) => {
    try {
      setIsSubmitting(true);
      const res = await api.addModerator(userId);
      setSuccessMsg(res.message);
      setModeratorModalOpen(false);
      setSelectedUserIdForMod('');
      loadAdminData();
    } catch (err: any) {
      setError(err.message || 'Moderatör yetkisi verilemedi');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokeModerator = async (userId: string) => {
    try {
      setIsSubmitting(true);
      const res = await api.removeModerator(userId);
      setSuccessMsg(res.message);
      loadAdminData();
    } catch (err: any) {
      setError(err.message || 'Moderatör yetkisi kaldırılamadı');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Drive Handlers
  const handleOpenDriveConnect = async () => {
    try {
      setDriveModalOpen(true);
      setDriveConnecting(false);
      const res = await api.getDriveAuthUrl();
      setDriveAuthUrl(res.authUrl);
    } catch (err: any) {
      setError(err.message || 'Google Drive yetkilendirme bağlantısı oluşturulamadı.');
    }
  };

  const handleCompleteDriveConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driveAuthCode.trim() || driveConnecting) return;

    try {
      setDriveConnecting(true);
      setError(null);
      const res = await api.connectDrive(driveAuthCode.trim());
      setSuccessMsg(res.message);
      setDriveModalOpen(false);
      setDriveAuthCode('');
      loadAdminData();
    } catch (err: any) {
      setError(err.message || 'Drive hesabı bağlanamadı');
    } finally {
      setDriveConnecting(false);
    }
  };

  const handleRemoveDrive = async (id: string) => {
    if (!confirm('Bu Google Drive hesabının bağlantısını kaldırmak istediğinizden emin misiniz?')) return;
    try {
      await api.removeDriveAccount(id);
      setSuccessMsg('Google Drive hesabı başarıyla kaldırıldı.');
      loadAdminData();
    } catch (err: any) {
      setError(err.message || 'Drive hesabı silinemedi');
    }
  };

  const handleSyncDriveQuota = async (id: string) => {
    try {
      setSyncingAccountId(id);
      const res = await api.syncDriveAccountQuota(id);
      setSuccessMsg(res.message || 'Drive kotası başarıyla eşitlendi.');
      loadAdminData();
    } catch (err: any) {
      setError(err.message || 'Drive kotası eşitlenemedi.');
    } finally {
      setSyncingAccountId(null);
    }
  };

  const handleUpdateReportStatus = async (id: string, status: 'open' | 'investigating' | 'resolved') => {
    try {
      await api.updateSupportReportStatus(id, status);
      setSuccessMsg('Bildirim durumu güncellendi.');
      loadAdminData();
    } catch (err: any) {
      setError(err.message || 'Bildirim durumu güncellenemedi.');
    }
  };

  // Telegram Handlers
  const handleAddTelegramBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!telegramToken.trim() || telegramConnecting) return;

    try {
      setTelegramConnecting(true);
      setError(null);
      const res = await api.addTelegramBot(telegramToken.trim(), customCommandsList);
      setSuccessMsg(res.message);
      setTelegramModalOpen(false);
      setTelegramToken('');
      setCustomCommandsList([]);
      loadAdminData();
    } catch (err: any) {
      setError(err.message || 'Telegram botu eklenemedi');
    } finally {
      setTelegramConnecting(false);
    }
  };

  const handleToggleTelegramBot = async (id: string, currentStatus: boolean) => {
    try {
      await api.toggleTelegramBot(id, !currentStatus);
      loadAdminData();
    } catch (err: any) {
      setError(err.message || 'Bot durumu güncellenemedi');
    }
  };

  const handleDeleteTelegramBot = async (id: string, username: string) => {
    if (!confirm(`@${username} botunu silmek istediğinizden emin misiniz?`)) return;
    try {
      await api.deleteTelegramBot(id);
      setSuccessMsg(`@${username} botu silindi.`);
      loadAdminData();
    } catch (err: any) {
      setError(err.message || 'Bot silinemedi');
    }
  };

  const formatBytes = (bytes?: number | null) => {
    if (!bytes || bytes === 0) return '0 MB';
    const gigabytes = bytes / (1024 * 1024 * 1024);
    if (gigabytes >= 1) return `${gigabytes.toFixed(2)} GB`;
    const megabytes = bytes / (1024 * 1024);
    return `${megabytes.toFixed(1)} MB`;
  };

  const filteredWhitelist = whitelist.filter(
    (item) =>
      item.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.display_name && item.display_name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="flex-1 overflow-y-auto bg-[#090710] p-4 sm:p-6 lg:p-8 animate-fade-in text-slate-100">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#241c38]">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-purple-900/60 border border-purple-700/50 flex items-center justify-center text-purple-300 shadow-md shadow-purple-950/50">
                <Shield className="w-5 h-5 text-purple-400" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Yönetim & Güvenlik Paneli</h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Erişim kontrolünü yapılandırın, Google Drive ve Telegram entegrasyonlarını yönetin, moderatörleri atayın.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadAdminData}
              disabled={loading}
              className="px-3 py-2 bg-[#141021] hover:bg-[#1f1833] text-slate-300 text-xs font-semibold rounded-xl border border-[#2a2042] flex items-center gap-1.5 transition-colors"
              title="Verileri Yenile"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Yenile</span>
            </button>
            <button
              onClick={onBackToChat}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-purple-950/50 transition-colors"
            >
              ← Sohbete Dön
            </button>
          </div>
        </div>

        {/* Notifications */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-center justify-between animate-fade-in">
            <span>{error}</span>
            <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
          </div>
        )}

        {successMsg && (
          <div className="p-4 rounded-2xl bg-emerald-950/70 border border-emerald-800 text-emerald-200 text-xs flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)}><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* KPI / Status Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Whitelist Status Switcher Card */}
          <div className="p-5 rounded-2xl bg-[#120e20] border border-[#261d3d] flex flex-col justify-between shadow-lg shadow-black/40">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Beyaz Liste Modu</span>
              {whitelistMode ? (
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              ) : (
                <ShieldAlert className="w-5 h-5 text-amber-400" />
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className={`text-base font-bold ${whitelistMode ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {whitelistMode ? 'Etkin (Güvenli)' : 'Devre Dışı'}
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {whitelistMode ? 'Sadece onaylı hesaplar girebilir' : 'Herkes giriş yapabilir'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmToggleModal(true)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  whitelistMode ? 'bg-purple-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                    whitelistMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Pending Requests Card */}
          <div
            onClick={() => setActiveTab('pending')}
            className={`p-5 rounded-2xl bg-[#120e20] border cursor-pointer transition-all flex flex-col justify-between shadow-lg shadow-black/40 ${
              activeTab === 'pending' ? 'border-purple-500 ring-1 ring-purple-500/40' : 'border-[#261d3d] hover:border-purple-700/60'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Bekleyen Talepler</span>
              <Clock className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <span className="text-3xl font-extrabold text-white">{pendingRequests.length}</span>
              <p className="text-[11px] text-slate-400 mt-1">Onay bekleyen hesaplar</p>
            </div>
          </div>

          {/* Drive & Telegram Integration Card */}
          <div
            onClick={() => setActiveTab('drive')}
            className={`p-5 rounded-2xl bg-[#120e20] border cursor-pointer transition-all flex flex-col justify-between shadow-lg shadow-black/40 ${
              activeTab === 'drive' ? 'border-purple-500 ring-1 ring-purple-500/40' : 'border-[#261d3d] hover:border-purple-700/60'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Drive Depolama</span>
              <HardDrive className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <span className="text-2xl font-bold text-white">
                {driveAccounts.length > 0 ? `${driveAccounts.length} Hesap Bağlı` : 'Bağlı Değil'}
              </span>
              <p className="text-[11px] text-slate-400 mt-1">Bulut ek dosya alanı</p>
            </div>
          </div>

          {/* Telegram Bots Card */}
          <div
            onClick={() => setActiveTab('telegram')}
            className={`p-5 rounded-2xl bg-[#120e20] border cursor-pointer transition-all flex flex-col justify-between shadow-lg shadow-black/40 ${
              activeTab === 'telegram' ? 'border-purple-500 ring-1 ring-purple-500/40' : 'border-[#261d3d] hover:border-purple-700/60'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Telegram Botu</span>
              <Bot className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <span className="text-2xl font-bold text-white">
                {telegramBots.filter((b) => b.isEnabled).length} Aktif Bot
              </span>
              <p className="text-[11px] text-slate-400 mt-1">Webhook ve bildirimler</p>
            </div>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-2 border-b border-[#241c38] pb-3 text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'pending'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                : 'bg-[#120e20] text-slate-400 hover:text-white border border-[#241c38]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Bekleyen Talepler</span>
            {pendingRequests.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-extrabold border border-amber-500/30">
                {pendingRequests.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('whitelist')}
            className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'whitelist'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                : 'bg-[#120e20] text-slate-400 hover:text-white border border-[#241c38]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Beyaz Liste ({whitelist.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('moderators')}
            className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'moderators'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                : 'bg-[#120e20] text-slate-400 hover:text-white border border-[#241c38]'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Moderatörler ({moderators.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('drive')}
            className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'drive'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                : 'bg-[#120e20] text-slate-400 hover:text-white border border-[#241c38]'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Google Drive</span>
          </button>

          <button
            onClick={() => setActiveTab('telegram')}
            className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'telegram'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                : 'bg-[#120e20] text-slate-400 hover:text-white border border-[#241c38]'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Telegram Botları</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'audit'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                : 'bg-[#120e20] text-slate-400 hover:text-white border border-[#241c38]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Denetim Günlüğü</span>
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'reports'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                : 'bg-[#120e20] text-slate-400 hover:text-white border border-[#241c38]'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Sorun Bildirimleri</span>
            {supportReports.filter((r) => r.status === 'open').length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-extrabold border border-rose-500/30">
                {supportReports.filter((r) => r.status === 'open').length}
              </span>
            )}
          </button>
        </div>

        {/* TAB 1: PENDING REQUESTS */}
        {activeTab === 'pending' && (
          <div className="bg-[#120e20] border border-[#261d3d] rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#201834]">
              <div>
                <h2 className="text-base font-bold text-white">Erişim Onayı Bekleyen Hesaplar</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Giriş yapmaya çalışan ancak beyaz listede henüz onaylanmamış kullanıcılar.
                </p>
              </div>
            </div>

            {pendingRequests.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <Clock className="w-10 h-10 mx-auto mb-2 text-slate-600" />
                <p className="text-sm font-semibold text-slate-400">Bekleyen erişim talebi bulunmuyor.</p>
                <p className="text-xs text-slate-500 mt-1">Yeni bir kullanıcı giriş yaptığında burada listelenecektir.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#201834]">
                {pendingRequests.map((req) => (
                  <div key={req.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-purple-950 border border-purple-800 flex items-center justify-center font-bold text-purple-300 text-xs">
                        {req.displayName?.charAt(0) || req.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-white">{req.displayName || req.email}</span>
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-bold border border-amber-500/20">
                            {req.attemptCount} deneme
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">{req.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleApprovePending(req.email)}
                        disabled={approvingEmail === req.email}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
                      >
                        {approvingEmail === req.email ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <UserCheck className="w-3.5 h-3.5" />
                        )}
                        <span>Onayla ve İzin Ver</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: WHITELIST */}
        {activeTab === 'whitelist' && (
          <div className="bg-[#120e20] border border-[#261d3d] rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#201834]">
              <div>
                <h2 className="text-base font-bold text-white">Beyaz Liste Erişim İzinleri</h2>
                <p className="text-xs text-slate-400 mt-0.5">XXQ Chat sistemine erişimine izin verilen kullanıcılar.</p>
              </div>

              {/* Add form */}
              <form onSubmit={handleAddWhitelist} className="flex items-center gap-2">
                <input
                  type="email"
                  placeholder="ornek@alanadi.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="px-3 py-2 bg-[#1b152d] border border-[#2d2247] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  required
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Ekle</span>
                </button>
              </form>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="E-posta veya isim ile ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-[#171126] border border-[#2a1f42] rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* List */}
            <div className="divide-y divide-[#201834]">
              {filteredWhitelist.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">Aramayla eşleşen onaylı hesap bulunamadı.</div>
              ) : (
                filteredWhitelist.map((item) => (
                  <div key={item.email} className="py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-950 border border-purple-800 flex items-center justify-center font-bold text-purple-300 text-xs">
                        {item.display_name?.charAt(0) || item.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-white">{item.display_name || item.email}</span>
                          {item.is_admin === 1 && (
                            <span className="px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 text-[10px] font-bold border border-purple-800">
                              Yönetici
                            </span>
                          )}
                          {item.is_moderator === 1 && (
                            <span className="px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 text-[10px] font-bold border border-indigo-800">
                              Moderatör
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400">{item.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {item.is_admin !== 1 && (
                        <button
                          onClick={() => setUserToRevoke(item.email)}
                          className="p-1.5 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 rounded-lg transition-colors"
                          title="Erişimi Kaldır"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 3: MODERATORS */}
        {activeTab === 'moderators' && (
          <div className="bg-[#120e20] border border-[#261d3d] rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#201834]">
              <div>
                <h2 className="text-base font-bold text-white">Moderatör Yönetimi</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Mesajları denetleyebilen ve sohbetleri yönetebilen moderatör yetkilileri.
                </p>
              </div>

              <button
                onClick={() => setModeratorModalOpen(true)}
                className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Moderatör Ata</span>
              </button>
            </div>

            {moderators.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <ShieldCheck className="w-10 h-10 mx-auto mb-2 text-slate-600" />
                <p className="text-sm font-semibold text-slate-400">Atanmış özel moderatör bulunmuyor.</p>
                <p className="text-xs text-slate-500 mt-1">Yöneticiler varsayılan olarak moderatör yetkisine sahiptir.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#201834]">
                {moderators.map((mod) => (
                  <div key={mod.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-950 border border-indigo-800 flex items-center justify-center font-bold text-indigo-300 text-xs">
                        {mod.displayName?.charAt(0) || mod.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-white">{mod.displayName || mod.email}</span>
                          <span className="px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 text-[10px] font-bold border border-indigo-800">
                            Moderatör
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">{mod.email}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleRevokeModerator(mod.id)}
                      className="px-3 py-1 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 rounded-xl text-xs font-semibold transition-colors"
                    >
                      Yetkiyi Kaldır
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: GOOGLE DRIVE */}
        {activeTab === 'drive' && (
          <div className="bg-[#120e20] border border-[#261d3d] rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#201834]">
              <div>
                <h2 className="text-base font-bold text-white">Google Drive Depolama Entegrasyonu</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sohbet ek dosyaları (resim, belge, video) bağlı Google Drive hesabındaki özel 'XXQ Chat' klasöründe saklanır.
                </p>
              </div>

              <button
                onClick={handleOpenDriveConnect}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors shadow-md shadow-purple-950/50"
              >
                <Plus className="w-4 h-4" />
                <span>Drive Ekle</span>
              </button>
            </div>

            {/* Drive Configuration Warning/Info */}
            {driveStatus && !driveStatus.isConfigured ? (
              <div className="p-4 bg-amber-950/40 border border-amber-800/60 rounded-2xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <p className="font-bold text-amber-300">Google Drive OAuth Yapılandırması Eksik</p>
                  <p className="text-amber-200/80 leading-relaxed">
                    Render ortam değişkenlerinde <code>GOOGLE_DRIVE_CLIENT_ID</code> ve <code>GOOGLE_DRIVE_CLIENT_SECRET</code> anahtarlarının tanımlanması gerekmektedir.
                    Google Cloud Console üzerinden OAuth 2.0 Client ID oluşturup Yetkili Yönlendirme URI olarak <code>{driveStatus.redirectUri || 'https://xxq-chat-backend.onrender.com/api/drive/callback'}</code> adresini ekleyin.
                  </p>
                </div>
              </div>
            ) : driveStatus?.isConfigured ? (
              <div className="p-3 bg-emerald-950/30 border border-emerald-800/50 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-emerald-300 font-semibold">Google OAuth 2.0 API Yapılandırması Aktif</span>
                </div>
                <span className="text-[11px] font-mono text-slate-400 truncate max-w-sm">{driveStatus.redirectUri}</span>
              </div>
            ) : null}

            {driveAccounts.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <HardDrive className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                <p className="text-sm font-semibold text-slate-400">Henüz bağlı Google Drive hesabı yok.</p>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Dosya eklerinin (görseller, belgeler) güvenle saklanabilmesi için "Drive Ekle" butonuna tıklayarak bir Google hesabı bağlayın.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {driveAccounts.map((acc) => {
                  const used = acc.spaceUsed || 0;
                  const total = acc.spaceTotal || 15 * 1024 * 1024 * 1024;
                  const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

                  return (
                    <div key={acc.id} className="p-5 rounded-2xl bg-[#171126] border border-[#2d2247] space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-800/60 flex items-center justify-center text-cyan-300">
                            <HardDrive className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-white">{acc.displayName || 'Google Drive'}</span>
                              <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 text-[10px] font-bold border border-emerald-800">
                                Aktif Depolama
                              </span>
                            </div>
                            <p className="text-xs text-slate-400">{acc.email}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSyncDriveQuota(acc.id)}
                            disabled={syncingAccountId === acc.id}
                            className="px-3 py-1.5 bg-[#251d3e] hover:bg-[#322754] text-slate-200 border border-[#3b2d63] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 text-purple-400 ${syncingAccountId === acc.id ? 'animate-spin' : ''}`} />
                            <span>Kotayı Eşitle</span>
                          </button>
                          <button
                            onClick={() => handleRemoveDrive(acc.id)}
                            className="px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 rounded-xl text-xs font-semibold transition-colors"
                          >
                            Bağlantıyı Kaldır
                          </button>
                        </div>
                      </div>

                      {/* Quota Bar */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Kullanılan Alan</span>
                          <span className="text-slate-200 font-mono">
                            {formatBytes(acc.spaceUsed)} / {formatBytes(acc.spaceTotal)} (%{percent})
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-[#201834] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-500"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-500">
                          En az ayrıcalıklı <code>drive.file</code> kapsamı ile sadece XXQ Chat tarafından yüklenen dosyalar yönetilir.
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: TELEGRAM BOTS */}
        {activeTab === 'telegram' && (
          <div className="bg-[#120e20] border border-[#261d3d] rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#201834]">
              <div>
                <h2 className="text-base font-bold text-white">Telegram Botu Entegrasyonu</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Telegram BotFather belirteci ile bot bağlayın, güvenli istatistikleri ve özel komutları yapılandırın.
                </p>
              </div>

              <button
                onClick={() => setTelegramModalOpen(true)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors shadow-md shadow-purple-950/50"
              >
                <Plus className="w-4 h-4" />
                <span>+ Telegram Botu Ekle</span>
              </button>
            </div>

            {telegramBots.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <Bot className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                <p className="text-sm font-semibold text-slate-400">Henüz bağlı Telegram botu yok.</p>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Telegram'da @BotFather üzerinden oluşturduğunuz bot belirtecini ekleyerek /start, /yardim ve /stat komutlarını kullanın.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {telegramBots.map((bot) => (
                  <div key={bot.id} className="p-5 rounded-2xl bg-[#171126] border border-[#2d2247] space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-950/80 border border-blue-800/60 flex items-center justify-center text-blue-300">
                          <Bot className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-white">{bot.botName}</span>
                            <span className="text-xs text-blue-400 font-mono">@{bot.username}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                bot.isEnabled
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : 'bg-slate-800 text-slate-400 border border-slate-700'
                              }`}
                            >
                              {bot.isEnabled ? 'Aktif' : 'Devre Dışı'}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {bot.customCommands?.length || 0} özel komut
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleTelegramBot(bot.id, bot.isEnabled)}
                          className={`p-2 rounded-xl border transition-colors ${
                            bot.isEnabled
                              ? 'bg-purple-950 text-purple-300 border-purple-800 hover:bg-purple-900'
                              : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                          }`}
                          title={bot.isEnabled ? 'Botu Durdur' : 'Botu Başlat'}
                        >
                          {bot.isEnabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                        </button>
                        <button
                          onClick={() => handleDeleteTelegramBot(bot.id, bot.username)}
                          className="p-2 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 rounded-xl transition-colors"
                          title="Botu Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#241c38] text-xs space-y-1">
                      <p className="text-slate-400">
                        <strong>Standart Komutlar:</strong> <code>/start</code> (Başlatma), <code>/yardim</code> (Komut listesi), <code>/stat</code> (Sistem durumu)
                      </p>
                      {bot.customCommands && bot.customCommands.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap pt-1">
                          <span className="text-slate-500">Özel:</span>
                          {bot.customCommands.map((c) => (
                            <span key={c.command} className="px-2 py-0.5 rounded bg-[#201834] text-purple-300 text-[10px] font-mono">
                              /{c.command}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 6: AUDIT LOGS */}
        {activeTab === 'audit' && (
          <div className="bg-[#120e20] border border-[#261d3d] rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#201834]">
              <div>
                <h2 className="text-base font-bold text-white">Sistem & Güvenlik Denetim Günlüğü</h2>
                <p className="text-xs text-slate-400 mt-0.5">Son yönetimsel eylemler ve erişim olayları.</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#201834] text-[10px] uppercase font-bold text-slate-400">
                    <th className="p-3">Zaman</th>
                    <th className="p-3">İşlem</th>
                    <th className="p-3">Yetkili</th>
                    <th className="p-3">Hedef</th>
                    <th className="p-3">Detaylar</th>
                    <th className="p-3">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#201834] font-mono text-[11px]">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-500 font-sans">
                        Kayıtlı denetim olayı bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-[#1a142c] transition-colors">
                        <td className="p-3 text-slate-400 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              log.action.includes('ENABLED') || log.action.includes('APPROVED') || log.action.includes('GRANTED') || log.action.includes('CONNECTED')
                                ? 'bg-purple-950 text-purple-300 border border-purple-800/60'
                                : log.action.includes('REVOKED') || log.action.includes('DISABLED') || log.action.includes('REMOVED')
                                ? 'bg-rose-950 text-rose-300 border border-rose-800/60'
                                : 'bg-[#1e1732] text-slate-300'
                            }`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="p-3 text-slate-300 truncate max-w-[140px]">{log.actor_email}</td>
                        <td className="p-3 text-slate-300 truncate max-w-[140px]">{log.target || '-'}</td>
                        <td className="p-3 text-slate-400 font-sans max-w-xs truncate">{log.details || '-'}</td>
                        <td className="p-3 text-slate-500">{log.ip_address || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 7: SUPPORT & PROBLEM REPORTS */}
        {activeTab === 'reports' && (
          <div className="bg-[#120e20] border border-[#261d3d] rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#201834]">
              <div>
                <h2 className="text-base font-bold text-white">Sorun & Hata Bildirimleri</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Kullanıcılar tarafından iletilen sorun raporları ve sistem teşhis verileri.
                </p>
              </div>
              <span className="text-xs text-purple-400 font-semibold font-mono">
                {supportReports.length} Bildirim
              </span>
            </div>

            {supportReports.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <HelpCircle className="w-10 h-10 mx-auto mb-2 text-slate-600" />
                <p className="text-sm font-semibold text-slate-400">Henüz bildirilmiş bir sorun bulunmuyor.</p>
                <p className="text-xs text-slate-500 mt-1">Kullanıcılar "Sorun Bildir" formunu kullandığında raporlar burada listelenir.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {supportReports.map((report) => (
                  <div
                    key={report.id}
                    className="p-4 rounded-2xl bg-[#171126] border border-[#2d2247] space-y-3 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#201834]">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white">{report.title}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            report.status === 'open'
                              ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                              : report.status === 'investigating'
                              ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                              : 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                          }`}
                        >
                          {report.status === 'open'
                            ? 'Açık'
                            : report.status === 'investigating'
                            ? 'İnceleniyor'
                            : 'Çözüldü'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span>{report.userDisplayName} ({report.userEmail})</span>
                        <span>•</span>
                        <span>{new Date(report.createdAt).toLocaleString('tr-TR')}</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {report.description}
                    </p>

                    {/* Diagnostics Pill */}
                    {report.diagnostics && (
                      <div className="p-2.5 bg-[#0b0914] border border-[#241c38] rounded-xl text-[11px] font-mono text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
                        <div>
                          <span className="text-slate-500">Platform: </span>
                          {report.diagnostics.platform || 'Bilinmeyen'}
                        </div>
                        <div>
                          <span className="text-slate-500">Sürüm: </span>
                          {report.diagnostics.appVersion || '1.0.0'}
                        </div>
                        {report.diagnostics.errorCode && (
                          <div>
                            <span className="text-rose-400">Hata Kodu: </span>
                            {report.diagnostics.errorCode}
                          </div>
                        )}
                        <div className="truncate max-w-xs">
                          <span className="text-slate-500">Yol: </span>
                          {report.diagnostics.currentPath || '/'}
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center justify-end gap-2 pt-1">
                      {report.status !== 'investigating' && report.status !== 'resolved' && (
                        <button
                          onClick={() => handleUpdateReportStatus(report.id, 'investigating')}
                          className="px-3 py-1 bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-800/60 rounded-xl text-xs font-semibold transition-colors"
                        >
                          İncelemeye Al
                        </button>
                      )}
                      {report.status !== 'resolved' ? (
                        <button
                          onClick={() => handleUpdateReportStatus(report.id, 'resolved')}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition-colors"
                        >
                          Çözüldü Olarak İşaretle
                        </button>
                      ) : (
                        <button
                          onClick={() => handleUpdateReportStatus(report.id, 'open')}
                          className="px-3 py-1 bg-[#1e1732] hover:bg-[#281f42] text-slate-300 rounded-xl text-xs font-semibold transition-colors"
                        >
                          Yeniden Aç
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL 1: Whitelist Toggle Confirmation */}
      {confirmToggleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#120e20] border border-[#2a2042] w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="font-bold text-lg text-white">Erişim Modu Değişikliği</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {whitelistMode
                ? 'Beyaz Liste Modunu kapatmak istediğinizden emin misiniz? Tüm kimliği doğrulanmış kullanıcılar XXQ Chat\'e doğrudan erişebilecektir.'
                : 'Beyaz Liste Modunu etkinleştirmek istediğinizden emin misiniz? Onaysız hesapların bağlantıları derhal sonlandırılacak ve bekleme listesine alınacaktır.'}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmToggleModal(false)}
                className="px-4 py-2 bg-[#1b152d] hover:bg-[#251d3e] text-slate-300 text-xs font-semibold rounded-xl transition-colors"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleToggleWhitelist}
                disabled={isSubmitting}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-purple-950/50 transition-all"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Onayla ve Uygula'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Revoke Whitelist User */}
      {userToRevoke && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#120e20] border border-[#2a2042] w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="font-bold text-lg text-white">Hesap Onayını Kaldır</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              <strong className="text-white">{userToRevoke}</strong> için beyaz liste erişimini kaldırmak istediğinizden emin misiniz?
              Kullanıcının aktif oturum bağlantısı derhal sonlandırılacaktır.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setUserToRevoke(null)}
                className="px-4 py-2 bg-[#1b152d] hover:bg-[#251d3e] text-slate-300 text-xs font-semibold rounded-xl transition-colors"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleRevokeWhitelist}
                disabled={isSubmitting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-950/50 transition-all"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Erişimi Kaldır'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Connect Google Drive */}
      {driveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#120e20] border border-[#2a2042] w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#241c38]">
              <div className="flex items-center gap-2.5">
                <HardDrive className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold text-base text-white">Google Drive Hesabı Bağla</h3>
              </div>
              <button onClick={() => setDriveModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3.5 rounded-2xl bg-[#171126] border border-[#2d2247] space-y-2">
                <p className="font-bold text-slate-200">1. Adım: Google Yetkilendirmesini Başlatın</p>
                <p className="text-slate-400 leading-relaxed">
                  Aşağıdaki butona tıklayarak Google Drive hesabınızda oturum açın ve XXQ Chat'e özel klasör erişim izni verin.
                </p>
                {driveAuthUrl ? (
                  <a
                    href={driveAuthUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl transition-colors shadow-sm"
                  >
                    <span>Google ile Yetkilendir</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                ) : (
                  <p className="text-rose-400">Google Drive API istemcisi sunucu tarafında henüz yapılandırılmamış.</p>
                )}
              </div>

              <form onSubmit={handleCompleteDriveConnect} className="p-3.5 rounded-2xl bg-[#171126] border border-[#2d2247] space-y-3">
                <p className="font-bold text-slate-200">2. Adım: Yetkilendirme Kodunu Girin</p>
                <p className="text-slate-400 leading-relaxed">
                  Google onay ekranından veya yönlendirme URL'sinden aldığınız <code>code</code> parametresini yapıştırın:
                </p>
                <input
                  type="text"
                  placeholder="4/0AWtg... yetkilendirme kodu"
                  value={driveAuthCode}
                  onChange={(e) => setDriveAuthCode(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1b152d] border border-[#2d2247] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 font-mono text-[11px]"
                  required
                />
                <button
                  type="submit"
                  disabled={driveConnecting || !driveAuthCode.trim()}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-md"
                >
                  {driveConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Bağlantıyı Tamamla'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Add Telegram Bot */}
      {telegramModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#120e20] border border-[#2a2042] w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#241c38]">
              <div className="flex items-center gap-2.5">
                <Bot className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-base text-white">Telegram Botu Ekle</h3>
              </div>
              <button onClick={() => setTelegramModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddTelegramBot} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Telegram Bot Belirteci (Token)</label>
                <input
                  type="password"
                  placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                  value={telegramToken}
                  onChange={(e) => setTelegramToken(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1b152d] border border-[#2d2247] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 font-mono text-xs"
                  required
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Telegram'da @BotFather üzerinden oluşturulan API token. Belirteç sunucuda AES-256 ile şifrelenir.
                </p>
              </div>

              {/* Custom Commands (Optional) */}
              <div className="p-3.5 rounded-2xl bg-[#171126] border border-[#2d2247] space-y-3">
                <p className="font-bold text-slate-200">İsteğe Bağlı Özel Komutlar</p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="komut (örn: duyuru)"
                    value={customCommandInput.command}
                    onChange={(e) => setCustomCommandInput({ ...customCommandInput, command: e.target.value })}
                    className="px-2.5 py-1.5 bg-[#1b152d] border border-[#2d2247] rounded-lg text-white text-[11px]"
                  />
                  <input
                    type="text"
                    placeholder="Açıklama (örn: Son haberler)"
                    value={customCommandInput.description}
                    onChange={(e) => setCustomCommandInput({ ...customCommandInput, description: e.target.value })}
                    className="px-2.5 py-1.5 bg-[#1b152d] border border-[#2d2247] rounded-lg text-white text-[11px]"
                  />
                </div>
                <textarea
                  placeholder="Botun göndereceği yanıt metni..."
                  value={customCommandInput.response}
                  onChange={(e) => setCustomCommandInput({ ...customCommandInput, response: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-[#1b152d] border border-[#2d2247] rounded-lg text-white text-[11px] resize-none h-14"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (customCommandInput.command.trim() && customCommandInput.response.trim()) {
                      setCustomCommandsList([
                        ...customCommandsList,
                        {
                          command: customCommandInput.command.trim(),
                          response: customCommandInput.response.trim(),
                          description: customCommandInput.description.trim() || undefined,
                        },
                      ]);
                      setCustomCommandInput({ command: '', response: '', description: '' });
                    }
                  }}
                  className="px-3 py-1.5 bg-[#241c38] hover:bg-[#2f244a] text-purple-300 rounded-lg font-semibold text-[11px] transition-colors"
                >
                  + Komutu Ekle
                </button>

                {customCommandsList.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {customCommandsList.map((c, i) => (
                      <div key={i} className="flex items-center justify-between p-1.5 rounded bg-[#1f1733] text-[11px]">
                        <span>/{c.command} - {c.description || c.response.slice(0, 20)}</span>
                        <button
                          type="button"
                          onClick={() => setCustomCommandsList(customCommandsList.filter((_, idx) => idx !== i))}
                          className="text-rose-400 hover:text-rose-300"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setTelegramModalOpen(false)}
                  className="px-4 py-2 bg-[#1b152d] hover:bg-[#251d3e] text-slate-300 text-xs font-semibold rounded-xl"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={telegramConnecting || !telegramToken.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-lg"
                >
                  {telegramConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Botu Doğrula ve Bağla'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: Assign Moderator */}
      {moderatorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#120e20] border border-[#2a2042] w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#241c38]">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-base text-white">Moderatör Ata</h3>
              </div>
              <button onClick={() => setModeratorModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <p className="text-slate-300 leading-relaxed">
                Moderatör olarak yetkilendirmek istediğiniz kullanıcıyı listeden seçin:
              </p>

              <select
                value={selectedUserIdForMod}
                onChange={(e) => setSelectedUserIdForMod(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#1b152d] border border-[#2d2247] rounded-xl text-white text-xs focus:outline-none focus:border-purple-500"
              >
                <option value="">Kullanıcı seçin...</option>
                {allUsers
                  .filter((u) => !u.isAdmin && !u.isModerator)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName} ({u.email})
                    </option>
                  ))}
              </select>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModeratorModalOpen(false)}
                  className="px-4 py-2 bg-[#1b152d] hover:bg-[#251d3e] text-slate-300 text-xs font-semibold rounded-xl"
                >
                  İptal
                </button>
                <button
                  type="button"
                  disabled={isSubmitting || !selectedUserIdForMod}
                  onClick={() => handleAssignModerator(selectedUserIdForMod)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Moderatör Yap'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
