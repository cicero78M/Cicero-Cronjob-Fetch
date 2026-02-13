// src/model/userModel.js

import { query } from '../repository/db.js';
import { PRIORITY_USER_NAMES } from '../utils/constants.js';
import { normalizeEmail, normalizeUserId } from '../utils/utilsHelper.js';
import { minPhoneDigitLength, normalizeWhatsappNumber } from '../utils/waHelper.js';

const NAME_PRIORITY_DEFAULT = PRIORITY_USER_NAMES.length + 1;
export const STATIC_DIVISIONS = [
  'SUBBID MULTIMEDIA',
  'SUBBID PENMAS',
  'SUBBID PID',
  'SUB BAG RENMIN',
];

export function mergeStaticDivisions(divisions = []) {
  const merged = [...divisions];
  const upperSet = new Set(divisions.map((div) => div.toUpperCase()));
  for (const staticDiv of STATIC_DIVISIONS) {
    const upperStatic = staticDiv.toUpperCase();
    if (!upperSet.has(upperStatic)) {
      merged.push(staticDiv);
      upperSet.add(upperStatic);
    }
  }
  return merged;
}

function buildNamePriorityCase(alias = 'u') {
  const column = alias ? `${alias}.nama` : 'nama';
  const upperColumn = `UPPER(COALESCE(${column}, ''))`;
  const cases = PRIORITY_USER_NAMES.map(
    (name, index) => `WHEN ${upperColumn} = '${name}' THEN ${index + 1}`
  ).join(' ');
  return `CASE ${cases} ELSE ${NAME_PRIORITY_DEFAULT} END`;
}

const NAME_PRIORITY_CASE_U = buildNamePriorityCase('u');

async function addRole(userId, roleName) {
  const uid = normalizeUserId(userId);
  await query('INSERT INTO roles (role_name) VALUES ($1) ON CONFLICT (role_name) DO NOTHING', [roleName]);
  await query(
    'INSERT INTO user_roles (user_id, role_id) VALUES ($1, (SELECT role_id FROM roles WHERE role_name=$2)) ON CONFLICT DO NOTHING',
    [uid, roleName]
  );
}

async function removeRole(userId, roleName) {
  const uid = normalizeUserId(userId);
  await query(
    'DELETE FROM user_roles WHERE user_id=$1 AND role_id=(SELECT role_id FROM roles WHERE role_name=$2)',
    [uid, roleName]
  );
}

export async function getUserRoles(userId) {
  const uid = normalizeUserId(userId);
  const { rows } = await query(
    `SELECT r.role_name
     FROM user_roles ur
     JOIN roles r ON ur.role_id = r.role_id
     WHERE ur.user_id = $1`,
    [uid]
  );
  return rows.map((row) => row.role_name);
}

export async function deactivateRoleOrUser(userId, roleName = null) {
  const uid = normalizeUserId(userId);
  const normalizedRole = typeof roleName === 'string' ? roleName.toLowerCase() : null;
  await query('BEGIN');
  try {
    const { rows } = await query(
      `SELECT r.role_name
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.role_id
       WHERE ur.user_id = $1`,
      [uid]
    );
    const currentRoles = rows.map((row) => row.role_name);

    if (normalizedRole) {
      const hasRole = currentRoles.some((role) => role?.toLowerCase() === normalizedRole);
      if (!hasRole) {
        throw new Error(`Role ${roleName} tidak ditemukan untuk user`);
      }
      await query(
        'DELETE FROM user_roles WHERE user_id=$1 AND role_id=(SELECT role_id FROM roles WHERE LOWER(role_name)=LOWER($2))',
        [uid, roleName]
      );
    }

    const remainingRoles = normalizedRole
      ? currentRoles.filter((role) => role?.toLowerCase() !== normalizedRole)
      : currentRoles;
    if (!normalizedRole || remainingRoles.length === 0) {
      await query('UPDATE "user" SET status=false, updated_at=NOW() WHERE user_id=$1', [uid]);
    } else {
      await query('UPDATE "user" SET updated_at=NOW() WHERE user_id=$1', [uid]);
    }
    await query('COMMIT');
  } catch (err) {
    await query('ROLLBACK');
    throw err;
  }
  return findUserById(uid);
}

