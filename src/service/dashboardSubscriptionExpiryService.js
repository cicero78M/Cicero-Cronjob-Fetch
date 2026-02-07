import { query } from '../repository/db.js';
import { expireSubscription } from './dashboardSubscriptionService.js';
import { formatToWhatsAppId, safeSendMessage } from '../utils/waHelper.js';
import { waGatewayClient } from './waService.js';
import { sendTelegramLog, sendTelegramError } from './telegramService.js';

const DEFAULT_TIMEZONE = 'Asia/Jakarta';

export function selectExpiredSubscriptions(subscriptions = [], now = new Date()) {
  const nowTs = new Date(now).getTime();
  return subscriptions.filter((subscription) => {
    if (!subscription || subscription.status !== 'active') return false;
    if (!subscription.expires_at) return false;
    const expiresAt = new Date(subscription.expires_at).getTime();
    return Number.isFinite(expiresAt) && expiresAt < nowTs;
  });
}

function formatExpiryDate(expiresAt) {
  if (!expiresAt) return '-';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: DEFAULT_TIMEZONE,
      dateStyle: 'long',
      timeStyle: 'short',
    }).format(new Date(expiresAt));
  } catch (err) {
    return new Date(expiresAt).toISOString();
  }
}

function buildExpiryMessage(subscription) {
  const tierLabel = subscription.tier ? ` *${subscription.tier}*` : '';
  const dateLabel = formatExpiryDate(subscription.expires_at);
  return [
    '🔔 Langganan dashboard Anda sudah berakhir.',
    `Paket${tierLabel} berakhir pada ${dateLabel}.`,
    'Silakan hubungi admin untuk memperpanjang akses.',
  ].join('\n');
}

function normalizeWhatsapp(rawValue) {
  if (!rawValue) return null;
  const digits = String(rawValue).replace(/\D/g, '');
  if (!digits) return null;
  try {
    return formatToWhatsAppId(digits);
  } catch (err) {
    return null;
  }
}

async function notifyExpiry(subscription) {
  const chatId = normalizeWhatsapp(subscription.whatsapp);
  if (!chatId) return false;

  const message = buildExpiryMessage(subscription);
  
  try {
    const sent = await safeSendMessage(waGatewayClient, chatId, message);
    if (sent) {
      await sendTelegramLog('INFO', `Subscription expiry notification sent to ${chatId}`);
    } else {
      await sendTelegramLog('WARN', `Failed to send subscription expiry notification to ${chatId}`);
    }
    return sent;
  } catch (error) {
    await sendTelegramError('dashboardSubscriptionExpiry', error);
    return false;
  }
}

export async function fetchActiveSubscriptions() {
  const { rows } = await query(
    `SELECT s.subscription_id,
            s.dashboard_user_id,
            s.tier,
            s.status,
            s.expires_at,
            s.canceled_at,
            u.username,
            u.whatsapp
     FROM dashboard_user_subscriptions s
     JOIN dashboard_user u ON u.dashboard_user_id = s.dashboard_user_id
     WHERE s.status = 'active'`,
  );
  return rows || [];
}

export async function processExpiredSubscriptions(now = new Date()) {
  const activeSubscriptions = await fetchActiveSubscriptions();
  const expiredSubscriptions = selectExpiredSubscriptions(activeSubscriptions, now);

  let successCount = 0;
  for (const subscription of expiredSubscriptions) {
    try {
      const result = await expireSubscription(subscription.subscription_id, subscription.expires_at);
      if (!result) continue;
      await notifyExpiry(subscription);
      successCount += 1;
    } catch (err) {
      console.error(
        `[CRON] Failed to expire dashboard subscription ${subscription.subscription_id}`,
        err,
      );
    }
  }

  return {
    checked: activeSubscriptions.length,
    expired: successCount,
  };
}
