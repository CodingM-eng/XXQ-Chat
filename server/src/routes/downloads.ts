import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config.js';

const router = Router();

const CURRENT_RELEASE_TAG = 'v1.0.1';
const GITHUB_REPO_URL = 'https://github.com/CodingM-eng/XXQ-Chat';
const GITHUB_RELEASE_BASE = `${GITHUB_REPO_URL}/releases/download/${CURRENT_RELEASE_TAG}`;

// Cache for sha256 to avoid repeated hashing of large binaries
const hashCache = new Map<string, { hash: string; mtime: number }>();

function getFileSha256(filePath: string): string | null {
  try {
    const stat = fs.statSync(filePath);
    const cached = hashCache.get(filePath);
    if (cached && cached.mtime === stat.mtimeMs) {
      return cached.hash;
    }
    const buf = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
    hashCache.set(filePath, { hash, mtime: stat.mtimeMs });
    return hash;
  } catch {
    return null;
  }
}

// Locate real release files relative to project root or current working dir
function findReleaseFile(fileName: string): string | null {
  const possiblePaths = [
    path.resolve(process.cwd(), 'release', fileName),
    path.resolve(process.cwd(), '..', 'release', fileName),
    path.resolve(process.cwd(), 'desktop', 'release', fileName),
    path.resolve(process.cwd(), '..', 'desktop', 'release', fileName),
    path.resolve(process.cwd(), 'release', 'XXQ-Chat-Setup.exe'),
    path.resolve(process.cwd(), '..', 'release', 'XXQ-Chat-Setup.exe'),
    path.resolve(process.cwd(), 'desktop', 'release', 'XXQ-Chat-Setup.exe'),
    path.resolve(process.cwd(), '..', 'desktop', 'release', 'XXQ-Chat-Setup.exe'),
    path.resolve(process.cwd(), 'release', 'XXQ-Chat.exe'),
    path.resolve(process.cwd(), '..', 'release', 'XXQ-Chat.exe'),
    path.resolve(process.cwd(), 'release', 'XXQ-Chat-debug.apk'),
    path.resolve(process.cwd(), '..', 'release', 'XXQ-Chat-debug.apk'),
    path.resolve(process.cwd(), 'release', 'XXQ-Chat-Android-debug.apk'),
    path.resolve(process.cwd(), '..', 'release', 'XXQ-Chat-Android-debug.apk'),
    path.resolve(process.cwd(), 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
    path.resolve(process.cwd(), '..', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
  ];

  for (const p of possiblePaths) {
    if ((fileName === 'XXQ-Chat.apk' || fileName === 'XXQ-Chat-debug.apk' || fileName === 'XXQ-Chat-Android-debug.apk') && p.endsWith('.apk') && fs.existsSync(p)) {
      return p;
    }
    if ((fileName === 'XXQ-Chat-Setup.exe' || fileName === 'XXQ-Chat.exe') && p.endsWith('.exe') && fs.existsSync(p)) {
      return p;
    }
    if (fs.existsSync(p) && path.basename(p).toLowerCase() === fileName.toLowerCase()) {
      return p;
    }
  }
  return null;
}

function getEffectiveServerBaseUrl(): string {
  const envUrl = (config.SERVER_BASE_URL || '').trim().replace(/\/+$/, '');
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl;
  }
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.trim().replace(/\/+$/, '');
  }
  return envUrl || 'https://xxq-chat-backend.onrender.com';
}

