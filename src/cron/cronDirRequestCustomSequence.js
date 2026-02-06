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
import { delayAfterSend } from './dirRequestThrottle.js';
import {
  normalizeGroupId,
  runCron as runDirRequestFetchSosmed,
} from './cronDirRequestFetchSosmed.js';

const DITBINMAS_CLIENT_ID = 'DITBINMAS';
const BIDHUMAS_CLIENT_ID = 'BIDHUMAS';
export const JOB_KEY = './src/cron/cronDirRequestCustomSequence.js';
export const BIDHUMAS_2030_JOB_KEY = `${JOB_KEY}#bidhumas-20-30`;
export const DITBINMAS_RECAP_AND_CUSTOM_JOB_KEY = `${JOB_KEY}#ditbinmas-recap-and-custom`;
const waFallbackClients = [
  { client: waGatewayClient, label: 'WA-GATEWAY' },
  { client: waClient, label: 'WA' },
  { client: waUserClient, label: 'WA-USER' },
];

function buildOrderedFallbackClients(primaryLabel) {
  if (!primaryLabel) return waFallbackClients;
  const primary = waFallbackClients.find((entry) => entry.label === primaryLabel);
  if (!primary) return waFallbackClients;
  return [primary, ...waFallbackClients.filter((entry) => entry.label !== primaryLabel)];
}

function logFallbackEvent(message) {
  sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: message });
  console.warn(message);
}

async function resolveReadyWaClient({ action, clientId, chatId }) {
  let lastError = null;

  for (const { client, label } of waFallbackClients) {
    if (typeof client?.waitForWaReady !== 'function') {
      if (lastError) {
        logFallbackEvent(
          `[WA FALLBACK] action=${action} clientId=${clientId} recipient=${chatId} label=${label} reason=waitForWaReady not available (prev=${lastError})`
        );
      }
      return { client, label };
    }

    try {
      await client.waitForWaReady();
      if (lastError) {
        logFallbackEvent(
          `[WA FALLBACK] action=${action} clientId=${clientId} recipient=${chatId} label=${label} reason=${lastError}`
        );
      }
      return { client, label };
    } catch (err) {
      lastError = err?.message || err;
      logFallbackEvent(
        `[WA FALLBACK] action=${action} clientId=${clientId} recipient=${chatId} label=${label} reason=${lastError}`
      );
    }
  }

  const failureMessage =
    `[WA FALLBACK] action=${action} clientId=${clientId} recipient=${chatId} ` +
    `semua client gagal siap (lastError=${lastError || 'unknown'})`;
  logFallbackEvent(failureMessage);
  throw new Error(failureMessage);
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

function toWAid(id) {
  if (!id || typeof id !== 'string') return null;
  const trimmed = id.trim();
  if (!trimmed) return null;
  if (trimmed.endsWith('@g.us')) return trimmed;
  return normalizeUserRecipient(trimmed);
}

function getGroupRecipient(client) {
  return normalizeGroupId(client?.client_group);
}

function getRecipientsFromField(rawValue) {
  return splitRecipientField(rawValue).map(toWAid).filter(Boolean);
}

function getSuperAdminRecipients(client) {
  return getRecipientsFromField(client?.client_super);
}

function getOperatorRecipients(client) {
  return getRecipientsFromField(client?.client_operator);
}

function buildRecipients(
  client,
  { includeGroup = false, includeSuperAdmins = false, includeOperators = false } = {}
) {
  const recipients = new Set();

  if (includeGroup) {
    const groupId = getGroupRecipient(client);
    if (groupId) {
      recipients.add(groupId);
    }
  }

  if (includeSuperAdmins) {
    getSuperAdminRecipients(client).forEach((wa) => recipients.add(wa));
  }

  if (includeOperators) {
    getOperatorRecipients(client).forEach((wa) => recipients.add(wa));
  }

  return Array.from(recipients);
}

const adminRecipients = new Set(
  getAdminWAIds().map((wid) => normalizeUserRecipient(wid)).filter(Boolean)
);

async function logToAdmins(message) {
  if (!message || adminRecipients.size === 0) return;
  const text = `[CRON DIRREQ CUSTOM] ${message}`;

  for (const admin of adminRecipients) {
    await sendWithClientFallback({
      chatId: admin,
      message: text,
      clients: waFallbackClients,
      reportClient: waClient,
      reportContext: { jobKey: JOB_KEY, admin },
    });
  }
}

function normalizeActionEntry(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') {
    return { action: entry, context: undefined };
  }
  if (typeof entry === 'object' && entry.action) {
    return { action: String(entry.action), context: entry.context };
  }
  return null;
}

