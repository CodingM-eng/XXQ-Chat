const { app, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

class DesktopUpdater {
  constructor() {
    this.mainWindow = null;
    this.status = 'idle'; // idle | checking | available | not-available | downloading | downloaded | error
    this.pendingUpdate = null;
    this.downloadAbortController = null;
    this.verifiedInstallerPath = null;
  }

  setMainWindow(window) {
    this.mainWindow = window;
  }

  emit(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  getServerUrl() {
    return process.env.BACKEND_URL || 'https://xxq-chat-backend.onrender.com';
  }

  /**
   * Checks for updates from the official backend /api/updates/check endpoint
   */
  async checkForUpdates(manual = false) {
    if (this.status === 'downloading') {
      return { success: false, message: 'Bir indirme işlemi zaten devam ediyor.' };
    }

    this.status = 'checking';
    this.emit('updater:status', { status: 'checking', message: 'Güncellemeler denetleniyor...' });

    const currentVersion = app.getVersion();
    const platform = process.platform;
    const arch = process.arch;
    const checkUrl = `${this.getServerUrl()}/api/updates/check?platform=${platform}&arch=${arch}&version=${encodeURIComponent(currentVersion)}`;

    try {
      const response = await this.fetchJson(checkUrl);

      if (response && response.updateAvailable && response.artifact) {
        this.status = 'available';
        this.pendingUpdate = response;

        this.emit('updater:update-available', {
          currentVersion,
          latestVersion: response.latestVersion,
          releaseNotes: response.releaseNotes,
          releaseDate: response.releaseDate,
          githubReleaseUrl: response.githubReleaseUrl,
          artifact: response.artifact,
          message: `Yeni bir güncelleme var: v${response.latestVersion}`,
        });

        // Show native notification if window not focused
        if (Notification.isSupported() && this.mainWindow && !this.mainWindow.isFocused()) {
          new Notification({
            title: 'XXQ Chat Güncellemesi',
            body: `Yeni bir sürüm yayınlandı: v${response.latestVersion}. Yüklemek için uygulamayı açın.`,
          }).show();
        }

        return { success: true, updateAvailable: true, data: response };
      } else {
        this.status = 'not-available';
        this.pendingUpdate = null;
        this.emit('updater:update-not-available', {
          currentVersion,
          message: `Uygulamanız güncel (v${currentVersion}).`,
        });
        return { success: true, updateAvailable: false, message: `Uygulamanız güncel (v${currentVersion}).` };
      }
    } catch (err) {
      this.status = 'error';
      const errorMsg = 'Güncelleme sunucusuna bağlanılamadı. İnternet bağlantınızı kontrol edin.';
      console.warn('[Updater] Check failed:', err.message);
      this.emit('updater:error', { error: errorMsg, isManual: manual });
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Downloads the verified update package with progress reporting and SHA-256 verification
   */
  async startDownload() {
    if (!this.pendingUpdate || !this.pendingUpdate.artifact) {
      throw new Error('İndirilecek geçerli bir güncelleme bulunamadı.');
    }

    const artifact = this.pendingUpdate.artifact;
    const downloadUrl = artifact.downloadUrl || artifact.githubDirectUrl;
    const expectedSha256 = (artifact.sha256 || '').toUpperCase().trim();

    if (!downloadUrl) {
      throw new Error('Güncelleme indirme bağlantısı mevcut değil.');
    }

    // Security check: only download from trusted hosts
    const parsed = new URL(downloadUrl);
    const trustedHosts = [
      'xxq-chat-backend.onrender.com',
      'github.com',
      'objects.githubusercontent.com',
      'release-assets.githubusercontent.com',
    ];
    const isTrusted = trustedHosts.some((h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`));
    if (!isTrusted && !parsed.hostname.includes('localhost') && !parsed.hostname.includes('127.0.0.1')) {
      throw new Error(`Güvenlik Uyarısı: Doğrulanmamış indirme adresi engellendi (${parsed.hostname}).`);
    }

    this.status = 'downloading';
    this.downloadAbortController = new AbortController();

    const updatesDir = path.join(app.getPath('userData'), 'updates');
    if (!fs.existsSync(updatesDir)) {
      fs.mkdirSync(updatesDir, { recursive: true });
    }

    const targetFile = path.join(updatesDir, artifact.fileName || 'XXQ-Chat-Setup.exe');
    if (fs.existsSync(targetFile)) {
      try {
        fs.unlinkSync(targetFile);
      } catch {}
    }

    this.emit('updater:status', { status: 'downloading', message: 'Güncelleme paketi indiriliyor...' });

    return new Promise((resolve, reject) => {
      this.downloadFileWithRedirects(downloadUrl, targetFile, (progress) => {
        this.emit('updater:download-progress', progress);
      })
        .then(async () => {
          this.emit('updater:status', { status: 'verifying', message: 'Dosya bütünlüğü (SHA-256) doğrulanıyor...' });

          // Verify SHA-256 checksum
          const actualHash = await this.calculateFileSha256(targetFile);
          if (expectedSha256 && actualHash !== expectedSha256) {
            fs.unlinkSync(targetFile);
            const mismatchError = `İndirilen güncelleme dosyasının sağlama toplamı (SHA-256) eşleşmedi! Beklenen: ${expectedSha256}, Hesaplanan: ${actualHash}. Güvenlik nedeniyle kurulum iptal edildi.`;
            console.error('[Updater] ' + mismatchError);
            this.status = 'error';
            this.emit('updater:error', { error: mismatchError });
            reject(new Error(mismatchError));
            return;
          }

          this.status = 'downloaded';
          this.verifiedInstallerPath = targetFile;
          this.emit('updater:update-downloaded', {
            version: this.pendingUpdate.latestVersion,
            targetFile,
            message: 'Güncelleme hazır! Uygulamayı yeniden başlatıp güncellemek istiyor musunuz?',
          });
          resolve({ success: true, targetFile });
        })
        .catch((err) => {
          this.status = 'error';
          this.emit('updater:error', { error: err.message || 'İndirme sırasında hata oluştu.' });
          reject(err);
        });
    });
  }

  /**
   * Installs the downloaded update and cleanly restarts the application
   */
  installAndRestart() {
    if (!this.verifiedInstallerPath || !fs.existsSync(this.verifiedInstallerPath)) {
      throw new Error('Kuruluma hazır doğrulanmış güncelleme dosyası bulunamadı.');
    }

    const installerPath = this.verifiedInstallerPath;

    if (process.platform === 'win32') {
      // NSIS installer: run with passive/silent flag, preserving all user profile data
      console.log('[Updater] Spawning NSIS installer:', installerPath);
      const child = spawn(installerPath, ['/passive', '/norestart'], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      app.isQuitting = true;
      app.quit();
    } else if (process.platform === 'linux') {
      // On Linux, guide or run the new AppImage
      if (installerPath.endsWith('.AppImage')) {
        try {
          fs.chmodSync(installerPath, '755');
          const child = spawn(installerPath, [], { detached: true, stdio: 'ignore' });
          child.unref();
          app.isQuitting = true;
          app.quit();
        } catch (e) {
          console.error('[Updater] Failed to launch AppImage:', e);
        }
      }
    }
  }

  cancelDownload() {
    if (this.downloadAbortController) {
      this.downloadAbortController.abort();
      this.downloadAbortController = null;
    }
    this.status = 'idle';
    this.emit('updater:status', { status: 'idle', message: 'İndirme iptal edildi.' });
  }

  fetchJson(url) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https:') ? https : http;
      client
        .get(url, { headers: { 'User-Agent': 'XXQ-Chat-Desktop-Updater' } }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return this.fetchJson(res.headers.location).then(resolve).catch(reject);
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          }
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
        })
        .on('error', reject);
    });
  }

  downloadFileWithRedirects(url, destinationPath, onProgress, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
      if (maxRedirects <= 0) return reject(new Error('Çok fazla yönlendirme (redirect limit exceeded)'));

      const client = url.startsWith('https:') ? https : http;
      const fileStream = fs.createWriteStream(destinationPath);

      client
        .get(url, { headers: { 'User-Agent': 'XXQ-Chat-Desktop-Updater' } }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            fileStream.close();
            try {
              fs.unlinkSync(destinationPath);
            } catch {}
            return this.downloadFileWithRedirects(res.headers.location, destinationPath, onProgress, maxRedirects - 1)
              .then(resolve)
              .catch(reject);
          }

          if (res.statusCode !== 200) {
            fileStream.close();
            try {
              fs.unlinkSync(destinationPath);
            } catch {}
            return reject(new Error(`İndirme başarısız oldu: HTTP ${res.statusCode}`));
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          let transferredBytes = 0;

          res.on('data', (chunk) => {
            transferredBytes += chunk.length;
            if (totalBytes > 0 && onProgress) {
              const percent = Math.min(100, Math.round((transferredBytes / totalBytes) * 100));
              onProgress({ percent, transferred: transferredBytes, total: totalBytes });
            }
          });

          res.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close(resolve);
          });
        })
        .on('error', (err) => {
          fileStream.close();
          try {
            fs.unlinkSync(destinationPath);
          } catch {}
          reject(err);
        });
    });
  }

  calculateFileSha256(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex').toUpperCase()));
      stream.on('error', reject);
    });
  }
}

module.exports = { DesktopUpdater };
