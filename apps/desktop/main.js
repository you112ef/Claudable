#!/usr/bin/env node

const path = require('path');
const { app, BrowserWindow, shell, dialog } = require('electron');
const { startWebServer } = require('./server');
const { bootstrapApi } = require('./api-runner');

const isMac = process.platform === 'darwin';
const isDev = !app.isPackaged;

// Optional safe-mode toggles via env for troubleshooting black screen
if (process.env.ELECTRON_DISABLE_GPU === '1') {
  try { app.disableHardwareAcceleration(); } catch (_) {}
}

// Load .env only in development if available; ignore if module isn't installed
if (isDev) {
  try {
    require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
  } catch (e) {
    // no-op in packaged builds or if dotenv isn't present
  }
}

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = isDev ? 'true' : process.env.ELECTRON_DISABLE_SECURITY_WARNINGS;

/**
 * Create the main application window
 */
async function createMainWindow() {
  // In packaged mode, we self-host Next (8080) and proxy API to Python runner (default 18080)
  const packaged = app.isPackaged;
  const defaultWebPort = packaged ? 8080 : (process.env.WEB_PORT || 3000);
  let desiredApiPort = packaged ? 18080 : (process.env.API_PORT || 8080);

  const useSandbox = process.env.ELECTRON_DISABLE_SANDBOX === '1' ? false : true;
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0b0b0d',
    webPreferences: {
      contextIsolation: true,
      sandbox: useSandbox,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Open external links in default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (packaged) {
    try {
      const resourcesPath = process.resourcesPath;
      const webDir = path.join(resourcesPath, 'web');
      const apiDir = path.join(resourcesPath, 'api');

      // Start API (Python, venv stored in userData) with retry and port fallback
      const { apiPort, apiChild } = await startApiWithRetry({ apiDir, desiredApiPort, userDataDir: app.getPath('userData') });
      // Start Next server with proxy to API
      await startWebServer({ webDir, webPort: defaultWebPort, apiPort });
      const startUrl = `http://localhost:${defaultWebPort}`;
      await win.loadURL(startUrl);

      // Graceful shutdown
      const clean = () => {
        try { apiChild.kill('SIGINT'); } catch (_) {}
      };
      app.on('before-quit', clean);
      win.on('closed', clean);
    } catch (err) {
      const hint = err && err.logFile ? `\n\n설치/실행 로그 파일을 확인하세요:\n${err.logFile}` : '';
      dialog.showErrorBox('앱 시작 실패', `${err.message}${hint}`);
      app.quit();
      return;
    }
  } else {
    const startUrl = process.env.ELECTRON_START_URL || `http://localhost:${defaultWebPort}`;
    win.loadURL(startUrl);
  }

  if (isDev || process.env.ELECTRON_DEBUG === '1' || process.env.OPEN_DEVTOOLS === '1') {
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

function waitForApiHealthy(port, { timeoutMs = 15000, intervalMs = 500 } = {}) {
  const http = require('http');
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const tryOnce = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: Math.min(intervalMs, 1000) }, (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          res.resume();
          return resolve(true);
        }
        res.resume();
        schedule();
      });
      req.on('error', schedule);
      req.on('timeout', () => { req.destroy(); schedule(); });
    };
    const schedule = () => {
      if (Date.now() >= deadline) return resolve(false);
      setTimeout(tryOnce, intervalMs);
    };
    tryOnce();
  });
}

async function findFreePort(preferPort) {
  try {
    // Use dynamic import to support ESM-only module in CJS context
    const mod = await import('get-port');
    const getPort = mod && (mod.default || mod);
    const port = await getPort({ port: preferPort });
    return port;
  } catch (e) {
    // Fallback: try preferPort; if busy, ask OS for a free ephemeral port
    const net = require('net');
    return await new Promise((resolve) => {
      const srv = net.createServer();
      srv.once('error', () => {
        const s2 = net.createServer();
        s2.listen(0, '127.0.0.1', () => {
          const addr = s2.address();
          const port = typeof addr === 'object' && addr ? addr.port : preferPort;
          s2.close(() => resolve(port));
        });
      });
      srv.listen(preferPort, '127.0.0.1', () => {
        const addr = srv.address();
        const port = typeof addr === 'object' && addr ? addr.port : preferPort;
        srv.close(() => resolve(port));
      });
    });
  }
}

async function startApiWithRetry({ apiDir, desiredApiPort, userDataDir }) {
  // Try up to 3 attempts with different ports
  let lastErr;
  for (let i = 0; i < 3; i++) {
    const base = Number(desiredApiPort) || 18080;
    const tryPort = await findFreePort(i === 0 ? base : base + i);
    try {
      const child = await bootstrapApi({ apiSrcDir: apiDir, apiPort: tryPort, userDataDir });
      const ok = await waitForApiHealthy(tryPort, { timeoutMs: 12000 });
      if (ok) return { apiPort: tryPort, apiChild: child };
      try { child.kill('SIGINT'); } catch (_) {}
      lastErr = new Error(`API unhealthy on port ${tryPort}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('API start failed');
}

// macOS: keep app running until explicit quit
app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

app.whenReady().then(() => {
  // On macOS, set App ID for notifications and dock
  if (isMac) app.setAboutPanelOptions({ applicationName: 'Claudable' });
  createMainWindow();
});
