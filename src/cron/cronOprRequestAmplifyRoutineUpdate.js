import { scheduleCronJob } from '../utils/cronScheduler.js';
import { sendDebug } from '../middleware/debugHandler.js';
import { fetchAndStoreInstaContent } from '../handler/fetchpost/instaFetchPost.js';
import { findAllActiveOrgAmplifyClients } from '../model/clientModel.js';

export const JOB_KEY = './src/cron/cronOprRequestAmplifyRoutineUpdate.js';
const CRON_EXPRESSION = '55,25 8-21 * * *';
const CRON_OPTIONS = { timezone: 'Asia/Jakarta' };
const CRON_TAG = 'CRON OPRREQUEST UPDATE TUGAS RUTIN AMPLIFIKASI';

async function runUpdateForClient(client) {
  if (!client?.client_insta) {
    sendDebug({
      tag: CRON_TAG,
      msg: `[${client.client_id}] Lewati update tugas rutin: username Instagram belum terdaftar.`,
    });
    return;
  }

  await fetchAndStoreInstaContent(null, null, null, client.client_id);

  sendDebug({
    tag: CRON_TAG,
    msg: `[${client.client_id}] Update tugas rutin selesai.`,
  });
}

export async function runCron() {
  sendDebug({
    tag: CRON_TAG,
    msg: 'Mulai cron update tugas rutin amplifikasi (oprrequest).',
  });

  try {
    const clients = await findAllActiveOrgAmplifyClients();
    if (!clients.length) {
      sendDebug({ tag: CRON_TAG, msg: 'Tidak ada client org aktif dengan amplifikasi aktif.' });
      return;
    }

    for (const client of clients) {
      try {
        await runUpdateForClient(client);
      } catch (err) {
        sendDebug({
          tag: CRON_TAG,
          msg: `[${client.client_id}] Gagal update tugas rutin: ${err.message || err}`,
        });
      }
    }
  } catch (err) {
    sendDebug({
      tag: CRON_TAG,
      msg: `[ERROR GLOBAL] ${err.message || err}`,
    });
  }
}

scheduleCronJob(JOB_KEY, CRON_EXPRESSION, runCron, CRON_OPTIONS);

export default null;
