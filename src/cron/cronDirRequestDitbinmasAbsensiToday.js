import { sendDebug } from '../middleware/debugHandler.js';
import { runDirRequestAction } from '../service/dirRequestService.js';
import {
  minPhoneDigitLength,
  normalizeUserWhatsAppId,
} from '../utils/waHelper.js';
import waClient, { waGatewayClient, waUserClient } from '../service/waService.js';
import { delayAfterSend } from './dirRequestThrottle.js';

const DITBINMAS_CLIENT_ID = 'DITBINMAS';
const TARGET_RECIPIENT = '081331780006';
export const JOB_KEY = './src/cron/cronDirRequestDitbinmasAbsensiToday.js';
const CRON_LABEL = 'CRON DIRREQ DITBINMAS 18:27';
const ACTIONS = ['5', '10'];
const waFallbackClients = [
  { client: waGatewayClient, label: 'WA-GATEWAY' },
  { client: waClient, label: 'WA' },
  { client: waUserClient, label: 'WA-USER' },
];

function normalizeRecipient(value) {
  if (!value) return null;
  return normalizeUserWhatsAppId(value, minPhoneDigitLength);
}

async function executeDitbinmasMenus(chatId) {
  const failures = [];

  for (let actionIndex = 0; actionIndex < ACTIONS.length; actionIndex += 1) {
    const action = ACTIONS[actionIndex];
    try {
      sendDebug({ tag: CRON_LABEL, msg: `Mulai menu ${action} untuk ${chatId}` });
      await runDirRequestAction({
        action,
        clientId: DITBINMAS_CLIENT_ID,
        chatId,
        roleFlag: DITBINMAS_CLIENT_ID,
        userClientId: DITBINMAS_CLIENT_ID,
        waClient: waGatewayClient,
        fallbackClients: waFallbackClients,
        fallbackContext: {
          action,
          clientId: DITBINMAS_CLIENT_ID,
          chatId,
          jobKey: JOB_KEY,
        },
      });
      sendDebug({ tag: CRON_LABEL, msg: `Menu ${action} selesai untuk ${chatId}` });
    } catch (err) {
      const errorMsg = `Gagal menu ${action} untuk ${chatId}: ${err.message || err}`;
      failures.push(errorMsg);
      sendDebug({ tag: CRON_LABEL, msg: errorMsg });
    }

    if (actionIndex < ACTIONS.length - 1) {
      await delayAfterSend();
    }
  }

  return failures;
}

export async function runCron() {
  sendDebug({
    tag: CRON_LABEL,
    msg: 'Mulai cron Ditbinmas menu 5 & 10 (data hari ini) untuk nomor khusus.',
  });

  const recipient = normalizeRecipient(TARGET_RECIPIENT);
  if (!recipient) {
    sendDebug({
      tag: CRON_LABEL,
      msg: `Nomor penerima tidak valid: ${TARGET_RECIPIENT}`,
    });
    return;
  }

  const failures = await executeDitbinmasMenus(recipient);
  const summary =
    failures.length === 0
      ? `Menu 5 & 10 dikirim ke ${recipient}`
      : `Menu 5 & 10 selesai dengan ${failures.length} kegagalan`;

  sendDebug({ tag: CRON_LABEL, msg: { summary, failures } });
}

export default null;
