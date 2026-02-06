import { findUserById as findByUserId, updatePremiumStatus } from '../model/userModel.js';

export const PREMIUM_ACCESS_DURATION_DAYS = 30;

export function calculatePremiumEndDate(baseDate = new Date(), durationDays = PREMIUM_ACCESS_DURATION_DAYS) {
  const expiry = new Date(baseDate);
  expiry.setDate(expiry.getDate() + durationDays);
  return expiry;
}

export async function getPremiumInfo(userId) {
  return findByUserId(userId);
}

export async function grantPremium(userId, endDate = null) {
  const resolvedEndDate = endDate || calculatePremiumEndDate();
  return updatePremiumStatus(userId, true, resolvedEndDate);
}

export async function revokePremium(userId) {
  return updatePremiumStatus(userId, false, null);
}
