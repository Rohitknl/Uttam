const { app, BrowserWindow, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

try {
  fs.appendFileSync('C:\\Users\\yogit\\Downloads\\Uttam-master\\debug.log', `[${new Date().toISOString()}] main.cjs evaluated: ${process.argv.join(' ')}\n`);
} catch (e) {}

ipcMain.handle('dialog:select-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Backup Folder',
    buttonLabel: 'Select Folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('dialog:select-file', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Backup File to Restore',
    buttonLabel: 'Select Backup File',
    filters: [
      { name: 'SQLite Database Backup', extensions: ['db'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

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

function log(...args) {
  try {
    const logFile = path.join(getDataDir(), 'app.log');
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${args.join(' ')}\n`);
  } catch {}
  try {
    fs.appendFileSync('C:\\Users\\yogit\\Downloads\\Uttam-master\\debug.log', `[${new Date().toISOString()}] ${args.join(' ')}\n`);
  } catch {}
  console.log(...args);
}

log('=== MAIN PROCESS SCRIPT LOADED ===');

process.on('uncaughtException', (err) => {
  log('[CRASH uncaughtException]', err && (err.stack || err.message));
});

process.on('unhandledRejection', (err) => {
  log('[CRASH unhandledRejection]', err && (err.stack || err.message));
});

function waitForHealth(timeoutMs = 60000) {
  const started = Date.now();
  log(`Waiting for server health on http://${HOST}:${DESKTOP_PORT}/api/health ...`);
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`http://${HOST}:${DESKTOP_PORT}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          log('Health check succeeded!');
          return resolve();
        }
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
        log('Health check timed out!');
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

  log('startBackend:', { backendRoot, entry, dbPath, staticDir, execPath: process.execPath });

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

  log(`backendProcess spawned with PID: ${backendProcess.pid}`);

  let stderrOutput = '';
  backendProcess.stdout.on('data', (buf) => {
    const msg = buf.toString().trim();
    log(`[api] ${msg}`);
  });
  backendProcess.stderr.on('data', (buf) => {
    const msg = buf.toString().trim();
    stderrOutput += msg + '\n';
    log(`[api:err] ${msg}`);
  });
  backendProcess.on('exit', (code, signal) => {
    log(`backendProcess exited with code ${code}, signal ${signal}`);
    backendProcess = null;
    if (!isQuitting) {
      dialog.showErrorBox(
        'Uttam Laboratory',
        `The local server stopped unexpectedly (code ${code ?? 'n/a'}, signal ${signal ?? 'n/a'}).\n\n${stderrOutput.trim()}`,
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
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
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
    log('boot starting...');
    startBackend();
    await waitForHealth();
    log('waitForHealth done, creating window...');
    createWindow();
  } catch (err) {
    log('[CRASH boot error]', err && (err.stack || err.message));
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
  log('Another instance is already running; quitting duplicate instance.');
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
