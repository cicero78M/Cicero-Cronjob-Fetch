import { query } from '../repository/db.js';

function getExecutor(dbClient = query) {
  if (typeof dbClient?.query === 'function') {
    return (...args) => dbClient.query(...args);
  }
  return dbClient;
}

export async function create(
  {
    dashboard_user_id,
    dashboardUserId,
    tier,
    status = 'active',
    expires_at,
    expiresAt,
    started_at,
    startedAt,
    metadata = null,
  },
  dbClient = query,
) {
  const exec = getExecutor(dbClient);
  const dashboardUser = dashboardUserId || dashboard_user_id;
  const expires = expiresAt || expires_at;
  const started = startedAt || started_at;

  if (!dashboardUser) {
    throw new Error('dashboard_user_id is required');
  }
  if (!tier) {
    throw new Error('tier is required');
  }
  if (!expires) {
    throw new Error('expires_at is required');
  }

  const { rows } = await exec(
    `INSERT INTO dashboard_user_subscriptions (dashboard_user_id, tier, status, started_at, expires_at, metadata)
     VALUES ($1, $2, $3, COALESCE($4, NOW()), $5, $6)
     RETURNING *`,
    [dashboardUser, tier, status, started, expires, metadata],
  );
  return rows[0] || null;
}

export async function findActiveByUser(dashboardUserId, dbClient = query) {
  const exec = getExecutor(dbClient);
  const { rows } = await exec(
    `SELECT * FROM dashboard_user_subscriptions
     WHERE dashboard_user_id = $1
       AND status = 'active'
       AND expires_at > NOW()
       AND (canceled_at IS NULL OR canceled_at > NOW())
     ORDER BY expires_at DESC
     LIMIT 1`,
    [dashboardUserId],
  );
  return rows[0] || null;
}

export async function expire(subscriptionId, expiredAt = null, dbClient = query) {
  const exec = getExecutor(dbClient);
  const { rows } = await exec(
    `UPDATE dashboard_user_subscriptions
     SET status = 'expired', expires_at = COALESCE($2, expires_at), canceled_at = NULL
     WHERE subscription_id = $1
     RETURNING *`,
    [subscriptionId, expiredAt],
  );
  return rows[0] || null;
}

export async function cancel(subscriptionId, canceledAt = null, dbClient = query) {
  const exec = getExecutor(dbClient);
  const { rows } = await exec(
    `UPDATE dashboard_user_subscriptions
     SET status = 'canceled', canceled_at = COALESCE($2, NOW())
     WHERE subscription_id = $1
     RETURNING *`,
    [subscriptionId, canceledAt],
  );
  return rows[0] || null;
}

export async function renew(
  subscriptionId,
  { tier, expires_at, expiresAt, metadata, started_at, startedAt } = {},
  dbClient = query,
) {
  const exec = getExecutor(dbClient);
  const current = await exec(
    'SELECT * FROM dashboard_user_subscriptions WHERE subscription_id = $1',
    [subscriptionId],
  );
  const existing = current.rows?.[0];
  if (!existing) {
    return null;
  }

  const mergedTier = tier || existing.tier;
  const mergedExpires = expiresAt || expires_at || existing.expires_at;
  const mergedMetadata = metadata ?? existing.metadata;
  const mergedStarted = startedAt || started_at || null;

  const { rows } = await exec(
    `UPDATE dashboard_user_subscriptions
     SET tier = $2,
         status = 'active',
         started_at = COALESCE($3, NOW()),
         expires_at = $4,
         canceled_at = NULL,
         metadata = $5
     WHERE subscription_id = $1
     RETURNING *`,
    [subscriptionId, mergedTier, mergedStarted, mergedExpires, mergedMetadata],
  );
  return rows[0] || null;
}
