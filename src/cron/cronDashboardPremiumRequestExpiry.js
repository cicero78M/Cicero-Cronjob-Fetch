import { scheduleCronJob } from '../utils/cronScheduler.js';
import { expireDashboardPremiumRequests } from '../service/dashboardPremiumRequestService.js';
import { formatToWhatsAppId, sendWithClientFallback, sendWAReport } from '../utils/waHelper.js';
import waClient, { waGatewayClient, waUserClient } from '../service/waService.js';

export const JOB_KEY = './src/cron/cronDashboardPremiumRequestExpiry.js';
const CRON_EXPRESSION = '20 * * * *';
const CRON_OPTIONS = { timezone: 'Asia/Jakarta' };
const waFallbackClients = [
  { client: waGatewayClient, label: 'WA-GATEWAY' },
  { client: waClient, label: 'WA' },
  { client: waUserClient, label: 'WA-USER' },
];

function buildRequesterMessage(request) {
  return [
    '⏰ Permintaan premium dashboard Anda kedaluwarsa.',
    `ID: ${request.request_id}`,
    `Tier: ${request.premium_tier || '-'}`,
    'Silakan ajukan ulang jika masih memerlukan akses premium.',
  ].join('\n');
}

async function notifyRequesters(requests = []) {
  for (const request of requests) {
    if (!request.whatsapp) continue;
    try {
      const wid = formatToWhatsAppId(request.whatsapp);
      await sendWithClientFallback({
        chatId: wid,
        message: buildRequesterMessage(request),
        clients: waFallbackClients,
        reportClient: waClient,
        reportContext: { jobKey: JOB_KEY, requestId: request.request_id },
      });
    } catch (err) {
      console.warn(
        `[CRON] Failed to notify requester ${request.dashboard_user_id} for request ${request.request_id}: ${err?.message || err}`,
      );
    }
  }
}

async function notifyAdmins(requests = []) {
  if (!requests.length) return;
  const header = `⏰ ${requests.length} dashboard premium request kedaluwarsa`;
  const details = requests
    .map(
      request =>
        `- ${request.username || request.dashboard_user_id} (${request.request_token})\n  ${request.client_id || '-'} | ${request.premium_tier || '-'} | ${request.whatsapp || '-'}`,
    )
    .join('\n');
  const message = `${header}\n${details}`;
  await sendWAReport(waClient, message);
}

export async function runCron() {
  const expired = await expireDashboardPremiumRequests();
  if (!expired.length) {
    console.log('[CRON] No dashboard premium requests expired in this window.');
    return;
  }
  await notifyRequesters(expired);
  await notifyAdmins(expired);
  console.log(
    `[CRON] Expired ${expired.length} dashboard premium request(s): ${expired
      .map(r => r.request_id)
      .join(', ')}`,
  );
}

scheduleCronJob(JOB_KEY, CRON_EXPRESSION, runCron, CRON_OPTIONS);

export default null;
