import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

import prisma from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/*
 * ============================================================
 * DATABASE PATH
 * ============================================================
 */

function getDbPath() {
  const url = process.env.DATABASE_URL || '';

  if (url.startsWith('file:')) {
    let filePath = url.slice('file:'.length);

    if (filePath.startsWith('///')) {
      filePath = filePath.slice(3);
    } else if (filePath.startsWith('//')) {
      filePath = filePath.slice(2);
    }

    if (
      path.isAbsolute(filePath) ||
      /^[A-Za-z]:[\\/]/.test(filePath)
    ) {
      return path.normalize(filePath);
    }

    return path.resolve(
      __dirname,
      '../../prisma',
      filePath.replace(/^\.\/?/, '')
    );
  }

  return path.resolve(
    __dirname,
    '../../prisma/dev.db'
  );
}

/*
 * ============================================================
 * GENERAL HELPERS
 * ============================================================
 */

function ensureDir(dir) {
  fs.mkdirSync(dir, {
    recursive: true,
  });
}

function safeReadDir(dir) {
  try {
    return fs.readdirSync(dir, {
      withFileTypes: true,
    });
  } catch {
    return [];
  }
}

function normalizeWindowsPath(value) {
  if (!value || typeof value !== 'string') {
    return '';
  }

  return path.normalize(value);
}

function isWindowsDrivePath(value) {
  return /^[A-Za-z]:[\\/]/.test(value);
}

function driveExists(letter) {
  try {
    return fs.existsSync(`${letter}:\\`);
  } catch {
    return false;
  }
}

/*
 * ============================================================
 * DRIVE DISCOVERY
 * ============================================================
 *
 * Automatically detects Windows drives A: through Z:.
 *
 * This includes:
 *   - C:
 *   - D:
 *   - E:
 *   - USB/Pen drives
 *   - External HDD/SSD
 *   - Mounted network drives
 *   - Other Windows volumes
 *
 * A device without a Windows drive letter cannot be detected
 * through this method.
 * ============================================================
 */

export function getAvailableDrives() {
  // On non-Windows platforms, return common directory destinations instead.
  if (process.platform !== 'win32') {
    return getNonWindowsDestinations();
  }

  const drives = [];

  for (
    let code = 'A'.charCodeAt(0);
    code <= 'Z'.charCodeAt(0);
    code++
  ) {
    const letter = String.fromCharCode(code);

    if (!driveExists(letter)) {
      continue;
    }

    const rootPath = `${letter}:\\`;

    let label = `${letter}:`;

    try {
      const volumeName = getWindowsVolumeLabel(letter);

      if (volumeName) {
        label = `${letter}: - ${volumeName}`;
      }
    } catch {
      // Keep default label.
    }

    drives.push({
      id: `drive_${letter.toLowerCase()}`,
      type: 'drive',
      letter,
      name: `${letter}:`,
      label,
      path: rootPath,
    });
  }

  return drives;
}

/**
 * Non-Windows backup destinations (macOS / Linux).
 * Returns Desktop, Documents, and home directory as choices.
 */
function getNonWindowsDestinations() {
  const home = os.homedir();
  const candidates = [
    { id: 'dir_desktop',   name: 'Desktop',   path: path.join(home, 'Desktop') },
    { id: 'dir_documents', name: 'Documents', path: path.join(home, 'Documents') },
    { id: 'dir_home',      name: 'Home',      path: home },
  ];

  return candidates
    .filter(d => {
      try { return fs.statSync(d.path).isDirectory(); } catch { return false; }
    })
    .map(d => ({
      ...d,
      type: 'folder',
      label: `${d.name} (${d.path})`,
    }));
}

/*
 * Try to read Windows volume label.
 *
 * This intentionally uses a lightweight command only when
 * available. If it fails, drive discovery still works.
 */
function getWindowsVolumeLabel(letter) {
  if (process.platform !== 'win32') {
    return '';
  }

  try {
    const { execFileSync } = require('child_process');

    const output = execFileSync(
      'cmd.exe',
      [
        '/c',
        `for /f "tokens=*" %a in ('vol ${letter}:') do @echo %a`,
      ],
      {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 2000,
      }
    );

    const text = String(output || '').trim();

    const match = text.match(
      /Volume in drive .* is (.*)/i
    );

    if (match && match[1]) {
      const volume = match[1].trim();

      if (
        volume &&
        !/^has no label/i.test(volume)
      ) {
        return volume;
      }
    }
  } catch {
    // Ignore volume label errors.
  }

  return '';
}

