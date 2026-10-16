import React from 'react';
import { BrandLogo } from '../common/BrandLogo';
import { Plus, ShieldCheck, Zap, Lock } from 'lucide-react';

interface EmptyStateProps {
  onOpenNewChat: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onOpenNewChat }) => {
  return (
    <main className="flex-1 flex flex-col items-center justify-center p-6 bg-chat-bg text-center select-none">
      <div className="max-w-md flex flex-col items-center">
        <BrandLogo size={64} showText={false} className="mb-4 animate-bounce-subtle" />

        <h2 className="text-2xl font-extrabold text-slate-100 tracking-tight mb-2">
          <span className="text-brand-400">XXQ Chat</span>&apos;e Hoş Geldiniz
        </h2>

        <p className="text-sm text-slate-400 mb-8 leading-relaxed max-w-sm">
          Sunucu onaylı beyaz liste erişim kontrolü ve yüksek güvenilirlikli modern, kuantum düzeyinde hızlı mesajlaşma platformu.
        </p>

        <button
          onClick={onOpenNewChat}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-brand-500/25 transition-all hover:scale-[1.02] active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Yeni Bir Sohbet Başlat</span>
        </button>

        <div className="grid grid-cols-3 gap-4 mt-12 w-full pt-8 border-t border-slate-800/80">
          <div className="flex flex-col items-center p-3 rounded-xl bg-slate-900/60 border border-slate-800/60">
            <Zap className="w-5 h-5 text-sky-400 mb-1.5" />
            <span className="text-xs font-semibold text-slate-200">Gerçek Zamanlı</span>
            <span className="text-[10px] text-slate-500 mt-0.5">Anında iletim</span>
          </div>

          <div className="flex flex-col items-center p-3 rounded-xl bg-slate-900/60 border border-slate-800/60">
            <ShieldCheck className="w-5 h-5 text-emerald-400 mb-1.5" />
            <span className="text-xs font-semibold text-slate-200">Beyaz Liste</span>
            <span className="text-[10px] text-slate-500 mt-0.5">Yönetici korumalı</span>
          </div>

          <div className="flex flex-col items-center p-3 rounded-xl bg-slate-900/60 border border-slate-800/60">
            <Lock className="w-5 h-5 text-indigo-400 mb-1.5" />
            <span className="text-xs font-semibold text-slate-200">Korumalı</span>
            <span className="text-[10px] text-slate-500 mt-0.5">Sunucu onaylı</span>
          </div>
        </div>
      </div>
    </main>
  );
};