// Helper to normalize text fields to uppercase
function normalizeUserFields(data) {
  if (!data) return;
  const fields = ['nama', 'title', 'divisi', 'jabatan', 'desa'];
  for (const key of fields) {
    if (data[key] && typeof data[key] === 'string') {
      data[key] = data[key].toUpperCase();
    }
  }
}

function normalizeWhatsappField(value) {
  if (value == null || value === '') return '';
  const normalized = normalizeWhatsappNumber(value);
  if (normalized && normalized.length < minPhoneDigitLength) {
    throw new Error('whatsapp tidak valid');
  }
  return normalized;
}

// Bangun klausa filter client dengan mempertimbangkan tipe client
async function buildClientFilter(
  clientId,
  alias = 'u',
  index = 1,
  roleFilter = null,
  clientTypeParam = null
) {
  let clientType = clientTypeParam;
  if (!clientType) {
    const { rows } = await query(
      'SELECT client_type FROM clients WHERE client_id = $1',
      [clientId]
    );
    clientType = rows[0]?.client_type?.toLowerCase();
  }

  let clause;
  const params = [];

  if (clientType === 'direktorat') {
    const roleName = roleFilter || clientId;
    if (roleName) {
      const rolePlaceholder = `$${index}`;
      clause = `EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON ur.role_id = r.role_id
        WHERE ur.user_id = ${alias}.user_id AND r.role_name = ${rolePlaceholder}
      )`;
      params.push(roleName);
    } else {
      clause = '1=1';
    }
  } else {
    const clientPlaceholder = `$${index}`;
    clause = `(${alias}.client_id = ${clientPlaceholder} OR EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON ur.role_id = r.role_id
        WHERE ur.user_id = ${alias}.user_id AND r.role_name = ${clientPlaceholder}
      ))`;
    params.push(clientId);

    const allowedRoles = [
      'ditbinmas',
      'ditlantas',
      'bidhumas',
      'ditsamapta',
      'operator',
    ];
    if (roleFilter && allowedRoles.includes(roleFilter.toLowerCase())) {
      const rolePlaceholder = `$${index + 1}`;
      clause += ` AND EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON ur.role_id = r.role_id
        WHERE ur.user_id = ${alias}.user_id AND r.role_name = ${rolePlaceholder}
      )`;
      params.push(roleFilter);
    }
  }

  return { clause, params };
}

// ========== QUERY DATABASE ==========

// Ambil daftar client_id berdasarkan role_name
export async function getClientsByRole(roleName, clientId = null) {
  const params = [roleName];
  let sql = `SELECT DISTINCT LOWER(duc.client_id) AS client_id
     FROM dashboard_user du
     JOIN roles r ON du.role_id = r.role_id
     JOIN dashboard_user_clients duc ON du.dashboard_user_id = duc.dashboard_user_id
     WHERE LOWER(r.role_name) = LOWER($1)`;
  if (clientId) {
    if (Array.isArray(clientId)) {
      sql += ` AND LOWER(duc.client_id) = ANY($2)`;
      params.push(clientId.map((c) => c.toLowerCase()));
    } else {
      sql += ` AND LOWER(duc.client_id) = LOWER($2)`;
      params.push(clientId.toLowerCase());
    }
  }
  const { rows } = await query(sql, params);
  return rows.map((r) => r.client_id);
}

// Ambil semua user aktif (status = true), tanpa filter insta
export async function getUsersByClient(client_id, roleFilter = null) {
  const { clause, params } = await buildClientFilter(client_id, 'u', 1, roleFilter);
  const res = await query(
    `SELECT u.user_id, u.nama, u.tiktok, u.insta, u.divisi, u.title, u.status, u.exception, u.jabatan,
            u.whatsapp, u.email, u.client_id, c.nama AS client_name, c.regional_id AS regional_id
     FROM "user" u
     LEFT JOIN clients c ON LOWER(c.client_id) = LOWER(u.client_id)
     WHERE ${clause} AND status = true`,
    params
  );
  return res.rows;
}

