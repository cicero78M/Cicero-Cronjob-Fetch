import { env } from '../../config/env.js';
import { scheduleCronJob } from '../../utils/cronScheduler.js';
import { runCron as runNotificationReminder, JOB_KEY as NOTIFICATION_REMINDER_JOB_KEY } from '../cronWaNotificationReminder.js';
import { runCron as runSatbinmasOfficialMedia, JOB_KEY as SATBINMAS_OFFICIAL_MEDIA_JOB_KEY } from '../cronDirRequestSatbinmasOfficialMedia.js';
import {
  runCron as runDitbinmasGroupRecap,
  JOB_KEY as DITBINMAS_GROUP_RECAP_JOB_KEY,
} from '../cronDirRequestDitbinmasGroupRecap.js';
import {
  runCron as runBidhumasEvening,
  JOB_KEY as BIDHUMAS_EVENING_JOB_KEY,
} from '../cronDirRequestBidhumasEvening.js';
import {
  runCron as runDitbinmasSuperAdminDaily,
  JOB_KEY as DITBINMAS_SUPER_ADMIN_DAILY_JOB_KEY,
} from '../cronDirRequestDitbinmasSuperAdminDaily.js';
import {
  runCron as runDitbinmasOperatorDaily,
  JOB_KEY as DITBINMAS_OPERATOR_DAILY_JOB_KEY,
} from '../cronDirRequestDitbinmasOperatorDaily.js';
import {
  runCron as runDitbinmasAbsensiToday,
  JOB_KEY as DITBINMAS_ABSENSI_TODAY_JOB_KEY,
} from '../cronDirRequestDitbinmasAbsensiToday.js';
// Default cron options
const DEFAULT_CRON_OPTIONS = { timezone: 'Asia/Jakarta' };
const inFlightJobs = new Map();
// Utility to create a single-flight handler for cron jobs
const createSingleFlightHandler = (jobKey, cronExpression, handler) => {
  return async () => {
    if (inFlightJobs.get(jobKey)) {
      console.warn(
        `[CRON] Skipping ${jobKey} at ${cronExpression}: previous run still in-flight`,
      );
      return;
    }

    inFlightJobs.set(jobKey, true);
    try {
      return await handler();
    } finally {
      inFlightJobs.delete(jobKey);
    }
  };
};

const dirRequestCrons = [
  // Notification reminder at 16:10, 16:40, 17:10, and 17:40
  {
    jobKey: NOTIFICATION_REMINDER_JOB_KEY,
    description:
      'Send WhatsApp task reminders to Ditbinmas users who opted in, with nightly follow-ups for incomplete tasks.',
    schedules: [
      { cronExpression: '5 17 * * *', handler: () => runNotificationReminder(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '35 17 * * *', handler: () => runNotificationReminder(), options: DEFAULT_CRON_OPTIONS },
    ],
  },
  // Bidhumas evening report at 15:15, 20:15, and 22:15
  {
    jobKey: BIDHUMAS_EVENING_JOB_KEY,
    description:
      'Send Bidhumas 22.00 evening recap..',
    schedules: [
      { cronExpression: '45 15 * * *', handler: () => runBidhumasEvening(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '15 20 * * *', handler: () => runBidhumasEvening(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '15 22 * * *', handler: () => runBidhumasEvening(), options: DEFAULT_CRON_OPTIONS },
    ],
  },
  // Satbinmas official media at 23:05
  {
    jobKey: SATBINMAS_OFFICIAL_MEDIA_JOB_KEY,
    description: 'Share Satbinmas official media updates with Ditbinmas recipients.',
    schedules: [
      { cronExpression: '5 23 * * *', handler: () => runSatbinmasOfficialMedia(), options: DEFAULT_CRON_OPTIONS },
    ],
  },
  // Ditbinmas group recap at 15:10 and 18:14
  {
    jobKey: DITBINMAS_GROUP_RECAP_JOB_KEY,
    description: 'Send Ditbinmas group recap for menu 21/22 (today).',
    schedules: [
      { cronExpression: '15 15 * * *', handler: () => runDitbinmasGroupRecap(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '19 18 * * *', handler: () => runDitbinmasGroupRecap(), options: DEFAULT_CRON_OPTIONS },
    ],
  },
  // Ditbinmas super admin daily recap at 18:10
  {
    jobKey: DITBINMAS_SUPER_ADMIN_DAILY_JOB_KEY,
    description:
      'Send Ditbinmas super admin daily recap (menus 6/9/34/35) with today period only.',
    schedules: [
      { cronExpression: '16 18 * * *', handler: () => runDitbinmasSuperAdminDaily(), options: DEFAULT_CRON_OPTIONS },
    ],
  },
  // Ditbinmas operator daily recap at 18:12
  {
    jobKey: DITBINMAS_OPERATOR_DAILY_JOB_KEY,
    description:
      'Send Ditbinmas operator daily report (menu 30) with today period only.',
    schedules: [
      { cronExpression: '17 18 * * *', handler: () => runDitbinmasOperatorDaily(), options: DEFAULT_CRON_OPTIONS },
    ],
  },
  // Ditbinmas absensi today at 18:14
  {
    jobKey: DITBINMAS_ABSENSI_TODAY_JOB_KEY,
    description:
      'Send Ditbinmas absensi recap (menu 5 & 10, today) to the dedicated recipient only.',
    schedules: [
      { cronExpression: '18 18 * * *', handler: () => runDitbinmasAbsensiToday(), options: DEFAULT_CRON_OPTIONS },
    ],
  },
];
// Function to register all dirRequest related cron jobs
export function registerDirRequestCrons(waGatewayClient) {
  void waGatewayClient;
  if (!waGatewayClient) {
    throw new Error('waGatewayClient is required to register dirRequest crons');
  }

  if (process.env.JEST_WORKER_ID !== undefined) {
    console.log('[CRON] Skipping dirRequest cron registration during tests');
    return [];
  }

  if (!env.ENABLE_DIRREQUEST_GROUP) {
    console.log('[CRON] dirRequest cron group disabled via ENABLE_DIRREQUEST_GROUP flag');
    return [];
  }

  const scheduledJobs = [];

  dirRequestCrons.forEach(({ jobKey, description, schedules }) => {
    schedules.forEach(({ cronExpression, handler, options }) => {
      const singleFlightHandler = createSingleFlightHandler(
        jobKey,
        cronExpression,
        handler,
      );
      console.log(`[CRON] Registering ${jobKey} (${description}) at ${cronExpression}`);
      scheduledJobs.push(scheduleCronJob(jobKey, cronExpression, singleFlightHandler, options));
    });
  });

  return scheduledJobs;
}
