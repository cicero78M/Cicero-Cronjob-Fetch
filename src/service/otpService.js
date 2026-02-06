import crypto from 'crypto';
import redis from '../config/redis.js';
import { normalizeUserId, normalizeEmail } from '../utils/utilsHelper.js';

const OTP_TTL_SEC = 5 * 60;
const VERIFY_TTL_SEC = 10 * 60;
const MAX_ATTEMPTS = 3;

function hashOtp(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

export async function generateOtp(nrp, email) {
  const key = normalizeUserId(nrp);
  const em = normalizeEmail(email);
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const value = JSON.stringify({ hash: hashOtp(otp), email: em, attempts: 0 });
  await redis.set(`otp:${key}`, value, { EX: OTP_TTL_SEC });
  return otp;
}

export async function verifyOtp(nrp, email, code) {
  const key = normalizeUserId(nrp);
  const em = normalizeEmail(email);
  const data = await redis.get(`otp:${key}`);
  if (!data) return false;
  const { hash, email: storedEmail, attempts = 0 } = JSON.parse(data);
  if (storedEmail !== em) return false;
  if (attempts >= MAX_ATTEMPTS) {
    await redis.del(`otp:${key}`);
    return false;
  }
  if (hash !== hashOtp(code)) {
    const ttl = await redis.ttl(`otp:${key}`);
    const updated = JSON.stringify({ hash, email: storedEmail, attempts: attempts + 1 });
    await redis.set(`otp:${key}`, updated, { EX: ttl });
    return false;
  }
  await redis.del(`otp:${key}`);
  await redis.set(`verified:${key}`, em, { EX: VERIFY_TTL_SEC });
  return true;
}

export async function refreshVerification(nrp, email) {
  const key = normalizeUserId(nrp);
  let normalizedEmail;
  if (email !== undefined && email !== null && String(email).trim() !== '') {
    normalizedEmail = normalizeEmail(email);
  } else {
    normalizedEmail = await redis.get(`verified:${key}`);
    if (!normalizedEmail) return;
  }
  await redis.set(`verified:${key}`, normalizedEmail, { EX: VERIFY_TTL_SEC });
}

export async function isVerified(nrp, email) {
  const key = normalizeUserId(nrp);
  const em = normalizeEmail(email);
  const storedEmail = await redis.get(`verified:${key}`);
  if (!storedEmail) return false;
  if (storedEmail !== em) return false;
  return true;
}

export async function clearVerification(nrp) {
  const key = normalizeUserId(nrp);
  await redis.del(`verified:${key}`);
}
