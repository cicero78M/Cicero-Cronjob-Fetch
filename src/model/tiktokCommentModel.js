import { query } from '../repository/db.js';
import { buildPriorityOrderClause } from '../utils/sqlPriority.js';

const DEFAULT_ACTIVITY_START = '2025-09-01';

function normalizeUsername(uname) {
  if (typeof uname !== 'string' || uname.length === 0) return null;
  const lower = uname.toLowerCase();
  return lower.startsWith('@') ? lower : `@${lower}`;
}

function normalizeUsernameForSearch(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^@+/, '').toLowerCase();
}

function toTimestampParam(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const time = value.getTime();
    if (Number.isNaN(time)) return null;
    return value.toISOString();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
    return null;
  }
  return date.toISOString();
}

function normalizeUsernamePayload(payload) {
  if (Array.isArray(payload)) {
    return payload.map((val) => normalizeUsername(val)).filter(Boolean);
  }
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      if (Array.isArray(parsed)) {
        return parsed.map((val) => normalizeUsername(val)).filter(Boolean);
      }
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Simpan/Update komentar TikTok untuk video tertentu.
 * Yang disimpan ke DB: hanya array username unik (string) dengan awalan "@",
 * bukan objek komentar.
 * @param {string} video_id - ID video TikTok
 * @param {Array} commentsArr - Array of comment objects dari API
 */
export async function upsertTiktokComments(video_id, commentsArr) {
  // Ambil username dari commentsArr (prioritas: user.unique_id, fallback: username)
  const usernames = [];
  for (const c of commentsArr) {
    let uname = null;
    if (c && c.user && typeof c.user.unique_id === "string") {
      uname = c.user.unique_id;
    } else if (c && typeof c.username === "string") {
      uname = c.username;
    }
    const normalized = normalizeUsername(uname);
    if (normalized) usernames.push(normalized);
  }
  // Unikkan username (no duplicate)
  const uniqUsernames = [...new Set(usernames)];

  // Gabungkan dengan yang sudah ada (jika ada di DB)
  const qSelect = `SELECT comments FROM tiktok_comment WHERE video_id = $1`;
  const res = await query(qSelect, [video_id]);
  let existing = [];
  if (res.rows[0] && Array.isArray(res.rows[0].comments)) {
    existing = res.rows[0].comments
      .map((u) => normalizeUsername(u))
      .filter(Boolean);
  }
  // Merge dan unikkan lagi
  const finalUsernames = [...new Set([...existing, ...uniqUsernames])];

  // Upsert ke DB (hanya username array!)
  const qUpsert = `
    INSERT INTO tiktok_comment (video_id, comments, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (video_id)
    DO UPDATE SET comments = $2, updated_at = NOW()
  `;
  await query(qUpsert, [video_id, JSON.stringify(finalUsernames)]);
}

/**
 * Ambil array username yang berkomentar untuk video tertentu.
 * @param {string} video_id - ID video TikTok
 * @returns {Object} { comments: [username, ...] }
 */
export async function getCommentsByVideoId(video_id) {
  const q = `SELECT comments FROM tiktok_comment WHERE video_id = $1`;
  const res = await query(q, [video_id]);
  return res.rows[0] ? { comments: res.rows[0].comments } : { comments: [] };
}

/**
 * Hapus komentar TikTok untuk video tertentu.
 * @param {string} video_id
 * @returns {Promise<number>} jumlah baris yang dihapus
 */
export async function deleteCommentsByVideoId(video_id) {
  const normalizedVideoId = (video_id || "").trim();
  if (!normalizedVideoId) {
    return 0;
  }
  const res = await query(
    `DELETE FROM tiktok_comment WHERE video_id = $1`,
    [normalizedVideoId]
  );
  return res.rowCount || 0;
}

export async function hasUserCommentedBetween(
  username,
  startDate = DEFAULT_ACTIVITY_START,
  endDate,
  clientId
) {
  const normalized = normalizeUsernameForSearch(username);
  if (!normalized) return 0;

  const startParam = toTimestampParam(startDate) || DEFAULT_ACTIVITY_START;
  const endParam = toTimestampParam(endDate);
  const params = [normalized, startParam, endParam];

  let clientParamIndex = null;
  if (clientId) {
    clientParamIndex = params.push(clientId);
  }

  const queryText = `
    SELECT COUNT(DISTINCT c.video_id) AS total_activity
    FROM tiktok_comment c
    JOIN tiktok_post p ON p.video_id = c.video_id
    JOIN LATERAL (
      SELECT lower(replace(trim(raw_username), '@', '')) AS username
      FROM jsonb_array_elements_text(COALESCE(c.comments, '[]'::jsonb)) AS raw(raw_username)
    ) AS commenter ON commenter.username = $1
    WHERE (p.created_at AT TIME ZONE 'Asia/Jakarta') BETWEEN $2::timestamptz AND COALESCE($3::timestamptz, NOW())
      ${clientParamIndex ? `AND LOWER(p.client_id) = LOWER($${clientParamIndex})` : ''}
  `;

  const { rows } = await query(queryText, params);
  const total = Number(rows[0]?.total_activity || 0);
  return Number.isFinite(total) ? total : 0;
}

export const findByVideoId = getCommentsByVideoId;

/**
 * Simpan snapshot komentar TikTok ke tabel audit.
 *
 * @param {Object} params
 * @param {string} params.video_id - ID video TikTok.
 * @param {Array<string>} params.usernames - Hasil normalize username komentar.
 * @param {string|Date} params.snapshotWindowStart - Awal jendela snapshot.
 * @param {string|Date} params.snapshotWindowEnd - Akhir jendela snapshot.
 * @param {string|Date} [params.capturedAt=new Date()] - Timestamp penyimpanan snapshot.
 * @returns {Promise<number>} rowCount insert (0 jika parameter tidak lengkap).
 */
export async function saveCommentSnapshotAudit({
  video_id,
  usernames = [],
  snapshotWindowStart,
  snapshotWindowEnd,
  capturedAt = new Date(),
}) {
  const startParam = toTimestampParam(snapshotWindowStart);
  const endParam = toTimestampParam(snapshotWindowEnd);
  const capturedParam = toTimestampParam(capturedAt) || new Date().toISOString();
  if (!video_id || !startParam || !endParam) {
    return 0;
  }
  const normalizedUsernames = Array.isArray(usernames)
    ? usernames.filter(Boolean)
    : [];
  const result = await query(
    `INSERT INTO tiktok_comment_audit (video_id, usernames, snapshot_window_start, snapshot_window_end, captured_at)
     VALUES ($1, $2, $3::timestamptz, $4::timestamptz, $5::timestamptz)`,
    [video_id, JSON.stringify(normalizedUsernames), startParam, endParam, capturedParam]
  );
  return result.rowCount || 0;
}

/**
 * Ambil snapshot audit komentar TikTok berdasarkan jendela waktu tertentu.
 *
 * @param {Array<string>} videoIds - Daftar video_id target.
 * @param {string|Date} snapshotWindowStart - Awal jendela snapshot.
 * @param {string|Date} snapshotWindowEnd - Akhir jendela snapshot.
 * @returns {Promise<Array<{video_id: string, usernames: Array<string>}>>}
 */
export async function getLatestCommentAuditByWindow(
  videoIds,
  snapshotWindowStart,
  snapshotWindowEnd
) {
  if (!Array.isArray(videoIds) || videoIds.length === 0) return [];
  const startParam = toTimestampParam(snapshotWindowStart);
  const endParam = toTimestampParam(snapshotWindowEnd);
  if (!startParam || !endParam) return [];

  const { rows } = await query(
    `
    SELECT DISTINCT ON (video_id)
      video_id,
      usernames,
      snapshot_window_start,
      snapshot_window_end,
      captured_at
    FROM tiktok_comment_audit
    WHERE video_id = ANY($1)
      AND snapshot_window_start = $2::timestamptz
      AND snapshot_window_end = $3::timestamptz
    ORDER BY video_id, captured_at DESC
    `,
    [videoIds, startParam, endParam]
  );

  return rows.map((row) => ({
    video_id: row.video_id,
    usernames: normalizeUsernamePayload(row.usernames),
    snapshot_window_start: row.snapshot_window_start,
    snapshot_window_end: row.snapshot_window_end,
    captured_at: row.captured_at,
  }));
}


export async function getRekapKomentarByClient(
  client_id,
  periode = "harian",
  tanggal,
  start_date,
  end_date,
  role,
  options = {}
) {
  const roleLower = typeof role === 'string' ? role.toLowerCase() : null;
  const hasOption = (key) =>
    Object.prototype.hasOwnProperty.call(options, key);
  const postClientIdOverride = hasOption('postClientId')
    ? options.postClientId
    : undefined;
  const userClientIdOverride = hasOption('userClientId')
    ? options.userClientId
    : undefined;
  const userRoleFilterOverride = hasOption('userRoleFilter')
    ? options.userRoleFilter
    : undefined;
  const includePostRoleFilterOverride = hasOption('includePostRoleFilter')
    ? options.includePostRoleFilter
    : undefined;
  const postRoleFilterNameOverride = hasOption('postRoleFilterName')
    ? options.postRoleFilterName
    : undefined;
  const regionalIdOverride = hasOption('regionalId')
    ? options.regionalId
    : null;
  const usesOverrides = [
    postClientIdOverride,
    userClientIdOverride,
    userRoleFilterOverride,
    includePostRoleFilterOverride,
    postRoleFilterNameOverride,
  ].some((value) => value !== undefined);

  let clientType = null;
  if (!usesOverrides) {
    const clientTypeRes = await query(
      "SELECT client_type FROM clients WHERE client_id = $1",
      [client_id]
    );
    clientType = clientTypeRes.rows[0]?.client_type?.toLowerCase() || null;
  }

  const params = [];
  const addParam = (value) => {
    params.push(value);
    return params.length;
  };
  const normalizedRegionalId = regionalIdOverride
    ? String(regionalIdOverride).trim().toUpperCase()
    : null;
  const regionalParamIdx = normalizedRegionalId
    ? addParam(normalizedRegionalId)
    : null;
  let tanggalFilter =
    "__DATE_FIELD__::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date";
  if (start_date && end_date) {
    const startIdx = addParam(start_date);
    const endIdx = addParam(end_date);
    tanggalFilter = `(__DATE_FIELD__)::date BETWEEN $${startIdx}::date AND $${endIdx}::date`;
  } else if (periode === "semua") {
    tanggalFilter = "1=1";
  } else if (periode === "mingguan") {
    if (tanggal) {
      const idx = addParam(tanggal);
      tanggalFilter = `date_trunc('week', __DATE_FIELD__) = date_trunc('week', $${idx}::date)`;
    } else {
      tanggalFilter = "date_trunc('week', __DATE_FIELD__) = date_trunc('week', NOW())";
    }
  } else if (periode === "bulanan") {
    if (tanggal) {
      const monthDate = tanggal.length === 7 ? `${tanggal}-01` : tanggal;
      const idx = addParam(monthDate);
      tanggalFilter = `date_trunc('month', __DATE_FIELD__) = date_trunc('month', $${idx}::date)`;
    } else {
      tanggalFilter =
        "date_trunc('month', __DATE_FIELD__) = date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta')";
    }
  } else if (tanggal) {
    const idx = addParam(tanggal);
    tanggalFilter = `__DATE_FIELD__::date = $${idx}::date`;
  }

  const commentDateField = "(c.updated_at AT TIME ZONE 'Asia/Jakarta')";
  const postDateField = "(p.created_at AT TIME ZONE 'Asia/Jakarta')";
  const commentTanggalFilter = tanggalFilter.replaceAll(
    "__DATE_FIELD__",
    commentDateField
  );
  const postTanggalFilter = tanggalFilter.replaceAll(
    "__DATE_FIELD__",
    postDateField
  );

  let resolvedPostClientId = postClientIdOverride;
  let resolvedUserClientId = userClientIdOverride;
  let resolvedUserRole = userRoleFilterOverride;
  let shouldIncludeRoleFilter = includePostRoleFilterOverride;
  let resolvedPostRoleName = postRoleFilterNameOverride;
  let postRoleFilterMode = 'match_role';

  if (!usesOverrides) {
    const effectiveRole = (roleLower || String(client_id || "")).toLowerCase();
    if (clientType === "direktorat") {
      resolvedPostClientId = null;
      resolvedUserClientId = null;
      resolvedUserRole = effectiveRole;
      shouldIncludeRoleFilter = effectiveRole === "ditbinmas";
      resolvedPostRoleName = shouldIncludeRoleFilter ? effectiveRole : null;
    } else if (roleLower && roleLower !== "operator") {
      resolvedPostClientId = client_id;
      resolvedUserClientId = client_id;
      resolvedUserRole = roleLower;
      shouldIncludeRoleFilter = roleLower === "ditbinmas";
      resolvedPostRoleName = shouldIncludeRoleFilter ? roleLower : null;
      if (roleLower === "ditbinmas") {
        postRoleFilterMode = 'include_unscoped';
      }
    } else {
      resolvedPostClientId = client_id;
      resolvedUserClientId = client_id;
      resolvedUserRole = null;
      shouldIncludeRoleFilter = false;
      resolvedPostRoleName = null;
    }
  } else {
    resolvedPostClientId =
      postClientIdOverride !== undefined ? postClientIdOverride : client_id;
    resolvedUserClientId =
      userClientIdOverride !== undefined ? userClientIdOverride : client_id;
    resolvedUserRole =
      userRoleFilterOverride !== undefined ? userRoleFilterOverride : null;
    shouldIncludeRoleFilter =
      includePostRoleFilterOverride !== undefined
        ? includePostRoleFilterOverride
        : false;
    resolvedPostRoleName =
      postRoleFilterNameOverride !== undefined
        ? postRoleFilterNameOverride
        : shouldIncludeRoleFilter
          ? resolvedUserRole
          : null;
  }

  let postClientFilter = "1=1";
  if (resolvedPostClientId) {
    const postClientIdx = addParam(resolvedPostClientId);
    postClientFilter = `LOWER(p.client_id) = LOWER($${postClientIdx})`;
  }

  const baseUserClientId = resolvedUserClientId ?? client_id;
  let resolvedUserClientType = clientType;
  if (!resolvedUserClientType && baseUserClientId) {
    const clientTypeRes = await query(
      'SELECT client_type FROM clients WHERE client_id = $1',
      [baseUserClientId]
    );
    resolvedUserClientType =
      clientTypeRes.rows[0]?.client_type?.toLowerCase() || null;
  }

  const allowedRoles = [
    'ditbinmas',
    'ditlantas',
    'bidhumas',
    'ditsamapta',
    'operator',
  ];

  let userWhere = "1=1";
  if (resolvedUserClientType === 'direktorat') {
    const roleName = resolvedUserRole || baseUserClientId;
    if (roleName) {
      const roleParamIndex = addParam(roleName);
      userWhere = `EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON ur.role_id = r.role_id
        WHERE ur.user_id = u.user_id AND r.role_name = $${roleParamIndex}
      )`;
    }
  } else if (baseUserClientId) {
    const userClientIdx = addParam(baseUserClientId);
    userWhere = `(LOWER(u.client_id) = LOWER($${userClientIdx}) OR EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      WHERE ur.user_id = u.user_id AND r.role_name = $${userClientIdx}
    ))`;

    if (
      resolvedUserRole &&
      allowedRoles.includes(String(resolvedUserRole).toLowerCase())
    ) {
      const roleParamIndex = addParam(resolvedUserRole);
      userWhere += ` AND EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON ur.role_id = r.role_id
        WHERE ur.user_id = u.user_id AND LOWER(r.role_name) = LOWER($${roleParamIndex})
      )`;
    }
  }

  if (regionalParamIdx !== null) {
    const regionalFilter = `UPPER(cl.regional_id) = UPPER($${regionalParamIdx})`;
    userWhere = userWhere === "1=1"
      ? regionalFilter
      : `${userWhere} AND ${regionalFilter}`;
  }

  let postRoleJoin = "";
  let postRoleFilter = "";
  let postRegionalJoin = "";
  let postRegionalFilter = "";
  if (shouldIncludeRoleFilter && resolvedPostRoleName) {
    const roleParamIndex = addParam(resolvedPostRoleName);
    postRoleJoin = `LEFT JOIN tiktok_post_roles pr
      ON pr.video_id = p.video_id
     AND LOWER(pr.role_name) = LOWER($${roleParamIndex})`;
    if (postRoleFilterMode === 'include_unscoped') {
      postRoleFilter = `AND (
        pr.video_id IS NOT NULL
        OR NOT EXISTS (
          SELECT 1 FROM tiktok_post_roles pr_all WHERE pr_all.video_id = p.video_id
        )
      )`;
    } else {
      const roleFilterCondition =
        `LOWER(p.client_id) = LOWER($${roleParamIndex}) OR LOWER(pr.role_name) = LOWER($${roleParamIndex})`;
      postRoleFilter = `AND (${roleFilterCondition})`;
    }
  }
  if (normalizedRegionalId) {
    const regionalIdx = addParam(normalizedRegionalId);
    postRegionalJoin = 'JOIN clients cp ON cp.client_id = p.client_id';
    postRegionalFilter = `AND UPPER(cp.regional_id) = UPPER($${regionalIdx})`;
  }

  const commentParams = [...params];
  const addPriorityParam = value => {
    commentParams.push(value);
    return commentParams.length;
  };
  const { priorityCase, fallbackRank } = buildPriorityOrderClause('u.nama', addPriorityParam);
  const priorityExpr = `(${priorityCase})`;

  const { rows } = await query(
    `WITH valid_comments AS (
      SELECT c.video_id,
             c.updated_at,
             lower(replace(trim(cmt), '@', '')) AS username
      FROM tiktok_comment c
      JOIN tiktok_post p ON p.video_id = c.video_id
      ${postRegionalJoin}
      ${postRoleJoin}
      JOIN LATERAL jsonb_array_elements_text(c.comments) cmt ON TRUE
      WHERE ${postClientFilter}
        ${postRoleFilter}
        ${postRegionalFilter}
        AND ${commentTanggalFilter}
    ),
    total_posts AS (
      SELECT COUNT(DISTINCT p.video_id) AS total_konten
      FROM tiktok_post p
      ${postRegionalJoin}
      ${postRoleJoin}
      WHERE ${postClientFilter}
        ${postRoleFilter}
        ${postRegionalFilter}
        AND ${postTanggalFilter}
    ),
    comment_counts AS (
      SELECT username, COUNT(DISTINCT video_id) AS jumlah_komentar
      FROM valid_comments
      GROUP BY username
    )
    SELECT
      u.client_id,
      u.user_id,
      u.title,
      u.nama,
      u.tiktok AS username,
      u.divisi,
      cl.nama AS client_name,
      cl.regional_id,
      COALESCE(cc.jumlah_komentar, 0) AS jumlah_komentar,
      tp.total_konten
    FROM "user" u
    JOIN clients cl ON cl.client_id = u.client_id
    LEFT JOIN comment_counts cc
      ON lower(replace(trim(coalesce(u.tiktok, '')), '@', '')) = cc.username
    CROSS JOIN total_posts tp
    WHERE u.status = true
      AND ${userWhere}
    ORDER BY
      ${priorityExpr} ASC,
      CASE WHEN ${priorityExpr} = ${fallbackRank} THEN UPPER(u.nama) END ASC,
      jumlah_komentar DESC,
      UPPER(u.nama) ASC`,
    commentParams
  );
  for (const user of rows) {
    user.jumlah_komentar = parseInt(user.jumlah_komentar, 10);
  }

  return rows;
}
