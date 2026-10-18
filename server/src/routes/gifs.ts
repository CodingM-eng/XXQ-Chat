import { Router, Request, Response } from 'express';
import { config } from '../config.js';
import { requireAuth } from '../auth/index.js';

const router = Router();

// In-memory cache for Tenor queries (5 minutes TTL)
interface CacheEntry {
  data: any;
  timestamp: number;
}
const gifCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(key: string): any | null {
  const entry = gifCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    gifCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: any): void {
  // Prune if cache grows too large
  if (gifCache.size > 200) {
    const oldestKey = gifCache.keys().next().value;
    if (oldestKey) gifCache.delete(oldestKey);
  }
  gifCache.set(key, { data, timestamp: Date.now() });
}

export interface SanitizedGifItem {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
  source: 'tenor';
}

function sanitizeTenorResult(item: any): SanitizedGifItem | null {
  if (!item || !item.media_formats) return null;
  const formats = item.media_formats;
  const gif = formats.gif || formats.mediumgif || formats.tinygif;
  const preview = formats.tinygif || formats.nanogif || formats.gif;

  const url = (gif?.url || '').trim();
  const previewUrl = (preview?.url || url).trim();

  // Validate trusted Google Tenor domain
  if (!url.startsWith('https://') || (!url.includes('.tenor.com/') && !url.includes('.tenor.co/'))) {
    return null;
  }

  const [w, h] = gif?.dims || [300, 200];

  return {
    id: String(item.id || Math.random().toString(36).substring(2)),
    title: String(item.content_description || item.title || 'Tenor GIF'),
    url,
    previewUrl,
    width: Number(w) || 300,
    height: Number(h) || 200,
    source: 'tenor',
  };
}

const TENOR_UNCONFIGURED_MESSAGE =
  "Tenor API anahtarı yapılandırılmamış. Tenor'ın güncel dokümantasyonuna göre Ocak 2026 itibarıyla yeni Tenor API istemci başvuruları kabul edilmemektedir. Halihazırda onaylanmış bir Tenor API anahtarınız varsa Render ortam değişkenlerine TENOR_API_KEY olarak ekleyebilirsiniz. Alternatif olarak GIPHY sağlayıcısı da onayınızla entegre edilebilir.";

// GET /api/gifs/status - Check Tenor API configuration status
router.get('/status', (req: Request, res: Response) => {
  const isConfigured = Boolean(config.TENOR_API_KEY && config.TENOR_API_KEY.trim().length > 0);
  res.json({
    configured: isConfigured,
    provider: 'tenor',
    policyNotice:
      "Google Tenor API Ocak 2026 itibarıyla yeni istemci kayıtlarını durdurmuştur. Önceden onaylanmış anahtarlar çalışmaktadır.",
    message: isConfigured ? 'Tenor GIF servisi aktif ve hazır.' : TENOR_UNCONFIGURED_MESSAGE,
    attribution: {
      text: 'Powered By Tenor',
      logoUrl: 'https://tenor.com/assets/img/tenor-app-icon.png',
      websiteUrl: 'https://tenor.com',
    },
  });
});

// GET /api/gifs/categories - Return popular Turkish search categories
router.get('/categories', (req: Request, res: Response) => {
  res.json({
    categories: [
      { id: 'trending', label: 'Trendler', query: '' },
      { id: 'reactions', label: 'Tepkiler', query: 'reaction' },
      { id: 'celebrate', label: 'Kutlama', query: 'celebrate' },
      { id: 'gaming', label: 'Oyun', query: 'gaming' },
      { id: 'funny', label: 'Komik', query: 'funny' },
      { id: 'applause', label: 'Alkış', query: 'applause' },
      { id: 'yes', label: 'Evet', query: 'yes' },
      { id: 'no', label: 'Hayır', query: 'no' },
      { id: 'love', label: 'Sevgi', query: 'love' },
      { id: 'hello', label: 'Selam', query: 'hello' },
    ],
  });
});