async function executeMenuActions({
  clientId,
  actions,
  recipients,
  label,
  roleFlag,
  userClientId,
  delayMs,
}) {
  if (!recipients?.length) {
    const msg = `${label}: tidak ada penerima yang valid`;
    sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg });
    await logToAdmins(msg);
    return msg;
  }

  const failures = [];

  recipientsLoop: for (let recipientIndex = 0; recipientIndex < recipients.length; recipientIndex += 1) {
    const wa = recipients[recipientIndex];

    for (let actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
      const actionEntry = actions[actionIndex];
      const normalizedAction = normalizeActionEntry(actionEntry);
      if (!normalizedAction?.action) {
        const invalidMsg = `[${label}] action tidak valid untuk clientId=${clientId} recipient=${wa}`;
        failures.push(invalidMsg);
        await logToAdmins(invalidMsg);
        continue;
      }
      const contextText = normalizedAction.context
        ? ` context=${JSON.stringify(normalizedAction.context)}`
        : '';
      const actionPrefix = `[${label}] clientId=${clientId} recipient=${wa} action=${normalizedAction.action}`;
      try {
        const startMsg = `${actionPrefix} mulai${contextText ? ` (${contextText.trim()})` : ''}`;
        sendDebug({
          tag: 'CRON DIRREQ CUSTOM',
          msg: startMsg,
        });
        await logToAdmins(startMsg);
        const { client: readyClient, label: readyLabel } = await resolveReadyWaClient({
          action: normalizedAction.action,
          clientId,
          chatId: wa,
        });
        await runDirRequestAction({
          action: normalizedAction.action,
          clientId,
          chatId: wa,
          roleFlag,
          userClientId,
          waClient: readyClient,
          context: normalizedAction.context,
          fallbackClients: buildOrderedFallbackClients(readyLabel),
          fallbackContext: {
            action: normalizedAction.action,
            clientId,
            chatId: wa,
            jobKey: JOB_KEY,
          },
        });
        const successMsg = `${actionPrefix} sukses${contextText ? ` (${contextText.trim()})` : ''}`;
        await logToAdmins(successMsg);
      } catch (err) {
        const failureMsg = `${actionPrefix} gagal${contextText ? ` (${contextText.trim()})` : ''}: ${
          err.message || err
        }`;
        failures.push(failureMsg);
        sendDebug({
          tag: 'CRON DIRREQ CUSTOM',
          msg: `${failureMsg}. detail=${err.stack || err}`,
        });
        await logToAdmins(failureMsg);

        if (err?.message?.includes('GatewayResponseError: Rate limit exceeded')) {
          break recipientsLoop;
        }
      }

      const isLastRecipient = recipientIndex === recipients.length - 1;
      const isLastAction = actionIndex === actions.length - 1;
      if (!isLastRecipient || !isLastAction) {
        await delayAfterSend(delayMs);
      }
    }
  }

  const summary = failures.length
    ? `${label}: ${recipients.length} penerima, ${failures.length} kegagalan`
    : `${label}: ${recipients.length} penerima berhasil`;

  await logToAdmins(failures.length ? `${summary}\n${failures.join('\n')}` : summary);
  return summary;
}

export async function runBidhumasMenuSequence({
  includeFetch = true,
  label = 'Menu 6, 9, 28, & 29 BIDHUMAS',
} = {}) {
  let fetchStatus = includeFetch ? 'pending' : 'skipped';
  let sendStatus = 'pending';

  if (includeFetch) {
    try {
      await logToAdmins('Mulai blok runDirRequestFetchSosmed (BIDHUMAS)');
      await runDirRequestFetchSosmed();
      fetchStatus = 'sosmed fetch selesai';
      await logToAdmins('Selesai blok runDirRequestFetchSosmed (BIDHUMAS)');
    } catch (err) {
      fetchStatus = `gagal sosmed fetch: ${err.message || err}`;
      sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: fetchStatus });
      await logToAdmins(fetchStatus);
    }
  }

  try {
    await logToAdmins('Mulai sekuens BIDHUMAS (menu 6, 9, 28, & 29)');
    const bidhumasClient = await findClientById(BIDHUMAS_CLIENT_ID);
    const recipients = buildRecipients(bidhumasClient, {
      includeGroup: true,
      includeSuperAdmins: true,
    });

    sendStatus = await executeMenuActions({
      clientId: BIDHUMAS_CLIENT_ID,
      actions: ['6', '9', '28', '29'],
      recipients,
      label,
      userClientId: BIDHUMAS_CLIENT_ID,
      roleFlag: BIDHUMAS_CLIENT_ID,
    });
    await logToAdmins(`Selesai sekuens BIDHUMAS: ${sendStatus}`);
  } catch (err) {
    sendStatus = `gagal kirim BIDHUMAS: ${err.message || err}`;
    sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: sendStatus });
    await logToAdmins(sendStatus);
  }

  return { fetchStatus, sendStatus };
}

