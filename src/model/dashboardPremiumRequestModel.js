import { query } from '../repository/db.js';

function getExecutor(dbClient = query) {
  if (typeof dbClient?.query === 'function') {
    return (...args) => dbClient.query(...args);
  }
  return dbClient;
}

export async function createRequest(data, dbClient = query) {
  const exec = getExecutor(dbClient);
  const { rows } = await exec(
    `INSERT INTO dashboard_premium_request (
        dashboard_user_id,
        client_id,
        username,
        whatsapp,
        bank_name,
        account_number,
        sender_name,
        transfer_amount,
        premium_tier,
        proof_url,
        subscription_expires_at,
        status,
        expired_at,
        responded_at,
        admin_whatsapp,
        metadata
     )
     VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, COALESCE($12, 'pending'), $13, $14, $15, COALESCE($16, '{}'::jsonb)
     )
     RETURNING *`,
    [
      data.dashboard_user_id,
      data.client_id || null,
      data.username,
      data.whatsapp || null,
      data.bank_name,
      data.account_number,
      data.sender_name,
      data.transfer_amount ?? null,
      data.premium_tier || null,
      data.proof_url || null,
      data.subscription_expires_at || null,
      data.status,
      data.expired_at || null,
      data.responded_at || null,
      data.admin_whatsapp || null,
      data.metadata || null,
    ],
  );
  return rows[0] || null;
}

export async function findById(requestId, dbClient = query) {
  const exec = getExecutor(dbClient);
  const { rows } = await exec(
    'SELECT * FROM dashboard_premium_request WHERE request_id = $1 LIMIT 1',
    [requestId],
  );
  return rows[0] || null;
}

export async function findByToken(token, dbClient = query) {
  if (!token) return null;
  const exec = getExecutor(dbClient);
  const { rows } = await exec(
    'SELECT * FROM dashboard_premium_request WHERE request_token = $1 LIMIT 1',
    [token],
  );
  return rows[0] || null;
}

export async function findLatestForUser(dashboardUserId, dbClient = query) {
  const exec = getExecutor(dbClient);
  const { rows } = await exec(
    `SELECT *
     FROM dashboard_premium_request
     WHERE dashboard_user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [dashboardUserId],
  );
  return rows[0] || null;
}

export async function findLatestOpenByDashboardUserId(dashboardUserId, dbClient = query) {
  const exec = getExecutor(dbClient);
  const { rows } = await exec(
    `SELECT *
     FROM dashboard_premium_request
     WHERE dashboard_user_id = $1
       AND status IN ('pending', 'confirmed')
       AND (expired_at IS NULL OR expired_at > NOW())
     ORDER BY created_at DESC
     LIMIT 1`,
    [dashboardUserId],
  );
  return rows[0] || null;
}

export async function findLatestOpenByUsername(username, dbClient = query) {
  if (!username) return null;
  const exec = getExecutor(dbClient);
  const { rows } = await exec(
    `SELECT *
     FROM dashboard_premium_request
     WHERE LOWER(username) = LOWER($1)
       AND status IN ('pending', 'confirmed')
       AND (expired_at IS NULL OR expired_at > NOW())
     ORDER BY created_at DESC
     LIMIT 1`,
    [username],
  );
  return rows[0] || null;
}

export async function updateRequest(requestId, patch, dbClient = query) {
  const existing = await findById(requestId, dbClient);
  if (!existing) return null;
  const exec = getExecutor(dbClient);
  const merged = { ...existing, ...patch };
  const values = [
    requestId,
    merged.client_id || null,
    merged.username,
    merged.whatsapp || null,
    merged.bank_name,
    merged.account_number,
    merged.sender_name,
    merged.transfer_amount ?? null,
    merged.premium_tier || null,
    merged.proof_url || null,
    merged.subscription_expires_at || null,
    merged.status,
    merged.expired_at || null,
    merged.responded_at || null,
    merged.admin_whatsapp || null,
    merged.metadata ?? existing.metadata ?? {},
  ];

  const { rows } = await exec(
    `UPDATE dashboard_premium_request
     SET client_id = $2,
         username = $3,
         whatsapp = $4,
         bank_name = $5,
         account_number = $6,
         sender_name = $7,
         transfer_amount = $8,
         premium_tier = $9,
         proof_url = $10,
         subscription_expires_at = $11,
         status = $12,
         expired_at = $13,
         responded_at = $14,
         admin_whatsapp = $15,
         metadata = $16,
         updated_at = NOW()
     WHERE request_id = $1
     RETURNING *`,
    values,
  );
  return rows[0] || null;
}

export async function insertAuditEntry(entry, dbClient = query) {
  const exec = getExecutor(dbClient);
  const { rows } = await exec(
    `INSERT INTO dashboard_premium_request_audit (
        request_id,
        dashboard_user_id,
        action,
        actor,
        note,
        status_from,
        status_to,
        admin_whatsapp,
        metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      entry.request_id,
      entry.dashboard_user_id || null,
      entry.action,
      entry.actor,
      entry.note || null,
      entry.status_from || null,
      entry.status_to || null,
      entry.admin_whatsapp || null,
      entry.metadata || null,
    ],
  );
  return rows[0] || null;
}

export async function findExpirable(referenceDate = new Date(), dbClient = query) {
  const exec = getExecutor(dbClient);
  const { rows } = await exec(
    `SELECT *
     FROM dashboard_premium_request
     WHERE status IN ('pending', 'confirmed')
       AND expired_at IS NOT NULL
       AND expired_at <= $1`,
    [referenceDate],
  );
  return rows || [];
}

export async function markRequestsExpired(requestIds = [], expiredAt = new Date(), dbClient = query) {
  if (!requestIds.length) return [];
  const exec = getExecutor(dbClient);
  const { rows } = await exec(
    `UPDATE dashboard_premium_request
     SET status = 'expired',
         responded_at = COALESCE(responded_at, $2),
         updated_at = NOW()
     WHERE request_id = ANY($1)
     RETURNING *`,
    [requestIds, expiredAt],
  );
  return rows || [];
}