// Ambil semua user aktif berdasarkan client_id yang spesifik dan role tertentu
export async function getUsersByClientAndRole(client_id, roleFilter = null) {
  const params = [client_id];
  let sql = `SELECT u.user_id, u.nama, u.tiktok, u.insta, u.divisi, u.title, u.status, u.exception, u.jabatan,
            u.whatsapp, u.email, u.client_id, c.nama AS client_name, c.regional_id AS regional_id
     FROM "user" u
     LEFT JOIN clients c ON LOWER(c.client_id) = LOWER(u.client_id)
     WHERE LOWER(u.client_id) = LOWER($1)`;

  if (roleFilter) {
    sql += ` AND EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON ur.role_id = r.role_id
        WHERE ur.user_id = u.user_id AND LOWER(r.role_name) = LOWER($2)
      )`;
    params.push(roleFilter);
  }

  sql += ' AND status = true';

  const res = await query(sql, params);
  return res.rows;
}

export async function getOperatorsByClient(client_id) {
  const { clause, params } = await buildClientFilter(client_id, 'u', 1);
  const res = await query(
    `SELECT u.user_id, u.nama, u.tiktok, u.insta, u.divisi, u.title, u.status, u.exception, u.whatsapp
     FROM "user" u
     JOIN user_roles ur_opr ON ur_opr.user_id = u.user_id
     JOIN roles r_opr ON ur_opr.role_id = r_opr.role_id
     WHERE ${clause} AND u.status = true AND LOWER(r_opr.role_name) = 'operator'`,
    params
  );
  return res.rows;
}

// Ambil semua user aktif (status = true/NULL), khusus absensi TikTok
export async function getUsersByClientFull(client_id, roleFilter = null) {
  const { clause, params } = await buildClientFilter(client_id, 'u', 1, roleFilter);
  const res = await query(
    `SELECT user_id, nama, tiktok, divisi, title, exception
     FROM "user" u
     WHERE ${clause} AND (status IS TRUE OR status IS NULL)`,
    params
  );
  // DEBUG: log hasilnya
  console.log('[DEBUG][getUsersByClientFull] TikTok, client_id:', client_id, '| user:', res.rows.length);
  return res.rows;
}

// [OPSI] Ambil user by Instagram (status = true)

// Ambil seluruh user dari semua client
export async function getAllUsers(client_id, roleFilter = null) {
  if (client_id) {
    const { clause, params } = await buildClientFilter(client_id, 'u', 1, roleFilter);
    const res = await query(
      `SELECT * FROM "user" u WHERE ${clause}`,
      params
    );
    return res.rows;
  } else {
    // Jika tanpa client_id, ambil semua user di seluruh client
    const res = await query('SELECT * FROM "user"');
    return res.rows;
  }
}

// Ambil user yang SUDAH mengisi Instagram (status true)
export async function getInstaFilledUsersByClient(clientId, roleFilter = null) {
  const { clause, params } = await buildClientFilter(clientId, 'u', 1, roleFilter);
  const result = await query(
    `SELECT divisi, nama, user_id, title, insta
     FROM "user" u
     WHERE ${clause} AND insta IS NOT NULL AND insta <> '' AND status = true
     ORDER BY ${NAME_PRIORITY_CASE_U}, divisi, nama`,
    params
  );
  return result.rows;
}

// Ambil user yang BELUM mengisi Instagram (status true)
export async function getInstaEmptyUsersByClient(clientId, roleFilter = null) {
  const { clause, params } = await buildClientFilter(clientId, 'u', 1, roleFilter);
  const result = await query(
    `SELECT divisi, nama, user_id, title
     FROM "user" u
     WHERE ${clause} AND (insta IS NULL OR insta = '') AND status = true
     ORDER BY ${NAME_PRIORITY_CASE_U}, divisi, nama`,
    params
  );
  return result.rows;
}

// Ambil user yang SUDAH mengisi TikTok (status true)
export async function getTiktokFilledUsersByClient(clientId, roleFilter = null) {
  const { clause, params } = await buildClientFilter(clientId, 'u', 1, roleFilter);
  const result = await query(
    `SELECT divisi, nama, user_id, title, tiktok
     FROM "user" u
     WHERE ${clause} AND tiktok IS NOT NULL AND tiktok <> '' AND status = true
     ORDER BY ${NAME_PRIORITY_CASE_U}, divisi, nama`,
    params
  );
  return result.rows;
}