function isLastDayOfMonth(date = new Date()) {
  const checkDate = new Date(date);
  const nextDay = new Date(checkDate);
  nextDay.setDate(checkDate.getDate() + 1);
  return checkDate.getMonth() !== nextDay.getMonth();
}

function buildDitbinmasRecapPlan(referenceDate = new Date()) {
  const recapPeriods = new Set(['daily']);
  const kasatkerPeriods = new Set(['today']);

  if (referenceDate.getDay() === 0) {
    recapPeriods.add('weekly');
    kasatkerPeriods.add('this_week');
  }

  if (isLastDayOfMonth(referenceDate)) {
    recapPeriods.add('monthly');
    kasatkerPeriods.add('this_month');
  }

  const contextByPeriod = (period) => ({ period, referenceDate });

  return {
    recapPeriods: Array.from(recapPeriods),
    kasatkerPeriods: Array.from(kasatkerPeriods),
    superActions: [
      { action: '6' },
      { action: '9' },
      ...Array.from(recapPeriods).map((period) => ({
        action: '34',
        context: contextByPeriod(period),
      })),
      ...Array.from(recapPeriods).map((period) => ({
        action: '35',
        context: contextByPeriod(period),
      })),
    ],
    operatorActions: Array.from(kasatkerPeriods).map((period) => ({
      action: '30',
      context: { period },
    })),
  };
}

export async function runCron({
  includeFetch = true,
  includeDitbinmas = true,
  includeBidhumas = true,
  summaryTitle = '[CRON DIRREQ CUSTOM] Ringkasan',
} = {}) {
  sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: 'Mulai urutan cron custom dirrequest' });

  const summary = {
    fetch: includeFetch ? 'pending' : 'dilewati (tidak dijadwalkan)',
    ditbinmas: includeDitbinmas ? 'pending' : 'dilewati (tidak dijadwalkan)',
    bidhumas: includeBidhumas ? 'pending' : 'dilewati (tidak dijadwalkan)',
  };

  if (includeFetch) {
    await logToAdmins('Mulai cron custom dirrequest: blok runDirRequestFetchSosmed');
    try {
      await runDirRequestFetchSosmed();
      summary.fetch = 'sosmed fetch selesai';
      await logToAdmins('Selesai blok runDirRequestFetchSosmed');
    } catch (err) {
      summary.fetch = `gagal sosmed fetch: ${err.message || err}`;
      sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: summary.fetch });
      await logToAdmins(summary.fetch);
    }
  }

  if (includeDitbinmas) {
    try {
      await logToAdmins('Mulai blok Menu 21 DITBINMAS');
      const ditbinmasClient = await findClientById(DITBINMAS_CLIENT_ID);
      const recipients = buildRecipients(ditbinmasClient, { includeGroup: true });
      summary.ditbinmas = await executeMenuActions({
        clientId: DITBINMAS_CLIENT_ID,
        actions: ['21'],
        recipients,
        label: 'Menu 21 DITBINMAS',
        userClientId: DITBINMAS_CLIENT_ID,
      });
      await logToAdmins(`Selesai blok Menu 21 DITBINMAS: ${summary.ditbinmas}`);
    } catch (err) {
      summary.ditbinmas = `gagal rekap DITBINMAS: ${err.message || err}`;
      sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: summary.ditbinmas });
      await logToAdmins(summary.ditbinmas);
    }
  }

  if (includeBidhumas) {
    try {
      await logToAdmins('Mulai blok sekuens BIDHUMAS (menu 6, 9, 28, & 29)');
      const { sendStatus } = await runBidhumasMenuSequence({ label: 'Menu 6, 9, 28, & 29 BIDHUMAS' });
      summary.bidhumas = sendStatus;
      await logToAdmins(`Selesai blok sekuens BIDHUMAS (menu 6, 9, 28, & 29): ${sendStatus}`);
    } catch (err) {
      summary.bidhumas = `gagal kirim BIDHUMAS: ${err.message || err}`;
      sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: summary.bidhumas });
      await logToAdmins(summary.bidhumas);
    }
  }

  const logMessage =
    `${summaryTitle}:\n` +
    `- Fetch sosmed: ${summary.fetch}\n` +
    `- Menu 21 DITBINMAS: ${summary.ditbinmas}\n` +
    `- Menu 6/9/28/29 BIDHUMAS: ${summary.bidhumas}`;

  sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: summary });
  await logToAdmins(logMessage);
}

