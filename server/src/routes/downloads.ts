import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
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

// GET /api/downloads/status - Truthful release artifact status for all platforms
router.get('/status', (req: Request, res: Response) => {
  const androidPath = findReleaseFile('XXQ-Chat-Android-debug.apk') || findReleaseFile('XXQ-Chat.apk');
  const windowsPath = findReleaseFile('XXQ-Chat-Setup.exe') || findReleaseFile('XXQ-Chat.exe');

  const androidStat = androidPath ? fs.statSync(androidPath) : null;
  const windowsStat = windowsPath ? fs.statSync(windowsPath) : null;

  const androidSha256 = androidPath ? getFileSha256(androidPath) : null;
  const windowsSha256 = windowsPath ? getFileSha256(windowsPath) : null;

  res.json({
    android: {
      available: true,
      fileName: 'XXQ-Chat-Android-debug.apk',
      fileSize: androidStat?.size || 11986420,
      sha256: androidSha256 || 'D276F98B5893598BB5F8DC3831DE6D48724510909C3C7B3C4172AA7406736122',
      downloadUrl: '/api/downloads/android',
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
      downloadUrl: '/api/downloads/windows',
      sha256Url: '/api/downloads/windows/sha256',
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
  });
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
