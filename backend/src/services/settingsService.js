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

// ─── Formula Category Password helpers ────────────────────────────────────

export async function verifyCategoryPassword(category, plain) {
  const creds = readCredentials();
  if (!plain) return false;

  const cat = String(category || '').toLowerCase().trim();

  // If a specific password is set for this category, check it first
  if (creds?.categoryPasswords && creds.categoryPasswords[cat]) {
    const matched = await comparePassword(String(plain), creds.categoryPasswords[cat]);
    if (matched) return true;
  }

  // Fallback 1: Check CRUD password
  if (creds?.crudPasswordHash) {
    const crudOk = await comparePassword(String(plain), creds.crudPasswordHash);
    if (crudOk) return true;
  }

  // Fallback 2: Check Admin login password
  if (creds?.passwordHash) {
    const loginOk = await comparePassword(String(plain), creds.passwordHash);
    if (loginOk) return true;
  }

  // Fallback 3: Check standard default passwords
  if (plain === 'UttamLab@27' || plain === 'admin123') {
    return true;
  }

  return false;
}

export async function setCategoryPassword(_userId, {
  category,
  currentPassword,
  newPassword,
  confirmPassword,
}) {
  const cat = String(category || '').toLowerCase().trim();
  const validCategories = ['view', 'edit', 'delete', 'print'];
  if (!validCategories.includes(cat)) {
    throw new AppError('Invalid category. Must be one of view, edit, delete, print', 400);
  }

  if (!newPassword || String(newPassword).length < 4) {
    throw new AppError('New password must be at least 4 characters', 400);
  }
  if (String(newPassword) !== String(confirmPassword || '')) {
    throw new AppError('New password and confirm password do not match', 400);
  }

  const creds = readCredentials();
  if (!creds) throw new AppError('Credentials file not found', 500);

  // Authorize using existing category password OR CRUD password OR login password
  const confirmValue = String(currentPassword || '');
  if (!confirmValue) {
    throw new AppError('Enter your current category password or admin password to change password', 400);
  }

  let authorized = false;
  const existingCatHash = creds.categoryPasswords?.[cat];
  if (existingCatHash && (await comparePassword(confirmValue, existingCatHash))) {
    authorized = true;
  } else if (creds.crudPasswordHash && (await comparePassword(confirmValue, creds.crudPasswordHash))) {
    authorized = true;
  } else if (creds.passwordHash && (await comparePassword(confirmValue, creds.passwordHash))) {
    authorized = true;
  } else if (confirmValue === 'UttamLab@27' || confirmValue === 'admin123') {
    authorized = true;
  }

  if (!authorized) {
    throw new AppError('Incorrect current category password or admin password', 403);
  }

  const categoryPasswordHash = await hashPassword(String(newPassword));
  const categoryPasswords = { ...(creds.categoryPasswords || {}), [cat]: categoryPasswordHash };
  writeCredentials({ ...creds, categoryPasswords });

  return {
    success: true,
    category: cat,
    message: `Password for ${cat.toUpperCase()} category updated successfully`,
  };
}

export async function getCategoryPasswordStatus() {
  const creds = readCredentials();
  const catPasswords = creds?.categoryPasswords || {};
  return {
    view: Boolean(catPasswords.view),
    edit: Boolean(catPasswords.edit),
    delete: Boolean(catPasswords.delete),
    print: Boolean(catPasswords.print),
  };
}
