import { scheduleCronJob } from '../utils/cronScheduler.js';
import { processExpiredSubscriptions } from '../service/dashboardSubscriptionExpiryService.js';

export const JOB_KEY = './src/cron/cronDashboardSubscriptionExpiry.js';
const CRON_EXPRESSION = '*/48 * * * *';
const CRON_OPTIONS = { timezone: 'Asia/Jakarta' };

export async function runCron() {
  const { checked, expired } = await processExpiredSubscriptions();
  console.log(
    `[CRON] Dashboard subscription expiry check completed. Checked: ${checked}, expired: ${expired}`,
  );
}

scheduleCronJob(JOB_KEY, CRON_EXPRESSION, runCron, CRON_OPTIONS);

export default null;
