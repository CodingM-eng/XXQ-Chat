import React, { useState, useEffect } from 'react';
import { Download, RefreshCw, X, CheckCircle, AlertTriangle, ExternalLink, ShieldCheck } from 'lucide-react';
import { getBackendBaseUrl } from '../../services/api';

export interface UpdateArtifact {
  fileName: string;
  fileSize: number;
  sha256: string;
  downloadUrl: string;
  installType?: string;
  instruction?: string;
  formats?: {
    appImage?: { fileName: string; fileSize: number; sha256: string; downloadUrl: string; instruction: string };
    deb?: { fileName: string; fileSize: number; sha256: string; downloadUrl: string; instruction: string };
  };
}

export interface UpdateData {
  latestVersion: string;
  releaseNotes: string;
  releaseDate?: string;
  artifact?: UpdateArtifact;
  githubReleaseUrl?: string;
}

export interface UpdateModalViewProps {
  isOpen: boolean;
  updateData: UpdateData | null;
  status: 'available' | 'downloading' | 'downloaded' | 'error';
  downloadProgress: number;
  downloadStats: { transferred: number; total: number };
  errorMessage?: string | null;
  onClose: () => void;
  onStartDownload: () => void;
  onInstallAndRestart: () => void;
  onCancelDownload: () => void;
}

