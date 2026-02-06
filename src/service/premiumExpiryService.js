import { query } from '../repository/db.js';
import { updatePremiumStatus } from '../model/userModel.js';

export async function fetchExpiredPremiumUsers(referenceDate = new Date()) {
  const { rows } = await query(
    `SELECT user_id, premium_end_date
     FROM "user"
     WHERE premium_status = true
       AND premium_end_date IS NOT NULL
       AND premium_end_date <= $1`,
    [referenceDate],
  );
  return rows || [];
}

export async function processExpiredPremiumUsers(referenceDate = new Date()) {
  const expiringUsers = await fetchExpiredPremiumUsers(referenceDate);
  let expiredCount = 0;

  for (const user of expiringUsers) {
    try {
      await updatePremiumStatus(user.user_id, false, null);
      expiredCount += 1;
    } catch (err) {
      console.error(`[CRON] Failed to expire premium for user ${user.user_id}: ${err?.message || err}`);
    }
  }

  return {
    checked: expiringUsers.length,
    expired: expiredCount,
  };
}
