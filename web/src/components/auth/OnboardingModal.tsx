import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { BrandLogo } from '../common/BrandLogo';
import { User as UserIcon, Shield, Sparkles, Check, Phone, ArrowRight, Loader2 } from 'lucide-react';

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
];

export const OnboardingModal: React.FC = () => {
  const { user, refreshSession } = useAuth();

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('Lütfen bir görünen isim belirleyin.');
      return;
    }

    const finalAvatar = useCustomUrl && customAvatarUrl.trim() ? customAvatarUrl.trim() : selectedAvatar;

    try {
      setIsSubmitting(true);
      setError(null);

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
      });

      await refreshSession();
    } catch (err: any) {
      setError(err.message || 'Profil kaydedilirken bir hata oluştu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-800/80 bg-gradient-to-r from-purple-950/40 via-slate-900 to-slate-900 flex items-center gap-4">
          <BrandLogo size={40} />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">Hoş Geldiniz! Profilinizi Tamamlayın</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-900/60 text-purple-300 border border-purple-700/50 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-purple-400" /> İlk Kurulum
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">XXQ Chat sohbetlerine başlamadan önce profil bilgilerinizi onaylayın.</p>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-300">
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
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Soyadınız</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Örn: Karahan"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
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
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
            <p className="text-[11px] text-slate-500 mt-1">Grup ve birebir sohbetlerde diğer kullanıcılara bu isim gösterilir.</p>
          </div>

          {/* Avatar Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">Profil Resmi Seçin</label>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-purple-500 bg-slate-800 flex-shrink-0 shadow-lg shadow-purple-900/20">
                <img
                  src={useCustomUrl && customAvatarUrl.trim() ? customAvatarUrl.trim() : selectedAvatar}
                  alt="Seçili Avatar"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = PRESET_AVATARS[0];
                  }}
                />
              </div>
              <div className="text-xs text-slate-400">
                <p className="font-medium text-slate-200">Mevcut Önizleme</p>
                <p className="text-[11px] text-slate-500">Aşağıdan bir hazır avatar seçebilir veya kendi resminizi kullanabilirsiniz.</p>
              </div>
            </div>

            {/* Presets */}
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
                      : 'border-slate-800 hover:border-slate-700 opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={url} alt={`Avatar ${idx + 1}`} className="w-full h-full object-cover" />
                  {!useCustomUrl && selectedAvatar === url && (
                    <div className="absolute inset-0 bg-purple-600/30 flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Custom URL Option */}
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setUseCustomUrl(!useCustomUrl)}
                className="text-[11px] text-purple-400 hover:text-purple-300 font-medium underline"
              >
                {useCustomUrl ? 'Hazır avatarlardan seç' : 'Özel resim bağlantısı (URL) gir'}
              </button>
              {useCustomUrl && (
                <input
                  type="url"
                  placeholder="https://example.com/avatar.jpg"
                  value={customAvatarUrl}
                  onChange={(e) => setCustomAvatarUrl(e.target.value)}
                  className="mt-1.5 w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
                />
              )}
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
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Kendinizden bahsedin (hobiler, ilgi alanları, durum vb.)..."
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition-colors resize-none"
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
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500 transition-colors"
            >
              <option value="everyone">Herkes doğrudan ekleyebilir</option>
              <option value="friends">Yalnızca Arkadaşlarım ekleyebilir</option>
              <option value="invite_only">Yalnızca Davet Bağlantısıyla katılırım</option>
            </select>
          </div>

          {/* Private Phone Number */}
          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
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
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
            />
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-500">
              <Shield className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <span>Gizlilik Güvencesi: Numaranız diğer kullanıcılara asla gösterilmez.</span>
            </div>
          </div>

          {/* Community Rules & Etiquette Card */}
          <div className="p-3.5 rounded-2xl bg-purple-950/20 border border-purple-800/40 text-xs text-purple-200/90 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-purple-300">
              <Sparkles className="w-3.5 h-3.5" />
              <span>XXQ Chat Topluluk İlkeleri</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Topluluk Kuralları: Saygılı iletişim, gizliliğe özen, spam veya rahatsız edici içerik paylaşmama ilkesine bağlı kalmayı kabul etmiş sayılırsınız.
            </p>
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 transition-all"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Profil Kaydediliyor...</span>
                </>
              ) : (
                <>
                  <span>Profilimi Kaydet ve Başla</span>
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
