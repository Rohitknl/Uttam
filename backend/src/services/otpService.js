import prisma from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { comparePassword, hashPassword } from '../utils/bcrypt.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function otpKey(purpose, username) {
  return `otp:${purpose}:${String(username).trim().toLowerCase()}`;
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function createAndStoreOtp(purpose, username, phone) {
  const code = generateCode();
  const hash = await hashPassword(code);
  const payload = {
    hash,
    phone: String(phone),
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  };
  await prisma.appSetting.upsert({
    where: { key: otpKey(purpose, username) },
    create: { key: otpKey(purpose, username), value: JSON.stringify(payload) },
    update: { value: JSON.stringify(payload) },
  });
  return code;
}

export async function verifyAndConsumeOtp(purpose, username, otp) {
  const key = otpKey(purpose, username);
  const row = await prisma.appSetting.findUnique({ where: { key } });
  if (!row?.value) throw new AppError('OTP expired or not requested. Please send a new OTP.', 400);

  let data;
  try {
    data = JSON.parse(row.value);
  } catch {
    await prisma.appSetting.delete({ where: { key } }).catch(() => {});
    throw new AppError('OTP expired or invalid. Please send a new OTP.', 400);
  }

  if (!data?.expiresAt || Date.now() > data.expiresAt) {
    await prisma.appSetting.delete({ where: { key } }).catch(() => {});
    throw new AppError('OTP expired. Please send a new OTP.', 400);
  }

  if ((data.attempts || 0) >= MAX_ATTEMPTS) {
    await prisma.appSetting.delete({ where: { key } }).catch(() => {});
    throw new AppError('Too many invalid OTP attempts. Please send a new OTP.', 400);
  }

  const ok = await comparePassword(String(otp || ''), data.hash);
  if (!ok) {
    data.attempts = (data.attempts || 0) + 1;
    await prisma.appSetting.update({
      where: { key },
      data: { value: JSON.stringify(data) },
    });
    throw new AppError('Invalid OTP', 403);
  }

  await prisma.appSetting.delete({ where: { key } }).catch(() => {});
  return true;
}
