import prisma from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { comparePassword, hashPassword } from '../utils/bcrypt.js';

const CRUD_PASSWORD_KEY = 'crud_password_hash';

export async function isCrudPasswordSet() {
  const row = await prisma.appSetting.findUnique({ where: { key: CRUD_PASSWORD_KEY } });
  return Boolean(row?.value);
}

export async function verifyCrudPassword(plain) {
  const row = await prisma.appSetting.findUnique({ where: { key: CRUD_PASSWORD_KEY } });
  if (!row?.value) return false;
  return comparePassword(String(plain || ''), row.value);
}

async function verifyLoginPassword(userId, plain) {
  if (!plain) return false;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.password) return false;
  return comparePassword(String(plain), user.password);
}

export async function setCrudPassword(userId, {
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

  const alreadySet = await isCrudPasswordSet();
  if (alreadySet) {
    const confirmValue = currentPassword || loginPassword || '';
    if (!confirmValue) {
      throw new AppError('Enter your current Edit/Delete Herb Password, or your login password to reset', 400);
    }

    const crudOk = await verifyCrudPassword(confirmValue);
    const loginOk = crudOk ? false : await verifyLoginPassword(userId, confirmValue);
    if (!crudOk && !loginOk) {
      throw new AppError('Password is incorrect. Use the current Edit/Delete Herb Password, or your login password.', 403);
    }
  }

  const hashed = await hashPassword(String(newPassword));
  await prisma.appSetting.upsert({
    where: { key: CRUD_PASSWORD_KEY },
    create: { key: CRUD_PASSWORD_KEY, value: hashed },
    update: { value: hashed },
  });

  return {
    crudPasswordSet: true,
    message: alreadySet ? 'Edit/Delete Herb Password reset successfully' : 'Edit/Delete Herb Password set successfully',
  };
}

export async function getSecurityStatus() {
  return { crudPasswordSet: await isCrudPasswordSet() };
}