// Ambil user yang BELUM mengisi TikTok (status true)
export async function getTiktokEmptyUsersByClient(clientId, roleFilter = null) {
  const { clause, params } = await buildClientFilter(clientId, 'u', 1, roleFilter);
  const result = await query(
    `SELECT divisi, nama, user_id, title
     FROM "user" u
     WHERE ${clause} AND (tiktok IS NULL OR tiktok = '') AND status = true
     ORDER BY ${NAME_PRIORITY_CASE_U}, divisi, nama`,
    params
  );
  return result.rows;
}

// Ambil semua user aktif (status=true) beserta whatsapp
export async function getUsersWithWaByClient(clientId, roleFilter = null) {
  const { clause, params } = await buildClientFilter(clientId, 'u', 1, roleFilter);
  const result = await query(
    `SELECT divisi, nama, user_id, title, whatsapp
     FROM "user" u WHERE ${clause} AND status = true AND whatsapp IS NOT NULL AND whatsapp <> '' AND wa_notification_opt_in = true
     ORDER BY ${NAME_PRIORITY_CASE_U}, divisi, nama`,
    params
  );
  return result.rows;
}

// Ambil seluruh user aktif dengan nomor WhatsApp
export async function getActiveUsersWithWhatsapp() {
  const { rows } = await query(
    `SELECT nama, title, title AS pangkat, whatsapp, wa_notification_opt_in, insta, tiktok, client_id
     FROM "user"
     WHERE status = true AND whatsapp IS NOT NULL AND whatsapp <> '' AND wa_notification_opt_in = true`
  );
  return rows;
}

// Ambil user aktif yang belum melengkapi data (insta/tiktok/whatsapp)
export async function getUsersMissingDataByClient(clientId, roleFilter = null) {
  const { clause, params } = await buildClientFilter(clientId, 'u', 1, roleFilter);
  const res = await query(
    `SELECT user_id, nama, insta, tiktok, whatsapp
     FROM "user" u
     WHERE ${clause} AND status = true
       AND (insta IS NULL OR insta='' OR
            tiktok IS NULL OR tiktok='' OR
            whatsapp IS NULL OR whatsapp='')
     ORDER BY ${NAME_PRIORITY_CASE_U}, nama`,
    params
  );
  return res.rows;
}

// Ambil seluruh user aktif beserta data sosial
export async function getUsersSocialByClient(clientId, roleFilter = null) {
  const { rows } = await query(
    'SELECT client_type FROM clients WHERE client_id = $1',
    [clientId]
  );
  const clientType = rows[0]?.client_type?.toLowerCase();

  const { clause, params } = await buildClientFilter(clientId, 'u', 1, roleFilter);
  let directorateClause = clause;
  const directorateParams = [...params];

  if (clientType === 'direktorat') {
    const clientPlaceholder = roleFilter ? `$${directorateParams.length + 1}` : '$1';
    directorateClause = `(${directorateClause} OR LOWER(u.client_id) = LOWER(${clientPlaceholder}))`;
    if (roleFilter) {
      directorateParams.push(clientId);
    }
  }

  const res = await query(
      `SELECT u.user_id, u.nama, u.title, u.divisi, u.insta, u.tiktok, u.client_id
       FROM "user" u
       WHERE ${directorateClause} AND status = true
       ORDER BY u.client_id, u.divisi, u.nama`,
    directorateParams
  );
  return res.rows;
}

export async function findUserById(user_id) {
  const uid = normalizeUserId(user_id);
  const { rows } = await query(
      `SELECT u.*,\n      bool_or(r.role_name='ditbinmas') AS ditbinmas,\n      bool_or(r.role_name='ditlantas') AS ditlantas,\n      bool_or(r.role_name='bidhumas') AS bidhumas,\n      bool_or(r.role_name='ditsamapta') AS ditsamapta,\n      bool_or(r.role_name='operator') AS operator\n     FROM "user" u\n     LEFT JOIN user_roles ur ON u.user_id = ur.user_id\n     LEFT JOIN roles r ON ur.role_id = r.role_id\n     WHERE u.user_id=$1\n     GROUP BY u.user_id`,
    [uid]
  );
  return rows[0];
}