export const formatBytes = (bytes: number) => {
  if (!bytes || bytes === 0) return '0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const UpdateModalView: React.FC<UpdateModalViewProps> = ({
  isOpen,
  updateData,
  status,
  downloadProgress,
  downloadStats,
  errorMessage,
  onClose,
  onStartDownload,
  onInstallAndRestart,
  onCancelDownload,
}) => {
  if (!isOpen || !updateData) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
      <div className="bg-[#120d24] border border-purple-900/60 w-full max-w-lg rounded-3xl p-6 sm:p-7 shadow-2xl flex flex-col text-slate-100 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white transition-colors"
          title="Kapat"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400 shrink-0">
            <Download className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>Yeni bir güncelleme var: v{updateData.latestVersion}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-600/30 text-purple-300 border border-purple-500/30">
                Kararlı Sürüm
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              XXQ Chat deneyiminizi güncel tutmak için yeni sürümü yükleyin.
            </p>
          </div>
        </div>

        {/* Release Notes */}
        <div className="p-3.5 mb-4 rounded-2xl bg-black/40 border border-purple-950/80 text-xs text-slate-300 space-y-1.5 max-h-48 overflow-y-auto leading-relaxed">
          <div className="font-semibold text-purple-300 flex items-center gap-1.5 mb-1">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>Sürüm Yenilikleri</span>
          </div>
          <div className="whitespace-pre-line text-[11px] text-slate-300">
            {updateData.releaseNotes}
          </div>
        </div>

        {/* Artifact Metadata */}
        {updateData.artifact && (
          <div className="mb-4 p-3 rounded-xl bg-purple-950/30 border border-purple-800/30 text-[11px] text-slate-300 space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Dosya:</span>
              <code className="text-purple-200 font-mono">{updateData.artifact.fileName}</code>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Boyut:</span>
              <span className="text-white font-medium">{formatBytes(updateData.artifact.fileSize)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-purple-800/20">
              <span className="text-slate-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>SHA-256:</span>
              </span>
              <span className="text-[10px] font-mono text-purple-300 truncate max-w-[240px]" title={updateData.artifact.sha256}>
                {updateData.artifact.sha256}
              </span>
            </div>
          </div>
        )}

        {/* Downloading Status */}
        {status === 'downloading' && (
          <div className="mb-4 p-3.5 rounded-2xl bg-purple-950/50 border border-purple-700/50 text-xs text-purple-200 space-y-2">
            <div className="flex justify-between items-center text-xs font-semibold">
              <span className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
                <span>Güncelleme indiriliyor...</span>
              </span>
              <span>%{downloadProgress}</span>
            </div>
            <div className="w-full bg-purple-950 rounded-full h-2 overflow-hidden border border-purple-800/60">
              <div
                className="bg-purple-500 h-2 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
            {downloadStats.total > 0 && (
              <div className="text-[10px] text-purple-400 text-right">
                {formatBytes(downloadStats.transferred)} / {formatBytes(downloadStats.total)}
              </div>
            )}
          </div>
        )}

        {/* Downloaded Ready Status */}
        {status === 'downloaded' && (
          <div className="mb-4 p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-700/50 text-xs text-emerald-200 flex items-center gap-2.5">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <p className="font-semibold text-emerald-100">Güncelleme paketi başarıyla indirildi ve doğrulandı!</p>
              <p className="text-[11px] text-emerald-300/80 mt-0.5">
                Uygulama yeniden başlatılarak yeni sürüm yüklenecektir. Oturumunuz ve sohbet verileriniz korunur.
              </p>
            </div>
          </div>
        )}

        {/* Error Status */}
        {status === 'error' && (
          <div className="mb-4 p-3.5 rounded-2xl bg-rose-950/60 border border-rose-800 text-xs text-rose-200 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-rose-100">Güncelleme Hatası</p>
              <p className="text-[11px] text-rose-300 mt-0.5 leading-relaxed">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-3 pt-2">
          {updateData.githubReleaseUrl && (
            <a
              href={updateData.githubReleaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
            >
              <span>GitHub Sürümü</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {status === 'downloading' ? (
              <button
                type="button"
                onClick={onCancelDownload}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
              >
                İptal Et
              </button>
            ) : status === 'downloaded' ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
                >
                  Daha Sonra
                </button>
                <button
                  type="button"
                  onClick={onInstallAndRestart}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-lg shadow-emerald-950/50 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  Yeniden Başlat ve Güncelle
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
                >
                  Daha Sonra
                </button>
                <button
                  type="button"
                  onClick={onStartDownload}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs shadow-lg shadow-purple-950/50 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>İndir</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const UpdateNotificationModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [updateData, setUpdateData] = useState<UpdateData | null>(null);
  const [status, setStatus] = useState<'available' | 'downloading' | 'downloaded' | 'error'>('available');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStats, setDownloadStats] = useState<{ transferred: number; total: number }>({ transferred: 0, total: 0 });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    const isElec = Boolean(
      typeof window !== 'undefined' &&
        (window.electronAPI?.isElectron || window.location?.protocol === 'file:')
    );
    setIsElectron(isElec);

    // If running inside Electron, subscribe to main-process updater events
    if (isElec && window.electronAPI?.updater) {
      const unsubAvailable = window.electronAPI.updater.onUpdateAvailable?.((data: any) => {
        setUpdateData({
          latestVersion: data.latestVersion,
          releaseNotes: data.releaseNotes,
          releaseDate: data.releaseDate,
          artifact: data.artifact,
          githubReleaseUrl: data.githubReleaseUrl,
        });
        setStatus('available');
        setIsOpen(true);
      });

      const unsubProgress = window.electronAPI.updater.onUpdateProgress?.((progress) => {
        setStatus('downloading');
        setDownloadProgress(progress.percent);
        setDownloadStats({ transferred: progress.transferred, total: progress.total });
      });

      const unsubDownloaded = window.electronAPI.updater.onUpdateDownloaded?.(() => {
        setStatus('downloaded');
        setDownloadProgress(100);
      });

      const unsubError = window.electronAPI.updater.onUpdateError?.((err) => {
        setStatus('error');
        setErrorMessage(err.error || 'Güncelleme sırasında bir hata oluştu.');
      });

      return () => {
        unsubAvailable?.();
        unsubProgress?.();
        unsubDownloaded?.();
        unsubError?.();
      };
    } else if (typeof window !== 'undefined') {
      // In web browser or other client, check update manifest once on startup
      const checkWebUpdate = async () => {
        try {
          const res = await fetch(`${getBackendBaseUrl()}/api/updates/check?platform=windows&version=1.0.0`);
          if (res.ok) {
            const data = await res.json();
            if (data.updateAvailable && data.artifact) {
              // Web mode: inform about available native release
            }
          }
        } catch {}
      };
      checkWebUpdate();
    }
  }, []);

  const handleStartDownload = async () => {
    if (isElectron && window.electronAPI?.updater?.download) {
      try {
        setStatus('downloading');
        setDownloadProgress(0);
        setErrorMessage(null);
        await window.electronAPI.updater.download();
      } catch (err: any) {
        setStatus('error');
        setErrorMessage(err.message || 'Güncelleme indirilemedi.');
      }
    } else if (updateData?.artifact?.downloadUrl && typeof window !== 'undefined') {
      window.open(updateData.artifact.downloadUrl, '_blank');
      setIsOpen(false);
    }
  };

  const handleInstallAndRestart = async () => {
    if (isElectron && window.electronAPI?.updater?.install) {
      try {
        await window.electronAPI.updater.install();
      } catch (err: any) {
        setStatus('error');
        setErrorMessage(err.message || 'Güncelleme yüklenemedi.');
      }
    }
  };

  const handleCancelDownload = async () => {
    if (isElectron && window.electronAPI?.updater?.cancel) {
      await window.electronAPI.updater.cancel();
    }
    setStatus('available');
    setIsOpen(false);
  };

  return (
    <UpdateModalView
      isOpen={isOpen}
      updateData={updateData}
      status={status}
      downloadProgress={downloadProgress}
      downloadStats={downloadStats}
      errorMessage={errorMessage}
      onClose={() => setIsOpen(false)}
      onStartDownload={handleStartDownload}
      onInstallAndRestart={handleInstallAndRestart}
      onCancelDownload={handleCancelDownload}
    />
  );
};