/*
 * ============================================================
 * BACKUP DESTINATIONS
 * ============================================================
 *
 * Backward-compatible destination list.
 *
 * The old implementation returned:
 *   C:\UttamLaboratory\Backups
 *   Documents\UttamLaboratory\Backups
 *   Desktop\UttamLaboratory\Backups
 *   D:\UttamLaboratory\Backups
 *
 * Now the application dynamically discovers all drives.
 *
 * Each drive can subsequently be browsed using listFolders().
 * ============================================================
 */

export function getBackupDestinations() {
  return getAvailableDrives();
}

/*
 * ============================================================
 * PATH VALIDATION
 * ============================================================
 *
 * The desktop application needs filesystem access, but selected
 * paths should still be validated.
 *
 * A selected folder must:
 *   - exist
 *   - be a directory
 *   - be located on an available Windows drive
 *
 * This prevents malformed paths from being passed to SQLite.
 * ============================================================
 */

function getAvailableDriveRootForPath(targetPath) {
  const normalized = normalizeWindowsPath(
    targetPath
  );

  if (!isWindowsDrivePath(normalized)) {
    return null;
  }

  const letter = normalized
    .substring(0, 1)
    .toUpperCase();

  if (!driveExists(letter)) {
    return null;
  }

  return `${letter}:\\`;
}

function validateFolderPath(folderPath) {
  if (
    !folderPath ||
    typeof folderPath !== 'string'
  ) {
    throw new AppError(
      'Backup folder path is required',
      400
    );
  }

  const normalized = path.normalize(folderPath);

  // On Windows, additionally verify the drive is available.
  if (process.platform === 'win32') {
    const driveRoot = getAvailableDriveRootForPath(normalized);
    if (!driveRoot) {
      throw new AppError(
        'Invalid or unavailable drive',
        400
      );
    }
  }

  if (!fs.existsSync(normalized)) {
    // Auto-create the directory so backup works on first use.
    try {
      fs.mkdirSync(normalized, { recursive: true });
    } catch {
      throw new AppError(
        'Selected folder does not exist and could not be created',
        404
      );
    }
  }

  let stat;

  try {
    stat = fs.statSync(normalized);
  } catch {
    throw new AppError(
      'Unable to access selected folder',
      400
    );
  }

  if (!stat.isDirectory()) {
    throw new AppError(
      'Selected path is not a folder',
      400
    );
  }

  return normalized;
}

function validateBackupFilePath(
  folderPath,
  fileName
) {
  if (
    !fileName ||
    typeof fileName !== 'string'
  ) {
    throw new AppError(
      'Backup file name is required',
      400
    );
  }

  /*
   * Prevent:
   *   ../
   *   ..\
   *   absolute paths
   *   nested paths
   */
  if (
    fileName.includes('..') ||
    fileName.includes('/') ||
    fileName.includes('\\') ||
    path.isAbsolute(fileName) ||
    /^[A-Za-z]:/.test(fileName)
  ) {
    throw new AppError(
      'Invalid backup file name',
      400
    );
  }

  if (
    !fileName
      .toLowerCase()
      .endsWith('.db')
  ) {
    throw new AppError(
      'Backup must be a .db file',
      400
    );
  }

  const safeFolder =
    validateFolderPath(folderPath);

  const fullPath = path.join(
    safeFolder,
    fileName
  );

  const relative = path.relative(
    safeFolder,
    fullPath
  );

  if (
    relative.startsWith('..') ||
    path.isAbsolute(relative)
  ) {
    throw new AppError(
      'Invalid backup file path',
      400
    );
  }

  return fullPath;
}

/*
 * ============================================================
 * FOLDER LISTING
 * ============================================================
 *
 * Lists only immediate child folders.
 *
 * This is intentional.
 *
 * We do NOT recursively scan the entire drive because a drive
 * can contain tens of thousands of folders.
 *
 * UI flow:
 *
 *   Select Drive
 *       ↓
 *   Select Folder
 *       ↓
 *   Select Subfolder
 *       ↓
 *   Select Backup DB
 *
 * The frontend can call listFolders() again when a folder is
 * selected.
 * ============================================================
 */