function buildDownloadsManifest() {
  const androidPath = findReleaseFile('XXQ-Chat-Android-debug.apk') || findReleaseFile('XXQ-Chat.apk');
  const windowsPath = findReleaseFile('XXQ-Chat-Setup.exe') || findReleaseFile('XXQ-Chat.exe');

  const androidStat = androidPath ? fs.statSync(androidPath) : null;
  const windowsStat = windowsPath ? fs.statSync(windowsPath) : null;

  const androidSha256 = androidPath ? getFileSha256(androidPath) : null;
  const windowsSha256 = windowsPath ? getFileSha256(windowsPath) : null;

  const baseUrl = getEffectiveServerBaseUrl();

  return {
    android: {
      available: true,
      fileName: 'XXQ-Chat-Android-debug.apk',
      fileSize: androidStat?.size || 11971302,
      sha256: androidSha256 || 'D276F98B5893598BB5F8DC3831DE6D48724510909C3C7B3C4172AA7406736122',
      downloadUrl: `${baseUrl}/api/downloads/android`,
      githubDirectUrl: `${GITHUB_RELEASE_BASE}/XXQ-Chat-Android-debug.apk`,
      githubReleaseUrl: `${GITHUB_REPO_URL}/releases/tag/${CURRENT_RELEASE_TAG}`,
      installGuide:
        "İndirilen APK dosyasını açın. Android Sistem Paket Yükleyicisi kurulumu tamamlayacaktır. Kurulum sonrasında uygulama ilk açılışta profil kurulum sihirbazını başlatır.",
    },
    windows: {
      available: true,
      fileName: 'XXQ-Chat-Setup.exe',
      fileSize: windowsStat?.size || 82587967,
      sha256: windowsSha256 || 'CDF8400372B79447C26F189CB59D994D3D3C6809701961E85B2F6CDCC2198A5F',
      downloadUrl: `${baseUrl}/api/downloads/windows`,
      sha256Url: `${baseUrl}/api/downloads/windows/sha256`,
      githubDirectUrl: `${GITHUB_RELEASE_BASE}/XXQ-Chat-Setup.exe`,
      githubReleaseUrl: `${GITHUB_REPO_URL}/releases/tag/${CURRENT_RELEASE_TAG}`,
      installGuide:
        "İndirilen XXQ-Chat-Setup.exe dosyasını çalıştırın. Doğrulanmış Türkçe kurulum sihirbazı adımlarını (hoş geldiniz, kurulum dizini, ilerleme ve tamamla) takip edin. Uygulama %LocalAppData%\\Programs\\XXQ Chat dizinine kurulur.",
    },
    mac: {
      intel: {
        available: false,
        packageType: 'dmg',
        message:
          "Intel tabanlı Mac için henüz doğrulanmış bir yerel .dmg / .pkg paketi yayınlanmamıştır. Lütfen tarayıcınız üzerinden XXQ Chat Web uygulamasını kullanın.",
      },
      appleSilicon: {
        available: false,
        message:
          "Apple Silicon (M1/M2/M3 ve üzeri) Mac için yerel uygulama indirmesi sunulmamaktadır. XXQ Chat modern Web uygulamasını tam performans ile kullanabilirsiniz.",
      },
    },
    ios: {
      available: false,
      pwaOnly: true,
      instructions: [
        'Safari tarayıcısında web sitemizi açın.',
        'Ekranın altındaki "Paylaş" (Share) simgesine dokunun.',
        'Aşağı kaydırarak "Ana Ekrana Ekle" seçeneğine dokunun.',
        'Sağ üstteki "Ekle" butonuna basarak XXQ Chat\'i tam ekran PWA olarak kullanmaya başlayın.',
      ],
    },
  };
}

