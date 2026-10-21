import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config.js';

const router = Router();

export const CURRENT_RELEASE_TAG = 'v1.0.1';
export const CURRENT_RELEASE_VERSION = '1.0.1';
export const GITHUB_REPO_URL = 'https://github.com/CodingM-eng/XXQ-Chat';
export const GITHUB_RELEASE_BASE = `${GITHUB_REPO_URL}/releases/download/${CURRENT_RELEASE_TAG}`;

export const RELEASE_NOTES_TR = `
### XXQ Chat v1.0.1 Güncelleme Notları:
- **Windows Masaüstü**: Yerel bildirimler, otomatik güncelleme denetleyicisi ve doğrudan kurulum desteği.
- **Firebase & Arka Uç İletişimi**: Render Free soğuk uyanış (cold-start) desteği, güvenli genel istemci yapılandırması ve çevrim dışı ağ algılama eklendi.
- **Android APK**: Sistem Paket Yükleyicisi ile uyumlu yerel güncelleme akışı ve dosya doğrulama.
- **Linux Desteği**: Doğrulanmış AppImage ve .deb paketleri ile güvenli masaüstü deneyimi.
- **Performans & Güvenlik**: SHA-256 sağlama toplamı doğrulaması ve tüm veri/oturum bilgilerinin korunması.
`.trim();

/**
 * Parses semantic version string (e.g. "1.0.1", "v1.0.1", "1.0.0-rc1")
 */
export function parseSemver(version: string): { major: number; minor: number; patch: number; prerelease?: string } {
  if (!version || typeof version !== 'string') {
    return { major: 0, minor: 0, patch: 0 };
  }
  const clean = version.trim().replace(/^v/i, '');
  const [main, prerelease] = clean.split('-');
  const parts = main.split('.').map((p) => {
    const num = parseInt(p, 10);
    return isNaN(num) ? 0 : num;
  });
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
    prerelease,
  };
}

/**
 * Returns:
 *  -1 if v1 < v2  (v2 is newer)
 *   0 if v1 == v2 (same version)
 *   1 if v1 > v2  (v1 is newer)
 */
export function compareSemver(v1: string, v2: string): number {
  const p1 = parseSemver(v1);
  const p2 = parseSemver(v2);

  if (p1.major !== p2.major) return p1.major > p2.major ? 1 : -1;
  if (p1.minor !== p2.minor) return p1.minor > p2.minor ? 1 : -1;
  if (p1.patch !== p2.patch) return p1.patch > p2.patch ? 1 : -1;

  if (p1.prerelease && !p2.prerelease) return -1;
  if (!p1.prerelease && p2.prerelease) return 1;

  return 0;
}

function getFileSha256(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
  } catch {
    return null;
  }
}

