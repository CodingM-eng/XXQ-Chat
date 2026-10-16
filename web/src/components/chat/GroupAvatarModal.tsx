import React, { useState, useRef } from 'react';
import { api } from '../../services/api';
import { Conversation } from '../../types';
import { X, Upload, Trash2, Check, Image as ImageIcon, Loader2 } from 'lucide-react';

interface GroupAvatarModalProps {
  conversation: Conversation;
  isOpen: boolean;
  onClose: () => void;
  onAvatarUpdated: (newAvatarUrl: string | null) => void;
}

export const GroupAvatarModal: React.FC<GroupAvatarModalProps> = ({
  conversation,
  isOpen,
  onClose,
  onAvatarUpdated,
}) => {
  const [avatarUrl, setAvatarUrl] = useState(conversation.avatarUrl || '');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const currentPreview = filePreview || avatarUrl || conversation.avatarUrl || '';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Lütfen bir resim dosyası seçin.');
      return;
    }

    if (file.size > 1024 * 1024) {
      setError('Resim boyutu 1 MB değerinden küçük olmalıdır.');
      return;
    }

    setError(null);
    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      setFilePreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    try {
      setIsSubmitting(true);
      setError(null);

      let finalUrl = avatarUrl;
      if (selectedFile) {
        const res = await api.uploadGroupAvatar(conversation.id, selectedFile);
        finalUrl = res.avatarUrl;
      } else if (avatarUrl.trim()) {
        const res = await api.uploadGroupAvatar(conversation.id, avatarUrl.trim());
        finalUrl = res.avatarUrl;
      }

      onAvatarUpdated(finalUrl);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 800);
    } catch (err: any) {
      setError(err.message || 'Grup logosu güncellenemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      await api.removeGroupAvatar(conversation.id);
      onAvatarUpdated(null);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 800);
    } catch (err: any) {
      setError(err.message || 'Grup logosu kaldırılamadı.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#120f1e] border border-[#2a2244] w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#241c38] flex items-center justify-between bg-gradient-to-r from-purple-950/40 via-[#120f1e] to-[#120f1e]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-900/60 border border-purple-700/50 flex items-center justify-center text-purple-300">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white">Grup Logosu Yönetimi</h3>
              <p className="text-[10px] text-slate-400">{conversation.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#1b152d] hover:bg-[#251d3e] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-300">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400" />
              <span>Grup logosu başarıyla güncellendi!</span>
            </div>
          )}

          {/* Logo Preview */}
          <div className="flex flex-col items-center justify-center p-4 bg-[#090710] border border-[#241c38] rounded-2xl">
            <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-purple-500 bg-[#161224] flex items-center justify-center shadow-lg shadow-purple-950/40 mb-3">
              {currentPreview ? (
                <img src={currentPreview} alt="Grup Logosu" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xl font-bold text-purple-300">
                  {conversation.name.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>

            <input
              type="file"
              ref={fileInputRef}
              accept="image/png, image/jpeg, image/webp, image/gif"
              onChange={handleFileChange}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-950/80 hover:bg-purple-900 border border-purple-700/60 rounded-xl text-xs font-semibold text-purple-200 transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-purple-300" />
              <span>Cihazdan Fotoğraf Seç</span>
            </button>
          </div>

          {/* URL Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Veya Doğrudan Web Resmi Bağlantısı (URL)
            </label>
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => {
                setAvatarUrl(e.target.value);
                setSelectedFile(null);
                setFilePreview(null);
              }}
              placeholder="https://example.com/grup-logosu.png"
              className="w-full px-3.5 py-2.5 bg-[#0b0914] border border-[#241c38] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2">
            {conversation.avatarUrl ? (
              <button
                type="button"
                onClick={handleRemove}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 rounded-xl transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Logoyu Kaldır</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSubmitting || (!selectedFile && !avatarUrl.trim())}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-900/30 transition-all disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Kaydediliyor...</span>
                  </>
                ) : (
                  <span>Logoyu Kaydet</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