// GET /api/gifs/search - Search GIFs via Tenor v2 API
router.get('/search', requireAuth, async (req: Request, res: Response) => {
  const apiKey = config.TENOR_API_KEY?.trim();
  if (!apiKey) {
    res.status(400).json({
      error: 'TENOR_NOT_CONFIGURED',
      configured: false,
      message: TENOR_UNCONFIGURED_MESSAGE,
    });
    return;
  }

  const q = String(req.query.q || '').trim();
  const pos = String(req.query.pos || '').trim();
  const limit = Math.min(30, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));

  const cacheKey = `search_${q}_${pos}_${limit}`;
  const cached = getCached(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    const endpoint = q
      ? 'https://tenor.googleapis.com/v2/search'
      : 'https://tenor.googleapis.com/v2/featured';

    const params = new URLSearchParams({
      key: apiKey,
      client_key: 'xxq_chat',
      contentfilter: 'medium',
      media_filter: 'gif,tinygif,nanogif',
      limit: String(limit),
      locale: 'tr_TR',
    });
    if (q) params.set('q', q);
    if (pos) params.set('pos', pos);

    const apiRes = await fetch(`${endpoint}?${params.toString()}`);
    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error(`[TENOR API ERROR] Status ${apiRes.status}:`, errText);
      res.status(apiRes.status).json({
        error: 'TENOR_API_ERROR',
        message: 'Tenor API sunucusundan yanıt alınamadı.',
      });
      return;
    }

    const json = (await apiRes.json()) as any;
    const rawResults: any[] = Array.isArray(json.results) ? json.results : [];
    const results: SanitizedGifItem[] = rawResults
      .map((item: any) => sanitizeTenorResult(item))
      .filter((r: SanitizedGifItem | null): r is SanitizedGifItem => r !== null);

    const responsePayload = {
      results,
      next: json.next || null,
      provider: 'tenor',
      attribution: {
        text: 'Powered By Tenor',
        logoUrl: 'https://tenor.com/assets/img/tenor-app-icon.png',
        websiteUrl: 'https://tenor.com',
      },
    };

    setCache(cacheKey, responsePayload);
    res.json(responsePayload);
  } catch (err: any) {
    console.error('[TENOR SEARCH ERROR]:', err);
    res.status(500).json({
      error: 'TENOR_PROXY_ERROR',
      message: 'GIF araması sırasında bir hata oluştu.',
    });
  }
});

// GET /api/gifs/featured - Featured trending GIFs
router.get('/featured', requireAuth, async (req: Request, res: Response) => {
  const apiKey = config.TENOR_API_KEY?.trim();
  if (!apiKey) {
    res.status(400).json({
      error: 'TENOR_NOT_CONFIGURED',
      configured: false,
      message: TENOR_UNCONFIGURED_MESSAGE,
    });
    return;
  }

  const pos = String(req.query.pos || '').trim();
  const limit = Math.min(30, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));

  const cacheKey = `featured_${pos}_${limit}`;
  const cached = getCached(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    const params = new URLSearchParams({
      key: apiKey,
      client_key: 'xxq_chat',
      contentfilter: 'medium',
      media_filter: 'gif,tinygif,nanogif',
      limit: String(limit),
      locale: 'tr_TR',
    });
    if (pos) params.set('pos', pos);

    const apiRes = await fetch(`https://tenor.googleapis.com/v2/featured?${params.toString()}`);
    if (!apiRes.ok) {
      res.status(apiRes.status).json({
        error: 'TENOR_API_ERROR',
        message: 'Tenor API trend GIF verisi alınamadı.',
      });
      return;
    }

    const json = (await apiRes.json()) as any;
    const rawResults: any[] = Array.isArray(json.results) ? json.results : [];
    const results: SanitizedGifItem[] = rawResults
      .map((item: any) => sanitizeTenorResult(item))
      .filter((r: SanitizedGifItem | null): r is SanitizedGifItem => r !== null);

    const responsePayload = {
      results,
      next: json.next || null,
      provider: 'tenor',
      attribution: {
        text: 'Powered By Tenor',
        logoUrl: 'https://tenor.com/assets/img/tenor-app-icon.png',
        websiteUrl: 'https://tenor.com',
      },
    };

    setCache(cacheKey, responsePayload);
    res.json(responsePayload);
  } catch (err: any) {
    console.error('[TENOR FEATURED ERROR]:', err);
    res.status(500).json({
      error: 'TENOR_PROXY_ERROR',
      message: 'Trend GIF verisi alınırken hata oluştu.',
    });
  }
});

export const gifsRouter = router;
