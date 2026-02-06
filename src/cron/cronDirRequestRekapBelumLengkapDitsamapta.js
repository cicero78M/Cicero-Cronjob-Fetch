import dotenv from 'dotenv';
dotenv.config();

import waClient from '../service/waService.js';
import { formatRekapBelumLengkapDirektorat } from '../service/dirRequestService.js';
import { scheduleCronJob } from '../utils/cronScheduler.js';
import { safeSendMessage } from '../utils/waHelper.js';
import { sendDebug } from '../middleware/debugHandler.js';
import { buildClientRecipientSet } from '../utils/recipientHelper.js';

const TARGET_CLIENT_ID = 'DITSAMAPTA';
export const JOB_KEY = './src/cron/cronDirRequestRekapBelumLengkapDitsamapta.js';
const CRON_EXPRESSION = '15 6 * * *';
const CRON_OPTIONS = { timezone: 'Asia/Jakarta' };
export async function runCron() {
  sendDebug({
    tag: 'CRON DIRREQ DITSAMAPTA',
    msg: 'Mulai rekap belum lengkap DITSAMAPTA',
  });

  try {
    const report = await formatRekapBelumLengkapDirektorat(TARGET_CLIENT_ID);

    if (!report) {
      sendDebug({
        tag: 'CRON DIRREQ DITSAMAPTA',
        msg: 'Lewati pengiriman: seluruh personel telah melengkapi data.',
      });
      return;
    }

    const { recipients } = await buildClientRecipientSet(TARGET_CLIENT_ID, {
      includeGroup: false,
      includeAdmins: true,
      includeSuper: true,
      includeOperator: true,
    });

    if (!recipients.size) {
      sendDebug({
        tag: 'CRON DIRREQ DITSAMAPTA',
        msg: 'Tidak ada penerima superadmin/operator yang valid untuk DITSAMAPTA',
      });
      return;
    }

    for (const wa of recipients) {
      await safeSendMessage(waClient, wa, report);
    }

    sendDebug({
      tag: 'CRON DIRREQ DITSAMAPTA',
      msg: `Laporan dikirim ke ${recipients.size} penerima`,
    });
  } catch (error) {
    sendDebug({
      tag: 'CRON DIRREQ DITSAMAPTA',
      msg: `[ERROR] ${error.message || error}`,
    });
  }
}

if (process.env.JEST_WORKER_ID === undefined) {
  scheduleCronJob(JOB_KEY, CRON_EXPRESSION, () => runCron(), CRON_OPTIONS);
}

export default null;