export async function findUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  const { rows } = await query('SELECT * FROM "user" WHERE LOWER(email) = LOWER($1)', [normalizedEmail]);
  return rows[0] || null;
}

// Ambil user berdasarkan user_id dan client_id
export async function findUserByIdAndClient(user_id, client_id, roleFilter = null) {
  const uid = normalizeUserId(user_id);
  const { clause, params: clientParams } = await buildClientFilter(client_id, 'u', 2, roleFilter);
  const { rows } = await query(
      `SELECT u.*,\n      bool_or(r.role_name='ditbinmas') AS ditbinmas,\n      bool_or(r.role_name='ditlantas') AS ditlantas,\n      bool_or(r.role_name='bidhumas') AS bidhumas,\n      bool_or(r.role_name='ditsamapta') AS ditsamapta,\n      bool_or(r.role_name='operator') AS operator\n     FROM "user" u\n     LEFT JOIN user_roles ur ON u.user_id = ur.user_id\n     LEFT JOIN roles r ON ur.role_id = r.role_id\n     WHERE u.user_id=$1 AND ${clause}\n     GROUP BY u.user_id`,
    [uid, ...clientParams]
  );
  return rows[0];
}

export async function updatePremiumStatus(userId, status, endDate) {
  const { rows } = await query(
    'UPDATE "user" SET premium_status=$2, premium_end_date=$3 WHERE user_id=$1 RETURNING *',
    [userId, status, endDate]
  );
  return rows[0] || null;
}

/**
 * Update field user (termasuk insta/tiktok/whatsapp/exception/status/nama/title/divisi/jabatan)
 */
export async function updateUserField(user_id, field, value) {
  const uid = normalizeUserId(user_id);
  const allowed = [
    "insta",
    "tiktok",
    "whatsapp",
    "email",
    "exception",
    "status",
    "nama",
    "title",
    "divisi",
    "jabatan",
    "desa",
    "client_id",
    "premium_status",
    "premium_end_date",
    "wa_notification_opt_in",
  ];
  const roleFields = ["ditbinmas", "ditlantas", "bidhumas", "ditsamapta", "operator"];
  if (!allowed.includes(field) && !roleFields.includes(field)) throw new Error("Field tidak diizinkan!");
  if (["nama", "title", "divisi", "jabatan", "desa"].includes(field) && typeof value === 'string') {
    value = value.toUpperCase();
  }
  if (field === 'whatsapp') {
    value = normalizeWhatsappField(value);
  }
  if (roleFields.includes(field)) {
    if (value) await addRole(uid, field);
    else await removeRole(uid, field);
    await query(
      'UPDATE "user" SET updated_at=NOW() WHERE user_id=$1',
      [uid]
    );
    return findUserById(uid);
  }
  if (field === 'client_id') {
    const normalizedClientId = typeof value === 'string' ? value.toUpperCase() : value;
    const { rows } = await query(
      'SELECT 1 FROM clients WHERE LOWER(client_id) = LOWER($1)',
      [normalizedClientId]
    );
    if (!rows.length) throw new Error('client_id tidak ditemukan');
    await query(
      `UPDATE "user" SET client_id=$1, updated_at=NOW() WHERE user_id=$2`,
      [normalizedClientId, uid]
    );
    return findUserById(uid);
  }
  await query(
    `UPDATE "user" SET ${field}=$1, updated_at=NOW() WHERE user_id=$2`,
    [value, uid]
  );
  return findUserById(uid);
}

// Ambil semua user dengan exception true
export async function getAllExceptionUsers() {
  const { rows } = await query(
    'SELECT * FROM "user" u WHERE exception = true'
  );
  return rows;
}

// Ambil user dengan exception per client
export async function getExceptionUsersByClient(client_id, roleFilter = null) {
  const { clause, params } = await buildClientFilter(client_id, 'u', 1, roleFilter);
  const { rows } = await query(
    `SELECT * FROM "user" u WHERE exception = true AND ${clause}`,
    params
  );
  return rows;
}

