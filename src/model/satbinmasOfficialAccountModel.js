import { query } from '../repository/db.js';

const normalizePlatform = (value) => value?.trim().toLowerCase();

const returningColumns =
  'satbinmas_account_id, client_id, platform, username, display_name, profile_url, secuid AS "secUid", is_active, is_verified, created_at, updated_at';
const selectColumns = `SELECT ${returningColumns}`;

export async function findByClientAndPlatform(
  client_id,
  platform,
  { onlyActive = false } = {},
) {
  const normalizedPlatform = normalizePlatform(platform);
  const conditions = [
    'LOWER(client_id) = LOWER($1)',
    'LOWER(platform) = LOWER($2)',
  ];

  if (onlyActive) {
    conditions.push('is_active = TRUE');
  }

  const res = await query(
    `${selectColumns}
     FROM satbinmas_official_accounts
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at ASC`,
    [client_id, normalizedPlatform],
  );
  return res.rows;
}

export async function findActiveByClientAndPlatform(client_id, platform) {
  return findByClientAndPlatform(client_id, platform, { onlyActive: true });
}

export async function findByClientId(client_id) {
  const res = await query(
    `${selectColumns}
     FROM satbinmas_official_accounts
     WHERE LOWER(client_id) = LOWER($1)
     ORDER BY platform ASC, created_at ASC`,
    [client_id],
  );
  return res.rows;
}

export async function findByClientIdAndPlatform(client_id, platform) {
  const normalizedPlatform = normalizePlatform(platform);
  const res = await query(
    `${selectColumns}
     FROM satbinmas_official_accounts
     WHERE LOWER(client_id) = LOWER($1) AND LOWER(platform) = LOWER($2)
     LIMIT 1`,
    [client_id, normalizedPlatform],
  );
  return res.rows[0] || null;
}

export async function findByPlatformAndUsername(platform, username) {
  const normalizedPlatform = normalizePlatform(platform);
  const trimmedUsername = username?.trim();
  const res = await query(
    `${selectColumns}
     FROM satbinmas_official_accounts
     WHERE LOWER(platform) = LOWER($1) AND LOWER(username) = LOWER($2)
     LIMIT 1`,
    [normalizedPlatform, trimmedUsername],
  );
  return res.rows[0] || null;
}

export async function findById(accountId) {
  const res = await query(
    `${selectColumns}
     FROM satbinmas_official_accounts
     WHERE satbinmas_account_id = $1
     LIMIT 1`,
    [accountId],
  );
  return res.rows[0] || null;
}

export async function upsertAccount({
  client_id,
  platform,
  username,
  display_name,
  profile_url,
  is_active,
  is_verified,
  secUid,
}) {
  const normalizedPlatform = normalizePlatform(platform);
  const trimmedUsername = username?.trim();
  const trimmedDisplayName = display_name?.trim();
  const trimmedProfileUrl = profile_url?.trim();
  const normalizedSecUid = secUid?.trim();
  const res = await query(
    `INSERT INTO satbinmas_official_accounts (client_id, platform, username, display_name, profile_url, secuid, is_active, is_verified)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (client_id, platform) DO UPDATE
       SET username = EXCLUDED.username,
           display_name = EXCLUDED.display_name,
           profile_url = EXCLUDED.profile_url,
           secuid = EXCLUDED.secuid,
           is_active = EXCLUDED.is_active,
           is_verified = EXCLUDED.is_verified,
           updated_at = NOW()
     RETURNING ${returningColumns}`,
    [
      client_id,
      normalizedPlatform,
      trimmedUsername,
      trimmedDisplayName,
      trimmedProfileUrl,
      normalizedSecUid ?? null,
      is_active,
      is_verified,
    ],
  );
  return res.rows[0] || null;
}

export async function removeById(accountId) {
  const res = await query(
    `DELETE FROM satbinmas_official_accounts
     WHERE satbinmas_account_id = $1
     RETURNING ${returningColumns}`,
    [accountId],
  );
  return res.rows[0] || null;
}
