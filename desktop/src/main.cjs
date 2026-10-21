const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage, session, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let isQuitting = false;

// Request single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Media & Screen Sharing Permission Handlers
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      const allowed = ['media', 'audio', 'video', 'notifications', 'display-capture', 'camera', 'microphone'];
      if (allowed.includes(permission)) {
        callback(true);
      } else {
        callback(false);
      }
    });

    session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
      const allowed = ['media', 'audio', 'video', 'notifications', 'display-capture', 'camera', 'microphone'];
      return allowed.includes(permission);
    });

    if (session.defaultSession.setDisplayMediaRequestHandler) {
      session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
        try {
          const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
          const screenSource = sources.find((s) => s.id.startsWith('screen:')) || sources[0];
          if (screenSource) {
            callback({ video: screenSource, audio: 'loopback' });
          } else {
            callback({});
          }
        } catch (err) {
          console.error('[Electron] Display media request error:', err);
          callback({});
        }
      });
    }

    createWindow();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#08070b',
    title: 'XXQ Chat',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  // Determine local web bundle location
  const localWebDist = path.join(__dirname, '../web/index.html');
  const fallbackWebDist = path.join(__dirname, '../../web/dist/index.html');

  if (process.env.ELECTRON_DEV_URL) {
    mainWindow.loadURL(process.env.ELECTRON_DEV_URL);
  } else if (fs.existsSync(localWebDist)) {
    mainWindow.loadFile(localWebDist);
  } else if (fs.existsSync(fallbackWebDist)) {
    mainWindow.loadFile(fallbackWebDist);
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Minimize to tray on close if user prefers
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      // In production desktop apps, allow minimizing to tray
      // mainWindow.hide();
      // event.preventDefault();
    }
  });

  // Navigation security: prevent navigating outside allowed origins
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://') && !url.startsWith('http://localhost:')) {
      event.preventDefault();
      require('electron').shell.openExternal(url);
    }
  });

  // Window Open Handler: allows Google & Firebase Auth popups while opening external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (
      url.includes('firebaseapp.com') ||
      url.startsWith('https://accounts.google.com') ||
      url.includes('apis.google.com') ||
      url.includes('googleapis.com')
    ) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 680,
          autoHideMenuBar: true,
          webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
          },
        },
      };
    }

    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });

  // IPC Event Handlers
  ipcMain.on('shell:openExternal', (event, url) => {
    if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
      require('electron').shell.openExternal(url);
    }
  });

  ipcMain.on('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on('window:close', () => {
    mainWindow?.close();
  });

  ipcMain.handle('window:isMaximized', () => {
    return mainWindow?.isMaximized() ?? false;
  });

  ipcMain.handle('app:version', () => {
    return app.getVersion();
  });

  ipcMain.on('notification:show', (event, { title, body }) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  });
}

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
