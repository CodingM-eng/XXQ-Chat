import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { initDb, closeDb } from '../db/index.js';
import { GoogleDriveService } from '../services/drive.js';

describe('Features 24 to 30 Backend Verification Suite', () => {
  beforeAll(async () => {
    await initDb();
  });

  afterAll(async () => {
    await closeDb();
  });

  describe('Feature 24: Google Drive API Setup Messaging & SERVICE_DISABLED Detection', () => {
    it('accurately detects SERVICE_DISABLED for project 1096874707747 and provides direct GCP link', () => {
      const mockRawError = {
        code: 403,
        errors: [
          {
            domain: 'usageLimits',
            reason: 'accessNotConfigured',
            message:
              'Google Drive API has not been used in project 1096874707747 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=1096874707747 then retry.',
          },
        ],
      };

      const sanitized = GoogleDriveService.sanitizeDriveApiError(mockRawError);
      expect(sanitized.isServiceDisabled).toBe(true);
      expect(sanitized.projectId).toBe('1096874707747');
      expect(sanitized.enableUrl).toContain('1096874707747');
      expect(sanitized.messageTr).toContain('Google Cloud projenizde (1096874707747) Google Drive API etkinleştirilmemiş');
      expect(sanitized.messageTr).toContain('Bu durum bir kod hatası değildir');
    });

    it('generates consistent OAuth redirect URI matching Render configuration', () => {
      const status = GoogleDriveService.getStatus();
      expect(status.redirectUri).toBe('https://xxq-chat-backend.onrender.com/api/drive/callback');
    });
  });

  describe('Feature 26: Tenor GIF Server Endpoints & Policy Compliance', () => {
    it('GET /api/gifs/status returns truthful configuration status and attribution', async () => {
      const res = await request(app).get('/api/gifs/status');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('provider', 'tenor');
      expect(res.body).toHaveProperty('attribution');
      expect(res.body.attribution).toHaveProperty('text', 'Powered By Tenor');
      expect(res.body.attribution).toHaveProperty('websiteUrl', 'https://tenor.com');
      // If no key in test environment, correctly indicates unconfigured without faking
      if (!process.env.TENOR_API_KEY) {
        expect(res.body.configured).toBe(false);
        expect(res.body.message).toContain('Ocak 2026');
      }
    });

    it('GET /api/gifs/categories returns curated Turkish categories', async () => {
      const res = await request(app).get('/api/gifs/categories');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('categories');
      expect(Array.isArray(res.body.categories)).toBe(true);
      expect(res.body.categories.length).toBeGreaterThan(0);
      expect(res.body.categories[0]).toHaveProperty('id');
      expect(res.body.categories[0]).toHaveProperty('label');
      expect(res.body.categories[0]).toHaveProperty('query');
    });
  });

  describe('Feature 27: Accurate Device Detection & Download Guidance Endpoints', () => {
    it('GET /api/downloads/status returns truthful platform matrix without fake releases', async () => {
      const res = await request(app).get('/api/downloads/status');
      expect(res.status).toBe(200);

      // Windows
      expect(res.body).toHaveProperty('windows');
      expect(res.body.windows.installGuide).toContain('Türkçe kurulum sihirbazı');

      // Android
      expect(res.body).toHaveProperty('android');
      expect(res.body.android.installGuide).toContain('Sistem Paket Yükleyicisi');

      // macOS truthful reporting
      expect(res.body).toHaveProperty('mac');
      expect(res.body.mac.intel.available).toBe(false);
      expect(res.body.mac.intel.message).toContain('Intel tabanlı Mac için henüz doğrulanmış bir yerel .dmg');
      expect(res.body.mac.appleSilicon.available).toBe(false);
      expect(res.body.mac.appleSilicon.message).toContain('Apple Silicon');

      // iOS PWA guidance
      expect(res.body).toHaveProperty('ios');
      expect(res.body.ios.pwaOnly).toBe(true);
      expect(res.body.ios.instructions.length).toBeGreaterThanOrEqual(4);
      expect(res.body.ios.instructions[1]).toContain('Paylaş');
      expect(res.body.ios.instructions[2]).toContain('Ana Ekrana Ekle');
    });
  });
});
