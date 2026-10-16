import { config } from '../config.js';

/**
 * Validates whether an incoming HTTP or WebSocket origin is permitted.
 * Handles production Render domains (*.onrender.com), configured CORS_ORIGIN,
 * localhost development origins, and Electron desktop apps.
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // Server-to-server, healthchecks, mobile native clients, cURL
  if (config.CORS_ORIGIN === '*') return true;

  const cleanOrigin = origin.trim().replace(/\/$/, '');
  const configuredList = config.CORS_ORIGIN.split(',').map((o) => o.trim().replace(/\/$/, ''));

  // Exact match with configured origin
  if (configuredList.includes(cleanOrigin)) {
    return true;
  }

  // Allow Render deployed frontend static site and any subdomains
  if (cleanOrigin.endsWith('.onrender.com')) {
    return true;
  }

  // Allow local development (Vite dev server, tests)
  if (/^https?:\/\/localhost(:\d+)?$/.test(cleanOrigin)) {
    return true;
  }
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(cleanOrigin)) {
    return true;
  }

  // Allow Electron desktop app / file scheme
  if (cleanOrigin === 'file://' || cleanOrigin.startsWith('vscode-webview://') || cleanOrigin.startsWith('ionic://')) {
    return true;
  }

  return false;
}
