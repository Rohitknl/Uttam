/**
 * settingsService.js
 *
 * Manages the Edit/Delete Herb password (CRUD password).
 * The hash is stored in credentials.json under `crudPasswordHash`,
 * alongside the login password hash — no database table required.
 */

import { AppError } from '../middleware/errorHandler.js';
import { comparePassword, hashPassword } from '../utils/bcrypt.js';
import { readCredentials, writeCredentials } from '../utils/credentialsFile.js';

// ─── CRUD password helpers ────────────────────────────────────────────────

export async function isCrudPasswordSet() {
  const creds = readCredentials();
  return Boolean(creds?.crudPasswordHash);
}

export async function verifyCrudPassword(plain) {
  const creds = readCredentials();
  if (!creds?.crudPasswordHash) return false;
  return comparePassword(String(plain || ''), creds.crudPasswordHash);
}

// ─── Set / reset CRUD password ────────────────────────────────────────────

export async function setCrudPassword(_userId, {
  currentPassword,
  loginPassword,
  newPassword,
  confirmPassword,
}) {
  if (!newPassword || String(newPassword).length < 6) {
    throw new AppError('New password must be at least 6 characters', 400);
  }
  if (String(newPassword) !== String(confirmPassword || '')) {
    throw new AppError('New password and confirm password do not match', 400);
  }

  const creds = readCredentials();
  if (!creds) throw new AppError('Credentials file not found', 500);

  const alreadySet = Boolean(creds.crudPasswordHash);

  if (alreadySet) {
    const confirmValue = currentPassword || loginPassword || '';
    if (!confirmValue) {
      throw new AppError(
        'Enter your current Edit/Delete Herb Password, or your login password to reset',
        400,
      );
    }

    // Accept either the current CRUD password OR the admin login password
    const crudOk = await comparePassword(confirmValue, creds.crudPasswordHash);
    const loginOk = crudOk ? false : await comparePassword(confirmValue, creds.passwordHash);

    if (!crudOk && !loginOk) {
      throw new AppError(
        'Password is incorrect. Use the current Edit/Delete Herb Password, or your login password.',
        403,
      );
    }
  }

  const crudPasswordHash = await hashPassword(String(newPassword));
  writeCredentials({ ...creds, crudPasswordHash });

  return {
    crudPasswordSet: true,
    message: alreadySet
      ? 'Edit/Delete Herb Password reset successfully'
      : 'Edit/Delete Herb Password set successfully',
  };
}

// ─── Security status ──────────────────────────────────────────────────────

export async function getSecurityStatus() {
  return { crudPasswordSet: await isCrudPasswordSet() };
}
