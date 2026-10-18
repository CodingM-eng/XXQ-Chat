import React, { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { SafeAvatar } from './SafeAvatar';
import { toSafeImageUrl } from '../../utils/sanitizeSvg';
import {
  X,
  User as UserIcon,
  Check,
  Phone,
  Upload,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Palette,
  Trash2,
  Shield,
} from 'lucide-react';

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
];

const PRESET_ACCENT_COLORS = [
  { name: 'XXQ Mor', color: '#8b5cf6' },
  { name: 'Neon Pembe', color: '#ec4899' },
  { name: 'Derin Mavi', color: '#3b82f6' },
  { name: 'Zümrüt Yeşil', color: '#10b981' },
  { name: 'Sıcak Amber', color: '#f59e0b' },
  { name: 'Gül Kırmızı', color: '#f43f5e' },
  { name: 'Okyanus Turkuaz', color: '#06b6d4' },
  { name: 'İndigo Gece', color: '#6366f1' },
];

interface ProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileEditModal: React.FC<ProfileEditModalProps> = ({ isOpen, onClose }) => {
  const { user, updateUser } = useAuth();

  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [groupAddPrivacy, setGroupAddPrivacy] = useState<'everyone' | 'friends' | 'invite_only'>(
    user?.groupAddPrivacy || 'everyone'
  );

