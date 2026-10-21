import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFAULT_PRODUCTION_BACKEND_URL,
  DEFAULT_PRODUCTION_FIREBASE_CONFIG,
  resolveBackendBaseUrl,
  resolveFirebaseConfig,
  validateFirebaseConfig,
  isElectronEnvironment,
  FirebaseClientConfig,
} from '../config/appConfig';
import { probeBackendWithWakeup, ConnectionError } from '../services/health';

describe('Desktop & Web Configuration Suite', () => {
  const originalWindow = (globalThis as any).window;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalWindow !== undefined) {
      Object.defineProperty(globalThis, 'window', {
        value: originalWindow,
        configurable: true,
        writable: true,
      });
    } else {
      delete (globalThis as any).window;
    }
  });

  describe('Firebase Client Configuration Validation', () => {
    it('detects missing apiKey, authDomain, or projectId and returns clear Turkish error', () => {
      const emptyConfig: FirebaseClientConfig = {};
      const validation = validateFirebaseConfig(emptyConfig);

      expect(validation.valid).toBe(false);
      expect(validation.missing).toContain('apiKey (VITE_FIREBASE_API_KEY)');
      expect(validation.missing).toContain('authDomain (VITE_FIREBASE_AUTH_DOMAIN)');
      expect(validation.missing).toContain('projectId (VITE_FIREBASE_PROJECT_ID)');
      expect(validation.error).toContain('Firebase istemci yapılandırması eksik');
      expect(validation.error).toContain('Zorunlu alan(lar) tanımlanmamış');
    });

    it('identifies partial missing fields without revealing secret credentials', () => {
      const partialConfig: FirebaseClientConfig = {
        apiKey: 'test-api-key',
        projectId: 'test-project',
      };
      const validation = validateFirebaseConfig(partialConfig);

      expect(validation.valid).toBe(false);
      expect(validation.missing).toEqual(['authDomain (VITE_FIREBASE_AUTH_DOMAIN)']);
      expect(validation.error).toContain('authDomain');
      expect(validation.error).not.toContain('test-api-key');
    });

    it('validates default production Firebase configuration successfully', () => {
      const validation = validateFirebaseConfig(DEFAULT_PRODUCTION_FIREBASE_CONFIG);
      expect(validation.valid).toBe(true);
      expect(validation.missing).toHaveLength(0);
      expect(DEFAULT_PRODUCTION_FIREBASE_CONFIG.projectId).toBe('xxq-chat');
      expect(DEFAULT_PRODUCTION_FIREBASE_CONFIG.authDomain).toBe('xxq-chat.firebaseapp.com');
    });

    it('resolves production fallback config when environment variables are omitted', () => {
      const resolved = resolveFirebaseConfig();
      expect(resolved.apiKey).toBeDefined();
      expect(resolved.authDomain).toBe('xxq-chat.firebaseapp.com');
      expect(resolved.projectId).toBe('xxq-chat');
    });
  });

  describe('Backend URL Selection for Desktop & Web Environments', () => {
    it('detects Electron environment via electronAPI or file: protocol', () => {
      Object.defineProperty(globalThis, 'window', {
        value: {
          location: { protocol: 'file:', hostname: '', origin: 'file://' },
          electronAPI: { platform: 'win32', isElectron: true },
        },
        configurable: true,
        writable: true,
      });

      expect(isElectronEnvironment()).toBe(true);
    });

    it('selects production Render backend URL in Electron instead of localhost or file://', () => {
      Object.defineProperty(globalThis, 'window', {
        value: {
          location: { protocol: 'file:', hostname: '', origin: 'file://' },
          electronAPI: {
            platform: 'win32',
            isElectron: true,
            getServerUrl: () => 'https://xxq-chat-backend.onrender.com',
          },
        },
        configurable: true,
        writable: true,
      });

      const url = resolveBackendBaseUrl();
      expect(url).toBe('https://xxq-chat-backend.onrender.com');
      expect(url).not.toContain('localhost');
      expect(url).not.toContain('file:');
    });

    it('respects custom server URL if provided by Electron runtime', () => {
      Object.defineProperty(globalThis, 'window', {
        value: {
          location: { protocol: 'file:', hostname: '', origin: 'file://' },
          electronAPI: {
            platform: 'win32',
            isElectron: true,
            getServerUrl: () => 'https://custom-backend.example.com/',
          },
        },
        configurable: true,
        writable: true,
      });

      const url = resolveBackendBaseUrl();
      expect(url).toBe('https://custom-backend.example.com');
    });

    it('routes *.onrender.com frontend static domains to Render backend service', () => {
      Object.defineProperty(globalThis, 'window', {
        value: {
          location: { protocol: 'https:', hostname: 'xxq-chat-frontend.onrender.com', origin: 'https://xxq-chat-frontend.onrender.com' },
        },
        configurable: true,
        writable: true,
      });

      const url = resolveBackendBaseUrl();
      expect(url).toBe('https://xxq-chat-backend.onrender.com');
    });

    it('routes local Vite dev server (localhost) to local port 4000', () => {
      Object.defineProperty(globalThis, 'window', {
        value: {
          location: { protocol: 'http:', hostname: 'localhost', origin: 'http://localhost:5173' },
        },
        configurable: true,
        writable: true,
      });

      const url = resolveBackendBaseUrl();
      expect(url).toBe('http://localhost:4000');
    });
  });

  describe('Render Cold-Start Probing & Bounded Retries', () => {
    it('detects offline state immediately and throws clear Turkish ConnectionError', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true, writable: true });

      await expect(probeBackendWithWakeup({ maxAttempts: 3 })).rejects.toThrow(
        'İnternet bağlantınız kesilmiş görünüyor. Lütfen ağ bağlantınızı kontrol edin.'
      );
    });

    it('returns success on first attempt if server is awake and healthy', async () => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
      Object.defineProperty(globalThis, 'window', {
        value: {
          location: { protocol: 'file:', hostname: '', origin: 'file://' },
          electronAPI: { isElectron: true },
        },
        configurable: true,
        writable: true,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
      });
      global.fetch = mockFetch;

      const progressLogs: string[] = [];
      const result = await probeBackendWithWakeup({
        maxAttempts: 3,
        onProgress: (p) => progressLogs.push(p.message),
      });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(1);
      expect(progressLogs).toContain('Sunucu çevrim içi ve hazır.');
    });

    it('supports cancellation via AbortSignal when user clicks cancel', async () => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
      Object.defineProperty(globalThis, 'window', {
        value: {
          location: { protocol: 'file:', hostname: '', origin: 'file://' },
          electronAPI: { isElectron: true },
        },
        configurable: true,
        writable: true,
      });

      const controller = new AbortController();
      controller.abort();

      await expect(probeBackendWithWakeup({ maxAttempts: 3, signal: controller.signal })).rejects.toThrow(
        'kullanıcı tarafından iptal edildi'
      );
    });
  });
});
