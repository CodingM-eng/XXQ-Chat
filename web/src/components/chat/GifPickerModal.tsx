import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { Search, X, Loader2, Sparkles, AlertCircle, Info, ExternalLink } from 'lucide-react';

export interface SelectedGif {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
  source: 'tenor';
}

interface GifPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (gif: SelectedGif) => void;
  title?: string;
}

export const GifPickerModal: React.FC<GifPickerModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  title = 'Tenor GIF Seç',
}) => {
  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<Array<{ id: string; label: string; query: string }>>([]);
  const [activeCategory, setActiveCategory] = useState<string>('trending');
  const [gifs, setGifs] = useState<SelectedGif[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const debounceTimerRef = useRef<any>(null);

  // Load status and categories on open
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    const init = async () => {
      try {
        const [statusRes, catRes] = await Promise.all([
          api.getGifStatus().catch(() => ({
            configured: false,
            provider: 'tenor',
            message: 'Tenor API anahtarı tanımlanmamış.',
            attribution: { text: 'Powered By Tenor', logoUrl: '', websiteUrl: 'https://tenor.com' },
          })),
          api.getGifCategories().catch(() => ({ categories: [] })),
        ]);

        if (!mounted) return;
        setIsConfigured(statusRes.configured);
        setStatusMessage(statusRes.message);
        setCategories(catRes.categories || []);

        if (statusRes.configured) {
          loadFeaturedGifs();
        }
      } catch (err: any) {
        if (!mounted) return;
        setIsConfigured(false);
        setStatusMessage(err.message || 'Tenor bağlantı durumu doğrulanamadı.');
      }
    };

    init();
    return () => {
      mounted = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [isOpen]);

  const loadFeaturedGifs = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.getFeaturedGifs(undefined, 24);
      setGifs(res.results || []);
    } catch (err: any) {
      setError(err.message || 'Trend GIF verisi yüklenemedi.');
    } finally {
      setIsLoading(false);
    }
  };

  const executeSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      loadFeaturedGifs();
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const res = await api.searchGifs(searchQuery.trim(), undefined, 24);
      setGifs(res.results || []);
    } catch (err: any) {
      setError(err.message || 'GIF araması yapılamadı.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      executeSearch(val);
    }, 400);
  };

  const handleCategoryClick = (cat: { id: string; label: string; query: string }) => {
    setActiveCategory(cat.id);
    setQuery(cat.query);
    executeSearch(cat.query);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-purple-950/40 via-slate-900 to-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-900/60 border border-purple-700/50 flex items-center justify-center text-purple-300">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">{title}</h3>
              <p className="text-[11px] text-slate-400">Tenor resmi kütüphanesinden hareketli GIF seçin</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar & Categories */}
        <div className="p-4 border-b border-slate-800 space-y-3 bg-slate-950/40">
          <div className="relative">
            <Search className="w-4 h-4 text-purple-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Tenor'da GIF ara (örn: kutlama, alkış, merhaba)..."
              disabled={isConfigured === false}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 disabled:opacity-50 transition-colors"
            />
            {query && (
              <button
                type="button"
                onClick={() => handleQueryChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Chips */}
          {categories.length > 0 && isConfigured && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {categories.map((cat) => (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => handleCategoryClick(cat)}
                  className={`px-3 py-1 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-colors ${
                    activeCategory === cat.id
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 min-h-[300px]">
          {isConfigured === false ? (
            <div className="p-6 rounded-2xl bg-amber-950/30 border border-amber-800/60 text-center max-w-lg mx-auto my-6 space-y-3 animate-fade-in">
              <div className="w-12 h-12 rounded-2xl bg-amber-900/40 border border-amber-700/50 flex items-center justify-center text-amber-300 mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-sm text-white">Tenor API Anahtarı Tanımlı Değil</h4>
              <p className="text-xs text-slate-300 leading-relaxed text-left">
                {statusMessage ||
                  "Tenor resmi API dokümantasyonuna göre Ocak 2026 itibarıyla yeni API istemci başvuruları geçici olarak kabul edilmemektedir."}
              </p>
              <div className="p-3 bg-slate-900/80 rounded-xl text-[11px] text-slate-400 text-left space-y-1.5 border border-slate-800">
                <div className="flex items-center gap-1.5 font-semibold text-purple-300">
                  <Info className="w-3.5 h-3.5" />
                  <span>Nasıl Aktifleştirilir?</span>
                </div>
                <p>
                  1. Eğer daha önceden alınmış geçerli bir Tenor API anahtarınız varsa Render sunucusu ortam değişkenlerine{' '}
                  <code className="text-amber-300 font-mono">TENOR_API_KEY</code> olarak ekleyebilirsiniz.
                </p>
                <p>
                  2. Alternatif olarak onayınızla GIPHY veya dahili medya sağlayıcısı eklenebilir.
                </p>
              </div>
            </div>
          ) : isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
              <span className="text-xs font-medium">Tenor GIF'leri yükleniyor...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/50 text-xs text-rose-300 text-center">
              {error}
            </div>
          ) : gifs.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-xs space-y-1">
              <p className="font-semibold text-slate-400">Aradığınız kriterlere uygun GIF bulunamadı.</p>
              <p>Farklı bir arama terimi deneyin.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {gifs.map((g) => (
                <button
                  type="button"
                  key={g.id}
                  onClick={() => {
                    onSelect(g);
                    onClose();
                  }}
                  className="group relative rounded-xl overflow-hidden aspect-video bg-slate-800/80 border border-slate-800 hover:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all hover:scale-[1.02]"
                >
                  <img
                    src={g.previewUrl || g.url}
                    alt={g.title}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                    <span className="text-[10px] text-white font-medium truncate drop-shadow">{g.title}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer with mandatory Tenor attribution */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-300">Powered by</span>
            <span className="px-2 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-700/40 text-[10px] font-bold tracking-wider">
              TENOR
            </span>
          </div>
          <a
            href="https://tenor.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300 transition-colors"
          >
            <span>Tenor.com</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
};
