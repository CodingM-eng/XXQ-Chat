import React, { useState } from 'react';
import { BrandLogo } from '../common/BrandLogo';
import { useAuth } from '../../context/AuthContext';
import { ShieldAlert, RefreshCw, LogOut } from 'lucide-react';

export const AccessRestricted: React.FC = () => {
  const { user, refreshSession, logout } = useAuth();
  const [checking, setChecking] = useState(false);

  const handleRefresh = async () => {
    try {
      setChecking(true);
      await refreshSession();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-chat-bg flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center animate-fade-in">
        <BrandLogo size={52} className="mb-6" />

        <div className="w-14 h-14 rounded-2xl bg-amber-950/60 border border-amber-800/60 flex items-center justify-center text-amber-400 mb-4 shadow-lg shadow-amber-900/20">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <h2 className="text-xl font-bold text-white mb-2">Access Restricted</h2>
        <p className="text-xs text-slate-300 mb-4 leading-relaxed">
          XXQ Chat is currently operating in <strong className="text-amber-400">Restricted Whitelist Mode</strong>.
          Your account is authenticated, but has not yet been approved by an administrator.
        </p>

        {user && (
          <div className="w-full p-3 rounded-xl bg-slate-800/70 border border-slate-700/60 mb-6 flex flex-col items-center">
            <span className="text-[11px] text-slate-400 uppercase font-mono">Current Account</span>
            <span className="text-sm font-semibold text-slate-200 mt-0.5">{user.email}</span>
          </div>
        )}

        <div className="flex flex-col w-full gap-2.5">
          <button
            onClick={handleRefresh}
            disabled={checking}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-brand-500/25 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            <span>{checking ? 'Checking Status...' : 'Check Approval Status'}</span>
          </button>

          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl border border-slate-700 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out / Switch Account</span>
          </button>
        </div>

        <p className="text-[11px] text-slate-500 mt-6 leading-relaxed">
          If you believe this is an error, contact the system administrator to request whitelist inclusion.
        </p>
      </div>
    </div>
  );
};
