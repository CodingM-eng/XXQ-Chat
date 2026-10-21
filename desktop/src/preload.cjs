const { contextBridge, ipcRenderer } = require('electron');

const DEFAULT_BACKEND_URL = 'https://xxq-chat-backend.onrender.com';
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCCk8A6picstXW0qSMCXB75tAuj47BfJps',
  authDomain: 'xxq-chat.firebaseapp.com',
  projectId: 'xxq-chat',
  storageBucket: 'xxq-chat.firebasestorage.app',
  messagingSenderId: '361932070636',
  appId: '1:361932070636:web:086c009ce9f7fb68998fc9',
  measurementId: 'G-CXJNKZYRLG',
};

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  getServerUrl: () => process.env.BACKEND_URL || DEFAULT_BACKEND_URL,
  getFirebaseConfig: () => ({
    apiKey: process.env.VITE_FIREBASE_API_KEY || DEFAULT_FIREBASE_CONFIG.apiKey,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || DEFAULT_FIREBASE_CONFIG.authDomain,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_CONFIG.projectId,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || DEFAULT_FIREBASE_CONFIG.storageBucket,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || DEFAULT_FIREBASE_CONFIG.messagingSenderId,
    appId: process.env.VITE_FIREBASE_APP_ID || DEFAULT_FIREBASE_CONFIG.appId,
    measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || DEFAULT_FIREBASE_CONFIG.measurementId,
  }),
  openExternal: (url) => ipcRenderer.send('shell:openExternal', url),
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  showNotification: (title, body) => ipcRenderer.send('notification:show', { title, body }),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
});
