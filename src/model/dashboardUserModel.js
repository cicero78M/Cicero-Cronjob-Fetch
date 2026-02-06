import { query, withTransaction } from '../repository/db.js';

const BASE_SELECT =
  `SELECT du.*, r.role_name AS role, COALESCE(array_agg(duc.client_id) FILTER (WHERE duc.client_id IS NOT NULL), '{}') AS client_ids
   FROM dashboard_user du
   LEFT JOIN roles r ON du.role_id = r.role_id
   LEFT JOIN dashboard_user_clients duc ON du.dashboard_user_id = duc.dashboard_user_id`;

const BASE_GROUP_BY = 'GROUP BY du.dashboard_user_id, r.role_name';

function normalizeDashboardUserId(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

async function runDashboardUserQuery({ whereClause, params, sessionSettings, expectMany = false }) {
  const queryText = `${BASE_SELECT} WHERE ${whereClause} ${BASE_GROUP_BY}`;

  const executor = sessionSettings
    ? () => withTransaction(client => client.query(queryText, params), { sessionSettings })
    : () => query(queryText, params);

  const res = await executor();
  return expectMany ? res.rows : res.rows[0] || null;
}

async function findOneBy(field, value, { sessionSettings } = {}) {
  if (field === 'dashboard_user_id') {
    const normalized = normalizeDashboardUserId(value);
    if (!normalized) {
      return null;
    }
    return runDashboardUserQuery({
      whereClause: `du.${field} = $1`,
      params: [normalized],
      sessionSettings,
    });
  }

  const whereClause =
    field === 'username' ? 'LOWER(du.username) = LOWER($1)' : `du.${field} = $1`;

  return runDashboardUserQuery({ whereClause, params: [value], sessionSettings });
}

export async function findByUsername(username) {
  return findOneBy('username', username);
}

export async function findByWhatsApp(wa) {
  return findOneBy('whatsapp', wa);
}

export async function findAllByWhatsApp(wa) {
  const whereClause = 'du.whatsapp = $1';
  return runDashboardUserQuery({ whereClause, params: [wa], expectMany: true });
}

export async function findAllByNormalizedWhatsApp(whatsapp) {
  if (!whatsapp) {
    return [];
  }
  const normalized = String(whatsapp).replace(/\D/g, '');
  const candidates = Array.from(new Set([whatsapp, normalized].filter(Boolean)));
  const whereClause = 'du.whatsapp = ANY($1)';
  return runDashboardUserQuery({ whereClause, params: [candidates], expectMany: true });
}

export async function createUser(data) {
  const res = await query(
    `INSERT INTO dashboard_user (dashboard_user_id, username, password_hash, role_id, status, whatsapp)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      data.dashboard_user_id,
      data.username,
      data.password_hash,
      data.role_id,
      data.status,
      data.whatsapp,
    ],
  );
  return res.rows[0];
}

export async function addClients(dashboardUserId, clientIds = []) {
  if (!clientIds || clientIds.length === 0) {
    throw new Error('client_ids cannot be empty');
  }
  const placeholders = clientIds.map((_, i) => `($1, $${i + 2})`).join(', ');
  await query(
    `INSERT INTO dashboard_user_clients (dashboard_user_id, client_id) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
    [dashboardUserId, ...clientIds],
  );
}

export async function findById(id) {
  return findOneBy('dashboard_user_id', id);
}

export async function findByIdWithSessionSettings(id, sessionSettings = {}) {
  return findOneBy('dashboard_user_id', id, { sessionSettings });
}

export async function updateStatus(id, status) {
  const res = await query(
    'UPDATE dashboard_user SET status=$2, updated_at=NOW() WHERE dashboard_user_id=$1 RETURNING *',
    [id, status],
  );
  return res.rows[0];
}

export async function updatePasswordHash(dashboardUserId, passwordHash) {
  const res = await query(
    'UPDATE dashboard_user SET password_hash=$2, updated_at=NOW() WHERE dashboard_user_id=$1 RETURNING *',
    [dashboardUserId, passwordHash],
  );
  return res.rows[0] || null;
}
