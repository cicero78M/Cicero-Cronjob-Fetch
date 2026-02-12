import { scheduleCronJob } from '../utils/cronScheduler.js';
import { processWaOutboxBatch } from '../service/waOutboxWorkerService.js';

const JOB_KEY = './src/cron/cronWaOutboxWorker.js';
const SCHEDULE = '*/1 * * * *';
const CRON_OPTIONS = { timezone: 'Asia/Jakarta' };

export async function runWaOutboxWorker(options = {}) {
  const { batchSize = 20 } = options;
  const result = await processWaOutboxBatch(batchSize);

  if (result.claimedCount > 0) {
    console.log(
      `[WA_OUTBOX_WORKER] processed claimed=${result.claimedCount} sent=${result.sentCount} retried=${result.retriedCount} dead_letter=${result.deadLetterCount}`
    );
  }

  return result;
}

scheduleCronJob(JOB_KEY, SCHEDULE, runWaOutboxWorker, CRON_OPTIONS);

export { JOB_KEY };
