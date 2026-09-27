const { app, BrowserWindow, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');



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

function getCredentialsFilePath() {
  return path.join(getDataDir(), 'credentials.json');
}

function ensureCredentials() {
  const credPath = getCredentialsFilePath();
  if (fs.existsSync(credPath)) return credPath;

  const templateCred = path.join(getBackendRoot(), 'credentials.json');
  if (fs.existsSync(templateCred)) {
    try {
      fs.copyFileSync(templateCred, credPath);
      return credPath;
    } catch {}
  }
  return credPath;
}

const DB_CLEAN_VERSION_MARKER = 'v1.1.0-clean-init';

function cleanAndResetDatabase(targetDbPath, templateDb, reason) {
  log(`[DB AUTO-CLEAN] Cleaning database at "${targetDbPath}". Reason: ${reason}`);

  if (fs.existsSync(targetDbPath)) {
    try {
      const dataDir = path.dirname(targetDbPath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `safety-backup-old-db-${timestamp}.db`;
      const backupPath = path.join(dataDir, backupName);
      fs.copyFileSync(targetDbPath, backupPath);
      log(`[DB AUTO-CLEAN] Saved safety backup to: ${backupPath}`);

      // Also copy safety backup to Documents/UttamLab/Backups if accessible
      try {
        const docsBackupDir = path.join(app.getPath('documents'), 'UttamLab', 'Backups');
        fs.mkdirSync(docsBackupDir, { recursive: true });
        fs.copyFileSync(targetDbPath, path.join(docsBackupDir, backupName));
        log(`[DB AUTO-CLEAN] Saved safety backup in Documents: ${path.join(docsBackupDir, backupName)}`);
      } catch {}
    } catch (err) {
      log(`[DB AUTO-CLEAN] Warning saving backup: ${err.message}`);
    }

    // Clean sidecar files
    for (const suffix of ['-wal', '-shm', '-journal']) {
      const side = `${targetDbPath}${suffix}`;
      if (fs.existsSync(side)) {
        try { fs.unlinkSync(side); } catch {}
      }
    }
  }

  if (fs.existsSync(templateDb)) {
    fs.copyFileSync(templateDb, targetDbPath);
    log(`[DB AUTO-CLEAN] Copied fresh, clean template.db to: ${targetDbPath}`);
  } else {
    fs.writeFileSync(targetDbPath, '');
  }
}

function ensureDatabase() {
  const dataDir = getDataDir();
  const dbPath = getDbFilePath();
  const markerFile = path.join(dataDir, '.db_initialized_clean');
  const templateDb = path.join(getBackendRoot(), 'prisma', 'template.db');

  let needsClean = false;
  let cleanReason = '';

  // 1. Force clean via command line flags (--clean or --reset-db)
  if (process.argv.includes('--clean') || process.argv.includes('--reset-db')) {
    needsClean = true;
    cleanReason = 'Command-line flag (--clean or --reset-db) specified';
  }
  // 2. If an existing database file is present without the clean initialization marker
  else if (fs.existsSync(dbPath) && (!fs.existsSync(markerFile) || fs.readFileSync(markerFile, 'utf8').trim() !== DB_CLEAN_VERSION_MARKER)) {
    needsClean = true;
    cleanReason = 'Found existing database from older/uncleaned version without clean marker';
  }

  // Also check and clean alternative appData locations if present
  try {
    const roaming = app.getPath('appData');
    const altFolders = ['Uttam Laboratory', 'uttam-laboratory'];
    for (const folder of altFolders) {
      const altDataDir = path.join(roaming, folder, 'data');
      const altDb = path.join(altDataDir, 'uttam.db');
      const altMarker = path.join(altDataDir, '.db_initialized_clean');
      if (altDb !== dbPath && fs.existsSync(altDb) && (!fs.existsSync(altMarker) || fs.readFileSync(altMarker, 'utf8').trim() !== DB_CLEAN_VERSION_MARKER)) {
        cleanAndResetDatabase(altDb, templateDb, `Found existing legacy db in ${folder}`);
        try { fs.writeFileSync(altMarker, DB_CLEAN_VERSION_MARKER, 'utf8'); } catch {}
      }
    }
  } catch (e) {
    log(`[DB AUTO-CLEAN] Alternative folder scan warning: ${e.message}`);
  }

  if (needsClean) {
    cleanAndResetDatabase(dbPath, templateDb, cleanReason);
    try {
      fs.writeFileSync(markerFile, DB_CLEAN_VERSION_MARKER, 'utf8');
    } catch {}
    return dbPath;
  }

  // Initial setup if db does not exist
  if (!fs.existsSync(dbPath)) {
    if (fs.existsSync(templateDb)) {
      fs.copyFileSync(templateDb, dbPath);
    } else {
      fs.writeFileSync(dbPath, '');
    }
    try {
      fs.writeFileSync(markerFile, DB_CLEAN_VERSION_MARKER, 'utf8');
    } catch {}
    log(`[DB INIT] Initialized clean database from template`);
    return dbPath;
  }

  return dbPath;
}

function log(...args) {
  try {
    const logFile = path.join(getDataDir(), 'app.log');
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${args.join(' ')}\n`);
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

  const credPath = ensureCredentials();
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    PORT: String(DESKTOP_PORT),
    HOST,
    DATABASE_URL: toPrismaFileUrl(dbPath),
    CREDENTIALS_PATH: credPath,
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
