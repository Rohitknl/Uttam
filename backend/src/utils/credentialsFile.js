/**
 * credentialsFile.js
 *
 * Stores a single admin credential set in a JSON file on disk.
 * This replaces the DB `users` table for authentication purposes.
 *
 * File location: <cwd>/credentials.json
 * (Same working directory the backend process starts from)
 *
 * Schema:
 * {
 *   "username": "admin",
 *   "passwordHash": "$2a$10$...",
 *   "fullName": "Administrator",
 *   "role": "ROLE_ADMIN",
 *   "mustChangePassword": true
 * }
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { hashPassword } from './bcrypt.js';

// Resolve credentials.json to the backend root directory (two levels up from src/utils/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_PATH = path.resolve(__dirname, '..', '..', 'credentials.json');

const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = 'admin123';
const DEFAULT_FULL_NAME = 'Administrator';

/**
 * Read credentials from disk. Returns null if file doesn't exist or is corrupt.
 * @returns {{ username, passwordHash, fullName, role, mustChangePassword } | null}
 */
export function readCredentials() {
  if (!existsSync(CREDENTIALS_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Persist credentials to disk (atomic write).
 * @param {{ username, passwordHash, fullName, role, mustChangePassword }} data
 */
export function writeCredentials(data) {
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Called at server startup. Creates credentials.json with default values if it
 * doesn't already exist. The default forces a password change on first login.
 */
export async function initCredentials() {
  if (existsSync(CREDENTIALS_PATH)) {
    const creds = readCredentials();
    if (creds?.username) {
      console.log(`[Auth] credentials.json loaded (user: ${creds.username})`);
      return;
    }
  }

  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
  const creds = {
    username: DEFAULT_USERNAME,
    passwordHash,
    fullName: DEFAULT_FULL_NAME,
    role: 'ROLE_ADMIN',
    mustChangePassword: true,
  };
  writeCredentials(creds);
  console.log(
    `[Auth] credentials.json created. Default login: ${DEFAULT_USERNAME} / ${DEFAULT_PASSWORD}`,
    `\n[Auth] ⚠ The user will be prompted to change the password on first login.`,
  );
}