// Ambil user dengan flag direktorat binmas atau lantas
export async function getDirektoratUsers(clientId = null) {
  let sql = `SELECT u.*,\n    bool_or(r.role_name='ditbinmas') AS ditbinmas,\n    bool_or(r.role_name='ditlantas') AS ditlantas,\n    bool_or(r.role_name='bidhumas') AS bidhumas,\n    bool_or(r.role_name='ditsamapta') AS ditsamapta\n  FROM "user" u\n  JOIN user_roles ur ON u.user_id = ur.user_id\n  JOIN roles r ON ur.role_id = r.role_id\n  WHERE r.role_name IN ('ditbinmas','ditlantas','bidhumas','ditsamapta')`;
  const params = [];
  if (clientId) {
    sql += ' AND u.client_id = $1';
    params.push(clientId);
  }
  sql += ' GROUP BY u.user_id';
  const { rows } = await query(sql, params);
  return rows;
}

// Ambil user berdasarkan flag direktorat tertentu (ditbinmas/ditlantas/bidhumas)
// Jika clientId berupa array, filter berdasarkan list tersebut.
// Selalu memastikan user memiliki role yang sama dengan client_id-nya.
export async function getUsersByDirektorat(flag, clientId = null) {
  console.log(`[USER MODEL] getUsersByDirektorat called with flag=${flag}, clientId=${JSON.stringify(clientId)}`);
  const validFlags = ['ditbinmas', 'ditlantas', 'bidhumas', 'ditsamapta'];
  if (!validFlags.includes(flag)) {
    console.log(`[USER MODEL] Invalid flag passed to getUsersByDirektorat: ${flag}`);
    throw new Error('Direktorat flag tidak valid');
  }

  const params = [flag];
  let p = 2;

  let sql = `SELECT
      u.*,
      c.regional_id AS regional_id,
      bool_or(r.role_name='ditbinmas') AS ditbinmas,
      bool_or(r.role_name='ditlantas') AS ditlantas,
      bool_or(r.role_name='bidhumas') AS bidhumas,
      bool_or(r.role_name='ditsamapta') AS ditsamapta
    FROM "user" u
    LEFT JOIN user_roles ur ON ur.user_id = u.user_id
    LEFT JOIN roles r ON r.role_id = ur.role_id
    LEFT JOIN clients c ON LOWER(c.client_id) = LOWER(u.client_id)
    WHERE EXISTS (
      SELECT 1
      FROM user_roles ur1
      JOIN roles r1 ON r1.role_id = ur1.role_id
      WHERE ur1.user_id = u.user_id
        AND r1.role_name = $1
    )
    AND u.status = true`;

  const hasClientId =
    Array.isArray(clientId) ? clientId.length > 0 : typeof clientId === 'string' && clientId.trim() !== '';

  if (hasClientId) {
    if (Array.isArray(clientId)) {
      sql += ` AND LOWER(u.client_id) = ANY($${p})`;
      params.push(clientId.map((c) => String(c).toLowerCase()));
      p += 1;
    } else {
      sql += ` AND LOWER(u.client_id) = LOWER($${p})`;
      params.push(clientId.trim().toLowerCase());
      p += 1;
    }
  }

  sql += ' GROUP BY u.user_id, c.regional_id';
  console.log('[USER MODEL] getUsersByDirektorat SQL:', sql);
  console.log('[USER MODEL] getUsersByDirektorat Params:', params);
  const { rows } = await query(sql, params);
  console.log(`[USER MODEL] getUsersByDirektorat returning ${rows.length} users`);
  return rows;
}


export async function findUserByInsta(insta) {
  if (!insta) return null;
  const { rows } = await query(
      `SELECT u.*,\n      c.nama AS client_name,\n      bool_or(r.role_name='ditbinmas') AS ditbinmas,\n      bool_or(r.role_name='ditlantas') AS ditlantas,\n      bool_or(r.role_name='bidhumas') AS bidhumas,\n      bool_or(r.role_name='ditsamapta') AS ditsamapta,\n      bool_or(r.role_name='operator') AS operator\n     FROM "user" u\n     LEFT JOIN clients c ON c.client_id = u.client_id\n     LEFT JOIN user_roles ur ON u.user_id = ur.user_id\n     LEFT JOIN roles r ON ur.role_id = r.role_id\n     WHERE LOWER(u.insta) = LOWER($1)\n     GROUP BY u.user_id, c.nama`,
    [insta]
  );
  return rows[0];
}