export async function runDitbinmasRecapAndCustomSequence(referenceDate = new Date()) {
  sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: 'Mulai gabungan fetch, recap Ditbinmas, dan cron custom' });
  await logToAdmins('Mulai gabungan fetch konten/engagement, recap Ditbinmas, lalu cron custom dirrequest');

  const summary = {
    fetch: 'pending',
    ditbinmasSuperAdmins: 'pending',
    ditbinmasOperators: 'pending',
    customSequence: 'pending',
  };

  try {
    await logToAdmins('Mulai blok fetch konten dan engagement (likes + komentar)');
    await runDirRequestFetchSosmed();
    summary.fetch = 'fetch konten dan engagement selesai';
    await logToAdmins('Selesai blok fetch konten dan engagement');
  } catch (err) {
    summary.fetch = `gagal fetch konten/engagement: ${err.message || err}`;
    sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: summary.fetch });
    await logToAdmins(summary.fetch);
  }

  try {
    const recapSummary = await runDitbinmasRecapSequence(referenceDate, {
      includeOperators: true,
      superAdminDelayMs: 5000,
    });
    summary.ditbinmasSuperAdmins = recapSummary?.superAdmins || 'Ditbinmas super admin selesai';
    summary.ditbinmasOperators = recapSummary?.operators || 'operator dilewati';
  } catch (err) {
    summary.ditbinmasSuperAdmins = `gagal menjalankan recap Ditbinmas super admin: ${err.message || err}`;
    summary.ditbinmasOperators = `operator dilewati karena error: ${err.message || err}`;
    sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: summary.ditbinmasSuperAdmins });
    await logToAdmins(summary.ditbinmasSuperAdmins);
  }

  try {
    await runCron({ includeFetch: false });
    summary.customSequence = 'cron custom selesai';
  } catch (err) {
    summary.customSequence = `gagal menjalankan cron custom: ${err.message || err}`;
    sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: summary.customSequence });
    await logToAdmins(summary.customSequence);
  }

  const logMessage =
    '[CRON DIRREQ CUSTOM] Ringkasan gabungan fetch + recap Ditbinmas + cron custom:\n' +
    `- Fetch konten/engagement: ${summary.fetch}\n` +
    `- Recap Ditbinmas (super admin): ${summary.ditbinmasSuperAdmins}\n` +
    `- Recap Ditbinmas (operator): ${summary.ditbinmasOperators}\n` +
    `- Cron custom dirrequest: ${summary.customSequence}`;

  sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: summary });
  await logToAdmins(logMessage);

  return summary;
}

export async function runDitbinmasSuperAdminDailyRecap(referenceDate = new Date()) {
  const label = 'Ditbinmas super admin (6,9,34,35 harian)';
  sendDebug({
    tag: 'CRON DIRREQ CUSTOM',
    msg: 'Mulai cron Ditbinmas super admin harian (menu 6/9/34/35 hari ini)',
  });
  await logToAdmins('Mulai cron Ditbinmas super admin harian (menu 6/9/34/35 hari ini)');

  let status = 'pending';

  try {
    const ditbinmasClient = await findClientById(DITBINMAS_CLIENT_ID);
    const recipients = getSuperAdminRecipients(ditbinmasClient);
    const actions = [
      { action: '6' },
      { action: '9' },
      { action: '34', context: { period: 'daily', referenceDate } },
      { action: '35', context: { period: 'daily', referenceDate } },
    ];

    status = await executeMenuActions({
      clientId: DITBINMAS_CLIENT_ID,
      actions,
      recipients,
      label,
      roleFlag: DITBINMAS_CLIENT_ID,
      userClientId: DITBINMAS_CLIENT_ID,
    });
    await logToAdmins(`Selesai cron Ditbinmas super admin harian: ${status}`);
  } catch (err) {
    status = `gagal menjalankan cron Ditbinmas super admin harian: ${err.message || err}`;
    sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: status });
    await logToAdmins(status);
  }

  return status;
}

