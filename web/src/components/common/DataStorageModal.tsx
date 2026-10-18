import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { DriveAccount } from '../../types';
import {
  X,
  HardDrive,
  Database,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Image as ImageIcon,
  ShieldCheck,
  RefreshCw,
  Loader2,
  ExternalLink,
} from 'lucide-react';

interface DataStorageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DataStorageModal: React.FC<DataStorageModalProps> = ({ isOpen, onClose }) => {
  const [driveAccounts, setDriveAccounts] = useState<DriveAccount[]>([]);
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [storageEstimate, setStorageEstimate] = useState<{ usage: number; quota: number } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    const loadDriveStatus = async () => {
      try {
        setIsLoadingDrive(true);
        const res = await api.getDriveAccounts();
        if (mounted) setDriveAccounts(res.accounts || []);
      } catch (err) {
        console.error('Failed to load drive accounts:', err);
      } finally {
        if (mounted) setIsLoadingDrive(false);
      }
    };

    const loadStorageEstimate = async () => {
      if (navigator.storage && navigator.storage.estimate) {
        try {
          const est = await navigator.storage.estimate();
          if (mounted && est.usage !== undefined && est.quota !== undefined) {
            setStorageEstimate({ usage: est.usage, quota: est.quota });
          }
        } catch (e) {
          console.debug('Storage estimate not supported or failed:', e);
        }
      }
    };

    loadDriveStatus();
    loadStorageEstimate();

    return () => {
      mounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const formatBytes = (bytes?: number | null) => {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let b = bytes;
    while (b >= 1024 && i < units.length - 1) {
      b /= 1024;
      i++;
    }
    return `${b.toFixed(1)} ${units[i]}`;
  };

  const handleClearLocalCache = async () => {
    try {
      setClearingCache(true);
      // Clear session/local caches that are safe to remove without destroying token
      const token = localStorage.getItem('token');
      const theme = localStorage.getItem('theme');
      const draftKeys = Object.keys(localStorage).filter((k) => k.startsWith('draft_') || k.startsWith('cache_'));
      draftKeys.forEach((k) => localStorage.removeItem(k));

      // Clear Cache API if available
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      }

      // Re-read storage estimate
      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        if (est.usage !== undefined && est.quota !== undefined) {
          setStorageEstimate({ usage: est.usage, quota: est.quota });
        }
      }

      setCacheCleared(true);
      setTimeout(() => setCacheCleared(false), 3500);
    } catch (e) {
      console.error('Failed to clear cache:', e);
    } finally {
      setClearingCache(false);
    }
  };

  const primaryDrive = driveAccounts.length > 0 ? driveAccounts[0] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-[#120e24] border border-[#2b224c] w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2b224c] flex items-center justify-between bg-gradient-to-r from-purple-950/50 via-[#181232] to-[#120e24]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-900/60 border border-purple-600/50 flex items-center justify-center text-purple-300">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Veri ve Depolama</h3>
              <p className="text-[11px] text-purple-300/80">Depolama kotaları, dosya limitleri ve önbellek yönetimi</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* File Upload Limits Card */}
          <div className="bg-[#181330] border border-[#2b2350] rounded-2xl p-4 space-y-3">
            <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
              Yükleme Boyut Limitleri
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-black/30 border border-white/5 space-y-1">
                <div className="flex items-center gap-1.5 text-slate-200 text-xs font-semibold">
                  <FileText className="w-3.5 h-3.5 text-purple-400" />
                  <span>Sohbet Ekleri & Medya</span>
                </div>
                <div className="text-xl font-black text-white">25 MB</div>
                <p className="text-[10px] text-slate-400 leading-tight">
                  Mesajlarda paylaşılan fotoğraf, video, ses kaydı ve belgeler için tek dosya üst sınırı.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-black/30 border border-white/5 space-y-1">
                <div className="flex items-center gap-1.5 text-slate-200 text-xs font-semibold">
                  <ImageIcon className="w-3.5 h-3.5 text-pink-400" />
                  <span>Profil & Afiş Resimleri</span>
                </div>
                <div className="text-xl font-black text-white">2 MB</div>
                <p className="text-[10px] text-slate-400 leading-tight">
                  Kullanıcı profil avatarları ve afiş görselleri için güvenli dosya üst sınırı.
                </p>
              </div>
            </div>
          </div>

          {/* Google Drive Status Card */}
          <div className="bg-[#181330] border border-[#2b2350] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-purple-400" />
                Google Drive Depolama Alanı
              </h4>
              {isLoadingDrive && <Loader2 className="w-3 h-3 text-purple-400 animate-spin" />}
            </div>

            {primaryDrive ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Bağlı Hesap:</span>
                  <span className="font-semibold text-white">{primaryDrive.email}</span>
                </div>

                {primaryDrive.folderName && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">Hedef Klasör:</span>
                    <span className="font-mono text-purple-300 text-[11px]">{primaryDrive.folderName}</span>
                  </div>
                )}

                {primaryDrive.spaceTotal && primaryDrive.spaceTotal > 0 ? (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">
                        {formatBytes(primaryDrive.spaceUsed)} / {formatBytes(primaryDrive.spaceTotal)} kullanıldı
                      </span>
                      <span className="font-semibold text-purple-300">
                        {Math.round(((primaryDrive.spaceUsed || 0) / primaryDrive.spaceTotal) * 100)}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden border border-white/5">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(((primaryDrive.spaceUsed || 0) / primaryDrive.spaceTotal) * 100)
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl bg-purple-950/40 border border-purple-600/30 text-xs text-purple-200">
                    Google Drive aktif ve dosyalar güvenle şifrelenerek depolanıyor.
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-600/30 text-xs text-amber-200 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Google Drive Henüz Bağlanmadı</span>
                </div>
                <p className="text-[11px] text-amber-300/80 leading-relaxed">
                  Platformda dosya ve medya paylaşımı yapılabilmesi için yöneticinin Yönetici Paneli üzerinden Google Drive hesabını yetkilendirmesi gerekmektedir.
                </p>
              </div>
            )}
          </div>

          {/* Local Storage & Cache Clear */}
          <div className="bg-[#181330] border border-[#2b2350] rounded-2xl p-4 space-y-3">
            <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-purple-400" />
              Yerel Tarayıcı Önbelleği
            </h4>

            {storageEstimate && (
              <div className="text-xs text-slate-300 flex items-center justify-between">
                <span>Cihazda Tutulan Geçici Veri:</span>
                <span className="font-semibold text-white">{formatBytes(storageEstimate.usage)}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <div className="text-[11px] text-slate-400">
                Geçici taslakları, küçük resim önbelleklerini ve eski oturum artıklarını temizler. Giriş bilgileriniz korunur.
              </div>
              <button
                type="button"
                onClick={handleClearLocalCache}
                disabled={clearingCache}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-700/60 text-rose-200 font-semibold text-xs transition-colors shrink-0 ml-3 disabled:opacity-50"
              >
                {clearingCache ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Önbelleği Temizle</span>
              </button>
            </div>

            {cacheCleared && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-600/40 p-2.5 rounded-xl animate-fade-in">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Geçici önbellek ve taslaklar başarıyla temizlendi!</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#2b224c] bg-[#0d091b] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-xs transition-colors"
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
};
