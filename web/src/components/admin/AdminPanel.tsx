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
      setError(err.message || 'Failed to load administration data');
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
      setSuccessMsg(`Whitelist mode successfully ${res.whitelistMode ? 'ENABLED' : 'DISABLED'}`);
      loadAdminData();
    } catch (err: any) {
      setError(err.message || 'Failed to toggle whitelist mode');
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
      setSuccessMsg(`Approved ${newEmail} for application access`);
      setNewEmail('');
      loadAdminData();
    } catch (err: any) {
      setError(err.message || 'Failed to approve account');
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
      setSuccessMsg(`Revoked whitelist access for ${userToRevoke}`);
      setUserToRevoke(null);
      loadAdminData();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke whitelist access');
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
              <h1 className="text-2xl font-bold tracking-tight text-white">Administration & Security Panel</h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Configure access control, manage approved accounts, and inspect system audit history.
            </p>
          </div>

          <button
            onClick={onBackToChat}
            className="self-start sm:self-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors"
          >
            ← Return to Chat
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
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Access Control</span>
              {whitelistMode ? (
                <ShieldCheck className="w-5 h-5 text-blue-400" />
              ) : (
                <ShieldAlert className="w-5 h-5 text-emerald-400" />
              )}
            </div>

            <div className="mb-4">
              <span className="text-xl font-bold text-white">
                {whitelistMode ? 'Whitelist Mode (ON)' : 'Open Access (OFF)'}
              </span>
              <p className="text-[11px] text-slate-400 mt-1">
                {whitelistMode
                  ? 'Only approved accounts can access the application.'
                  : 'All authenticated users may log in.'}
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
              {whitelistMode ? 'Switch to Open Access' : 'Enable Whitelist Mode'}
            </button>
          </div>

          {/* Approved Accounts Card */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Approved Users</span>
              <Users className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <span className="text-3xl font-extrabold text-white">
                {stats?.approvedWhitelistCount ?? 0}
              </span>
              <p className="text-[11px] text-slate-400 mt-1">Explicitly whitelisted accounts</p>
            </div>
          </div>

          {/* Total Registered Users Card */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Registered Accounts</span>
              <Users className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <span className="text-3xl font-extrabold text-white">
                {stats?.totalUsers ?? 0}
              </span>
              <p className="text-[11px] text-slate-400 mt-1">Total user profiles stored</p>
            </div>
          </div>

          {/* Total Messages Card */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Messages Delivered</span>
              <MessageSquare className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <span className="text-3xl font-extrabold text-white">
                {stats?.totalMessages ?? 0}
              </span>
              <p className="text-[11px] text-slate-400 mt-1">Total chat history records</p>
            </div>
          </div>
        </div>

        {/* Whitelist Management Section */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">Approved Whitelist Directory</h2>
              <p className="text-xs text-slate-400">
                Accounts approved to use XXQ Chat when Whitelist mode is active.
              </p>
            </div>

            {/* Approve Account Form */}
            <form onSubmit={handleAddWhitelist} className="flex items-center gap-2">
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Enter email to approve..."
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="submit"
                disabled={isSubmitting || !newEmail.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-md shrink-0"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Approve User</span>
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
              placeholder="Search approved accounts..."
              className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Whitelist Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400 uppercase font-mono text-[10px]">
                <tr>
                  <th className="p-3">User</th>
                  <th className="p-3">Approved By</th>
                  <th className="p-3">Approved Date</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {filteredWhitelist.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-slate-500">
                      No approved accounts found.
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
                              ADMIN
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-slate-400 font-mono text-[11px]">{item.approved_by}</td>
                      <td className="p-3 text-slate-400 font-mono text-[11px]">
                        {new Date(item.created_at).toLocaleString()}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => setUserToRevoke(item.email)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors"
                          title="Revoke Whitelist Access"
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
            <h2 className="text-lg font-bold text-white">System Security Audit Log</h2>
          </div>
          <p className="text-xs text-slate-400">
            Immutable chronological record of administrative actions, whitelist modifications, and bootstrap events.
          </p>

          <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-96">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400 uppercase font-mono text-[10px] sticky top-0">
                <tr>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Actor</th>
                  <th className="p-3">Target</th>
                  <th className="p-3">Details</th>
                  <th className="p-3">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-500 font-sans">
                      No audit events recorded.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3 text-slate-400 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
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
              <h3 className="font-bold text-lg text-white">Confirm Whitelist Mode Change</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {whitelistMode
                ? 'Are you sure you want to disable Whitelist Mode? All authenticated users will be granted access to XXQ Chat.'
                : 'Are you sure you want to enable Whitelist Mode? All accounts not explicitly listed in the whitelist directory will be immediately blocked from connecting.'}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmToggleModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleToggleWhitelist}
                disabled={isSubmitting}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-brand-500/25 transition-all"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm & Apply'}
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
              <h3 className="font-bold text-lg text-white">Revoke Account Approval</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to revoke whitelist access for <strong className="text-white">{userToRevoke}</strong>?
              If Whitelist mode is active, this user will no longer be able to use XXQ Chat.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setUserToRevoke(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRevokeWhitelist}
                disabled={isSubmitting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-600/25 transition-all"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Revoke Access'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
