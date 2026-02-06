import { sendDebug } from '../middleware/debugHandler.js';
import { runDitbinmasSuperAdminDailyRecap } from './cronDirRequestCustomSequence.js';

export const JOB_KEY = './src/cron/cronDirRequestDitbinmasSuperAdminDaily.js';
const CRON_TAG = 'CRON DIRREQ DITBINMAS 18:10';

export async function runCron(referenceDate = new Date()) {
  sendDebug({
    tag: CRON_TAG,
    msg: 'Mulai cron Ditbinmas super admin harian (menu 6/9/34/35 hari ini)',
  });
  return runDitbinmasSuperAdminDailyRecap(referenceDate);
}

export default null;
