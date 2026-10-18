import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const router = Router();

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
    path.resolve(process.cwd(), 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
    path.resolve(process.cwd(), '..', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
  ];

  for (const p of possiblePaths) {
    if ((fileName === 'XXQ-Chat.apk' || fileName === 'XXQ-Chat-debug.apk') && p.endsWith('.apk') && fs.existsSync(p)) {
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
  const androidPath = findReleaseFile('XXQ-Chat.apk');
  const windowsPath = findReleaseFile('XXQ-Chat-Setup.exe') || findReleaseFile('XXQ-Chat.exe');

  const androidStat = androidPath ? fs.statSync(androidPath) : null;
  const windowsStat = windowsPath ? fs.statSync(windowsPath) : null;

  const androidSha256 = androidPath ? getFileSha256(androidPath) : null;
  const windowsSha256 = windowsPath ? getFileSha256(windowsPath) : null;

  res.json({
    android: {
      available: !!androidPath,
      fileName: 'XXQ-Chat.apk',
      fileSize: androidStat?.size || 0,
      sha256: androidSha256,
      downloadUrl: androidPath ? '/api/downloads/android' : null,
      installGuide:
        "İndirilen APK dosyasını açın. Android Sistem Paket Yükleyicisi kurulumu tamamlayacaktır. Kurulum sonrasında uygulama ilk açılışta profil kurulum sihirbazını başlatır.",
    },
    windows: {
      available: !!windowsPath,
      fileName: 'XXQ-Chat-Setup.exe',
      fileSize: windowsStat?.size || 0,
      sha256: windowsSha256,
      downloadUrl: windowsPath ? '/api/downloads/windows' : null,
      sha256Url: windowsPath ? '/api/downloads/windows/sha256' : null,
      githubReleaseUrl: 'https://github.com/CodingM-eng/XXQ-Chat/releases/latest',
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
          "Apple Silicon (M1/M2/M3 ve üzeri) Mac için yerel uygulama indirmesi sunulmamaktadır. XXQ Chat modern Web uygulaması tam performans ile kullanılabilir.",
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

// GET /api/downloads/android - Download real Android APK
router.get('/android', (req: Request, res: Response) => {
  const androidPath = findReleaseFile('XXQ-Chat.apk');
  if (!androidPath) {
    res.status(404).json({
      error: 'RELEASE_NOT_FOUND',
      message: 'Android APK sürüm dosyası sunucuda bulunamadı. Web uygulamasını kullanabilirsiniz.',
    });
    return;
  }

  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="XXQ-Chat.apk"');
  const stream = fs.createReadStream(androidPath);
  stream.pipe(res);
});

// GET /api/downloads/windows - Download real Windows executable installer
router.get('/windows', (req: Request, res: Response) => {
  const windowsPath = findReleaseFile('XXQ-Chat-Setup.exe') || findReleaseFile('XXQ-Chat.exe');
  if (!windowsPath) {
    res.status(404).json({
      error: 'RELEASE_NOT_FOUND',
      message: 'Windows kurulum dosyası sunucuda bulunamadı. Web uygulamasını kullanabilirsiniz.',
    });
    return;
  }

  res.setHeader('Content-Type', 'application/vnd.microsoft.portable-executable');
  res.setHeader('Content-Disposition', 'attachment; filename="XXQ-Chat-Setup.exe"');
  const stream = fs.createReadStream(windowsPath);
  stream.pipe(res);
});

// GET /api/downloads/windows/sha256 - Windows installer SHA-256 checksum
router.get('/windows/sha256', (req: Request, res: Response) => {
  const windowsPath = findReleaseFile('XXQ-Chat-Setup.exe') || findReleaseFile('XXQ-Chat.exe');
  if (!windowsPath) {
    res.status(404).send('Not found');
    return;
  }
  const hash = getFileSha256(windowsPath);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(`${hash}  XXQ-Chat-Setup.exe\n`);
});

// GET /api/downloads/checksums - Full SHA-256 manifest
router.get('/checksums', (req: Request, res: Response) => {
  const windowsPath = findReleaseFile('XXQ-Chat-Setup.exe') || findReleaseFile('XXQ-Chat.exe');
  const androidPath = findReleaseFile('XXQ-Chat.apk');
  const lines: string[] = [];
  if (windowsPath) {
    const hash = getFileSha256(windowsPath);
    lines.push(`${hash}  XXQ-Chat-Setup.exe`);
  }
  if (androidPath) {
    const hash = getFileSha256(androidPath);
    lines.push(`${hash}  XXQ-Chat-Android-debug.apk`);
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(lines.join('\n') + '\n');
});

export const downloadsRouter = router;
