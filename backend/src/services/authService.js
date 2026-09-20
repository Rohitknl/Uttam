/**
 * authService.js — simplified, single-admin, file-based authentication.
 *
 * Credentials (username + bcrypt password hash) are stored in credentials.json
 * on disk, not in the database. There is no multi-user management.
 *
 * Supported operations:
 *   login(username, password)       — verify credentials, return JWT
 *   getMe(userId)                   — return current admin profile
 *   changeOwnPassword(userId, body) — verify current password, update hash
 *   updateOwnProfile(userId, body)  — update fullName in credentials file
 */

import { comparePassword, hashPassword } from '../utils/bcrypt.js';
import { signToken } from '../utils/jwt.js';
import { readCredentials, writeCredentials } from '../utils/credentialsFile.js';
import { AppError } from '../middleware/errorHandler.js';

// Fixed userId used in JWT payload (single-user system, id is always 1)
const ADMIN_USER_ID = 1;

/**
 * Verify username + password and return a signed JWT with user profile.
 */
export async function login(username, password) {
  const creds = readCredentials();
  if (!creds) {
    throw new AppError('Server credentials not initialised. Please restart the server.', 500);
  }

  // Case-insensitive username comparison
  if (!username || username.trim().toLowerCase() !== creds.username.toLowerCase()) {
    throw new AppError('Invalid username or password', 401);
  }

  const valid = await comparePassword(password, creds.passwordHash);
  if (!valid) {
    throw new AppError('Invalid username or password', 401);
  }

  const token = signToken({
    userId: ADMIN_USER_ID,
    username: creds.username,
    role: creds.role,
  });

  return {
    token,
    userId: ADMIN_USER_ID,
    username: creds.username,
    role: creds.role,
    fullName: creds.fullName,
    mustChangePassword: Boolean(creds.mustChangePassword),
  };
}

/**
 * Return the current user profile from the credentials file.
 * `userId` is ignored (single-user) but kept for API compatibility.
 */
export async function getMe(_userId) {
  const creds = readCredentials();
  if (!creds) throw new AppError('Credentials file not found', 500);
  return formatUser(creds);
}

/**
 * Change the admin's own login password.
 * Requires current password verification.
 */
export async function changeOwnPassword(_userId, { currentPassword, newPassword, confirmPassword }) {
  if (!newPassword || String(newPassword).length < 6) {
    throw new AppError('New password must be at least 6 characters', 400);
  }
  if (String(newPassword) !== String(confirmPassword || '')) {
    throw new AppError('New password and confirm password do not match', 400);
  }

  const creds = readCredentials();
  if (!creds) throw new AppError('Credentials file not found', 500);

  if (!currentPassword) throw new AppError('Current password is required', 400);
  const valid = await comparePassword(String(currentPassword), creds.passwordHash);
  if (!valid) throw new AppError('Current password is incorrect', 403);

  const passwordHash = await hashPassword(String(newPassword));
  writeCredentials({ ...creds, passwordHash, mustChangePassword: false });

  return formatUser({ ...creds, mustChangePassword: false });
}

/**
 * Update display name in the credentials file.
 */
export async function updateOwnProfile(_userId, { fullName }) {
  const creds = readCredentials();
  if (!creds) throw new AppError('Credentials file not found', 500);

  const data = { ...creds };
  if (fullName !== undefined && String(fullName).trim()) {
    data.fullName = String(fullName).trim();
  }

  writeCredentials(data);
  return formatUser(data);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatUser(creds) {
  return {
    id: ADMIN_USER_ID,
    userId: ADMIN_USER_ID,
    username: creds.username,
    fullName: creds.fullName,
    role: creds.role,
    active: true,
    mustChangePassword: Boolean(creds.mustChangePassword),
  };
}
