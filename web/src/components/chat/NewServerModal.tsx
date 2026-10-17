import React, { useState } from 'react';
import { api } from '../../services/api';
import { Server, ServerPurpose } from '../../types';
import {
  X,
  Layers,
  Gamepad2,
  MessageSquare,
  Megaphone,
  Briefcase,
  HelpCircle,
  Loader2,
  AlertCircle,
  ArrowRight,
  Shield,
  FileText,
} from 'lucide-react';

interface NewServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onServerCreated: (server: Server) => void;
}

export const NewServerModal: React.FC<NewServerModalProps> = ({
  isOpen,
  onClose,
  onServerCreated,
}) => {
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState<ServerPurpose>('community');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const purposeOptions: {
    id: ServerPurpose;
    title: string;
    desc: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      id: 'gaming',
      title: 'Oyun',
      desc: 'Klanlar, turnuvalar ve oyun arkadaşları için',
      icon: Gamepad2,
    },
    {
      id: 'chat',
      title: 'Sohbet',
      desc: 'Genel sohbet, arkadaş çevreleri ve serbest muhabbet',
      icon: MessageSquare,
    },
    {
      id: 'community',
      title: 'Duyuru ve Topluluk',
      desc: 'Geniş kitlelere haber ve içerik duyuruları',
      icon: Megaphone,
    },
    {
      id: 'business',
      title: 'Para Kazanma / İş',
      desc: 'Projeler, girişimler, freelance ve ticari ekipler',
      icon: Briefcase,
    },
    {
      id: 'other',
      title: 'Diğer',
      desc: 'Özel amaçlar veya serbest tema',
      icon: HelpCircle,
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Lütfen bir sunucu adı belirleyin.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const res = await api.createServer({
        name: name.trim(),
        purpose,
        description: description.trim(),
        rules: rules.trim(),
      });
      onServerCreated(res.server);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Sunucu oluşturulamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
      <div className="bg-[#120f1e] border border-[#2a2244] w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#241c38] flex items-center justify-between bg-gradient-to-r from-purple-950/40 via-[#120f1e] to-[#120f1e]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-900/60 border border-purple-700/50 flex items-center justify-center text-purple-300">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Yeni Sunucu Oluştur</h2>
              <p className="text-[11px] text-slate-400">Çok kanallı Discord tarzı topluluk alanı</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#1b152d] hover:bg-[#251d3e] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Purpose / Type selection */}
          <div>
            <label className="block text-slate-300 font-semibold mb-2">Sunucu Amacı / Türü</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {purposeOptions.map((opt) => {
                const Icon = opt.icon;
                const isSelected = purpose === opt.id;
                return (
                  <div
                    key={opt.id}
                    onClick={() => setPurpose(opt.id)}
                    className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                      isSelected
                        ? 'bg-purple-950/50 border-purple-500 shadow-md shadow-purple-950/40'
                        : 'bg-[#0d0a17] border-[#241c38] hover:border-slate-700'
                    }`}
                  >
                    <div
                      className={`p-2 rounded-xl shrink-0 ${
                        isSelected
                          ? 'bg-purple-600 text-white'
                          : 'bg-[#181329] text-slate-400'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-xs">{opt.title}</h4>
                      <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{opt.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Server Name */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1.5">Sunucu Adı</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn: Türkiye Oyun Topluluğu"
              className="w-full px-3.5 py-2.5 bg-[#0b0914] border border-[#241c38] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1.5">Sunucu Açıklaması</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Sunucunun temel konusu ve hedefleri..."
              className="w-full px-3.5 py-2 bg-[#0b0914] border border-[#241c38] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none"
            />
          </div>

          {/* Rules */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1.5">Temel Sunucu Kuralları</label>
            <textarea
              rows={2}
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              placeholder="Örn: 1. Saygılı dil kullanın 2. Reklam yapmayın 3. Spam yasaktır"
              className="w-full px-3.5 py-2 bg-[#0b0914] border border-[#241c38] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none"
            />
          </div>

          <div className="p-3 rounded-2xl bg-indigo-950/20 border border-indigo-800/40 text-[11px] text-indigo-300 leading-relaxed">
            Sunucunuz oluşturulduğunda otomatik olarak varsayılan <strong>#genel-sohbet</strong> kanalı ve duyurular için <strong>#duyurular</strong> kanalı hazırlanacaktır.
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-[#1b152d] hover:bg-[#251d3e] text-slate-300 rounded-xl font-semibold transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-purple-950/50 transition-all disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Sunucu Kuruluyor...</span>
                </>
              ) : (
                <>
                  <span>Sunucuyu Oluştur</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
