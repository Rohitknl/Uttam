const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

const DESKTOP_PORT = Number(process.env.UTTAM_PORT || 18765);
const HOST = '127.0.0.1';

let mainWindow = null;
let backendProcess = null;
let isQuitting = false;

function isPackaged() {
  return app.isPackaged;
}

function getBackendRoot() {
  if (isPackaged()) {
    return path.join(process.resourcesPath, 'backend');
  }
  return path.join(__dirname, '..', 'backend');
}

function getFrontendDist() {
  if (isPackaged()) {
    return path.join(process.resourcesPath, 'frontend-dist');
  }
  return path.join(__dirname, '..', 'frontend', 'dist');
}

function getDataDir() {
  const dir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getDbFilePath() {
  return path.join(getDataDir(), 'uttam.db');
}

function toPrismaFileUrl(filePath) {
  return `file:${filePath.replace(/\\/g, '/')}`;
}

function ensureDatabase() {
  const dbPath = getDbFilePath();
  if (fs.existsSync(dbPath)) return dbPath;

  const candidates = [
    path.join(getBackendRoot(), 'prisma', 'template.db'),
    path.join(getBackendRoot(), 'prisma', 'dev.db'),
  ];

  for (const source of candidates) {
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, dbPath);
      return dbPath;
    }
  }

  // Empty file; Prisma will need schema already applied via template in normal builds
  fs.writeFileSync(dbPath, '');
  return dbPath;
}

function waitForHealth(timeoutMs = 60000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`http://${HOST}:${DESKTOP_PORT}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.on('error', retry);
      req.setTimeout(2000, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        return reject(new Error('Local server did not start in time'));
      }
      setTimeout(tick, 400);
    };

    tick();
  });
}

function startBackend() {
  const backendRoot = getBackendRoot();
  const entry = path.join(backendRoot, 'src', 'index.js');
  const dbPath = ensureDatabase();
  const staticDir = getFrontendDist();

  if (!fs.existsSync(entry)) {
    throw new Error(`Backend entry not found: ${entry}`);
  }
  if (!fs.existsSync(staticDir)) {
    throw new Error(`Frontend build not found: ${staticDir}. Run frontend build first.`);
  }

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    PORT: String(DESKTOP_PORT),
    HOST,
    DATABASE_URL: toPrismaFileUrl(dbPath),
    STATIC_DIR: staticDir,
    CORS_ORIGINS: `http://${HOST}:${DESKTOP_PORT}`,
    JWT_SECRET: process.env.JWT_SECRET || 'UttamLifecycleAyurvedaInventorySecretKey2024MustBeAtLeast256BitsLongForHS256',
    HERB_CODE_CRUD_PASSWORD: process.env.HERB_CODE_CRUD_PASSWORD || 'UttamLab@27',
  };

  backendProcess = spawn(process.execPath, [entry], {
    cwd: backendRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  backendProcess.stdout.on('data', (buf) => {
    console.log(`[api] ${buf.toString().trim()}`);
  });
  backendProcess.stderr.on('data', (buf) => {
    console.error(`[api] ${buf.toString().trim()}`);
  });
  backendProcess.on('exit', (code, signal) => {
    backendProcess = null;
    if (!isQuitting) {
      dialog.showErrorBox(
        'Uttam Laboratory',
        `The local server stopped unexpectedly (code ${code ?? 'n/a'}, signal ${signal ?? 'n/a'}).`,
      );
      app.quit();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: 'Uttam Laboratory',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(`http://${HOST}:${DESKTOP_PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function boot() {
  try {
    startBackend();
    await waitForHealth();
    createWindow();
  } catch (err) {
    console.error(err);
    dialog.showErrorBox('Uttam Laboratory failed to start', err.message || String(err));
    stopBackend();
    app.quit();
  }
}

function stopBackend() {
  if (!backendProcess) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(backendProcess.pid), '/f', '/t'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      backendProcess.kill('SIGTERM');
    }
  } catch {
    // ignore
  }
  backendProcess = null;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(boot);

  app.on('before-quit', () => {
    isQuitting = true;
    stopBackend();
  });

  app.on('window-all-closed', () => {
    isQuitting = true;
    stopBackend();
    app.quit();
  });
}
