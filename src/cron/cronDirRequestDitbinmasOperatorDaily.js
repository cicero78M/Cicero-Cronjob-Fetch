import { runDitbinmasOperatorDailyReport } from './cronDirRequestCustomSequence.js';

export const JOB_KEY = './src/cron/cronDirRequestDitbinmasOperatorDaily.js';

export async function runCron(referenceDate = new Date()) {
  return runDitbinmasOperatorDailyReport(referenceDate);
}
