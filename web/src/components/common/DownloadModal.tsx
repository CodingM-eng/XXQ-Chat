import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import {
  X,
  Download,
  Smartphone,
  Monitor,
  Apple,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Laptop,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react';

export type DetectedPlatform = 'windows' | 'android' | 'ios' | 'mac-intel' | 'mac-arm' | 'linux' | 'other';

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DownloadModal: React.FC<DownloadModalProps> = ({ isOpen, onClose }) => {
  const [detectedPlatform, setDetectedPlatform] = useState<DetectedPlatform>('windows');
  const [selectedTab, setSelectedTab] = useState<DetectedPlatform>('windows');
  const [downloadStatus, setDownloadStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Detect operating system accurately
    const ua = navigator.userAgent || '';
    const platform = (navigator as any).platform || '';

    let detected: DetectedPlatform = 'windows';

    if (/Android/i.test(ua)) {
      detected = 'android';
    } else if (/iPhone|iPad|iPod/i.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
      detected = 'ios';
    } else if (/Mac/i.test(platform) || /Macintosh/i.test(ua)) {
      // Differentiate Intel Mac from Apple Silicon if possible
      let isAppleSilicon = false;
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
          const debugInfo = (gl as any).getExtension('WEBGL_debug_renderer_info');
          if (debugInfo) {
            const renderer = (gl as any).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
            if (/Apple/i.test(renderer) && !/Intel/i.test(renderer)) {
              isAppleSilicon = true;
            }
          }
        }
      } catch (e) {
        // fallback
      }
      detected = isAppleSilicon ? 'mac-arm' : 'mac-intel';
    } else if (/Win/i.test(platform) || /Windows/i.test(ua)) {
      detected = 'windows';
    } else if (/Linux/i.test(platform) || /Linux/i.test(ua)) {
      detected = 'linux';
    } else {
      detected = 'other';
    }

    setDetectedPlatform(detected);
    setSelectedTab(detected);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    const fetchStatus = async () => {
      try {
        setIsLoading(true);
        const res = await api.getDownloadsStatus();
        if (mounted) setDownloadStatus(res);
      } catch (e) {
        console.error('Failed to fetch downloads status:', e);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    fetchStatus();
    return () => {
      mounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const getPlatformName = (p: DetectedPlatform) => {
    switch (p) {
      case 'windows':
        return 'Windows (PC)';
      case 'android':
        return 'Android';
      case 'ios':
        return 'iOS (iPhone / iPad)';
      case 'mac-intel':
        return 'macOS (Intel)';
      case 'mac-arm':
        return 'macOS (Apple Silicon M1/M2/M3)';
      case 'linux':
        return 'Linux';
      default:
        return 'Web Tarayıcı';
    }
  };

  const currentTab = selectedTab;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-[#120e24] border border-[#2b224c] w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2b224c] flex items-center justify-between bg-gradient-to-r from-purple-950/50 via-[#181232] to-[#120e24]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-900/60 border border-purple-600/50 flex items-center justify-center text-purple-300">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">XXQ Chat İndir ve Kur</h3>
              <p className="text-[11px] text-purple-300/80">
                Algılanan Cihaz: <span className="font-semibold text-white">{getPlatformName(detectedPlatform)}</span>
              </p>
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

        {/* Platform Selector Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 bg-[#0d091b] border-b border-[#241c42] overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedTab('windows')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              selectedTab === 'windows'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Windows</span>
            {detectedPlatform === 'windows' && (
              <span className="text-[9px] bg-purple-400/30 text-purple-200 px-1 rounded">Cihazınız</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSelectedTab('android')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              selectedTab === 'android'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Android</span>
            {detectedPlatform === 'android' && (
              <span className="text-[9px] bg-purple-400/30 text-purple-200 px-1 rounded">Cihazınız</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSelectedTab('ios')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              selectedTab === 'ios'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Apple className="w-3.5 h-3.5" />
            <span>iOS / Safari PWA</span>
            {detectedPlatform === 'ios' && (
              <span className="text-[9px] bg-purple-400/30 text-purple-200 px-1 rounded">Cihazınız</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSelectedTab('mac-intel')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              selectedTab === 'mac-intel'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>macOS (Intel)</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedTab('mac-arm')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              selectedTab === 'mac-arm'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>macOS (Apple Silicon)</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Windows View */}
          {currentTab === 'windows' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-purple-950/30 border border-purple-600/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-white">XXQ Chat Windows Kurulum Paketi</span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/50">
                      Doğrulanmış Sürüm
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Windows 10 / 11 (64-bit) • Türkçe Kurulum Sihirbazı • Otomatik Masaüstü Kısayolu
                  </p>
                  <p className="text-[11px] text-purple-300 mt-1">
                    Dosya: <code className="text-white">XXQ-Chat.exe</code> ({formatFileSize(downloadStatus?.windows?.fileSize) || '181.7 MB'})
                  </p>
                </div>

                <a
                  href="/api/downloads/windows"
                  download="XXQ-Chat-Setup.exe"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs shadow-lg shadow-purple-900/40 transition-all hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
                >
                  <Download className="w-4 h-4" />
                  <span>Windows için İndir (.exe)</span>
                </a>
              </div>

              {/* Windows Setup Wizard Steps */}
              <div className="bg-[#181330] border border-[#2b2350] rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                  Türkçe Kurulum Sihirbazı Adımları
                </h4>
                <ol className="space-y-2 text-xs text-slate-300">
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-purple-900/60 border border-purple-600/50 flex items-center justify-center text-[10px] font-bold text-purple-200 shrink-0 mt-0.5">
                      1
                    </span>
                    <span>
                      <strong className="text-white">Hoş Geldiniz & Topluluk Kuralları:</strong> Kurulum dili varsayılan Türkçe olarak açılır. "XXQ Chat Kurulum Sihirbazına Hoş Geldiniz" ekranında topluluk kurallarını onaylayın.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-purple-900/60 border border-purple-600/50 flex items-center justify-center text-[10px] font-bold text-purple-200 shrink-0 mt-0.5">
                      2
                    </span>
                    <span>
                      <strong className="text-white">Kurulum Dizini:</strong> Varsayılan olarak güvenli kullanıcı dizinine kurulur (<code className="text-purple-300 bg-black/40 px-1 py-0.5 rounded text-[11px]">%LocalAppData%\Programs\XXQ Chat</code>). İsteğe göre dizin seçilebilir.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-purple-900/60 border border-purple-600/50 flex items-center justify-center text-[10px] font-bold text-purple-200 shrink-0 mt-0.5">
                      3
                    </span>
                    <span>
                      <strong className="text-white">Kısayollar:</strong> "Masaüstü Simgesi Oluştur" ve "Başlat Menüsüne Ekle" seçenekleri işaretlenir.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-purple-900/60 border border-purple-600/50 flex items-center justify-center text-[10px] font-bold text-purple-200 shrink-0 mt-0.5">
                      4
                    </span>
                    <span>
                      <strong className="text-white">Tamamlama:</strong> Kurulum ilerlemesi bittiğinde "XXQ Chat'i Başlat" seçeneği ile doğrudan uygulamaya geçilir.
                    </span>
                  </li>
                </ol>
              </div>
            </div>
          )}

          {/* Android View */}
          {currentTab === 'android' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-purple-950/30 border border-purple-600/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-white">XXQ Chat Android APK</span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/50">
                      Doğrulanmış APK
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Android 8.0 ve üzeri • Sistem Paket Yükleyicisi Destekli • Sesli & Görüntülü Arama
                  </p>
                  <p className="text-[11px] text-purple-300 mt-1">
                    Dosya: <code className="text-white">XXQ-Chat-debug.apk</code> ({formatFileSize(downloadStatus?.android?.fileSize) || '11.4 MB'})
                  </p>
                </div>

                <a
                  href="/api/downloads/android"
                  download="XXQ-Chat.apk"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs shadow-lg shadow-purple-900/40 transition-all hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
                >
                  <Download className="w-4 h-4" />
                  <span>APK İndir (11.4 MB)</span>
                </a>
              </div>

              {/* Android Setup Steps */}
              <div className="bg-[#181330] border border-[#2b2350] rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                  Android Kurulum ve İlk Açılış
                </h4>
                <ol className="space-y-2 text-xs text-slate-300">
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-purple-900/60 border border-purple-600/50 flex items-center justify-center text-[10px] font-bold text-purple-200 shrink-0 mt-0.5">
                      1
                    </span>
                    <span>
                      Yukarıdaki düğmeden <code className="text-white">XXQ-Chat.apk</code> dosyasını cihazınıza indirin.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-purple-900/60 border border-purple-600/50 flex items-center justify-center text-[10px] font-bold text-purple-200 shrink-0 mt-0.5">
                      2
                    </span>
                    <span>
                      İndirilen dosyaya dokunun. Android Paket Yükleyicisi kurulumu yapacaktır (Gerekirse tarayıcıdan yüklemeye izin verin).
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-purple-900/60 border border-purple-600/50 flex items-center justify-center text-[10px] font-bold text-purple-200 shrink-0 mt-0.5">
                      3
                    </span>
                    <span>
                      <strong>İlk Açılış Sihirbazı:</strong> Uygulamayı başlattığınızda mikrofon/kamera izin açıklamaları ve tema seçimi gösterilir; profilinizi tamamlayıp anında sohbete başlayabilirsiniz.
                    </span>
                  </li>
                </ol>
              </div>
            </div>
          )}

          {/* iOS View */}
          {currentTab === 'ios' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-blue-950/30 border border-blue-600/30">
                <div className="flex items-center gap-2 mb-2">
                  <Apple className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-bold text-white">Apple iOS (iPhone / iPad) Kurulumu</span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-950 text-blue-300 border border-blue-700/50">
                    Safari PWA
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Apple App Store politikaları gereği iOS cihazlar için yerel App Store indirmesi yerine Apple onaylı <strong>Aşamalı Web Uygulaması (PWA)</strong> teknolojisi sunulmaktadır. Kurulum gerektirmez, doğrudan ana ekranınıza eklenir ve tam ekran yerel uygulama gibi çalışır.
                </p>
              </div>

              {/* iOS Safari Steps */}
              <div className="bg-[#181330] border border-[#2b2350] rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                  Safari ile Ana Ekrana Ekleme Adımları
                </h4>
                <ol className="space-y-2.5 text-xs text-slate-300">
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-blue-900/60 border border-blue-500/50 flex items-center justify-center text-[10px] font-bold text-blue-200 shrink-0 mt-0.5">
                      1
                    </span>
                    <span>
                      iPhone veya iPad'inizde <strong>Safari</strong> tarayıcısını açarak XXQ Chat adresine girin.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-blue-900/60 border border-blue-500/50 flex items-center justify-center text-[10px] font-bold text-blue-200 shrink-0 mt-0.5">
                      2
                    </span>
                    <span>
                      Safari ekranının alt orta kısmında bulunan <strong>Paylaş (Share)</strong> simgesine (yukarı ok bulunan kare) dokunun.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-blue-900/60 border border-blue-500/50 flex items-center justify-center text-[10px] font-bold text-blue-200 shrink-0 mt-0.5">
                      3
                    </span>
                    <span>
                      Açılan menüde aşağı kaydırarak <strong>"Ana Ekrana Ekle" (Add to Home Screen)</strong> seçeneğine dokunun.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-blue-900/60 border border-blue-500/50 flex items-center justify-center text-[10px] font-bold text-blue-200 shrink-0 mt-0.5">
                      4
                    </span>
                    <span>
                      Sağ üstteki <strong>"Ekle"</strong> butonuna basın. XXQ Chat simgesi ana ekranınıza yerleştirilecek ve tam ekran açılacaktır.
                    </span>
                  </li>
                </ol>
              </div>
            </div>
          )}

          {/* Intel Mac View */}
          {currentTab === 'mac-intel' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-600/30 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-bold text-white">Intel Tabanlı macOS Bilgilendirmesi</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Intel tabanlı Mac bilgisayarlar için henüz doğrulanmış bir yerel <code className="text-white font-mono">.dmg</code> veya <code className="text-white font-mono">.pkg</code> paketi bulunmamaktadır. Sahte veya derlenmemiş paketler sunulmamaktadır.
                </p>
                <p className="text-xs text-amber-200 font-medium">
                  XXQ Chat modern Web uygulamasını Chrome, Safari veya Edge tarayıcıları üzerinden tam donanım ivmesi ve bildirim desteğiyle sorunsuz kullanabilirsiniz.
                </p>
              </div>

              <div className="bg-[#181330] border border-[#2b2350] rounded-2xl p-4">
                <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider mb-2">Önerilen Kullanım Şekli</h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Google Chrome veya Microsoft Edge kullanıyorsanız, adres çubuğundaki "Uygulama Olarak Yükle" simgesine tıklayarak XXQ Chat'i Mac masaüstünüzde bağımsız pencere olarak çalıştırabilirsiniz.
                </p>
              </div>
            </div>
          )}

          {/* Apple Silicon Mac View */}
          {currentTab === 'mac-arm' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-purple-950/30 border border-purple-600/30 space-y-2">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-bold text-white">Apple Silicon (M1 / M2 / M3 / M4) macOS</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Apple Silicon mimarisi için doğrudan indirilebilir yerel bir macOS yükleyicisi bulunmamaktadır. Bu platformda Web sürümümüz Metal ve WebRTC donanım hızlandırması ile yerel uygulama performansında çalışmaktadır.
                </p>
                <p className="text-xs text-purple-200 font-medium">
                  Tarayıcınız üzerinden tam ekran web uygulaması olarak hemen kullanmaya devam edebilirsiniz.
                </p>
              </div>

              <div className="bg-[#181330] border border-[#2b2350] rounded-2xl p-4">
                <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider mb-2">Bağımsız Pencere Olarak Kullanma</h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Safari veya Chrome üzerinden "Dock'a Ekle" veya "PWA olarak yükle" seçeneğini kullanarak yerel Mac uygulaması deneyimi elde edebilirsiniz.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#2b224c] bg-[#0d091b] flex items-center justify-between text-[11px] text-slate-400">
          <span>Tüm sürümler güvenli ve virüssüzdür.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