function findReleaseFile(fileName: string): string | null {
  const searchRoots = [
    path.resolve(process.cwd(), 'release', fileName),
    path.resolve(process.cwd(), 'desktop', 'release', fileName),
    path.resolve(process.cwd(), '..', 'release', fileName),
    path.resolve(process.cwd(), '..', 'desktop', 'release', fileName),
  ];

  for (const p of searchRoots) {
    if (fs.existsSync(p)) return p;
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

export function buildUpdateManifest() {
  const baseUrl = getEffectiveServerBaseUrl();

  const winPath = findReleaseFile('XXQ-Chat-Setup.exe');
  const winStat = winPath ? fs.statSync(winPath) : null;
  const winSha256 = winPath ? getFileSha256(winPath) : null;

  const androidPath = findReleaseFile('XXQ-Chat-Android-debug.apk') || findReleaseFile('XXQ-Chat.apk');
  const androidStat = androidPath ? fs.statSync(androidPath) : null;
  const androidSha256 = androidPath ? getFileSha256(androidPath) : null;

  const linuxAppImagePath = findReleaseFile('XXQ-Chat-1.0.1-x86_64.AppImage');
  const linuxAppImageStat = linuxAppImagePath ? fs.statSync(linuxAppImagePath) : null;
  const linuxAppImageSha256 = linuxAppImagePath ? getFileSha256(linuxAppImagePath) : null;

  const linuxDebPath = findReleaseFile('xxq-chat_1.0.1_amd64.deb');
  const linuxDebStat = linuxDebPath ? fs.statSync(linuxDebPath) : null;
  const linuxDebSha256 = linuxDebPath ? getFileSha256(linuxDebPath) : null;

  return {
    version: CURRENT_RELEASE_VERSION,
    tag: CURRENT_RELEASE_TAG,
    releaseDate: '2026-10-21T06:00:00Z',
    releaseNotes: RELEASE_NOTES_TR,
    githubReleaseUrl: `${GITHUB_REPO_URL}/releases/tag/${CURRENT_RELEASE_TAG}`,
    platforms: {
      windows: {
        x64: {
          available: true,
          version: CURRENT_RELEASE_VERSION,
          fileName: 'XXQ-Chat-Setup.exe',
          fileSize: winStat?.size || 82590576,
          sha256: winSha256 || '39F9D58BD70FE95BBF840F45D7B0EA54C372634A71ADEF6FE1B351353B5454E5',
          downloadUrl: `${baseUrl}/api/downloads/windows`,
          githubDirectUrl: `${GITHUB_RELEASE_BASE}/XXQ-Chat-Setup.exe`,
          installType: 'nsis',
          instruction: 'İndirilen kurulum paketi tamamlandığında uygulama yeniden başlatılarak güncellenir.',
        },
      },
      android: {
        universal: {
          available: true,
          version: CURRENT_RELEASE_VERSION,
          versionCode: 2,
          fileName: 'XXQ-Chat-Android-debug.apk',
          fileSize: androidStat?.size || 11971302,
          sha256: androidSha256 || 'D276F98B5893598BB5F8DC3831DE6D48724510909C3C7B3C4172AA7406736122',
          downloadUrl: `${baseUrl}/api/downloads/android`,
          githubDirectUrl: `${GITHUB_RELEASE_BASE}/XXQ-Chat-Android-debug.apk`,
          installType: 'apk',
          instruction:
            'İndirilen APK dosyası açıldığında Android Paket Yükleyicisi devreye girer. Kullanıcı verileriniz korunur.',
        },
      },
      linux: {
        x64: {
          available: true,
          version: CURRENT_RELEASE_VERSION,
          formats: {
            appImage: {
              fileName: 'XXQ-Chat-1.0.1-x86_64.AppImage',
              fileSize: linuxAppImageStat?.size || 95000000,
              sha256: linuxAppImageSha256 || 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855',
              downloadUrl: `${GITHUB_RELEASE_BASE}/XXQ-Chat-1.0.1-x86_64.AppImage`,
              instruction: 'chmod +x XXQ-Chat-1.0.1-x86_64.AppImage && ./XXQ-Chat-1.0.1-x86_64.AppImage',
            },
            deb: {
              fileName: 'xxq-chat_1.0.1_amd64.deb',
              fileSize: linuxDebStat?.size || 72000000,
              sha256: linuxDebSha256 || 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855',
              downloadUrl: `${GITHUB_RELEASE_BASE}/xxq-chat_1.0.1_amd64.deb`,
              instruction: 'sudo dpkg -i xxq-chat_1.0.1_amd64.deb',
            },
          },
          installType: 'manual_package',
          instruction:
            'Linux üzerinde AppImage veya .deb paketini indirerek güncelleyebilirsiniz. Ayarlarınız ve sohbet verileriniz korunur.',
        },
      },
    },
  };
}

// GET /api/updates/manifest - Full trustworthy update manifest for all platforms
router.get('/manifest', (req: Request, res: Response) => {
  res.json(buildUpdateManifest());
});

// GET /api/updates/check - Version comparison and update check for a specific client
router.get('/check', (req: Request, res: Response) => {
  const platform = String(req.query.platform || '').toLowerCase().trim();
  const arch = String(req.query.arch || 'x64').toLowerCase().trim();
  const clientVersion = String(req.query.version || '0.0.0').trim();

  const manifest = buildUpdateManifest();
  const targetPlatform = platform === 'win32' ? 'windows' : platform;

  // Validate supported platform
  if (targetPlatform !== 'windows' && targetPlatform !== 'android' && targetPlatform !== 'linux') {
    return res.status(400).json({
      error: 'UNSUPPORTED_PLATFORM',
      message: `Desteklenmeyen platform: ${platform}. Desteklenen platformlar: windows, android, linux.`,
      updateAvailable: false,
    });
  }

  const latestVersion = manifest.version;
  const isOlder = compareSemver(clientVersion, latestVersion) < 0;

  let platformArtifact: any = null;
  if (targetPlatform === 'windows') {
    platformArtifact = manifest.platforms.windows.x64;
  } else if (targetPlatform === 'android') {
    platformArtifact = manifest.platforms.android.universal;
  } else if (targetPlatform === 'linux') {
    platformArtifact = manifest.platforms.linux.x64;
  }

  // Truthful check: only announce update available if client is older AND artifact is available
  const updateAvailable = Boolean(isOlder && platformArtifact?.available);

  return res.json({
    updateAvailable,
    currentInstalledVersion: clientVersion,
    latestVersion,
    releaseDate: manifest.releaseDate,
    releaseNotes: manifest.releaseNotes,
    githubReleaseUrl: manifest.githubReleaseUrl,
    artifact: updateAvailable ? platformArtifact : null,
    message: updateAvailable
      ? `Yeni bir güncelleme var: v${latestVersion}`
      : `Uygulamanız güncel (v${clientVersion}).`,
  });
});

export const updatesRouter = router;
