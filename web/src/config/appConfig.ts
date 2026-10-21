export const DEFAULT_PRODUCTION_BACKEND_URL = 'https://xxq-chat-backend.onrender.com';

export interface FirebaseClientConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
}

export const DEFAULT_PRODUCTION_FIREBASE_CONFIG: Required<Pick<FirebaseClientConfig, 'apiKey' | 'authDomain' | 'projectId'>> & FirebaseClientConfig = {
  apiKey: 'AIzaSyCCk8A6picstXW0qSMCXB75tAuj47BfJps',
  authDomain: 'xxq-chat.firebaseapp.com',
  projectId: 'xxq-chat',
  storageBucket: 'xxq-chat.firebasestorage.app',
  messagingSenderId: '361932070636',
  appId: '1:361932070636:web:086c009ce9f7fb68998fc9',
  measurementId: 'G-CXJNKZYRLG',
};

/**
 * Checks whether the current runtime environment is an Electron native desktop app.
 */
export function isElectronEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.electronAPI?.isElectron ||
    (window as any).electronAPI ||
    window.location.protocol === 'file:' ||
    (typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('electron'))
  );
}

/**
 * Truthfully determines the backend API/WebSocket base URL.
 * - In Electron: Always points to production Render backend (or custom configured URL), NEVER localhost or file://.
 * - On Render static site: Points to Render backend.
 * - In Vite local development: Points to local backend (http://localhost:4000).
 */
export function resolveBackendBaseUrl(): string {
  // 1. Build-time explicit environment variable
  const envUrl = (import.meta.env.VITE_API_URL || '').trim();
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }

  // 2. Electron runtime check
  if (isElectronEnvironment()) {
    const runtimeUrl = window.electronAPI?.getServerUrl?.();
    if (runtimeUrl && runtimeUrl.trim()) {
      return runtimeUrl.trim().replace(/\/+$/, '');
    }
    return DEFAULT_PRODUCTION_BACKEND_URL;
  }

  // 3. Browser environment check
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    // Render static site or subdomains -> Render backend
    if (host.endsWith('.onrender.com')) {
      return DEFAULT_PRODUCTION_BACKEND_URL;
    }
    // Local Vite dev server
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:4000';
    }
    // Any other origin that is valid http/https
    if (window.location.origin && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
      return window.location.origin.replace(/\/+$/, '');
    }
  }

  return DEFAULT_PRODUCTION_BACKEND_URL;
}

/**
 * Resolves Firebase public web client configuration.
 * Order of precedence:
 * 1. Build-time VITE_FIREBASE_* environment variables
 * 2. Electron runtime window.electronAPI.getFirebaseConfig()
 * 3. Default production public web client configuration
 */
export function resolveFirebaseConfig(): FirebaseClientConfig {
  const envConfig: FirebaseClientConfig = {
    apiKey: (import.meta.env.VITE_FIREBASE_API_KEY || '').trim() || undefined,
    authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim() || undefined,
    projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim() || undefined,
    storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim() || undefined,
    messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim() || undefined,
    appId: (import.meta.env.VITE_FIREBASE_APP_ID || '').trim() || undefined,
    measurementId: (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '').trim() || undefined,
  };

  const electronConfig = typeof window !== 'undefined' ? window.electronAPI?.getFirebaseConfig?.() : undefined;

  return {
    apiKey: envConfig.apiKey || electronConfig?.apiKey || DEFAULT_PRODUCTION_FIREBASE_CONFIG.apiKey,
    authDomain: envConfig.authDomain || electronConfig?.authDomain || DEFAULT_PRODUCTION_FIREBASE_CONFIG.authDomain,
    projectId: envConfig.projectId || electronConfig?.projectId || DEFAULT_PRODUCTION_FIREBASE_CONFIG.projectId,
    storageBucket: envConfig.storageBucket || electronConfig?.storageBucket || DEFAULT_PRODUCTION_FIREBASE_CONFIG.storageBucket,
    messagingSenderId: envConfig.messagingSenderId || electronConfig?.messagingSenderId || DEFAULT_PRODUCTION_FIREBASE_CONFIG.messagingSenderId,
    appId: envConfig.appId || electronConfig?.appId || DEFAULT_PRODUCTION_FIREBASE_CONFIG.appId,
    measurementId: envConfig.measurementId || electronConfig?.measurementId || DEFAULT_PRODUCTION_FIREBASE_CONFIG.measurementId,
  };
}

/**
 * Validates that all required Firebase client configuration parameters are present.
 * Returns clear Turkish feedback identifying missing settings without revealing secrets.
 */
export function validateFirebaseConfig(config: FirebaseClientConfig): { valid: boolean; missing: string[]; error?: string } {
  const missing: string[] = [];
  if (!config.apiKey?.trim()) missing.push('apiKey (VITE_FIREBASE_API_KEY)');
  if (!config.authDomain?.trim()) missing.push('authDomain (VITE_FIREBASE_AUTH_DOMAIN)');
  if (!config.projectId?.trim()) missing.push('projectId (VITE_FIREBASE_PROJECT_ID)');

  if (missing.length > 0) {
    return {
      valid: false,
      missing,
      error: `Firebase istemci yapılandırması eksik: Zorunlu alan(lar) tanımlanmamış: ${missing.join(', ')}. Lütfen kurulum ortam değişkenlerini kontrol edin.`,
    };
  }
  return { valid: true, missing: [] };
}
