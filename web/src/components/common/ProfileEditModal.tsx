import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { X, User as UserIcon, Shield, Check, Phone, Save, Loader2, Sparkles } from 'lucide-react';

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
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
  const [selectedAvatar, setSelectedAvatar] = useState<string>(user?.avatarUrl || PRESET_AVATARS[0]);
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const [useCustomUrl, setUseCustomUrl] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen || !user) return null;

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

      const res = await api.updateMe({
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        displayName: displayName.trim(),
        avatarUrl: finalAvatar || undefined,
        phoneNumber: phoneNumber.trim() || undefined,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#120f1e] border border-[#2a2244] w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#241c38] flex items-center justify-between bg-gradient-to-r from-purple-950/40 via-[#120f1e] to-[#120f1e]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-900/60 border border-purple-700/50 flex items-center justify-center text-purple-300">
              <UserIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Profilimi Düzenle</h2>
              <p className="text-[11px] text-slate-400">Kişisel bilgilerinizi ve avatarınızı güncelleyin</p>
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[75vh]">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-300">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400" />
              <span>Profil başarıyla güncellendi!</span>
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
          </div>

          {/* Avatar Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">Profil Resmi</label>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-purple-500 bg-[#161224] flex-shrink-0 shadow-lg shadow-purple-950/40">
                <img
                  src={useCustomUrl && customAvatarUrl.trim() ? customAvatarUrl.trim() : selectedAvatar}
                  alt="Avatar Önizleme"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = PRESET_AVATARS[0];
                  }}
                />
              </div>
              <div className="text-xs text-slate-400">
                <p className="font-medium text-slate-200">Mevcut Görünüm</p>
                <p className="text-[11px] text-slate-500">Aşağıdaki hazır avatarlardan birini seçin veya özel bir bağlantı girin.</p>
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
                      ? 'border-purple-500 ring-2 ring-purple-500/50 scale-105 shadow-md'
                      : 'border-[#241c38] opacity-75 hover:opacity-100 hover:border-purple-700'
                  }`}
                >
                  <img src={url} alt={`Avatar ${idx + 1}`} className="w-full h-full object-cover" />
                  {!useCustomUrl && selectedAvatar === url && (
                    <div className="absolute inset-0 bg-purple-900/40 flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Custom URL Option */}
            <div className="mt-2">
              <div className="flex items-center gap-2 mb-1.5">
                <input
                  type="checkbox"
                  id="customUrlCheckEdit"
                  checked={useCustomUrl}
                  onChange={(e) => setUseCustomUrl(e.target.checked)}
                  className="rounded border-[#241c38] bg-[#0b0914] text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
                />
                <label htmlFor="customUrlCheckEdit" className="text-[11px] text-slate-300 font-medium cursor-pointer">
                  Özel resim bağlantısı (URL) kullan
                </label>
              </div>
              {useCustomUrl && (
                <input
                  type="url"
                  value={customAvatarUrl}
                  onChange={(e) => setCustomAvatarUrl(e.target.value)}
                  placeholder="https://example.com/profil-resmim.png"
                  className="w-full px-3.5 py-2 bg-[#0b0914] border border-[#241c38] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              )}
            </div>
          </div>

          {/* Optional Phone Number with Privacy Protection Notice */}
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
            <div className="mt-2 p-2.5 rounded-xl bg-purple-950/20 border border-purple-900/30 flex items-start gap-2 text-[11px] text-purple-300">
              <Shield className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
              <span>
                <strong>Gizlilik Garantisi:</strong> Telefon numaranız gizli tutulur. Yalnızca sistem yöneticileri görebilir; diğer sohbet kullanıcılarıyla veya aramalarda asla paylaşılmaz.
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#1b152d] hover:bg-[#251d3e] text-slate-300 text-xs font-semibold rounded-xl transition-colors"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !displayName.trim()}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-purple-950/50 flex items-center gap-1.5 transition-all"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Kaydediliyor...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
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
