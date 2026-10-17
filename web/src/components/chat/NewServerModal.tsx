import React, { useState, useRef } from 'react';
import { api } from '../../services/api';
import { Server, ServerPurpose, ServerJoinQuestion } from '../../types';
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
  ArrowLeft,
  Shield,
  FileText,
  Upload,
  Image as ImageIcon,
  Check,
  Plus,
  Trash2,
  Hash,
  HelpCircle as QuestionIcon,
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
  // Wizard steps: 1: Kimlik & Amaç, 2: Kurallar & Karşılama, 3: Kanallar, 4: Katılım Soruları
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Identity & Purpose
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState<ServerPurpose>('community');
  const [description, setDescription] = useState('');
  const [logoMode, setLogoMode] = useState<'upload' | 'url'>('upload');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const [bannerMode, setBannerMode] = useState<'upload' | 'url'>('upload');
  const [bannerUrl, setBannerUrl] = useState('');
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);

  // Step 2: Rules & Welcome
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [rules, setRules] = useState('');

  // Step 3: Initial Channels
  const [createGeneral, setCreateGeneral] = useState(true);
  const [createAnnouncements, setCreateAnnouncements] = useState(true);
  const [createRules, setCreateRules] = useState(false);
  const [customChannels, setCustomChannels] = useState<string[]>([]);
  const [newCustomChannel, setNewCustomChannel] = useState('');

  // Step 4: Join Questions & Approval
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [joinQuestions, setJoinQuestions] = useState<ServerJoinQuestion[]>([]);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionRequired, setNewQuestionRequired] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

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

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Lütfen geçerli bir resim dosyası seçin.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Logo boyutu 2 MB değerini aşamaz.');
      return;
    }
    setError(null);
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleBannerFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Lütfen geçerli bir afiş dosyası seçin.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setError('Afiş boyutu 3 MB değerini aşamaz.');
      return;
    }
    setError(null);
    setBannerFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setBannerPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const addCustomChannel = () => {
    const trimmed = newCustomChannel.trim().toLowerCase().replace(/\s+/g, '-');
    if (!trimmed) return;
    if (customChannels.includes(trimmed)) {
      setError('Bu kanal adı zaten ekli.');
      return;
    }
    setCustomChannels([...customChannels, trimmed]);
    setNewCustomChannel('');
    setError(null);
  };

  const removeCustomChannel = (idx: number) => {
    setCustomChannels(customChannels.filter((_, i) => i !== idx));
  };

  const addJoinQuestion = () => {
    const text = newQuestionText.trim();
    if (!text) return;
    const newQ: ServerJoinQuestion = {
      id: 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      question: text,
      required: newQuestionRequired,
      order: joinQuestions.length,
    };
    setJoinQuestions([...joinQuestions, newQ]);
    setNewQuestionText('');
    setNewQuestionRequired(true);
  };

  const removeJoinQuestion = (id: string) => {
    setJoinQuestions(joinQuestions.filter((q) => q.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Lütfen bir sunucu adı belirleyin.');
      setStep(1);
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      // Determine initial avatar/banner URL if provided via URL
      const finalAvatarUrl = logoMode === 'url' && logoUrl.trim() ? logoUrl.trim() : null;
      const finalBannerUrl = bannerMode === 'url' && bannerUrl.trim() ? bannerUrl.trim() : null;

      // 1. Create Server
      const res = await api.createServer({
        name: name.trim(),
        purpose,
        description: description.trim() || null,
        rules: rules.trim() || null,
        welcomeMessage: welcomeMessage.trim() || null,
        requiresApproval: requiresApproval || joinQuestions.length > 0,
        joinQuestions: joinQuestions,
        avatarUrl: finalAvatarUrl,
        bannerUrl: finalBannerUrl,
      });

      const createdServer = res.server;

      // 2. Upload Logo File if selected
      if (logoMode === 'upload' && logoFile) {
        try {
          await api.uploadServerLogo(createdServer.id, logoFile);
        } catch (logoErr) {
          console.warn('Sunucu logosu yüklenirken uyarı:', logoErr);
        }
      }

      // 3. Upload Banner File if selected
      if (bannerMode === 'upload' && bannerFile) {
        try {
          await api.uploadServerBanner(createdServer.id, bannerFile);
        } catch (bannerErr) {
          console.warn('Sunucu afişi yüklenirken uyarı:', bannerErr);
        }
      }

      // 4. Create additional channels if requested
      if (createRules) {
        try {
          await api.createServerChannel(createdServer.id, {
            name: 'kurallar',
            isAnnouncementOnly: true,
          });
        } catch (chErr) {
          console.warn('Kurallar kanalı oluşturulamadı:', chErr);
        }
      }

      for (const chName of customChannels) {
        try {
          await api.createServerChannel(createdServer.id, {
            name: chName,
            isAnnouncementOnly: false,
          });
        } catch (chErr) {
          console.warn(`Kanal (${chName}) oluşturulamadı:`, chErr);
        }
      }

      // Fetch fresh server state
      const freshRes = await api.getServer(createdServer.id).catch(() => ({ server: createdServer }));
      onServerCreated(freshRes.server);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Sunucu oluşturulamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
      <div className="bg-[#120f1e] border border-[#2a2244] w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Wizard Header */}
        <div className="px-6 py-4 border-b border-[#241c38] flex items-center justify-between bg-gradient-to-r from-purple-950/40 via-[#120f1e] to-[#120f1e]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-900/60 border border-purple-700/50 flex items-center justify-center text-purple-300">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Topluluk Kurulum Sihirbazı</h2>
              <p className="text-[11px] text-slate-400">Discord tarzı kurumsal topluluk ve kanal alanı</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#1b152d] hover:bg-[#251d3e] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Wizard Step Progress Tracker */}
        <div className="grid grid-cols-4 border-b border-[#241c38] bg-[#0c0a15] text-[11px]">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`py-2.5 px-2 text-center font-bold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
              step === 1
                ? 'border-purple-500 text-purple-300 bg-purple-950/20'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-[#1e1732] text-[10px] flex items-center justify-center">1</span>
            <span className="truncate">Kimlik & Amaç</span>
          </button>
          <button
            type="button"
            onClick={() => setStep(2)}
            className={`py-2.5 px-2 text-center font-bold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
              step === 2
                ? 'border-purple-500 text-purple-300 bg-purple-950/20'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-[#1e1732] text-[10px] flex items-center justify-center">2</span>
            <span className="truncate">Kurallar</span>
          </button>
          <button
            type="button"
            onClick={() => setStep(3)}
            className={`py-2.5 px-2 text-center font-bold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
              step === 3
                ? 'border-purple-500 text-purple-300 bg-purple-950/20'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-[#1e1732] text-[10px] flex items-center justify-center">3</span>
            <span className="truncate">Kanallar</span>
          </button>
          <button
            type="button"
            onClick={() => setStep(4)}
            className={`py-2.5 px-2 text-center font-bold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
              step === 4
                ? 'border-purple-500 text-purple-300 bg-purple-950/20'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-[#1e1732] text-[10px] flex items-center justify-center">4</span>
            <span className="truncate">Katılım & Onay</span>
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* ================= STEP 1: KIMLIK & AMAC ================= */}
          {step === 1 && (
            <div className="space-y-4 animate-fade-in">
              {/* Server Name */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Topluluk Adı <span className="text-purple-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Örn: Türkiye Oyun ve Yazılım Topluluğu"
                  className="w-full px-3.5 py-2.5 bg-[#0b0914] border border-[#241c38] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Purpose / Type selection */}
              <div>
                <label className="block text-slate-300 font-semibold mb-2">Topluluk Amacı</label>
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

              {/* Description */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">Topluluk Açıklaması</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Topluluğun temel konusu, hedefleri ve üyeler için sundukları..."
                  className="w-full px-3.5 py-2 bg-[#0b0914] border border-[#241c38] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>

              {/* Logo & Banner Section */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Logo Box */}
                <div className="p-3 bg-[#0d0a17] border border-[#241c38] rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-300 text-xs">Topluluk Logosu</span>
                    <div className="flex items-center gap-1 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setLogoMode('upload')}
                        className={`px-2 py-0.5 rounded ${logoMode === 'upload' ? 'bg-purple-800 text-white' : 'text-slate-400'}`}
                      >
                        Dosya
                      </button>
                      <button
                        type="button"
                        onClick={() => setLogoMode('url')}
                        className={`px-2 py-0.5 rounded ${logoMode === 'url' ? 'bg-purple-800 text-white' : 'text-slate-400'}`}
                      >
                        URL
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-[#171227] border border-[#2c2247] flex items-center justify-center overflow-hidden shrink-0">
                      {logoPreview ? (
                        <img src={logoPreview} alt="Logo Önizleme" className="w-full h-full object-cover" />
                      ) : logoMode === 'url' && logoUrl.trim() ? (
                        <img src={logoUrl} alt="Logo Önizleme" className="w-full h-full object-cover" onError={() => setError('Logo URL yüklenemedi')} />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-purple-400/50" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {logoMode === 'upload' ? (
                        <div>
                          <input
                            ref={logoInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleLogoFile}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => logoInputRef.current?.click()}
                            className="w-full px-2.5 py-1.5 bg-[#1b152d] hover:bg-[#251d3e] text-slate-200 rounded-xl text-[11px] font-semibold transition-colors flex items-center justify-center gap-1.5"
                          >
                            <Upload className="w-3.5 h-3.5 text-purple-400" />
                            <span>Görsel Seç</span>
                          </button>
                        </div>
                      ) : (
                        <input
                          type="url"
                          value={logoUrl}
                          onChange={(e) => setLogoUrl(e.target.value)}
                          placeholder="https://.../logo.png"
                          className="w-full px-2.5 py-1.5 bg-[#0b0914] border border-[#241c38] rounded-xl text-white text-[11px] placeholder-slate-500 focus:outline-none focus:border-purple-500"
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Banner Box */}
                <div className="p-3 bg-[#0d0a17] border border-[#241c38] rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-300 text-xs">Topluluk Afişi (Banner)</span>
                    <div className="flex items-center gap-1 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setBannerMode('upload')}
                        className={`px-2 py-0.5 rounded ${bannerMode === 'upload' ? 'bg-purple-800 text-white' : 'text-slate-400'}`}
                      >
                        Dosya
                      </button>
                      <button
                        type="button"
                        onClick={() => setBannerMode('url')}
                        className={`px-2 py-0.5 rounded ${bannerMode === 'url' ? 'bg-purple-800 text-white' : 'text-slate-400'}`}
                      >
                        URL
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-20 h-14 rounded-2xl bg-[#171227] border border-[#2c2247] flex items-center justify-center overflow-hidden shrink-0">
                      {bannerPreview ? (
                        <img src={bannerPreview} alt="Afiş Önizleme" className="w-full h-full object-cover" />
                      ) : bannerMode === 'url' && bannerUrl.trim() ? (
                        <img src={bannerUrl} alt="Afiş Önizleme" className="w-full h-full object-cover" onError={() => setError('Afiş URL yüklenemedi')} />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-purple-400/50" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {bannerMode === 'upload' ? (
                        <div>
                          <input
                            ref={bannerInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleBannerFile}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => bannerInputRef.current?.click()}
                            className="w-full px-2.5 py-1.5 bg-[#1b152d] hover:bg-[#251d3e] text-slate-200 rounded-xl text-[11px] font-semibold transition-colors flex items-center justify-center gap-1.5"
                          >
                            <Upload className="w-3.5 h-3.5 text-purple-400" />
                            <span>Afiş Seç</span>
                          </button>
                        </div>
                      ) : (
                        <input
                          type="url"
                          value={bannerUrl}
                          onChange={(e) => setBannerUrl(e.target.value)}
                          placeholder="https://.../banner.png"
                          className="w-full px-2.5 py-1.5 bg-[#0b0914] border border-[#241c38] rounded-xl text-white text-[11px] placeholder-slate-500 focus:outline-none focus:border-purple-500"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 2: KURALLAR & KARŞILAMA ================= */}
          {step === 2 && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Hoş Geldin & Karşılama Mesajı
                </label>
                <textarea
                  rows={3}
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                  placeholder="Yeni katılan üyelere gösterilecek karşılama metni (Örn: Topluluğumuza hoş geldiniz! Lütfen kuralları okuyup kendinizi #tanışma kanalında tanıtın.)"
                  className="w-full px-3.5 py-2.5 bg-[#0b0914] border border-[#241c38] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Topluluk Kuralları
                </label>
                <textarea
                  rows={5}
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                  placeholder="1. Saygılı ve yapıcı bir dil kullanın.&#10;2. Reklam, spam ve izinsiz tanıtım yasaktır.&#10;3. Kişisel bilgileri paylaşmayın.&#10;4. Yetkili uyarılarına uyun."
                  className="w-full px-3.5 py-2.5 bg-[#0b0914] border border-[#241c38] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>

              <div className="p-3 bg-indigo-950/20 border border-indigo-800/40 rounded-2xl text-[11px] text-indigo-300 flex items-start gap-2.5">
                <FileText className="w-4 h-4 shrink-0 text-indigo-400 mt-0.5" />
                <span>
                  Belirlediğiniz kurallar ve karşılama mesajı yeni katılan üyelere sunulacak ve topluluk ayrıntılarında görüntülenebilecektir.
                </span>
              </div>
            </div>
          )}

          {/* ================= STEP 3: BASLANGIC KANALLARI ================= */}
          {step === 3 && (
            <div className="space-y-4 animate-fade-in">
              <p className="text-slate-400 text-xs">
                Topluluğunuz oluşturulduğunda ilk olarak kurulmasını istediğiniz kanalları belirleyin:
              </p>

              <div className="space-y-2">
                {/* General Channel */}
                <label className="flex items-center justify-between p-3 rounded-2xl bg-[#0d0a17] border border-[#241c38] cursor-pointer hover:border-purple-800/50 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-purple-950 text-purple-400">
                      <Hash className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-xs">#genel-sohbet</h4>
                      <p className="text-[10px] text-slate-400">Tüm üyelerin serbestçe mesajlaşabileceği ana sohbet kanalı</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={createGeneral}
                    onChange={(e) => setCreateGeneral(e.target.checked)}
                    className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                  />
                </label>

                {/* Announcements Channel */}
                <label className="flex items-center justify-between p-3 rounded-2xl bg-[#0d0a17] border border-[#241c38] cursor-pointer hover:border-purple-800/50 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-amber-950 text-amber-400">
                      <Megaphone className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-xs">#duyurular</h4>
                      <p className="text-[10px] text-slate-400">Sadece yöneticilerin ve yetkililerin yazabildiği duyuru kanalı</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={createAnnouncements}
                    onChange={(e) => setCreateAnnouncements(e.target.checked)}
                    className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                  />
                </label>

                {/* Rules Channel */}
                <label className="flex items-center justify-between p-3 rounded-2xl bg-[#0d0a17] border border-[#241c38] cursor-pointer hover:border-purple-800/50 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-indigo-950 text-indigo-400">
                      <Shield className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-xs">#kurallar</h4>
                      <p className="text-[10px] text-slate-400">Topluluk yönergelerinin sabitlendiği salt-okunur kanal</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={createRules}
                    onChange={(e) => setCreateRules(e.target.checked)}
                    className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                  />
                </label>
              </div>

              {/* Extra Custom Channels */}
              <div className="pt-2">
                <label className="block text-slate-300 font-semibold mb-1.5">Ek Özel Kanal Ekle</label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Hash className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3 pointer-events-none" />
                    <input
                      type="text"
                      value={newCustomChannel}
                      onChange={(e) => setNewCustomChannel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCustomChannel();
                        }
                      }}
                      placeholder="Örn: soru-cevap, oyun-odası"
                      className="w-full pl-8 pr-3 py-2 bg-[#0b0914] border border-[#241c38] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 text-xs"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addCustomChannel}
                    className="px-3.5 py-2 bg-[#1b152d] hover:bg-[#251d3e] text-purple-300 rounded-xl font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Ekle</span>
                  </button>
                </div>

                {customChannels.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    {customChannels.map((ch, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-xl bg-purple-950/60 border border-purple-800/40 text-purple-300 text-xs flex items-center gap-1.5"
                      >
                        <Hash className="w-3 h-3 text-purple-400" />
                        <span>{ch}</span>
                        <button
                          type="button"
                          onClick={() => removeCustomChannel(idx)}
                          className="hover:text-red-400 transition-colors ml-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= STEP 4: KATILIM SORULARI & GIRIS ONAYI ================= */}
          {step === 4 && (
            <div className="space-y-4 animate-fade-in">
              {/* Approval Requirement Toggle */}
              <div className="p-3.5 rounded-2xl bg-[#0d0a17] border border-[#241c38] flex items-center justify-between">
                <div className="pr-3">
                  <h4 className="font-bold text-white text-xs">Yönetici Onayı Zorunlu Olsun</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                    Yeni üyelerin katılabilmesi için başvuru sorularını yanıtlaması ve yetkililer tarafından onaylanması gerekir.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={requiresApproval}
                  onChange={(e) => setRequiresApproval(e.target.checked)}
                  className="w-5 h-5 accent-purple-600 rounded cursor-pointer shrink-0"
                />
              </div>

              {/* Join Questions Builder */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Katılım Başvuru Soruları
                </label>
                <p className="text-[11px] text-slate-400 mb-2 leading-relaxed">
                  Aday üyelerin yanıtlaması için sorular ekleyin. Yanıtlar yalnızca topluluk yöneticilerine özel kalır ve gizlilikle saklanır.
                </p>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-3">
                  <input
                    type="text"
                    value={newQuestionText}
                    onChange={(e) => setNewQuestionText(e.target.value)}
                    placeholder="Örn: Topluluğumuza katılma amacınız nedir?"
                    className="flex-1 px-3 py-2 bg-[#0b0914] border border-[#241c38] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 text-xs"
                  />
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-300 bg-[#161129] px-2.5 py-2 rounded-xl border border-[#281e42] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newQuestionRequired}
                        onChange={(e) => setNewQuestionRequired(e.target.checked)}
                        className="accent-purple-600"
                      />
                      <span>Zorunlu</span>
                    </label>
                    <button
                      type="button"
                      onClick={addJoinQuestion}
                      className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl text-xs flex items-center gap-1 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Soru Ekle</span>
                    </button>
                  </div>
                </div>

                {joinQuestions.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-[#0d0a17] border border-dashed border-[#241c38] text-center text-slate-500 text-xs">
                    Henüz bir katılım sorusu eklenmedi. Katılım sorusu eklenmezse davet bağlantısı olan herkes doğrudan katılabilir.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {joinQuestions.map((q, idx) => (
                      <div
                        key={q.id}
                        className="p-3 rounded-2xl bg-[#0d0a17] border border-[#241c38] flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded-full bg-purple-950 text-purple-400 font-bold text-[10px] flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="text-white font-medium truncate">{q.question}</span>
                          {q.required ? (
                            <span className="px-1.5 py-0.2 rounded text-[9px] bg-red-950/80 text-red-300 border border-red-800/40 shrink-0">
                              Zorunlu
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded text-[9px] bg-slate-800 text-slate-400 shrink-0">
                              İsteğe Bağlı
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeJoinQuestion(q.id)}
                          className="p-1 hover:text-red-400 text-slate-500 transition-colors shrink-0"
                          title="Soruyu Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Modal Navigation Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-[#241c38]">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((prev) => (prev - 1) as any)}
                className="px-4 py-2 bg-[#1b152d] hover:bg-[#251d3e] text-slate-300 rounded-xl font-semibold transition-colors flex items-center gap-1.5 text-xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Geri</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-[#1b152d] hover:bg-[#251d3e] text-slate-300 rounded-xl font-semibold transition-colors text-xs"
              >
                İptal
              </button>
            )}

            {step < 4 ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 1 && !name.trim()) {
                    setError('Lütfen bir topluluk adı belirleyin.');
                    return;
                  }
                  setError(null);
                  setStep((prev) => (prev + 1) as any);
                }}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-purple-950/50 transition-all text-xs"
              >
                <span>İleri</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting || !name.trim()}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-purple-950/50 transition-all disabled:opacity-50 text-xs"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Topluluk Kuruluyor...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Topluluğu Kur</span>
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