export async function findUserByTiktok(tiktok) {
  if (!tiktok) return null;
  const { rows } = await query(
      `SELECT u.*,\n      c.nama AS client_name,\n      bool_or(r.role_name='ditbinmas') AS ditbinmas,\n      bool_or(r.role_name='ditlantas') AS ditlantas,\n      bool_or(r.role_name='bidhumas') AS bidhumas,\n      bool_or(r.role_name='ditsamapta') AS ditsamapta,\n      bool_or(r.role_name='operator') AS operator\n     FROM "user" u\n     LEFT JOIN clients c ON c.client_id = u.client_id\n     LEFT JOIN user_roles ur ON u.user_id = ur.user_id\n     LEFT JOIN roles r ON ur.role_id = r.role_id\n     WHERE LOWER(u.tiktok) = LOWER($1)\n     GROUP BY u.user_id, c.nama`,
    [tiktok]
  );
  return rows[0];
}

export async function findUserByWhatsApp(wa) {
  if (!wa) return null;
  const { rows } = await query(
      `SELECT u.*,\n      c.nama AS client_name,\n      bool_or(r.role_name='ditbinmas') AS ditbinmas,\n      bool_or(r.role_name='ditlantas') AS ditlantas,\n      bool_or(r.role_name='bidhumas') AS bidhumas,\n      bool_or(r.role_name='ditsamapta') AS ditsamapta,\n      bool_or(r.role_name='operator') AS operator\n     FROM "user" u\n     LEFT JOIN clients c ON c.client_id = u.client_id\n     LEFT JOIN user_roles ur ON u.user_id = ur.user_id\n     LEFT JOIN roles r ON ur.role_id = r.role_id\n     WHERE u.whatsapp = $1\n     GROUP BY u.user_id, c.nama`,
    [wa]
  );
  return rows[0];
}

export async function findUserByIdAndWhatsApp(userId, wa) {
  if (!userId || !wa) return null;
  const uid = normalizeUserId(userId);
  const { rows } = await query(
      `SELECT u.*,\n      c.nama AS client_name,\n      bool_or(r.role_name='ditbinmas') AS ditbinmas,\n      bool_or(r.role_name='ditlantas') AS ditlantas,\n      bool_or(r.role_name='bidhumas') AS bidhumas,\n      bool_or(r.role_name='ditsamapta') AS ditsamapta,\n      bool_or(r.role_name='operator') AS operator\n     FROM "user" u\n     LEFT JOIN clients c ON c.client_id = u.client_id\n     LEFT JOIN user_roles ur ON u.user_id = ur.user_id\n     LEFT JOIN roles r ON ur.role_id = r.role_id\n     WHERE u.user_id = $1 AND u.whatsapp = $2\n     GROUP BY u.user_id, c.nama`,
    [uid, wa]
  );
  return rows[0];
}

// Ambil semua pangkat/title unik (distinct)

// Mendapatkan daftar pangkat unik dari tabel user (atau dari tabel/enum khusus jika ada)
export async function getAvailableTitles() {
  // Jika ada table titles: return await query('SELECT DISTINCT title FROM titles');
  const res = await query(
    'SELECT DISTINCT title FROM "user" WHERE title IS NOT NULL ORDER BY title'
  );
  return res.rows.map((r) => r.title).filter(Boolean);
}

// Ambil daftar Satfung unik dari database
export async function getAvailableSatfung(clientId = null, roleFilter = null) {
  // Gunakan "user" (pakai kutip dua) karena user adalah reserved word di Postgres
  let res;
  if (clientId) {
    const { clause, params } = await buildClientFilter(clientId, '"user"', 1, roleFilter);
    res = await query(
      `SELECT DISTINCT divisi FROM "user" WHERE divisi IS NOT NULL AND ${clause} ORDER BY divisi`,
      params
    );
  } else {
    res = await query(
      'SELECT DISTINCT divisi FROM "user" WHERE divisi IS NOT NULL ORDER BY divisi'
    );
  }
  const divisions = res.rows.map((r) => r.divisi).filter(Boolean);
  return mergeStaticDivisions(divisions);
}

