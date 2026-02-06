import { scheduleCronJob } from '../utils/cronScheduler.js';
import { sendDebug } from '../middleware/debugHandler.js';
import { absensiLikes } from '../handler/fetchabsensi/insta/absensiLikesInsta.js';
import { absensiKomentar } from '../handler/fetchabsensi/tiktok/absensiKomentarTiktok.js';
import { normalizeGroupId } from './cronDirRequestFetchSosmed.js';
import {
  minPhoneDigitLength,
  normalizeUserWhatsAppId,
  sendWithClientFallback,
} from '../utils/waHelper.js';
import waClient, { waGatewayClient, waUserClient } from '../service/waService.js';

export const JOB_KEY = './src/cron/cronOprRequestAbsensiEngagement.js';
const CRON_EXPRESSION = '20 15,18,20 * * *';
const CRON_OPTIONS = { timezone: 'Asia/Jakarta' };
const CRON_TAG = 'CRON OPRREQUEST ABSENSI ENGAGEMENT';
const ROLE_FLAG = 'operator';
const ABSENSI_MODE = 'all';

const waFallbackClients = [
  { client: waGatewayClient, label: 'WA-GATEWAY' },
  { client: waClient, label: 'WA' },
  { client: waUserClient, label: 'WA-USER' },
];

async function getActiveClients() {
  const { query } = await import('../db/index.js');
  const rows = await query(
    `SELECT client_id, nama, client_operator, client_super, client_group
     FROM clients
     WHERE client_status=true
       AND LOWER(client_type)='org'
       AND client_insta_status=true
       AND client_tiktok_status=true
     ORDER BY client_id`
  );
  return rows.rows;
}

function logInvalidRecipient(value) {
  console.warn('[SKIP WA] invalid recipient', value);
}

function normalizeUserRecipient(value) {
  const normalized = normalizeUserWhatsAppId(value, minPhoneDigitLength);
  if (!normalized) {
    logInvalidRecipient(value);
    return null;
  }
  return normalized;
}

function getRecipients(client) {
  const result = new Set();
  const groupId = normalizeGroupId(client?.client_group);
  if (groupId) {
    result.add(groupId);
  }

  [client?.client_operator, client?.client_super]
    .map(normalizeUserRecipient)
    .filter(Boolean)
    .forEach((recipient) => result.add(recipient));

  return Array.from(result);
}

async function sendReport({ client, recipients, label, message }) {
  if (!recipients.length) {
    sendDebug({
      tag: CRON_TAG,
      msg: `[${client.client_id}] Lewati absensi ${label}: penerima WA belum terdaftar`,
    });
    return;
  }

  const content = message || 'Data tidak ditemukan.';
  for (const chatId of recipients) {
    await sendWithClientFallback({
      chatId,
      message: content,
      clients: waFallbackClients,
      reportClient: waClient,
      reportContext: {
        jobKey: JOB_KEY,
        clientId: client.client_id,
        chatId,
        menu: `oprrequest-absensi-engagement-${label}`,
      },
    });
  }

  sendDebug({
    tag: CRON_TAG,
    msg: `[${client.client_id}] Absensi ${label} dikirim ke ${recipients.length} penerima`,
  });
}

export async function runCron() {
  sendDebug({
    tag: CRON_TAG,
    msg: 'Mulai cron absensi engagement Instagram & TikTok (oprrequest)',
  });

  try {
    const clients = await getActiveClients();
    if (!clients.length) {
      sendDebug({ tag: CRON_TAG, msg: 'Tidak ada client org aktif untuk diproses.' });
      return;
    }

    for (const client of clients) {
      const recipients = getRecipients(client);
      try {
        const instagramReport = await absensiLikes(client.client_id, {
          mode: ABSENSI_MODE,
          roleFlag: ROLE_FLAG,
        });
        await sendReport({
          client,
          recipients,
          label: 'engagement-instagram',
          message: instagramReport,
        });

        const tiktokReport = await absensiKomentar(client.client_id, {
          mode: ABSENSI_MODE,
          roleFlag: ROLE_FLAG,
        });
        await sendReport({
          client,
          recipients,
          label: 'engagement-tiktok',
          message: tiktokReport,
        });
      } catch (err) {
        sendDebug({
          tag: CRON_TAG,
          msg: `[${client.client_id}] Gagal kirim absensi engagement: ${err.message || err}`,
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
