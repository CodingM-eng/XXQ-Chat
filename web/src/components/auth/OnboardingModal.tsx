import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { BrandLogo } from '../common/BrandLogo';
import { SafeAvatar } from '../common/SafeAvatar';
import { toSafeImageUrl } from '../../utils/sanitizeSvg';
import { GifPickerModal, SelectedGif } from '../chat/GifPickerModal';
import {
  User as UserIcon,
  Shield,
  Sparkles,
  Check,
  Phone,
  ArrowRight,
  Loader2,
  Bell,
  Sun,
  Moon,
  Camera,
  Mic,
  HardDrive,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
];

export const OnboardingModal: React.FC = () => {
  const { user, refreshSession, theme, toggleTheme } = useAuth();

  const isExistingUser = !!user?.onboarded && !user?.displayName?.trim();

  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [selectedAvatar, setSelectedAvatar] = useState<string>(user?.avatarUrl || PRESET_AVATARS[0]);
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [groupAddPrivacy, setGroupAddPrivacy] = useState<'everyone' | 'friends' | 'invite_only'>(
    user?.groupAddPrivacy || 'everyone'
  );
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const [useCustomUrl, setUseCustomUrl] = useState(false);
  const [isGifPickerOpen, setIsGifPickerOpen] = useState(false);

  // Preference states
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    localStorage.getItem('xxq_notifications_enabled') !== 'false'
  );
  const [soundEnabled, setSoundEnabled] = useState(
    localStorage.getItem('xxq_notification_sound') !== 'false'
  );
  const [messagePreviewsEnabled, setMessagePreviewsEnabled] = useState(
    localStorage.getItem('xxq_notification_previews') !== 'false'
  );

  const [selectedTheme, setSelectedTheme] = useState<'dark' | 'light'>(theme || 'dark');
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [showRulesDetail, setShowRulesDetail] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectAvatarGif = (gif: SelectedGif) => {
    setIsGifPickerOpen(false);
    setCustomAvatarUrl(gif.url);
    setUseCustomUrl(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('Lütfen bir görünen isim belirleyin.');
      return;
    }

    if (!isExistingUser && !rulesAccepted) {
      setError('Devam edebilmek için Topluluk İlkeleri ve Kurallarını onaylamanız gerekmektedir.');
      return;
    }

    const rawAvatar = useCustomUrl && customAvatarUrl.trim() ? customAvatarUrl.trim() : selectedAvatar;
    const finalAvatar = toSafeImageUrl(rawAvatar) || undefined;

    try {
      setIsSubmitting(true);
      setError(null);

      // Save notification preferences locally
      localStorage.setItem('xxq_notifications_enabled', notificationsEnabled ? 'true' : 'false');
      localStorage.setItem('xxq_notification_sound', soundEnabled ? 'true' : 'false');
      localStorage.setItem('xxq_notification_previews', messagePreviewsEnabled ? 'true' : 'false');

      if (selectedTheme !== theme) {
        toggleTheme();
      }

      await api.completeOnboarding({
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        displayName: displayName.trim(),
        avatarUrl: finalAvatar || undefined,
        phoneNumber: phoneNumber.trim() || undefined,
      });

      await api.updateMe({
        bio: bio.trim() || null,
        groupAddPrivacy,
        themePreference: selectedTheme,
      });

      await refreshSession();
    } catch (err: any) {
      setError(err.message || 'Profil kaydedilirken bir hata oluştu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="bg-[#120e24] border border-[#2b224c] w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-[#2b224c] bg-gradient-to-r from-purple-950/60 via-[#181232] to-[#120e24] flex items-center gap-4">
          <BrandLogo size={40} />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-white">
                {isExistingUser ? 'Görünen İsminizi Belirleyin' : 'Hoş Geldiniz! Profilinizi Tamamlayın'}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-900/60 text-purple-300 border border-purple-700/50 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-purple-400" /> {isExistingUser ? 'Zorunlu Alan' : 'İlk Kurulum'}
              </span>
            </div>
            <p className="text-xs text-purple-300/80 mt-0.5">
              {isExistingUser
                ? 'Sohbetlerde arkadaşlarınızın sizi tanıyabilmesi için lütfen bir isim belirleyin.'
                : 'XXQ Chat sohbetlerine başlamadan önce tercihlerinizi ve profilinizi onaylayın.'}
            </p>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-950/80 border border-rose-800/80 rounded-xl text-xs text-rose-200">
              {error}
            </div>
          )}

          {/* Name Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Adınız</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Örn: Efe"
                className="w-full px-3.5 py-2.5 bg-[#0b0817] border border-[#271f42] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Soyadınız</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Örn: Karahan"
                className="w-full px-3.5 py-2.5 bg-[#0b0817] border border-[#271f42] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Sohbetlerde Görünen İsim <span className="text-purple-400">*</span>
            </label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Örn: Efe Karahan"
              className="w-full px-3.5 py-2.5 bg-[#0b0817] border border-[#271f42] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
            <p className="text-[11px] text-slate-400 mt-1">Grup ve birebir sohbetlerde diğer kullanıcılara bu isim gösterilir.</p>
          </div>

          {/* Avatar Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">Profil Resmi veya Tenor GIF</label>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-purple-500 bg-[#161129] flex-shrink-0 shadow-lg shadow-purple-900/30">
                <SafeAvatar
                  src={useCustomUrl && customAvatarUrl.trim() ? customAvatarUrl.trim() : selectedAvatar}
                  alt="Seçili Avatar"
                  className="w-full h-full object-cover"
                  fallbackText={displayName || 'XXQ'}
                  size={56}
                />
              </div>
              <div className="text-xs text-slate-300">
                <p className="font-semibold text-white">Mevcut Önizleme</p>
                <div className="flex items-center gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setIsGifPickerOpen(true)}
                    className="px-2.5 py-1 bg-purple-900/40 hover:bg-purple-900/60 border border-purple-600/50 rounded-lg text-purple-200 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                  >
                    <Sparkles className="w-3 h-3 text-purple-400" />
                    <span>Tenor GIF Seç</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseCustomUrl(!useCustomUrl)}
                    className="text-[11px] text-purple-400 hover:text-purple-300 underline"
                  >
                    {useCustomUrl ? 'Hazır avatarlar' : 'Özel URL'}
                  </button>
                </div>
              </div>
            </div>

            {/* Presets */}
            {!useCustomUrl && (
              <div className="grid grid-cols-6 gap-2 mb-2">
                {PRESET_AVATARS.map((url, idx) => (
                  <button
                    type="button"
                    key={idx}
                    onClick={() => {
                      setSelectedAvatar(url);
                      setUseCustomUrl(false);
                    }}
                    className={`relative w-full aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                      !useCustomUrl && selectedAvatar === url
                        ? 'border-purple-500 scale-105 shadow-md shadow-purple-500/30'
                        : 'border-[#271f42] hover:border-purple-600 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <SafeAvatar src={url} alt={`Avatar ${idx + 1}`} className="w-full h-full object-cover" size={48} />
                    {!useCustomUrl && selectedAvatar === url && (
                      <div className="absolute inset-0 bg-purple-600/30 flex items-center justify-center">
                        <Check className="w-4 h-4 text-white stroke-[3]" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {useCustomUrl && (
              <input
                type="url"
                placeholder="https://example.com/avatar.gif"
                value={customAvatarUrl}
                onChange={(e) => setCustomAvatarUrl(e.target.value)}
                className="w-full px-3 py-2 bg-[#0b0817] border border-[#271f42] rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
              />
            )}
          </div>

          {!isExistingUser && (
            <>
              {/* Theme Choice */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Görünüm Teması</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedTheme('dark')}
                    className={`p-3 rounded-2xl border text-left transition-all flex items-center gap-2.5 ${
                      selectedTheme === 'dark'
                        ? 'bg-purple-950/40 border-purple-500 shadow-md text-white'
                        : 'bg-[#0b0817] border-[#271f42] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Moon className="w-4 h-4 text-purple-400 shrink-0" />
                    <div>
                      <div className="text-xs font-bold">Koyu Tema (Önerilen)</div>
                      <div className="text-[10px] opacity-70">Göz yormayan kömür moru</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedTheme('light')}
                    className={`p-3 rounded-2xl border text-left transition-all flex items-center gap-2.5 ${
                      selectedTheme === 'light'
                        ? 'bg-purple-950/40 border-purple-500 shadow-md text-white'
                        : 'bg-[#0b0817] border-[#271f42] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Sun className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <div className="text-xs font-bold">Açık Tema</div>
                      <div className="text-[10px] opacity-70">Ferah lavanta beyazı</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Notification Preferences */}
              <div className="bg-[#181330] border border-[#2b2350] rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-xs text-purple-300">
                  <Bell className="w-4 h-4 text-purple-400" />
                  <span>Bildirim Tercihleri</span>
                </div>

                <div className="space-y-2 pt-1 text-xs text-slate-300">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notificationsEnabled}
                      onChange={(e) => setNotificationsEnabled(e.target.checked)}
                      className="rounded bg-black/40 border-slate-700 text-purple-600 focus:ring-purple-500"
                    />
                    <span>Yeni mesaj ve arama bildirimlerini etkinleştir</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={soundEnabled}
                      onChange={(e) => setSoundEnabled(e.target.checked)}
                      className="rounded bg-black/40 border-slate-700 text-purple-600 focus:ring-purple-500"
                    />
                    <span>Nazik bildirim zil sesini çal (Dahili ses)</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={messagePreviewsEnabled}
                      onChange={(e) => setMessagePreviewsEnabled(e.target.checked)}
                      className="rounded bg-black/40 border-slate-700 text-purple-600 focus:ring-purple-500"
                    />
                    <span>Bildirimlerde gönderen ve mesaj önizlemesini göster</span>
                  </label>
                  {!messagePreviewsEnabled && (
                    <p className="text-[10px] text-purple-300 italic pl-6">
                      Önizleme kapalıyken bildirimlerde yalnızca "Yeni bir mesajınız var" ifadesi gösterilir; içerik gizli tutulur.
                    </p>
                  )}
                </div>
              </div>

              {/* Mobile / Android Permissions Guide Card */}
              <div className="bg-[#181330] border border-[#2b2350] rounded-2xl p-4 space-y-2 text-xs text-slate-300">
                <h4 className="font-bold text-purple-300 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-purple-400" />
                  Cihaz ve Sistem İzinleri Açıklaması
                </h4>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 pt-1">
                  <div className="flex items-center gap-1.5 bg-black/25 p-2 rounded-xl">
                    <Mic className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span>Mikrofon: Sesli mesaj & görüşmeler</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-black/25 p-2 rounded-xl">
                    <Camera className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span>Kamera: Görüntülü aramalar</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-black/25 p-2 rounded-xl">
                    <HardDrive className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span>Depolama: Dosya ve medya paylaşımı</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-black/25 p-2 rounded-xl">
                    <Bell className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span>Bildirimler: Canlı mesaj uyarıları</span>
                  </div>
                </div>
              </div>

              {/* Bio / Hakkımda */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Hakkımda <span className="text-slate-500 font-normal">(İsteğe Bağlı)</span>
                  </label>
                  <span className="text-[10px] text-slate-500">{bio.length}/500</span>
                </div>
                <textarea
                  maxLength={500}
                  rows={2}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Kendinizden bahsedin (hobiler, ilgi alanları, durum vb.)..."
                  className="w-full px-3.5 py-2.5 bg-[#0b0817] border border-[#271f42] rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition-colors resize-none"
                />
              </div>

              {/* Group Add Privacy */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Beni Gruplara Kimler Ekleyebilir?
                </label>
                <select
                  value={groupAddPrivacy}
                  onChange={(e) => setGroupAddPrivacy(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 bg-[#0b0817] border border-[#271f42] rounded-xl text-xs text-white focus:outline-none focus:border-purple-500 transition-colors"
                >
                  <option value="everyone">Herkes doğrudan ekleyebilir</option>
                  <option value="friends">Yalnızca Arkadaşlarım ekleyebilir</option>
                  <option value="invite_only">Yalnızca Davet Bağlantısıyla katılırım</option>
                </select>
              </div>

              {/* Phone Number */}
              <div className="p-3.5 rounded-2xl bg-[#181330] border border-[#2b2350]">
                <div className="flex items-center gap-2 mb-1.5">
                  <Phone className="w-4 h-4 text-purple-400" />
                  <label className="text-xs font-semibold text-slate-300">
                    Telefon Numarası <span className="text-slate-500 font-normal">(İsteğe Bağlı)</span>
                  </label>
                </div>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+90 555 123 4567"
                  className="w-full px-3 py-2 bg-[#0b0817] border border-[#271f42] rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
                />
                <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-400">
                  <Shield className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span>Gizlilik Güvencesi: Numaranız diğer üyelere asla gösterilmez.</span>
                </div>
              </div>

              {/* Community Rules & Agreement */}
              <div className="p-3.5 rounded-2xl bg-purple-950/20 border border-purple-800/40 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-purple-300">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>XXQ Chat Topluluk İlkeleri</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRulesDetail(!showRulesDetail)}
                    className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-0.5"
                  >
                    <span>{showRulesDetail ? 'Gizle' : 'Kuralları İncele'}</span>
                    {showRulesDetail ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>

                {showRulesDetail && (
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-300 pl-1 py-1 border-t border-purple-900/40">
                    <li>Diğer üyelere ve topluluklara karşı her zaman saygılı ve dürüst iletişim kurun.</li>
                    <li>Spam, zararlı bağlantı veya rahatsız edici içerik paylaşmayın.</li>
                    <li>Kişisel ve ailevi verilerin gizliliğini ihlal edecek paylaşımlardan kaçının.</li>
                    <li>Kurallara uymayan hesaplar platform yöneticileri tarafından engellenebilir.</li>
                  </ul>
                )}

                <label className="flex items-start gap-2.5 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={rulesAccepted}
                    onChange={(e) => setRulesAccepted(e.target.checked)}
                    className="mt-0.5 rounded bg-black/40 border-purple-700 text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-[11px] text-slate-200">
                    Topluluk Kurallarını ve Gizlilik İlkelerini okudum, kabul ediyorum. <strong className="text-purple-400">*</strong>
                  </span>
                </label>
              </div>
            </>
          )}

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || (!isExistingUser && !rulesAccepted)}
              className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Profil Kaydediliyor...</span>
                </>
              ) : (
                <>
                  <span>{isExistingUser ? 'Görünen İsmi Kaydet ve Devam Et' : 'Profilimi Kaydet ve Başla'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Tenor GIF Picker for Avatar */}
      <GifPickerModal
        isOpen={isGifPickerOpen}
        onClose={() => setIsGifPickerOpen(false)}
        onSelect={handleSelectAvatarGif}
        title="Avatar için Tenor GIF Seç"
      />
    </div>
  );
};
