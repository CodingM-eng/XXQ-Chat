import React, { useState } from 'react';
import { api } from '../../services/api';
import { Conversation } from '../../types';
import { X, Hash, Megaphone, Loader2, AlertCircle } from 'lucide-react';

interface CreateChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string;
  serverName: string;
  onChannelCreated: (channel: Conversation) => void;
}

export const CreateChannelModal: React.FC<CreateChannelModalProps> = ({
  isOpen,
  onClose,
  serverId,
  serverName,
  onChannelCreated,
}) => {
  const [channelName, setChannelName] = useState('');
  const [isAnnouncementOnly, setIsAnnouncementOnly] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formatted = channelName
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-_]/g, '');

    if (!formatted) {
      setError('Lütfen geçerli bir kanal adı girin (örn. genel, turnuvalar).');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const res = await api.createServerChannel(serverId, {
        name: formatted,
        isAnnouncementOnly,
      });
      onChannelCreated(res.channel);
      onClose();
      setChannelName('');
      setIsAnnouncementOnly(false);
    } catch (err: any) {
      setError(err.message || 'Kanal oluşturulamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
      <div className="bg-[#120f1e] border border-[#2a2244] w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#241c38] flex items-center justify-between bg-gradient-to-r from-purple-950/40 via-[#120f1e] to-[#120f1e]">
          <div>
            <h2 className="text-sm font-bold text-white">Yeni Kanal Oluştur</h2>
            <p className="text-[11px] text-slate-400 truncate max-w-[280px]">
              {serverName} sunucusunda
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#1b152d] hover:bg-[#251d3e] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Channel Type */}
          <div>
            <label className="block text-slate-300 font-semibold mb-2">Kanal Türü</label>
            <div className="space-y-2">
              <div
                onClick={() => setIsAnnouncementOnly(false)}
                className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-start gap-3 ${
                  !isAnnouncementOnly
                    ? 'bg-purple-950/40 border-purple-500 shadow-md shadow-purple-950/40'
                    : 'bg-[#0d0a17] border-[#241c38] hover:border-slate-700'
                }`}
              >
                <div className="p-2 rounded-xl bg-purple-900/60 text-purple-300">
                  <Hash className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-white text-xs">Metin Kanalı</div>
                  <div className="text-[11px] text-slate-400">
                    Tüm üyelerin mesajlaşabileceği, resim ve dosya paylaşabileceği standart kanal.
                  </div>
                </div>
              </div>

              <div
                onClick={() => setIsAnnouncementOnly(true)}
                className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-start gap-3 ${
                  isAnnouncementOnly
                    ? 'bg-amber-950/40 border-amber-500 shadow-md shadow-amber-950/40'
                    : 'bg-[#0d0a17] border-[#241c38] hover:border-slate-700'
                }`}
              >
                <div className="p-2 rounded-xl bg-amber-900/60 text-amber-300">
                  <Megaphone className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-white text-xs">Duyuru Kanalı</div>
                  <div className="text-[11px] text-slate-400">
                    Yalnızca sunucu yöneticilerinin ve moderatörlerin duyuru yayınlayabileceği salt okunur kanal.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Channel Name */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Kanal Adı</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-500 font-bold">#</span>
              <input
                type="text"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="yeni-kanal"
                className="w-full bg-[#0d0a17] border border-[#241c38] rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500 transition-all font-mono"
                autoFocus
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Kanal adı küçük harf, rakam ve tire (-) içerebilir.
            </p>
          </div>

          {/* Action buttons */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-[#171224] hover:bg-[#201833] text-slate-300 transition-colors font-medium"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={submitting || !channelName.trim()}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold transition-all shadow-md shadow-purple-950/50 flex items-center gap-1.5"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Kanalı Oluştur</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
