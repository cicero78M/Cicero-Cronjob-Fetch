import { scheduleCronJob } from '../utils/cronScheduler.js';
import { processExpiredPremiumUsers } from '../service/premiumExpiryService.js';

export const JOB_KEY = './src/cron/cronPremiumExpiry.js';
const CRON_EXPRESSION = '0 0 * * *';
const CRON_OPTIONS = { timezone: 'Asia/Jakarta' };

export async function runCron() {
  const { checked, expired } = await processExpiredPremiumUsers();
  console.log(`[CRON] Premium access expiry check completed. Checked: ${checked}, expired: ${expired}`);
}

scheduleCronJob(JOB_KEY, CRON_EXPRESSION, runCron, CRON_OPTIONS);

export default null;
