import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { AdminStats, WhitelistItem, AuditLog, PendingRequest } from '../../types';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Users,
  MessageSquare,
  Search,
  UserPlus,
  Trash2,
  History,
  AlertTriangle,
  Loader2,
  CheckCircle,
  X,
  UserCheck,
  Clock,
  Sparkles,
  RefreshCw,
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
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<'pending' | 'whitelist' | 'audit'>('pending');

  // Search and Add state
  const [searchQuery, setSearchQuery] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [approvingEmail, setApprovingEmail] = useState<string | null>(null);

  // Confirmation Modals
  const [confirmToggleModal, setConfirmToggleModal] = useState<boolean>(false);
  const [userToRevoke, setUserToRevoke] = useState<string | null>(null);

  useEffect(() => {
    loadAdminData();
  }, []);

  const loadAdminData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [statusRes, whitelistRes, pendingRes, logsRes] = await Promise.all([
        api.getAdminStatus(),
        api.getWhitelist(),
        api.getPendingRequests().catch(() => ({ pendingRequests: [] })),
        api.getAuditLogs(50),
      ]);

      setStats(statusRes.stats);
      setWhitelistMode(statusRes.whitelistMode);
      setWhitelist(whitelistRes.whitelist);
      setPendingRequests(pendingRes.pendingRequests || []);
      setAuditLogs(logsRes.auditLogs);
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

  const filteredWhitelist = whitelist.filter((item) =>
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
              Erişim kontrolünü yapılandırın, bekleyen talepleri onaylayın ve sistem denetim geçmişini inceleyin.
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

        {/* KPI Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Whitelist Status Toggle Card */}
          <div className="p-5 rounded-2xl bg-[#120e20] border border-[#261d3d] flex flex-col justify-between shadow-lg shadow-black/40">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Erişim Modu</span>
              {whitelistMode ? (
                <ShieldCheck className="w-5 h-5 text-purple-400" />
              ) : (
                <ShieldAlert className="w-5 h-5 text-emerald-400" />
              )}
            </div>

            <div className="mb-4">
              <span className="text-lg font-bold text-white block">
                {whitelistMode ? 'Beyaz Liste Modu (AÇIK)' : 'Açık Erişim (KAPALI)'}
              </span>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                {whitelistMode
                  ? 'Yalnızca onaylanmış hesaplar uygulamaya erişebilir.'
                  : 'Tüm kimliği doğrulanmış kullanıcılar giriş yapabilir.'}
              </p>
            </div>

            <button
              onClick={() => setConfirmToggleModal(true)}
              className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-all shadow-md ${
                whitelistMode
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-950/40'
                  : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-950/40'
              }`}
            >
              {whitelistMode ? 'Açık Erişime Geç' : 'Beyaz Liste Modunu Aç'}
            </button>
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
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-white">
                  {pendingRequests.length}
                </span>
                {pendingRequests.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800/60 animate-pulse">
                    Onay Bekliyor
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Erişim reddedilen & onay bekleyen hesaplar</p>
            </div>
          </div>

          {/* Approved Accounts Card */}
          <div
            onClick={() => setActiveTab('whitelist')}
            className={`p-5 rounded-2xl bg-[#120e20] border cursor-pointer transition-all flex flex-col justify-between shadow-lg shadow-black/40 ${
              activeTab === 'whitelist' ? 'border-purple-500 ring-1 ring-purple-500/40' : 'border-[#261d3d] hover:border-purple-700/60'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Onaylı Hesaplar</span>
              <Users className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <span className="text-3xl font-extrabold text-white">
                {stats?.approvedWhitelistCount ?? whitelist.length}
              </span>
              <p className="text-[11px] text-slate-400 mt-1">Beyaz listede yetkili kullanıcılar</p>
            </div>
          </div>

          {/* Total Messages Card */}
          <div className="p-5 rounded-2xl bg-[#120e20] border border-[#261d3d] flex flex-col justify-between shadow-lg shadow-black/40">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">İletilen Mesajlar</span>
              <MessageSquare className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <span className="text-3xl font-extrabold text-white">
                {stats?.totalMessages ?? 0}
              </span>
              <p className="text-[11px] text-slate-400 mt-1">Kayıtlı mesaj sayısı</p>
            </div>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-2 border-b border-[#241c38] pb-3 text-xs">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 ${
              activeTab === 'pending'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                : 'bg-[#120e20] text-slate-400 hover:text-white border border-[#241c38]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Bekleyen Erişim Talepleri</span>
            {pendingRequests.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950">
                {pendingRequests.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('whitelist')}
            className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 ${
              activeTab === 'whitelist'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                : 'bg-[#120e20] text-slate-400 hover:text-white border border-[#241c38]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Onaylı Beyaz Liste ({whitelist.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 ${
              activeTab === 'audit'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                : 'bg-[#120e20] text-slate-400 hover:text-white border border-[#241c38]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Sistem Denetim Günlüğü</span>
          </button>
        </div>

        {/* TAB 1: PENDING REQUESTS */}
        {activeTab === 'pending' && (
          <div className="p-6 rounded-2xl bg-[#120e20] border border-[#261d3d] space-y-4 shadow-xl shadow-black/40">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Bekleyen Erişim Talepleri</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-950/70 text-amber-300 border border-amber-800/60 font-semibold">
                    İzolasyon Koruması Aktif
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Beyaz liste modu açıkken sisteme giriş yapmayı deneyen ancak henüz onaylanmamış hesaplar. Onaylanana kadar aktif kullanıcı profili oluşturulmaz.
                </p>
              </div>
            </div>

            {/* Pending Requests List */}
            <div className="overflow-x-auto rounded-xl border border-[#241c38]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#181329] text-slate-400 uppercase font-mono text-[10px]">
                  <tr>
                    <th className="p-3">E-posta & Kullanıcı</th>
                    <th className="p-3">İlk Giriş Denemesi</th>
                    <th className="p-3">Son Giriş Denemesi</th>
                    <th className="p-3">Deneme Sayısı</th>
                    <th className="p-3 text-right">Erişim Kararı</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#201834] font-medium">
                  {pendingRequests.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500 font-sans">
                        <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                        <p className="text-sm font-semibold text-slate-300">Bekleyen erişim talebi bulunmuyor</p>
                        <p className="text-xs text-slate-500 mt-0.5">Onaysız tüm giriş denemeleri incelenmiş durumda.</p>
                      </td>
                    </tr>
                  ) : (
                    pendingRequests.map((req) => (
                      <tr key={req.id} className="hover:bg-[#1a142c] transition-colors">
                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-purple-900/40 border border-purple-800/40 flex items-center justify-center font-bold text-white text-xs shrink-0 overflow-hidden">
                              {req.avatarUrl ? (
                                <img src={req.avatarUrl} alt={req.displayName || req.email} className="w-full h-full object-cover" />
                              ) : (
                                req.email.slice(0, 2).toUpperCase()
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-white">{req.email}</p>
                              {req.displayName && (
                                <p className="text-[11px] text-slate-400">{req.displayName}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-slate-400 font-mono text-[11px]">
                          {new Date(req.firstAttemptAt).toLocaleString('tr-TR')}
                        </td>
                        <td className="p-3 text-slate-400 font-mono text-[11px]">
                          {new Date(req.lastAttemptAt).toLocaleString('tr-TR')}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#1e1732] text-purple-300 border border-purple-800/40">
                            {req.attemptCount} kez
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleApprovePending(req.email)}
                            disabled={approvingEmail === req.email}
                            className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md shadow-purple-950/40 flex items-center gap-1.5 ml-auto transition-all"
                          >
                            {approvingEmail === req.email ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Onaylanıyor...</span>
                              </>
                            ) : (
                              <>
                                <UserCheck className="w-3.5 h-3.5" />
                                <span>Erişimi Onayla</span>
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: WHITELIST MANAGEMENT */}
        {activeTab === 'whitelist' && (
          <div className="p-6 rounded-2xl bg-[#120e20] border border-[#261d3d] space-y-4 shadow-xl shadow-black/40">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-white">Onaylı Beyaz Liste Dizini</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Beyaz liste modu etkinken XXQ Chat'i kullanmasına izin verilen kullanıcılar.
                </p>
              </div>

              {/* Approve Account Form */}
              <form onSubmit={handleAddWhitelist} className="flex items-center gap-2">
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="Onaylanacak e-posta adresi..."
                  className="bg-[#0b0914] border border-[#281f3e] rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
                />
                <button
                  type="submit"
                  disabled={isSubmitting || !newEmail.trim()}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-purple-950/40 shrink-0"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Kullanıcı Ekle</span>
                </button>
              </form>
            </div>

            {/* Whitelist Search */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Onaylı hesaplarda ara..."
                className="w-full bg-[#0b0914] border border-[#241c38] rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Whitelist Table */}
            <div className="overflow-x-auto rounded-xl border border-[#241c38]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#181329] text-slate-400 uppercase font-mono text-[10px]">
                  <tr>
                    <th className="p-3">Kullanıcı</th>
                    <th className="p-3">Onaylayan</th>
                    <th className="p-3">Onay Tarihi</th>
                    <th className="p-3 text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#201834] font-medium">
                  {filteredWhitelist.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-slate-500">
                        Onaylı hesap bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    filteredWhitelist.map((item) => (
                      <tr key={item.email} className="hover:bg-[#1a142c] transition-colors">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-200">{item.email}</span>
                            {item.is_admin === 1 && (
                              <span className="bg-purple-900/70 text-purple-300 border border-purple-700/60 text-[10px] px-1.5 py-0.2 rounded font-mono">
                                YÖNETİCİ
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-slate-400 font-mono text-[11px]">{item.approved_by}</td>
                        <td className="p-3 text-slate-400 font-mono text-[11px]">
                          {new Date(item.created_at).toLocaleString('tr-TR')}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => setUserToRevoke(item.email)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-xl transition-colors"
                            title="Beyaz Liste Erişimini Kaldır"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: AUDIT LOGS */}
        {activeTab === 'audit' && (
          <div className="p-6 rounded-2xl bg-[#120e20] border border-[#261d3d] space-y-4 shadow-xl shadow-black/40">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-purple-400" />
              <h2 className="text-base font-bold text-white">Sistem Güvenlik Denetim Günlüğü</h2>
            </div>
            <p className="text-xs text-slate-400">
              Yönetimsel işlemlerin, beyaz liste değişikliklerinin ve güvenlik olaylarının kronolojik kayıtları.
            </p>

            <div className="overflow-x-auto rounded-xl border border-[#241c38] max-h-96">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#181329] text-slate-400 uppercase font-mono text-[10px] sticky top-0">
                  <tr>
                    <th className="p-3">Zaman</th>
                    <th className="p-3">İşlem</th>
                    <th className="p-3">Yetkili</th>
                    <th className="p-3">Hedef</th>
                    <th className="p-3">Detaylar</th>
                    <th className="p-3">IP Adresi</th>
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
                              log.action.includes('ENABLED') || log.action.includes('APPROVED')
                                ? 'bg-purple-950 text-purple-300 border border-purple-800/60'
                                : log.action.includes('REVOKED') || log.action.includes('DISABLED')
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
      </div>

      {/* Whitelist Toggle Confirmation Modal */}
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

      {/* Revoke User Confirmation Modal */}
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
    </div>
  );
};
