/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface ElectronAPI {
  platform: string;
  isElectron: boolean;
  getServerUrl?: () => string;
  getFirebaseConfig?: () => {
    apiKey?: string;
    authDomain?: string;
    projectId?: string;
    storageBucket?: string;
    messagingSenderId?: string;
    appId?: string;
    measurementId?: string;
  };
  openExternal?: (url: string) => void;
  minimize?: () => void;
  maximize?: () => void;
  close?: () => void;
  isMaximized?: () => Promise<boolean>;
  showNotification?: (title: string, body: string) => void;
  getAppVersion?: () => Promise<string>;
  updater?: {
    check?: () => Promise<any>;
    download?: () => Promise<any>;
    install?: () => Promise<void>;
    cancel?: () => Promise<void>;
    onUpdateAvailable?: (callback: (data: any) => void) => () => void;
    onUpdateProgress?: (callback: (progress: { percent: number; transferred: number; total: number }) => void) => () => void;
    onUpdateDownloaded?: (callback: (data: any) => void) => () => void;
    onUpdateError?: (callback: (err: { error: string; isManual?: boolean }) => void) => () => void;
    onUpdateNotAvailable?: (callback: (data: any) => void) => () => void;
  };
}

interface Window {
  electronAPI?: ElectronAPI;
}