  // Avatar modes: 'preset' | 'file' | 'url'
  const [avatarMode, setAvatarMode] = useState<'preset' | 'file' | 'url'>('preset');
  const [selectedPreset, setSelectedPreset] = useState<string>(user?.avatarUrl || PRESET_AVATARS[0]);
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);

  // Banner state: 'file' | 'url'
  const [bannerMode, setBannerMode] = useState<'file' | 'url'>('file');
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(user?.bannerUrl || null);
  const [customBannerUrl, setCustomBannerUrl] = useState(user?.bannerUrl || '');
  const [removeBannerRequested, setRemoveBannerRequested] = useState(false);

  // Accent color
  const [accentColor, setAccentColor] = useState<string>(user?.accentColor || '#8b5cf6');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen || !user) return null;

  const currentAvatarPreview =
    avatarMode === 'file' && filePreview
      ? filePreview
      : avatarMode === 'url' && customAvatarUrl.trim()
      ? customAvatarUrl.trim()
      : selectedPreset;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Lütfen geçerli bir resim dosyası seçin (JPEG, PNG, WEBP, GIF).');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('Resim boyutu 2 MB değerini aşamaz. Lütfen daha küçük bir resim seçin.');
      return;
    }

    setError(null);
    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      setFilePreview(event.target?.result as string);
      setAvatarMode('file');
    };
    reader.readAsDataURL(file);
  };

  const handleBannerFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Lütfen geçerli bir afiş dosyası seçin (JPEG, PNG, WEBP, GIF).');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('Afiş boyutu 2 MB değerini aşamaz. Lütfen daha küçük bir resim seçin.');
      return;
    }

    setError(null);
    setBannerFile(file);
    setRemoveBannerRequested(false);

    const reader = new FileReader();
    reader.onload = (event) => {
      setBannerPreview(event.target?.result as string);
      setBannerMode('file');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveBanner = () => {
    setBannerFile(null);
    setBannerPreview(null);
    setCustomBannerUrl('');
    setRemoveBannerRequested(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('Lütfen bir görünen isim belirleyin.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      let finalAvatarUrl: string | undefined = undefined;

      if (avatarMode === 'file' && selectedFile) {
        const uploadRes = await api.uploadAvatar(selectedFile);
        finalAvatarUrl = uploadRes.avatarUrl;
      } else if (avatarMode === 'url' && customAvatarUrl.trim()) {
        finalAvatarUrl = customAvatarUrl.trim();
      } else if (avatarMode === 'preset') {
        finalAvatarUrl = selectedPreset;
      }

      // Handle Banner
      let finalBannerUrl: string | null | undefined = undefined;
      if (removeBannerRequested) {
        try {
          await api.removeBanner();
          finalBannerUrl = null;
        } catch (bErr) {
          console.warn('Afiş silinirken hata:', bErr);
        }
      } else if (bannerMode === 'file' && bannerFile) {
        try {
          const bannerRes = await api.uploadBanner(bannerFile);
          finalBannerUrl = bannerRes.bannerUrl;
        } catch (bErr: any) {
          console.warn('Afiş dosyası yüklenemedi:', bErr);
        }
      } else if (bannerMode === 'url') {
        finalBannerUrl = customBannerUrl.trim() || null;
      }

      const res = await api.updateMe({
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        displayName: displayName.trim(),
        avatarUrl: finalAvatarUrl ? toSafeImageUrl(finalAvatarUrl) || undefined : undefined,
        bannerUrl: finalBannerUrl !== undefined ? (toSafeImageUrl(finalBannerUrl) || null) : undefined,
        accentColor: accentColor || null,
        phoneNumber: phoneNumber.trim() || undefined,
        bio: bio.trim() || null,
        groupAddPrivacy,
      });

      updateUser(res.user);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 900);
    } catch (err: any) {
      setError(err.message || 'Profil güncellenirken bir hata oluştu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in select-none">
      <div className="bg-[#120f1e] border border-[#2a2244] w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#241c38] flex items-center justify-between bg-gradient-to-r from-purple-950/40 via-[#120f1e] to-[#120f1e]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-900/60 border border-purple-700/50 flex items-center justify-center text-purple-300">
              <UserIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Profil & Kişiselleştirme</h2>
              <p className="text-[11px] text-slate-400">Ücretsiz afiş, özel tema renkleri ve profil bilgileri</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#1b152d] hover:bg-[#251d3e] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-300">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400" />
              <span>Profil ve kişiselleştirmeleriniz başarıyla kaydedildi!</span>
            </div>
          )}

          {/* Free Personalization Notice */}
          <div className="p-3.5 bg-gradient-to-r from-purple-950/80 via-[#1d1435] to-indigo-950/80 border border-purple-600/50 rounded-2xl flex items-start gap-3 shadow-md">
            <div className="p-2 rounded-xl bg-purple-600 text-white shrink-0 shadow">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                <span>Herkes İçin %100 Ücretsiz Kişiselleştirme</span>
              </h4>
              <p className="text-[11px] text-purple-200/90 leading-relaxed mt-0.5">
                XXQ Chat'te profil afişi, özel tema ve vurgu renkleri, özel avatar ve tüm emojiler/reaksiyonlar tüm kullanıcılara tamamen ücretsizdir. Ücretli abonelik veya kilitli özellikler bulunmaz.
              </p>
            </div>
          </div>

          {/* Banner & Live Header Preview */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Profil Afişi (Banner)
            </label>

            {/* Banner preview card */}
            <div
              className="w-full h-28 rounded-2xl bg-[#18122c] border border-[#2b2046] overflow-hidden relative bg-cover bg-center mb-2 flex items-end p-3 shadow-inner"
              style={{
                backgroundColor: accentColor || '#312356',
                backgroundImage: toSafeImageUrl(bannerPreview) ? `url(${toSafeImageUrl(bannerPreview)})` : undefined,
              }}
            >
              <div
                className="w-14 h-14 rounded-xl overflow-hidden border-2 bg-[#120f1e] flex items-center justify-center text-white font-bold text-lg shadow-lg shrink-0"
                style={{ borderColor: accentColor }}
              >
                <SafeAvatar
                  src={currentAvatarPreview}
                  alt="Önizleme"
                  className="w-full h-full object-cover"
                  fallbackText={displayName || user?.displayName || 'XXQ'}
                  size={56}
                />
              </div>

              {bannerPreview && (
                <button
                  type="button"
                  onClick={handleRemoveBanner}
                  className="absolute top-2 right-2 px-2.5 py-1 bg-black/70 hover:bg-red-950 text-red-300 hover:text-red-200 rounded-lg text-[10px] font-semibold transition-colors flex items-center gap-1 backdrop-blur-sm"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Afişi Kaldır</span>
                </button>
              )}
            </div>

            {/* Banner controls */}
            <div className="flex items-center gap-2">
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                onChange={handleBannerFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => bannerInputRef.current?.click()}
                className="px-3 py-1.5 bg-[#1b152d] hover:bg-[#251d3e] text-purple-300 rounded-xl font-semibold transition-colors flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Afiş Yükle</span>
              </button>
              <div className="flex-1">
                <input
                  type="url"
                  placeholder="Veya afiş görsel URL bağlantısı girin..."
                  value={customBannerUrl}
                  onChange={(e) => {
                    setCustomBannerUrl(e.target.value);
                    setBannerPreview(e.target.value || null);
                    setBannerMode('url');
                    setRemoveBannerRequested(false);
                  }}
                  className="w-full px-3 py-1.5 bg-[#0b0914] border border-[#241c38] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Önerilen boyut: 600x200 piksel. Güvenlik ve kaynak koruması amacıyla dosya boyutu 2 MB ile sınırlıdır.
            </p>
          </div>

          {/* Accent Color Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Özel Profil Vurgu Rengi
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_ACCENT_COLORS.map((item) => (
                <button
                  type="button"
                  key={item.color}
                  onClick={() => setAccentColor(item.color)}
                  className={`w-7 h-7 rounded-xl transition-transform flex items-center justify-center border-2 ${
                    accentColor === item.color
                      ? 'scale-110 border-white shadow-lg'
                      : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: item.color }}
                  title={item.name}
                >
                  {accentColor === item.color && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                </button>
              ))}

              {/* Custom Color Input */}
              <label
                className="w-7 h-7 rounded-xl border border-dashed border-slate-600 hover:border-purple-400 cursor-pointer flex items-center justify-center overflow-hidden"
                title="Özel Renk Seç"
              >
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="opacity-0 w-full h-full cursor-pointer"
                />
                <Palette className="w-3.5 h-3.5 text-slate-400 absolute pointer-events-none" />
              </label>

              <button
                type="button"
                onClick={() => setAccentColor('#8b5cf6')}
                className="text-[11px] text-purple-400 hover:text-purple-300 font-semibold ml-1"
              >
                Sıfırla
              </button>
            </div>
          </div>

          {/* Name Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#241c38]">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Adınız</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Örn: Efe"
                className="w-full px-3.5 py-2.5 bg-[#0b0914] border border-[#241c38] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Soyadınız</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Örn: Karahan"
                className="w-full px-3.5 py-2.5 bg-[#0b0914] border border-[#241c38] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
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
              className="w-full px-3.5 py-2.5 bg-[#0b0914] border border-[#241c38] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
            {/* Platform Role Badges */}
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[10px] text-slate-400">Yetki / Rol:</span>
              {user.isAdmin ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-700/60 shadow-sm">
                  Platform Yöneticisi
                </span>
              ) : user.isFamily ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-950/80 text-pink-300 border border-pink-700/60 shadow-sm">
                  Aile Üyesi
                </span>
              ) : user.isModerator ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-950/80 text-blue-300 border border-blue-700/60 shadow-sm">
                  Moderatör
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#1e1732] text-slate-300 border border-[#31254e]">
                  Kullanıcı
                </span>
              )}
            </div>
          </div>

          {/* Hakkımda (Bio) Field */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Hakkımda (Biyografi)
              </label>
              <span className="text-[10px] font-mono text-slate-400">
                {bio.length}/500
              </span>
            </div>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 500))}
              rows={3}
              placeholder="Kendinizden, ilgi alanlarınızdan veya durumunuzdan bahsedin..."
              className="w-full px-3.5 py-2.5 bg-[#0b0914] border border-[#241c38] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors resize-none"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Bu bilgi profilinizi inceleyen diğer kullanıcılara ve sohbet katılımcılarına görünür.
            </p>
          </div>

          {/* Group Add Privacy */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Grup Davet ve Ekleme Gizliliği
            </label>
            <select
              value={groupAddPrivacy}
              onChange={(e: any) => setGroupAddPrivacy(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#0b0914] border border-[#241c38] rounded-xl text-xs text-white focus:outline-none focus:border-purple-500 transition-colors cursor-pointer"
            >
              <option value="everyone">Herkes (Beni herhangi biri gruplara ekleyebilir)</option>
              <option value="friends">Yalnızca Arkadaşlarım (Sadece arkadaşlarım gruplara ekleyebilir)</option>
              <option value="invite_only">Yalnızca Davetle (Gruplara doğrudan eklenemem, davet onayı gerekir)</option>
            </select>
          </div>

          {/* Avatar Options */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">Profil Fotoğrafı</label>

            {/* Mode selection tabs */}
            <div className="flex items-center gap-1.5 mb-2.5">
              <button
                type="button"
                onClick={() => setAvatarMode('preset')}
                className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                  avatarMode === 'preset'
                    ? 'bg-purple-600 text-white'
                    : 'bg-[#181329] text-slate-400 hover:text-white'
                }`}
              >
                Hazır Avatarlar
              </button>
              <button
                type="button"
                onClick={() => setAvatarMode('url')}
                className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                  avatarMode === 'url'
                    ? 'bg-purple-600 text-white'
                    : 'bg-[#181329] text-slate-400 hover:text-white'
                }`}
              >
                Web Bağlantısı (URL)
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1 rounded-lg text-[11px] font-semibold bg-[#181329] text-purple-300 hover:text-white transition-colors flex items-center gap-1 ml-auto"
              >
                <Upload className="w-3 h-3" />
                <span>Dosya Yükle</span>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/png, image/jpeg, image/webp, image/gif"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {avatarMode === 'preset' && (
              <div className="grid grid-cols-6 gap-2">
                {PRESET_AVATARS.map((url, idx) => (
                  <button
                    type="button"
                    key={idx}
                    onClick={() => {
                      setSelectedPreset(url);
                      setSelectedFile(null);
                      setFilePreview(null);
                    }}
                    className={`relative w-full aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                      selectedPreset === url
                        ? 'border-purple-500 ring-2 ring-purple-500/50 scale-105 shadow-md'
                        : 'border-[#241c38] opacity-75 hover:opacity-100 hover:border-purple-700'
                    }`}
                  >
                    <SafeAvatar src={url} alt={`Avatar ${idx + 1}`} className="w-full h-full object-cover" size={48} />
                    {selectedPreset === url && (
                      <div className="absolute inset-0 bg-purple-900/40 flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {avatarMode === 'url' && (
              <input
                type="url"
                value={customAvatarUrl}
                onChange={(e) => setCustomAvatarUrl(e.target.value)}
                placeholder="https://example.com/resmim.png"
                className="w-full px-3.5 py-2 bg-[#0b0914] border border-[#241c38] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />
            )}
          </div>

          {/* Optional Phone Number */}
          <div className="pt-2 border-t border-[#241c38]">
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Telefon Numarası <span className="text-[10px] text-slate-500 font-normal">(İsteğe bağlı)</span>
            </label>
            <div className="relative">
              <Phone className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3 pointer-events-none" />
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+90 5XX XXX XX XX"
                className="w-full pl-9 pr-3.5 py-2.5 bg-[#0b0914] border border-[#241c38] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Telefon numaranız yalnızca hesap kurtarma veya güvenlik için saklanır, diğer kullanıcılara asla gösterilmez.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#241c38]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-[#1b152d] transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-900/30 transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Kaydediliyor...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Değişiklikleri Kaydet</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