export async function runDitbinmasOperatorDailyReport(referenceDate = new Date()) {
  const label = 'Ditbinmas operator (menu 30 hari ini)';
  sendDebug({
    tag: 'CRON DIRREQ CUSTOM',
    msg: 'Mulai cron Ditbinmas operator harian (menu 30 hari ini)',
  });
  await logToAdmins('Mulai cron Ditbinmas operator harian (menu 30 hari ini)');

  let status = 'pending';

  try {
    const ditbinmasClient = await findClientById(DITBINMAS_CLIENT_ID);
    const recipients = getOperatorRecipients(ditbinmasClient);
    const actions = [{ action: '30', context: { period: 'today', referenceDate } }];

    status = await executeMenuActions({
      clientId: DITBINMAS_CLIENT_ID,
      actions,
      recipients,
      label,
      roleFlag: DITBINMAS_CLIENT_ID,
      userClientId: DITBINMAS_CLIENT_ID,
    });
    await logToAdmins(`Selesai cron Ditbinmas operator harian: ${status}`);
  } catch (err) {
    status = `gagal menjalankan cron Ditbinmas operator harian: ${err.message || err}`;
    sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: status });
    await logToAdmins(status);
  }

  return status;
}


export async function runDitbinmasRecapSequence(
  referenceDate = new Date(),
  {
    includeSuperAdmins = true,
    includeOperators = true,
    superAdminDelayMs,
    operatorDelayMs,
  } = {},
) {
  sendDebug({
    tag: 'CRON DIRREQ CUSTOM',
    msg: 'Mulai cron rekap Ditbinmas (menu 6/9/30/34/35)',
  });
  await logToAdmins('Mulai cron rekap Ditbinmas (menu 6/9/30/34/35)');

  const summary = {
    superAdmins: includeSuperAdmins ? 'pending' : 'dilewati (super admin recap tidak dijadwalkan)',
    operators: includeOperators ? 'pending' : 'dilewati (operator recap tidak dijadwalkan)',
  };

  try {
    const ditbinmasClient = await findClientById(DITBINMAS_CLIENT_ID);
    const { recapPeriods, kasatkerPeriods, superActions, operatorActions } =
      buildDitbinmasRecapPlan(referenceDate);

    const superRecipients = includeSuperAdmins ? getSuperAdminRecipients(ditbinmasClient) : [];
    if (includeSuperAdmins) {
      await logToAdmins('Mulai blok Ditbinmas super admin (6/9/34/35)');
      summary.superAdmins = await executeMenuActions({
        clientId: DITBINMAS_CLIENT_ID,
        actions: superActions,
        recipients: superRecipients,
        label: `Ditbinmas super admin (6,9,34,35 ${recapPeriods.join('/')})`,
        roleFlag: DITBINMAS_CLIENT_ID,
        userClientId: DITBINMAS_CLIENT_ID,
        delayMs: superAdminDelayMs,
      });
      await logToAdmins(`Selesai blok Ditbinmas super admin: ${summary.superAdmins}`);
    }

    const operatorRecipients = includeOperators ? getOperatorRecipients(ditbinmasClient) : [];
    if (includeSuperAdmins && includeOperators && superRecipients.length > 0 && operatorRecipients.length > 0) {
      await delayAfterSend(superAdminDelayMs);
    }

    if (includeOperators) {
      await logToAdmins('Mulai blok Ditbinmas operator (30)');
      summary.operators = await executeMenuActions({
        clientId: DITBINMAS_CLIENT_ID,
        actions: operatorActions,
        recipients: operatorRecipients,
        label: `Ditbinmas operator (30 ${kasatkerPeriods.join('/')})`,
        roleFlag: DITBINMAS_CLIENT_ID,
        userClientId: DITBINMAS_CLIENT_ID,
        delayMs: operatorDelayMs,
      });
      await logToAdmins(`Selesai blok Ditbinmas operator: ${summary.operators}`);
    }
  } catch (err) {
    const errorMsg = `gagal menjalankan cron rekap Ditbinmas: ${err.message || err}`;
    summary.superAdmins = errorMsg;
    summary.operators = errorMsg;
    sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: errorMsg });
    await logToAdmins(errorMsg);
  }

  const logMessage =
    '[CRON DIRREQ CUSTOM] Ringkasan Ditbinmas 20:30:\n' +
    `- Super admin: ${summary.superAdmins}\n` +
    `- Operator: ${summary.operators}`;

  sendDebug({ tag: 'CRON DIRREQ CUSTOM', msg: summary });
  await logToAdmins(logMessage);

  return summary;
}

export default null;