// --- Tambahkan fungsi createUser ---
export async function createUser(userData) {
  // Contoh userData: {user_id, nama, title, divisi, jabatan, ...}
  // Sesuaikan dengan struktur dan database-mu!
  userData.user_id = normalizeUserId(userData.user_id);
  normalizeUserFields(userData);
  const roles = ['ditbinmas', 'ditlantas', 'bidhumas', 'ditsamapta', 'operator'].filter(
    (r) => userData[r]
  );
  const q = `
    INSERT INTO "user" (user_id, nama, title, divisi, jabatan, desa, status, whatsapp, insta, tiktok, client_id, exception, wa_notification_opt_in)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
  `;
  const params = [
    userData.user_id,
    userData.nama,
    userData.title,
    userData.divisi,
    userData.jabatan,
    userData.desa,
    userData.status ?? true, // default true
    normalizeWhatsappField(userData.whatsapp),
    userData.insta || "",
    userData.tiktok || "",
    userData.client_id || null,
    userData.exception ?? false,
    userData.wa_notification_opt_in ?? false
  ];
  await query(q, params);
  for (const r of roles) {
    await addRole(userData.user_id, r);
  }
  return findUserById(userData.user_id);
}

export async function updateUser(userId, userData) {
  let uid = normalizeUserId(userId);
  normalizeUserFields(userData);

  if (userData.user_id) {
    const newUid = normalizeUserId(userData.user_id);
    if (newUid !== uid) {
      await updateUserRolesUserId(uid, newUid);
      uid = newUid;
    }
    delete userData.user_id;
  }

  const roleFields = ['ditbinmas', 'ditlantas', 'bidhumas', 'ditsamapta', 'operator'];
  const roles = {};
  let hasRoleUpdates = false;
  for (const rf of roleFields) {
    if (rf in userData) {
      roles[rf] = userData[rf];
      hasRoleUpdates = true;
      delete userData[rf];
    }
  }

  const columns = Object.keys(userData);
  if (columns.length > 0) {
    const setClause = columns.map((c, i) => `${c}=$${i + 1}`).join(', ');
    const params = columns.map((c) => userData[c]);
    params.push(uid);
    await query(
      `UPDATE "user" SET ${setClause}, updated_at=NOW() WHERE user_id=$${columns.length + 1}`,
      params
    );
  } else if (hasRoleUpdates) {
    await query(
      'UPDATE "user" SET updated_at=NOW() WHERE user_id=$1',
      [uid]
    );
  }

  for (const [r, val] of Object.entries(roles)) {
    if (val) await addRole(uid, r);
    else await removeRole(uid, r);
  }
  return findUserById(uid);
}

export async function updateUserRolesUserId(oldUserId, newUserId) {
  const oldUid = normalizeUserId(oldUserId);
  const newUid = normalizeUserId(newUserId);
  await query('BEGIN');
  try {
    const { rows } = await query('SELECT role_id FROM user_roles WHERE user_id=$1', [oldUid]);
    await query('DELETE FROM user_roles WHERE user_id=$1', [oldUid]);
    await query('UPDATE "user" SET user_id=$1, updated_at=NOW() WHERE user_id=$2', [newUid, oldUid]);
    for (const r of rows) {
      await query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2)', [newUid, r.role_id]);
    }
    await query('COMMIT');
  } catch (err) {
    await query('ROLLBACK');
    throw err;
  }
}

export async function deleteUser(userId) {
  const uid = normalizeUserId(userId);
  const { rows } = await query(
    'DELETE FROM "user" WHERE user_id=$1 RETURNING *',
    [uid]
  );
  return rows[0];
}

// Hapus field WhatsApp untuk semua user yang nomornya terdapat pada adminWAList
export async function clearUsersWithAdminWA(adminWAList) {
  if (!adminWAList || adminWAList.length === 0) return [];
  const { rows } = await query(
    "UPDATE \"user\" SET whatsapp = '' WHERE whatsapp = ANY($1::text[]) RETURNING user_id",
    [adminWAList]
  );
  return rows;
}

// --- Alias for backward compatibility ---
export const findUsersByClientId = getUsersByClient;
export const findUserByWA = findUserByWhatsApp;