export function listFolders(parentPath) {
  const safePath =
    validateFolderPath(parentPath);

  const entries =
    safeReadDir(safePath);

  const folders = [];

  for (const entry of entries) {
    /*
     * Ignore symbolic links.
     *
     * This prevents unexpected traversal outside the
     * selected filesystem location.
     */
    if (entry.isSymbolicLink()) {
      continue;
    }

    if (!entry.isDirectory()) {
      continue;
    }

    const fullPath = path.join(
      safePath,
      entry.name
    );

    let stat;

    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }

    if (!stat.isDirectory()) {
      continue;
    }

    folders.push({
      id: Buffer.from(
        fullPath,
        'utf8'
      ).toString('base64url'),

      name: entry.name,

      label: entry.name,

      path: fullPath,

      type: 'folder',
    });
  }

  return folders.sort(
    (a, b) =>
      a.name.localeCompare(
        b.name,
        undefined,
        {
          sensitivity: 'base',
        }
      )
  );
}

/*
 * ============================================================
 * DRIVE ROOT FOLDERS
 * ============================================================
 */

export function listDriveFolders(
  driveLetter
) {
  if (
    !driveLetter ||
    typeof driveLetter !== 'string'
  ) {
    throw new AppError(
      'Drive letter is required',
      400
    );
  }

  const letter =
    driveLetter
      .replace(':', '')
      .trim()
      .toUpperCase();

  if (!/^[A-Z]$/.test(letter)) {
    throw new AppError(
      'Invalid drive letter',
      400
    );
  }

  if (!driveExists(letter)) {
    throw new AppError(
      `Drive ${letter}: is not available`,
      404
    );
  }

  return listFolders(
    `${letter}:\\`
  );
}

/*
 * ============================================================
 * PATH FROM ENCODED FOLDER ID
 * ============================================================
 *
 * The frontend can safely store the returned folder ID instead
 * of manually constructing Windows paths.
 * ============================================================
 */

export function decodeFolderId(folderId) {
  if (
    !folderId ||
    typeof folderId !== 'string'
  ) {
    throw new AppError(
      'Folder ID is required',
      400
    );
  }

  try {
    const decoded =
      Buffer.from(
        folderId,
        'base64url'
      ).toString('utf8');

    return validateFolderPath(
      decoded
    );
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }

    throw new AppError(
      'Invalid folder ID',
      400
    );
  }
}

/*
 * ============================================================
 * DESTINATION RESOLUTION
 * ============================================================
 *
 * Supports:
 *
 * 1. New dynamic folder path
 * 2. New encoded folder ID
 * 3. Existing drive destination ID
 *
 * This keeps compatibility with older frontend code.
 * ============================================================
 */

function resolveDestination(
  destinationId,
  folderPath = null
) {
  /*
   * New preferred approach: caller supplies an actual folder path.
   */
  if (folderPath) {
    const safePath = validateFolderPath(folderPath);
    return {
      id: Buffer.from(safePath, 'utf8').toString('base64url'),
      label: safePath,
      path: safePath,
      type: 'folder',
    };
  }

  /*
   * Check if destinationId matches a known non-Windows destination (dir_desktop etc.)
   * or a Windows drive destination (drive_c etc.).
   */
  const knownDests = getAvailableDrives(); // works cross-platform now
  const known = knownDests.find(d => d.id === destinationId);
  if (known) {
    return {
      ...known,
      path: validateFolderPath(known.path),
    };
  }

  /*
   * If destinationId looks like a base64url-encoded path, decode it.
   */
  if (destinationId && typeof destinationId === 'string') {
    try {
      const decoded = Buffer.from(destinationId, 'base64url').toString('utf8');
      if (fs.existsSync(decoded)) {
        const safePath = validateFolderPath(decoded);
        return {
          id: destinationId,
          label: safePath,
          path: safePath,
          type: 'folder',
        };
      }
    } catch {
      // fall through
    }
  }

  throw new AppError(
    'Invalid backup location',
    400
  );
}

/*
 * ============================================================
 * DATABASE FILE LISTING
 * ============================================================
 */

function listDbFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  let statDir;

  try {
    statDir = fs.statSync(dir);
  } catch {
    return [];
  }

  if (!statDir.isDirectory()) {
    return [];
  }

  return safeReadDir(dir)
    .filter(
      (entry) =>
        !entry.isSymbolicLink() &&
        entry.isFile() &&
        entry.name
          .toLowerCase()
          .endsWith('.db')
    )
    .map((entry) => {
      const full =
        path.join(
          dir,
          entry.name
        );

      let stat;

      try {
        stat = fs.statSync(full);
      } catch {
        return null;
      }

      return {
        name: entry.name,

        path: full,

        sizeBytes: stat.size,

        sizeLabel: `${(
          stat.size /
          (1024 * 1024)
        ).toFixed(2)} MB`,

        modifiedAt:
          stat.mtime.toISOString(),
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        new Date(b.modifiedAt) -
        new Date(a.modifiedAt)
    );
}

/*
 * ============================================================
 * LIST BACKUPS
 * ============================================================
 *
 * Existing API:
 *
 *   listBackups(destinationId)
 *
 * New API can also use:
 *
 *   listBackups(null, folderPath)
 *
 * ============================================================
 */

export function listBackups(
  destinationId,
  folderPath = null
) {
  const dest =
    resolveDestination(
      destinationId,
      folderPath
    );

  return {
    destination: dest,

    backups:
      listDbFiles(dest.path),
  };
}

/*
 * ============================================================
 * TIMESTAMP
 * ============================================================
 */

function timestampName() {
  const d = new Date();

  const pad = (n) =>
    String(n).padStart(2, '0');

  return `uttam-backup-${d.getFullYear()}${pad(
    d.getMonth() + 1
  )}${pad(d.getDate())}-${pad(
    d.getHours()
  )}${pad(d.getMinutes())}${pad(
    d.getSeconds()
  )}.db`;
}

/*
 * ============================================================
 * CREATE BACKUP
 * ============================================================
 *
 * The application remains running.
 * ============================================================
 */

export async function createBackup(
  destinationId,
  folderPath = null
) {
  const dest =
    resolveDestination(
      destinationId,
      folderPath
    );

  ensureDir(dest.path);

  const dbPath =
    getDbPath();

  if (!fs.existsSync(dbPath)) {
    throw new AppError(
      'Database file not found',
      404
    );
  }

  const fileName =
    timestampName();

  const targetPath =
    path.join(
      dest.path,
      fileName
    );

  try {
    /*
     * Flush WAL changes.
     */
    await prisma.$executeRawUnsafe(
      'PRAGMA wal_checkpoint(FULL);'
    );

    /*
     * Create consistent SQLite snapshot.
     */
    const escapedTargetPath =
      targetPath
        .replace(/\\/g, '/')
        .replace(/'/g, "''");

    await prisma.$executeRawUnsafe(
      `VACUUM INTO '${escapedTargetPath}';`
    );
  } catch (err) {
    /*
     * Fallback to direct copy.
     */
    try {
      fs.copyFileSync(
        dbPath,
        targetPath
      );

      for (const suffix of [
        '-wal',
        '-shm',
      ]) {
        const sideFile =
          `${dbPath}${suffix}`;

        if (
          fs.existsSync(
            sideFile
          )
        ) {
          fs.copyFileSync(
            sideFile,
            `${targetPath}${suffix}`
          );
        }
      }
    } catch (copyError) {
      throw new AppError(
        `Failed to create backup: ${copyError.message}`,
        500
      );
    }
  }

  if (
    !fs.existsSync(
      targetPath
    )
  ) {
    throw new AppError(
      'Backup file was not created',
      500
    );
  }

  const stat =
    fs.statSync(targetPath);

  return {
    message:
      'Backup created successfully',

    destination: dest,

    backup: {
      name: fileName,

      path: targetPath,

      sizeBytes: stat.size,

      sizeLabel: `${(
        stat.size /
        (1024 * 1024)
      ).toFixed(2)} MB`,

      modifiedAt:
        stat.mtime.toISOString(),
    },
  };
}

/*
 * ============================================================
 * RESTORE BACKUP
 * ============================================================
 *
 * The application remains running.
 *
 * Steps:
 *
 * 1. Validate backup
 * 2. Create safety backup
 * 3. Attach selected backup
 * 4. Validate integrity
 * 5. Compare table structure
 * 6. Clear current data
 * 7. Copy backup data
 * 8. Verify
 * 9. Detach backup
 * ============================================================
 */

export async function restoreBackup(
  destinationId,
  fileName,
  folderPath = null
) {
  /*
   * ----------------------------------------------------------
   * 1. Resolve destination
   * ----------------------------------------------------------
   */

  const dest =
    resolveDestination(
      destinationId,
      folderPath
    );

  /*
   * ----------------------------------------------------------
   * 2. Validate backup file
   * ----------------------------------------------------------
   */

  const sourcePath =
    validateBackupFilePath(
      dest.path,
      fileName
    );

  if (!fs.existsSync(sourcePath)) {
    throw new AppError(
      'Selected backup file not found',
      404
    );
  }

  let sourceStat;

  try {
    sourceStat =
      fs.statSync(sourcePath);
  } catch {
    throw new AppError(
      'Unable to access selected backup file',
      400
    );
  }

  if (!sourceStat.isFile()) {
    throw new AppError(
      'Selected backup is not a file',
      400
    );
  }

  /*
   * ----------------------------------------------------------
   * 3. Current database
   * ----------------------------------------------------------
   */

  const dbPath =
    getDbPath();

  if (!fs.existsSync(dbPath)) {
    throw new AppError(
      'Current database file not found',
      404
    );
  }

  /*
   * ----------------------------------------------------------
   * 4. Prevent restoring current database into itself
   * ----------------------------------------------------------
   */

  try {
    if (
      path.resolve(
        sourcePath
      ).toLowerCase() ===
      path.resolve(
        dbPath
      ).toLowerCase()
    ) {
      throw new AppError(
        'Cannot restore the currently active database file',
        400
      );
    }
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
  }

  /*
   * ----------------------------------------------------------
   * 5. Create safety backup
   * ----------------------------------------------------------
   */

  const safetyDir =
    path.join(
      dest.path,
      '_pre_restore'
    );

  ensureDir(
    safetyDir
  );

  const safetyName =
    `pre-restore-${timestampName()}`;

  const safetyPath =
    path.join(
      safetyDir,
      safetyName
    );

  try {
    const escapedSafetyPath =
      safetyPath
        .replace(/\\/g, '/')
        .replace(/'/g, "''");

    await prisma.$executeRawUnsafe(
      `VACUUM INTO '${escapedSafetyPath}';`
    );
  } catch (err) {
    throw new AppError(
      `Unable to create safety backup before restore: ${err.message}`,
      500
    );
  }

  /*
   * ----------------------------------------------------------
   * 6. Attach backup database
   * ----------------------------------------------------------
   */

  const escapedSourcePath =
    sourcePath
      .replace(/\\/g, '/')
      .replace(/'/g, "''");

  let attached = false;

  try {
    await prisma.$executeRawUnsafe(
      `ATTACH DATABASE '${escapedSourcePath}' AS backup_db;`
    );

    attached = true;

    /*
     * --------------------------------------------------------
     * 7. Validate backup
     * --------------------------------------------------------
     */

    const integrity =
      await prisma.$queryRawUnsafe(
        `PRAGMA backup_db.integrity_check;`
      );

    if (
      integrity &&
      integrity.length > 0
    ) {
      const result =
        Object.values(
          integrity[0]
        )[0];

      if (
        result !== 'ok'
      ) {
        throw new Error(
          `Backup integrity check failed: ${result}`
        );
      }
    }

    /*
     * --------------------------------------------------------
     * 8. Get current tables
     * --------------------------------------------------------
     */

    const currentTables =
      await prisma.$queryRawUnsafe(`
        SELECT name
        FROM main.sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name;
      `);

    /*
     * --------------------------------------------------------
     * 9. Get backup tables
     * --------------------------------------------------------
     */

    const backupTables =
      await prisma.$queryRawUnsafe(`
        SELECT name
        FROM backup_db.sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name;
      `);

    const currentTableNames =
      currentTables.map(
        (table) =>
          table.name
      );

    const backupTableNames =
      backupTables.map(
        (table) =>
          table.name
      );

    /*
     * --------------------------------------------------------
     * 10. Check table compatibility
     * --------------------------------------------------------
     */

    const missingTables =
      currentTableNames.filter(
        (name) =>
          !backupTableNames.includes(
            name
          )
      );

    if (
      missingTables.length > 0
    ) {
      throw new Error(
        `Backup is not compatible with current database. ` +
        `Missing tables: ${missingTables.join(', ')}`
      );
    }

    /*
     * --------------------------------------------------------
     * 11. Disable FK enforcement
     * --------------------------------------------------------
     */

    await prisma.$executeRawUnsafe(
      `PRAGMA foreign_keys = OFF;`
    );

    /*
     * --------------------------------------------------------
     * 12. Restore inside transaction
     * --------------------------------------------------------
     */

    try {
      await prisma.$transaction(
        async (tx) => {
          /*
           * Clear existing data.
           */
          for (
            const table of
              currentTables
          ) {
            const tableName =
              table.name;

            if (
              !/^[A-Za-z_][A-Za-z0-9_]*$/.test(
                tableName
              )
            ) {
              throw new Error(
                `Invalid table name: ${tableName}`
              );
            }

            await tx.$executeRawUnsafe(
              `DELETE FROM main."${tableName}";`
            );
          }

          /*
           * Copy data from backup.
           */
          for (
            const table of
              currentTables
          ) {
            const tableName =
              table.name;

            if (
              !/^[A-Za-z_][A-Za-z0-9_]*$/.test(
                tableName
              )
            ) {
              throw new Error(
                `Invalid table name: ${tableName}`
              );
            }

            if (
              !backupTableNames.includes(
                tableName
              )
            ) {
              throw new Error(
                `Table "${tableName}" does not exist in backup`
              );
            }

            await tx.$executeRawUnsafe(`
              INSERT INTO main."${tableName}"
              SELECT *
              FROM backup_db."${tableName}";
            `);
          }
        }
      );
    } finally {
      /*
       * Restore FK checking.
       */
      await prisma.$executeRawUnsafe(
        `PRAGMA foreign_keys = ON;`
      );
    }

    /*
     * --------------------------------------------------------
     * 13. Verify database
     * --------------------------------------------------------
     */

    await prisma.$queryRaw`
      SELECT 1;
    `;

    /*
     * --------------------------------------------------------
     * 14. Detach backup
     * --------------------------------------------------------
     */

    await prisma.$executeRawUnsafe(
      `DETACH DATABASE backup_db;`
    );

    attached = false;
  } catch (err) {
    console.error(
      'Failed to restore backup:',
      err
    );

    /*
     * Restore FK checking.
     */
    try {
      await prisma.$executeRawUnsafe(
        `PRAGMA foreign_keys = ON;`
      );
    } catch {
      // Ignore cleanup error.
    }

    /*
     * Detach backup if still attached.
     */
    if (attached) {
      try {
        await prisma.$executeRawUnsafe(
          `DETACH DATABASE backup_db;`
        );
      } catch {
        // Ignore cleanup error.
      }
    }

    throw new AppError(
      `Failed to restore backup: ${err.message}`,
      500
    );
  }

  /*
   * ----------------------------------------------------------
   * 15. Success
   * ----------------------------------------------------------
   */

  return {
    message:
      'Data restored successfully while the application remained running',

    restoredFrom:
      sourcePath,

    safetyBackup:
      safetyPath,

    destination:
      dest,
  };
}

/*
 * ============================================================
 * OPTIONAL HELPER
 * ============================================================
 *
 * Returns the complete folder browsing information for a drive.
 *
 * Example:
 *
 * {
 *   drive: {
 *      id: "drive_e",
 *      letter: "E",
 *      path: "E:\\"
 *   },
 *   folders: [...]
 * }
 * ============================================================
 */

export function browseDrive(
  driveLetter
) {
  const letter =
    String(
      driveLetter || ''
    )
      .replace(':', '')
      .trim()
      .toUpperCase();

  if (
    !/^[A-Z]$/.test(letter)
  ) {
    throw new AppError(
      'Invalid drive letter',
      400
    );
  }

  if (
    !driveExists(letter)
  ) {
    throw new AppError(
      `Drive ${letter}: is not available`,
      404
    );
  }

  const drive =
    getAvailableDrives().find(
      (item) =>
        item.letter === letter
    );

  return {
    drive,

    folders:
      listFolders(
        `${letter}:\\`
      ),

    backups:
      listDbFiles(
        `${letter}:\\`
      ),
  };
}