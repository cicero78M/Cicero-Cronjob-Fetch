import { scheduleCronJob } from '../utils/cronScheduler.js';
import { sendDebug } from '../middleware/debugHandler.js';
import { absensiUpdateDataUsername } from '../handler/fetchabsensi/wa/absensiUpdateDataUsername.js';
import { findAllActiveOrgClientsWithSosmed } from '../model/clientModel.js';
import { sendWithClientFallback } from '../utils/waHelper.js';
import waClient, { waGatewayClient, waUserClient } from '../service/waService.js';
import { normalizeGroupId } from './cronDirRequestFetchSosmed.js';

export const JOB_KEY = './src/cron/cronOprRequestAbsensiUpdateDataUsername.js';
const CRON_EXPRESSION = '45 6 * * *';
const CRON_OPTIONS = { timezone: 'Asia/Jakarta' };
const CRON_TAG = 'CRON OPRREQUEST ABSENSI UPDATE USERNAME';
const ROLE_FLAG = 'operator';

const waFallbackClients = [
  { client: waGatewayClient, label: 'WA-GATEWAY' },
  { client: waClient, label: 'WA' },
  { client: waUserClient, label: 'WA-USER' },
];

function getGroupRecipient(client) {
  return normalizeGroupId(client?.client_group);
}

async function sendAbsensiReport(client) {
  const groupId = getGroupRecipient(client);
  if (!groupId) {
    sendDebug({
      tag: CRON_TAG,
      msg: `[${client.client_id}] Lewati absensi update data username: group WA belum terdaftar`,
    });
    return;
  }

  const message = await absensiUpdateDataUsername(client.client_id, ROLE_FLAG);
  await sendWithClientFallback({
    chatId: groupId,
    message: message || 'Data tidak ditemukan.',
    clients: waFallbackClients,
    reportClient: waClient,
    reportContext: {
      jobKey: JOB_KEY,
      clientId: client.client_id,
      chatId: groupId,
      menu: 'oprrequest-absensi-update-data-username',
    },
  });

  sendDebug({
    tag: CRON_TAG,
    msg: `[${client.client_id}] Absensi update data username dikirim ke ${groupId}`,
  });
}

export async function runCron() {
  sendDebug({
    tag: CRON_TAG,
    msg: 'Mulai cron absensi update data username (oprrequest)',
  });

  try {
    const clients = await findAllActiveOrgClientsWithSosmed();
    if (!clients.length) {
      sendDebug({ tag: CRON_TAG, msg: 'Tidak ada client org aktif untuk diproses.' });
      return;
    }

    for (const client of clients) {
      try {
        await sendAbsensiReport(client);
      } catch (err) {
        sendDebug({
          tag: CRON_TAG,
          msg: `[${client.client_id}] Gagal kirim absensi update data username: ${err.message || err}`,
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