// GET /api/downloads/ and GET /api/downloads
router.get('/', (req: Request, res: Response) => {
  const manifest = buildDownloadsManifest();

  // If a browser visited this route directly in the address bar, serve a clean HTML downloads portal
  if (req.accepts('html') && !req.xhr && !req.headers['sec-fetch-dest']?.toString().includes('empty')) {
    const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>XXQ Chat İndir - Doğrulanmış Kurulum Paketleri</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0816; color: #e2e8f0; margin: 0; padding: 24px; display: flex; justify-content: center; }
    .card { background: #15102a; border: 1px solid #332759; border-radius: 20px; max-width: 680px; width: 100%; padding: 32px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
    h1 { color: #f8fafc; font-size: 22px; margin-top: 0; margin-bottom: 8px; display: flex; align-items: center; gap: 10px; }
    p.sub { color: #a78bfa; font-size: 14px; margin-bottom: 24px; }
    .item { background: rgba(255,255,255,0.03); border: 1px solid #2e2450; border-radius: 14px; padding: 18px; margin-bottom: 16px; }
    .title { font-weight: 600; font-size: 15px; color: #fff; margin-bottom: 6px; }
    .meta { font-size: 12px; color: #94a3b8; font-family: monospace; word-break: break-all; margin-top: 4px; }
    .btn { display: inline-block; background: #7c3aed; color: #fff; font-weight: 600; padding: 10px 20px; border-radius: 10px; text-decoration: none; font-size: 13px; margin-top: 12px; }
    .btn:hover { background: #6d28d9; }
    .btn-alt { background: transparent; border: 1px solid #6d28d9; color: #c4b5fd; margin-left: 8px; }
    .btn-alt:hover { background: rgba(124, 58, 237, 0.2); }
    .footer { margin-top: 24px; font-size: 12px; color: #64748b; text-align: center; }
    .footer a { color: #a78bfa; }
  </style>
</head>
<body>
  <div class="card">
    <h1>XXQ Chat Resmi İndirme Merkezi</h1>
    <p class="sub">Doğrulanmış resmi sürüm: <strong>v1.0.1</strong></p>

    <div class="item">
      <div class="title">Windows Masaüstü Kurulum Paketi (64-bit)</div>
      <div class="meta">Dosya: XXQ-Chat-Setup.exe (${(manifest.windows.fileSize / (1024*1024)).toFixed(1)} MB)</div>
      <div class="meta">SHA-256: ${manifest.windows.sha256}</div>
      <a class="btn" href="${manifest.windows.githubDirectUrl}">Windows için İndir (.exe)</a>
      <a class="btn btn-alt" href="${manifest.windows.githubReleaseUrl}" target="_blank">GitHub Releases</a>
    </div>

    <div class="item">
      <div class="title">Android Uygulaması (APK)</div>
      <div class="meta">Dosya: XXQ-Chat-Android-debug.apk (${(manifest.android.fileSize / (1024*1024)).toFixed(1)} MB)</div>
      <div class="meta">SHA-256: ${manifest.android.sha256}</div>
      <a class="btn" href="${manifest.android.githubDirectUrl}">Android APK İndir</a>
      <a class="btn btn-alt" href="${manifest.android.githubReleaseUrl}" target="_blank">GitHub Releases</a>
    </div>

    <div class="footer">
      <p><a href="https://xxq-chat-frontend.onrender.com">XXQ Chat Web Uygulamasına Git &rarr;</a></p>
    </div>
  </div>
</body>
</html>`;
    return res.type('html').send(html);
  }

  return res.json(manifest);
});

// GET /api/downloads/status - Truthful release artifact status for all platforms
router.get('/status', (req: Request, res: Response) => {
  res.json(buildDownloadsManifest());
});

// GET /api/downloads/android - Download real Android APK or redirect to GitHub Releases CDN
router.get('/android', (req: Request, res: Response) => {
  const androidPath = findReleaseFile('XXQ-Chat-Android-debug.apk') || findReleaseFile('XXQ-Chat.apk');
  if (androidPath && fs.existsSync(androidPath)) {
    const stat = fs.statSync(androidPath);
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', 'attachment; filename="XXQ-Chat-Android-debug.apk"');
    res.setHeader('Accept-Ranges', 'bytes');
    return fs.createReadStream(androidPath).pipe(res);
  }

  // Fallback to GitHub Release CDN asset if not packaged in web container
  return res.redirect(302, `${GITHUB_RELEASE_BASE}/XXQ-Chat-Android-debug.apk`);
});

// GET /api/downloads/windows - Download real Windows executable installer or redirect to GitHub Releases CDN
router.get('/windows', (req: Request, res: Response) => {
  const windowsPath = findReleaseFile('XXQ-Chat-Setup.exe') || findReleaseFile('XXQ-Chat.exe');
  if (windowsPath && fs.existsSync(windowsPath)) {
    const stat = fs.statSync(windowsPath);
    res.setHeader('Content-Type', 'application/vnd.microsoft.portable-executable');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', 'attachment; filename="XXQ-Chat-Setup.exe"');
    res.setHeader('Accept-Ranges', 'bytes');
    return fs.createReadStream(windowsPath).pipe(res);
  }

  // Fallback to GitHub Release CDN asset if not packaged in web container
  return res.redirect(302, `${GITHUB_RELEASE_BASE}/XXQ-Chat-Setup.exe`);
});

// GET /api/downloads/windows/sha256 - Windows installer SHA-256 checksum
router.get('/windows/sha256', (req: Request, res: Response) => {
  const windowsPath = findReleaseFile('XXQ-Chat-Setup.exe') || findReleaseFile('XXQ-Chat.exe');
  if (windowsPath && fs.existsSync(windowsPath)) {
    const hash = getFileSha256(windowsPath);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(`${hash}  XXQ-Chat-Setup.exe\n`);
  }

  return res.redirect(302, `${GITHUB_RELEASE_BASE}/XXQ-Chat-Setup.exe.sha256`);
});

// GET /api/downloads/checksums - Full SHA-256 manifest
router.get('/checksums', (req: Request, res: Response) => {
  const windowsPath = findReleaseFile('XXQ-Chat-Setup.exe') || findReleaseFile('XXQ-Chat.exe');
  if (windowsPath && fs.existsSync(windowsPath)) {
    const androidPath = findReleaseFile('XXQ-Chat-Android-debug.apk') || findReleaseFile('XXQ-Chat.apk');
    const lines: string[] = [];
    const hash = getFileSha256(windowsPath);
    lines.push(`${hash}  XXQ-Chat-Setup.exe`);
    if (androidPath) {
      const androidHash = getFileSha256(androidPath);
      lines.push(`${androidHash}  XXQ-Chat-Android-debug.apk`);
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(lines.join('\n') + '\n');
  }

  return res.redirect(302, `${GITHUB_RELEASE_BASE}/SHA256SUMS.txt`);
});

export const downloadsRouter = router;
