import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { AdminStats, WhitelistItem, AuditLog } from '../../types';
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
} from 'lucide-react';

interface AdminPanelProps {
  onBackToChat: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onBackToChat }) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [whitelistMode, setWhitelistMode] = useState<boolean>(true);
  const [whitelist, setWhitelist] = useState<WhitelistItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Search and Add state
  const [searchQuery, setSearchQuery] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      const [statusRes, whitelistRes, logsRes] = await Promise.all([
        api.getAdminStatus(),
        api.getWhitelist(),
        api.getAuditLogs(50),
      ]);

      setStats(statusRes.stats);
      setWhitelistMode(statusRes.whitelistMode);
      setWhitelist(whitelistRes.whitelist);
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
      setSuccessMsg(`${newEmail} uygulamaya erişim için onaylandı`);
      setNewEmail('');
      loadAdminData();
    } catch (err: any) {
      setError(err.message || 'Hesap onaylanamadı');
    } finally {
      setIsSubmitting(false);
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
    <div className="flex-1 overflow-y-auto bg-slate-950 p-4 sm:p-6 lg:p-8 animate-fade-in text-slate-100">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-brand-400" />
              <h1 className="text-2xl font-bold tracking-tight text-white">Yönetim & Güvenlik Paneli</h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Erişim kontrolünü yapılandırın, onaylı hesapları yönetin ve sistem denetim geçmişini inceleyin.
            </p>
          </div>

          <button
            onClick={onBackToChat}
            className="self-start sm:self-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors"
          >
            ← Sohbete Dön
          </button>
        </div>

        {/* Notifications */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
          </div>
        )}

        {successMsg && (
          <div className="p-4 rounded-xl bg-emerald-950/70 border border-emerald-800 text-emerald-200 text-xs flex items-center justify-between">
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
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Erişim Kontrolü</span>
              {whitelistMode ? (
                <ShieldCheck className="w-5 h-5 text-blue-400" />
              ) : (
                <ShieldAlert className="w-5 h-5 text-emerald-400" />
              )}
            </div>

            <div className="mb-4">
              <span className="text-xl font-bold text-white">
                {whitelistMode ? 'Beyaz Liste Modu (AÇIK)' : 'Açık Erişim (KAPALI)'}
              </span>
              <p className="text-[11px] text-slate-400 mt-1">
                {whitelistMode
                  ? 'Yalnızca onaylanmış hesaplar uygulamaya erişebilir.'
                  : 'Tüm kimliği doğrulanmış kullanıcılar giriş yapabilir.'}
              </p>
            </div>

            <button
              onClick={() => setConfirmToggleModal(true)}
              className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-all shadow-md ${
                whitelistMode
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20'
                  : 'bg-brand-600 hover:bg-brand-500 text-white shadow-brand-600/20'
              }`}
            >
              {whitelistMode ? 'Açık Erişime Geç' : 'Beyaz Liste Modunu Etkinleştir'}
            </button>
          </div>

          {/* Approved Accounts Card */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Onaylı Kullanıcılar</span>
              <Users className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <span className="text-3xl font-extrabold text-white">
                {stats?.approvedWhitelistCount ?? 0}
              </span>
              <p className="text-[11px] text-slate-400 mt-1">Açıkça beyaz listeye eklenmiş hesaplar</p>
            </div>
          </div>

          {/* Total Registered Users Card */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Kayıtlı Hesaplar</span>
              <Users className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <span className="text-3xl font-extrabold text-white">
                {stats?.totalUsers ?? 0}
              </span>
              <p className="text-[11px] text-slate-400 mt-1">Kayıtlı kullanıcı profili sayısı</p>
            </div>
          </div>

          {/* Total Messages Card */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">İletilen Mesajlar</span>
              <MessageSquare className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <span className="text-3xl font-extrabold text-white">
                {stats?.totalMessages ?? 0}
              </span>
              <p className="text-[11px] text-slate-400 mt-1">Toplam sohbet geçmişi kaydı</p>
            </div>
          </div>
        </div>

        {/* Whitelist Management Section */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">Onaylı Beyaz Liste Dizini</h2>
              <p className="text-xs text-slate-400">
                Beyaz liste modu etkinken XXQ Chat&apos;i kullanmasına izin verilen hesaplar.
              </p>
            </div>

            {/* Approve Account Form */}
            <form onSubmit={handleAddWhitelist} className="flex items-center gap-2">
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Onaylanacak e-postayı girin..."
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="submit"
                disabled={isSubmitting || !newEmail.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-md shrink-0"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Kullanıcıyı Onayla</span>
              </button>
            </form>
          </div>

          {/* Whitelist Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Onaylı hesaplarda ara..."
              className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Whitelist Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400 uppercase font-mono text-[10px]">
                <tr>
                  <th className="p-3">Kullanıcı</th>
                  <th className="p-3">Onaylayan</th>
                  <th className="p-3">Onay Tarihi</th>
                  <th className="p-3 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {filteredWhitelist.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-slate-500">
                      Onaylı hesap bulunamadı.
                    </td>
                  </tr>
                ) : (
                  filteredWhitelist.map((item) => (
                    <tr key={item.email} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-200">{item.email}</span>
                          {item.is_admin === 1 && (
                            <span className="bg-sky-500/20 text-sky-400 text-[10px] px-1.5 py-0.2 rounded font-mono">
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
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors"
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

        {/* Audit Log History Section */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white">Sistem Güvenlik Denetim Günlüğü</h2>
          </div>
          <p className="text-xs text-slate-400">
            Yönetimsel işlemlerin, beyaz liste değişikliklerinin ve başlatma olaylarının kronolojik kayıtları.
          </p>

          <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-96">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400 uppercase font-mono text-[10px] sticky top-0">
                <tr>
                  <th className="p-3">Zaman Damgası</th>
                  <th className="p-3">İşlem</th>
                  <th className="p-3">Yetkili</th>
                  <th className="p-3">Hedef</th>
                  <th className="p-3">Detaylar</th>
                  <th className="p-3">IP Adresi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-500 font-sans">
                      Kayıtlı denetim olayı bulunamadı.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3 text-slate-400 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.action.includes('ENABLED') || log.action.includes('APPROVED')
                              ? 'bg-blue-950 text-blue-300 border border-blue-800/50'
                              : log.action.includes('REVOKED') || log.action.includes('DISABLED')
                              ? 'bg-amber-950 text-amber-300 border border-amber-800/50'
                              : 'bg-slate-800 text-slate-300'
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
      </div>

      {/* Whitelist Toggle Confirmation Modal */}
      {confirmToggleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="font-bold text-lg text-white">Beyaz Liste Modu Değişikliğini Onayla</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {whitelistMode
                ? 'Beyaz Liste Modunu devre dışı bırakmak istediğinizden emin misiniz? Tüm kimliği doğrulanmış kullanıcılar XXQ Chat\'e erişebilecektir.'
                : 'Beyaz Liste Modunu etkinleştirmek istediğinizden emin misiniz? Beyaz listede bulunmayan hesapların bağlantısı derhal engellenecektir.'}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmToggleModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleToggleWhitelist}
                disabled={isSubmitting}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-brand-500/25 transition-all"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Onayla ve Uygula'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke User Confirmation Modal */}
      {userToRevoke && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="font-bold text-lg text-white">Hesap Onayını Kaldır</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              <strong className="text-white">{userToRevoke}</strong> için beyaz liste erişimini kaldırmak istediğinizden emin misiniz?
              Beyaz liste modu etkinken bu kullanıcı artık XXQ Chat&apos;i kullanamaz.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setUserToRevoke(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleRevokeWhitelist}
                disabled={isSubmitting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-600/25 transition-all"
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
