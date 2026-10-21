import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { compareSemver, parseSemver, buildUpdateManifest } from '../routes/updates.js';

describe('XXQ Chat Cross-Platform Updates Suite', () => {
  describe('Semantic Version Parser & Comparator', () => {
    it('parses valid and prefixed semver strings', () => {
      expect(parseSemver('1.0.1')).toEqual({ major: 1, minor: 0, patch: 1, prerelease: undefined });
      expect(parseSemver('v2.3.4')).toEqual({ major: 2, minor: 3, patch: 4, prerelease: undefined });
      expect(parseSemver('1.2.0-beta.1')).toEqual({ major: 1, minor: 2, patch: 0, prerelease: 'beta.1' });
      expect(parseSemver('')).toEqual({ major: 0, minor: 0, patch: 0 });
    });

    it('correctly compares version numbers across major, minor, and patch', () => {
      // Installed older than release
      expect(compareSemver('1.0.0', '1.0.1')).toBe(-1);
      expect(compareSemver('0.9.9', '1.0.0')).toBe(-1);
      expect(compareSemver('1.0.1', '1.1.0')).toBe(-1);
      expect(compareSemver('v1.0.0', '1.0.1')).toBe(-1);

      // Installed matches release
      expect(compareSemver('1.0.1', '1.0.1')).toBe(0);
      expect(compareSemver('v1.0.1', '1.0.1')).toBe(0);

      // Installed newer than release
      expect(compareSemver('1.0.2', '1.0.1')).toBe(1);
      expect(compareSemver('2.0.0', '1.0.1')).toBe(1);
    });
  });

  describe('GET /api/updates/manifest', () => {
    it('returns full cross-platform update manifest with checksums and release notes in Turkish', async () => {
      const res = await request(app).get('/api/updates/manifest');

      expect(res.status).toBe(200);
      expect(res.body.version).toBe('1.0.1');
      expect(res.body.tag).toBe('v1.0.1');
      expect(res.body.releaseNotes).toContain('XXQ Chat v1.0.1 Güncelleme Notları');
      expect(res.body.releaseNotes).toContain('Windows Masaüstü');

      // Windows
      const win = res.body.platforms.windows.x64;
      expect(win.available).toBe(true);
      expect(win.fileName).toBe('XXQ-Chat-Setup.exe');
      expect(win.installType).toBe('nsis');
      expect(win.sha256).toMatch(/^[0-9A-F]{64}$/);

      // Android
      const android = res.body.platforms.android.universal;
      expect(android.available).toBe(true);
      expect(android.fileName).toBe('XXQ-Chat-Android-debug.apk');
      expect(android.installType).toBe('apk');
      expect(android.sha256).toMatch(/^[0-9A-F]{64}$/);

      // Linux
      const linux = res.body.platforms.linux.x64;
      expect(linux.available).toBe(true);
      expect(linux.formats.appImage.fileName).toContain('.AppImage');
      expect(linux.formats.deb.fileName).toContain('.deb');
      expect(linux.installType).toBe('manual_package');
    });
  });

  describe('GET /api/updates/check', () => {
    it('notifies update is available when installed Windows app is older (v1.0.0)', async () => {
      const res = await request(app)
        .get('/api/updates/check')
        .query({ platform: 'windows', arch: 'x64', version: '1.0.0' });

      expect(res.status).toBe(200);
      expect(res.body.updateAvailable).toBe(true);
      expect(res.body.latestVersion).toBe('1.0.1');
      expect(res.body.message).toContain('Yeni bir güncelleme var: v1.0.1');
      expect(res.body.artifact).toBeDefined();
      expect(res.body.artifact.fileName).toBe('XXQ-Chat-Setup.exe');
      expect(res.body.artifact.sha256).toMatch(/^[0-9A-F]{64}$/);
    });

    it('reports up-to-date when installed Windows app is on current release (v1.0.1)', async () => {
      const res = await request(app)
        .get('/api/updates/check')
        .query({ platform: 'windows', arch: 'x64', version: '1.0.1' });

      expect(res.status).toBe(200);
      expect(res.body.updateAvailable).toBe(false);
      expect(res.body.message).toContain('Uygulamanız güncel (v1.0.1)');
      expect(res.body.artifact).toBeNull();
    });

    it('reports up-to-date when installed version is newer than release (e.g. 1.0.2 dev)', async () => {
      const res = await request(app)
        .get('/api/updates/check')
        .query({ platform: 'windows', arch: 'x64', version: '1.0.2' });

      expect(res.status).toBe(200);
      expect(res.body.updateAvailable).toBe(false);
      expect(res.body.artifact).toBeNull();
    });

    it('notifies update is available for Android APK when installed version is older', async () => {
      const res = await request(app)
        .get('/api/updates/check')
        .query({ platform: 'android', arch: 'universal', version: '1.0.0' });

      expect(res.status).toBe(200);
      expect(res.body.updateAvailable).toBe(true);
      expect(res.body.artifact.fileName).toBe('XXQ-Chat-Android-debug.apk');
      expect(res.body.artifact.installType).toBe('apk');
    });

    it('provides Linux formats (AppImage and deb) when checking Linux update', async () => {
      const res = await request(app)
        .get('/api/updates/check')
        .query({ platform: 'linux', arch: 'x64', version: '1.0.0' });

      expect(res.status).toBe(200);
      expect(res.body.updateAvailable).toBe(true);
      expect(res.body.artifact.formats.appImage).toBeDefined();
      expect(res.body.artifact.formats.deb).toBeDefined();
      expect(res.body.artifact.installType).toBe('manual_package');
    });

    it('rejects unsupported platforms with 400 and clear Turkish message', async () => {
      const res = await request(app)
        .get('/api/updates/check')
        .query({ platform: 'unsupported-os', version: '1.0.0' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('UNSUPPORTED_PLATFORM');
      expect(res.body.message).toContain('Desteklenmeyen platform');
    });
  });
});
