import * as dashboardSubscriptionModel from '../model/dashboardSubscriptionModel.js';
import { query } from '../repository/db.js';

function getExecutor(dbClient = query) {
  if (typeof dbClient?.query === 'function') {
    return (...args) => dbClient.query(...args);
  }
  return dbClient;
}

async function updatePremiumCache(dashboardUserId, activeSubscription = null, dbClient = query) {
  const exec = getExecutor(dbClient);
  const active =
    activeSubscription || (await dashboardSubscriptionModel.findActiveByUser(dashboardUserId, dbClient));

  const premiumStatus = Boolean(active);
  const premiumTier = active?.tier || null;
  const premiumExpiresAt = active?.expires_at || null;

  const { rows } = await exec(
    `UPDATE dashboard_user
     SET premium_status = $2,
         premium_tier = $3,
         premium_expires_at = $4,
         updated_at = NOW()
     WHERE dashboard_user_id = $1
     RETURNING premium_status, premium_tier, premium_expires_at`,
    [dashboardUserId, premiumStatus, premiumTier, premiumExpiresAt],
  );

  return rows[0] || {
    premium_status: premiumStatus,
    premium_tier: premiumTier,
    premium_expires_at: premiumExpiresAt,
  };
}

export async function createSubscription(payload) {
  await query('BEGIN');
  try {
    const subscription = await dashboardSubscriptionModel.create(payload);
    const cache = await updatePremiumCache(subscription.dashboard_user_id, subscription);
    await query('COMMIT');
    return { subscription, cache };
  } catch (err) {
    await query('ROLLBACK');
    throw err;
  }
}

export async function createSubscriptionWithClient(payload, dbClient) {
  const execClient = dbClient || query;
  const subscription = await dashboardSubscriptionModel.create(payload, execClient);
  const cache = await updatePremiumCache(subscription.dashboard_user_id, subscription, execClient);
  return { subscription, cache };
}

export async function expireSubscription(subscriptionId, expiredAt = null) {
  await query('BEGIN');
  try {
    const subscription = await dashboardSubscriptionModel.expire(subscriptionId, expiredAt);
    if (!subscription) {
      await query('ROLLBACK');
      return null;
    }
    const cache = await updatePremiumCache(subscription.dashboard_user_id);
    await query('COMMIT');
    return { subscription, cache };
  } catch (err) {
    await query('ROLLBACK');
    throw err;
  }
}

export async function cancelSubscription(subscriptionId, canceledAt = null) {
  await query('BEGIN');
  try {
    const subscription = await dashboardSubscriptionModel.cancel(subscriptionId, canceledAt);
    if (!subscription) {
      await query('ROLLBACK');
      return null;
    }
    const cache = await updatePremiumCache(subscription.dashboard_user_id);
    await query('COMMIT');
    return { subscription, cache };
  } catch (err) {
    await query('ROLLBACK');
    throw err;
  }
}

export async function renewSubscription(subscriptionId, payload = {}) {
  await query('BEGIN');
  try {
    const subscription = await dashboardSubscriptionModel.renew(subscriptionId, payload);
    if (!subscription) {
      await query('ROLLBACK');
      return null;
    }
    const cache = await updatePremiumCache(subscription.dashboard_user_id, subscription);
    await query('COMMIT');
    return { subscription, cache };
  } catch (err) {
    await query('ROLLBACK');
    throw err;
  }
}

export async function getActiveSubscription(dashboardUserId) {
  return dashboardSubscriptionModel.findActiveByUser(dashboardUserId);
}

export async function getPremiumSnapshot(dashboardUser) {
  if (!dashboardUser) {
    return { premiumStatus: false, premiumTier: null, premiumExpiresAt: null };
  }
  const active = await dashboardSubscriptionModel.findActiveByUser(
    dashboardUser.dashboard_user_id,
  );
  if (active) {
    return {
      premiumStatus: true,
      premiumTier: active.tier,
      premiumExpiresAt: active.expires_at,
    };
  }

  return {
    premiumStatus: Boolean(dashboardUser.premium_status),
    premiumTier: dashboardUser.premium_tier || null,
    premiumExpiresAt: dashboardUser.premium_expires_at || null,
  };
}

export async function refreshPremiumCache(dashboardUserId, { dbClient } = {}) {
  return updatePremiumCache(dashboardUserId, null, dbClient || query);
}
