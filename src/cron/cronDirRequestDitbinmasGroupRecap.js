import { sendDebug } from '../middleware/debugHandler.js';
import { runDirRequestAction } from '../service/dirRequestService.js';
import { findClientById } from '../service/clientService.js';
import {
  getAdminWAIds,
  minPhoneDigitLength,
  normalizeUserWhatsAppId,
  sendWithClientFallback,
} from '../utils/waHelper.js';
import waClient, { waGatewayClient, waUserClient } from '../service/waService.js';
import { normalizeGroupId } from './cronDirRequestFetchSosmed.js';
import { delayAfterSend } from './dirRequestThrottle.js';

const DITBINMAS_CLIENT_ID = 'DITBINMAS';
export const JOB_KEY = './src/cron/cronDirRequestDitbinmasGroupRecap.js';
const CRON_LABEL = 'CRON DIRREQ DITBINMAS GROUP';
const ACTIONS = [
  { action: '21' },
  { action: '22', context: { period: 'today' } },
];
const waFallbackClients = [
  { client: waGatewayClient, label: 'WA-GATEWAY' },
  { client: waClient, label: 'WA' },
  { client: waUserClient, label: 'WA-USER' },
];

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

function getGroupRecipient(client) {
  return normalizeGroupId(client?.client_group);
}

function buildRecipients(client) {
  const recipients = new Set();
  const groupId = getGroupRecipient(client);
  if (groupId) {
    recipients.add(groupId);
  }
  return Array.from(recipients);
}

async function logToAdmins(message) {
  if (!message || adminRecipients.size === 0) return;
  const prefix = `[${CRON_LABEL}] `;
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

async function executeDitbinmasMenus(recipients) {
  const failures = [];

  for (let recipientIndex = 0; recipientIndex < recipients.length; recipientIndex += 1) {
    const chatId = recipients[recipientIndex];

    for (let actionIndex = 0; actionIndex < ACTIONS.length; actionIndex += 1) {
      const { action, context } = ACTIONS[actionIndex];
      try {
        await logPhase(`Mulai menu ${action} untuk DITBINMAS -> ${chatId}`);
        await runDirRequestAction({
          action,
          clientId: DITBINMAS_CLIENT_ID,
          chatId,
          roleFlag: DITBINMAS_CLIENT_ID,
          userClientId: DITBINMAS_CLIENT_ID,
          waClient: waGatewayClient,
          context,
          fallbackClients: waFallbackClients,
          fallbackContext: {
            action,
            clientId: DITBINMAS_CLIENT_ID,
            chatId,
            jobKey: JOB_KEY,
            context,
          },
        });
        await logPhase(`Menu ${action} selesai untuk ${chatId}`);
      } catch (err) {
        const errorMsg = `Gagal menu ${action} untuk ${chatId}: ${err.message || err}`;
        failures.push(errorMsg);
        await logPhase(errorMsg);
      }

      const isLastRecipient = recipientIndex === recipients.length - 1;
      const isLastAction = actionIndex === ACTIONS.length - 1;
      if (!isLastRecipient || !isLastAction) {
        await delayAfterSend();
      }
    }
  }

  return failures;
}

export async function runCron() {
  await logPhase('Mulai cron Ditbinmas group (menu 21 dan 22).');

  let sendStatus = 'pending';

  try {
    await logPhase('Ambil data DITBINMAS dan daftar penerima WA grup.');
    const client = await findClientById(DITBINMAS_CLIENT_ID);
    const recipients = buildRecipients(client);

    if (recipients.length === 0) {
      sendStatus = 'tidak ada penerima grup valid untuk DITBINMAS';
      await logToAdmins(sendStatus);
    } else {
      await logPhase(`Daftar penerima grup DITBINMAS: ${recipients.join(', ')}`);
      const failures = await executeDitbinmasMenus(recipients);
      sendStatus =
        failures.length === 0
          ? `menu 21 dan 22 dikirim ke ${recipients.length} grup`
          : `menu 21 dan 22 selesai dengan ${failures.length} kegagalan`;

      if (failures.length > 0) {
        await logToAdmins(`${sendStatus}\n${failures.join('\n')}`);
      }
    }
  } catch (err) {
    sendStatus = `gagal memproses Ditbinmas group: ${err.message || err}`;
    await logToAdmins(sendStatus);
  }

  await logToAdmins(`Ringkasan: ${sendStatus}`);
  sendDebug({ tag: CRON_LABEL, msg: { sendStatus } });
}

export default null;
