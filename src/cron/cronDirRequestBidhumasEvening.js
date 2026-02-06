import { sendDebug } from '../middleware/debugHandler.js';
import { runDirRequestAction } from '../service/dirRequestService.js';
import { findClientById } from '../service/clientService.js';
import { splitRecipientField } from '../repository/clientContactRepository.js';
import {
  sendWithClientFallback,
  getAdminWAIds,
  normalizeUserWhatsAppId,
  minPhoneDigitLength,
} from '../utils/waHelper.js';
import waClient, { waGatewayClient, waUserClient } from '../service/waService.js';
import { normalizeGroupId } from './cronDirRequestFetchSosmed.js';
import { delayAfterSend } from './dirRequestThrottle.js';

const BIDHUMAS_CLIENT_ID = 'BIDHUMAS';
export const JOB_KEY = './src/cron/cronDirRequestBidhumasEvening.js';

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

const adminRecipients = new Set(
  getAdminWAIds().map((wid) => normalizeUserRecipient(wid)).filter(Boolean)
);
const CRON_LABEL = 'CRON DIRREQ BIDHUMAS 22:00';
const waFallbackClients = [
  { client: waGatewayClient, label: 'WA-GATEWAY' },
  { client: waClient, label: 'WA' },
  { client: waUserClient, label: 'WA-USER' },
];

function toWAid(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.endsWith('@g.us')) return trimmed;
  return normalizeUserRecipient(trimmed);
}

function getGroupRecipient(client) {
  return normalizeGroupId(client?.client_group);
}

function getSuperAdminRecipients(client) {
  return splitRecipientField(client?.client_super).map(toWAid).filter(Boolean);
}

function buildRecipients(client) {
  const recipients = new Set();
  const groupId = getGroupRecipient(client);
  if (groupId) {
    recipients.add(groupId);
  }
  getSuperAdminRecipients(client).forEach((wa) => recipients.add(wa));
  return Array.from(recipients);
}

async function logToAdmins(message) {
  if (!message || adminRecipients.size === 0) return;
  const prefix = '[CRON DIRREQ BIDHUMAS 22:00] ';
  for (const admin of adminRecipients) {
    await sendWithClientFallback({
      chatId: admin,
      message: `${prefix}${message}`,
      clients: waFallbackClients,
      reportClient: waClient,
      reportContext: { jobKey: JOB_KEY, admin },
    });
  }
}

async function logPhase(message) {
  await logToAdmins(message);
  sendDebug({ tag: CRON_LABEL, msg: message });
}

async function executeBidhumasMenus(recipients) {
  const actions = ['6', '9', '28', '29'];
  const failures = [];

  for (let recipientIndex = 0; recipientIndex < recipients.length; recipientIndex += 1) {
    const chatId = recipients[recipientIndex];

    for (let actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
      const action = actions[actionIndex];
      try {
        await logPhase(`Mulai jalankan menu ${action} untuk BIDHUMAS -> ${chatId}`);
        await runDirRequestAction({
          action,
          clientId: BIDHUMAS_CLIENT_ID,
          chatId,
          roleFlag: BIDHUMAS_CLIENT_ID,
          userClientId: BIDHUMAS_CLIENT_ID,
          waClient: waGatewayClient,
          fallbackClients: waFallbackClients,
          fallbackContext: {
            action,
            clientId: BIDHUMAS_CLIENT_ID,
            chatId,
            jobKey: JOB_KEY,
          },
        });
        await logPhase(`Menu ${action} selesai untuk ${chatId}`);
      } catch (err) {
        const errorMsg = `Gagal menu ${action} untuk ${chatId}: ${err.message || err}`;
        failures.push(errorMsg);
        await logPhase(errorMsg);
      }

      const isLastRecipient = recipientIndex === recipients.length - 1;
      const isLastAction = actionIndex === actions.length - 1;
      if (!isLastRecipient || !isLastAction) {
        await delayAfterSend();
      }
    }
  }

  return failures;
}

export async function runCron() {
  await logPhase('Mulai cron BIDHUMAS malam: tanpa fetch sosmed');

  let sendStatus = 'pending';

  try {
    await logPhase('Ambil data BIDHUMAS dan daftar penerima WA');
    const client = await findClientById(BIDHUMAS_CLIENT_ID);
    const recipients = buildRecipients(client);

    if (recipients.length === 0) {
      sendStatus = 'tidak ada penerima valid untuk BIDHUMAS';
      await logToAdmins(sendStatus);
    } else {
      await logPhase(`Daftar penerima valid BIDHUMAS: ${recipients.join(', ')}`);
      const failures = await executeBidhumasMenus(recipients);
      sendStatus =
        failures.length === 0
          ? `menu 6, 9, 28, dan 29 dikirim ke ${recipients.length} penerima`
          : `menu 6, 9, 28, dan 29 selesai dengan ${failures.length} kegagalan`;

      if (failures.length > 0) {
        await logToAdmins(`${sendStatus}\n${failures.join('\n')}`);
      }
    }
  } catch (err) {
    sendStatus = `gagal memproses BIDHUMAS: ${err.message || err}`;
    await logToAdmins(sendStatus);
  }

  await logToAdmins(`Ringkasan: ${sendStatus}`);
  sendDebug({ tag: CRON_LABEL, msg: { sendStatus } });
}

export default null;
