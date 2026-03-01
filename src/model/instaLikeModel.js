// src/model/instaLikeModel.js
import { query } from '../repository/db.js';
import { buildPriorityOrderClause } from '../utils/sqlPriority.js';

const DEFAULT_ACTIVITY_START = '2025-09-01';

function normalizeLikeUsername(value) {
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

function normalizeLikeUsernamesPayload(payload) {
  if (Array.isArray(payload)) {
    return payload.map((val) => normalizeLikeUsername(val)).filter(Boolean);
  }
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      if (Array.isArray(parsed)) {
        return parsed.map((val) => normalizeLikeUsername(val)).filter(Boolean);
      }
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Upsert (insert/update) daftar username likes untuk sebuah shortcode.
 * Disarankan kolom likes bertipe JSONB.
 */
export async function upsertInstaLike(shortcode, likes) {
  const result = await query(
    `INSERT INTO insta_like (shortcode, likes, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (shortcode) DO UPDATE
     SET likes = EXCLUDED.likes, updated_at = NOW()`,
    [shortcode, JSON.stringify(likes)]
  );
  return result.rowCount;
}

/**
 * Mendapatkan array username likes dari database untuk 1 shortcode.
 * Otomatis handle jika likes berupa jsonb atau text (akan di-parse).
 * Return: array of username (jika belum ada, array kosong)
 */
export async function getLikeUsernamesByShortcode(shortcode) {
  const res = await query('SELECT likes FROM insta_like WHERE shortcode = $1', [shortcode]);
  if (res.rows.length === 0) return [];
  const rawLikes = res.rows[0].likes;
  if (!rawLikes) return [];

  // pastikan selalu array terlebih dahulu
  let likesArr = rawLikes;
  if (typeof rawLikes === 'string') {
    try {
      likesArr = JSON.parse(rawLikes);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(likesArr)) return [];

  // dukung format lama (array string) dan baru (array objek)
  return likesArr
    .map(l => {
      if (typeof l === 'string') return l;
      if (l && typeof l === 'object') return l.username || null;
      return null;
    })
    .filter(Boolean);
}

/**
 * Hapus data likes berdasarkan shortcode (optional, untuk sinkronisasi)
 */
export async function deleteInstaLikeByShortcode(shortcode) {
  const result = await query('DELETE FROM insta_like WHERE shortcode = $1', [shortcode]);
  return result.rowCount;
}

/**
 * (Optional) Ambil semua shortcode likes yang diupdate hari ini
 */
export async function getAllShortcodesToday() {
  const res = await query(
    `SELECT shortcode FROM insta_like WHERE (updated_at AT TIME ZONE 'Asia/Jakarta')::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date`
  );
  return res.rows.map(r => r.shortcode);
}


export async function getLikesByShortcode(shortcode) {
  // alias untuk backward compatibility
  return getLikeUsernamesByShortcode(shortcode);
}

/**
 * Simpan snapshot hasil fetch likes ke tabel audit tanpa memengaruhi tabel utama.
 *
 * @param {Object} params
 * @param {string} params.shortcode - Shortcode konten Instagram.
 * @param {Array<string>} params.usernames - Daftar username hasil fetch setelah dinormalisasi.
 * @param {string|Date} params.snapshotWindowStart - Awal jendela waktu (timestamptz).
 * @param {string|Date} params.snapshotWindowEnd - Akhir jendela waktu (timestamptz).
 * @param {string|Date} [params.capturedAt=new Date()] - Timestamp penyimpanan snapshot.
 * @returns {Promise<number>} rowCount hasil insert (0 jika parameter kurang lengkap).
 */
export async function saveLikeSnapshotAudit({
  shortcode,
  usernames = [],
  snapshotWindowStart,
  snapshotWindowEnd,
  capturedAt = new Date(),
}) {
  const startParam = toTimestampParam(snapshotWindowStart);
  const endParam = toTimestampParam(snapshotWindowEnd);
  const capturedParam = toTimestampParam(capturedAt) || new Date().toISOString();
  if (!shortcode || !startParam || !endParam) {
    return 0;
  }
  const normalizedUsernames = Array.isArray(usernames)
    ? usernames.filter(Boolean)
    : [];
  const result = await query(
    `INSERT INTO insta_like_audit (shortcode, usernames, snapshot_window_start, snapshot_window_end, captured_at)
     VALUES ($1, $2, $3::timestamptz, $4::timestamptz, $5::timestamptz)`,
    [shortcode, JSON.stringify(normalizedUsernames), startParam, endParam, capturedParam]
  );
  return result.rowCount || 0;
}

/**
 * Ambil snapshot audit terbaru untuk kumpulan shortcode pada rentang tertentu.
 * Jika kombinasi start/end tidak valid, fungsi akan mengembalikan array kosong.
 *
 * @param {Array<string>} shortcodes - Daftar shortcode yang ingin diambil snapshot-nya.
 * @param {string|Date} snapshotWindowStart - Awal jendela waktu.
 * @param {string|Date} snapshotWindowEnd - Akhir jendela waktu.
 * @returns {Promise<Array<{shortcode: string, usernames: Array<string>}>>}
 */
export async function getLatestLikeAuditByWindow(
  shortcodes,
  snapshotWindowStart,
  snapshotWindowEnd
) {
  if (!Array.isArray(shortcodes) || shortcodes.length === 0) return [];
  const startParam = toTimestampParam(snapshotWindowStart);
  const endParam = toTimestampParam(snapshotWindowEnd);
  if (!startParam || !endParam) return [];

  const { rows } = await query(
    `
    SELECT DISTINCT ON (shortcode)
      shortcode,
      usernames,
      snapshot_window_start,
      snapshot_window_end,
      captured_at
    FROM insta_like_audit
    WHERE shortcode = ANY($1)
      AND snapshot_window_start = $2::timestamptz
      AND snapshot_window_end = $3::timestamptz
    ORDER BY shortcode, captured_at DESC
    `,
    [shortcodes, startParam, endParam]
  );

  return rows.map((row) => ({
    shortcode: row.shortcode,
    usernames: normalizeLikeUsernamesPayload(row.usernames),
    snapshot_window_start: row.snapshot_window_start,
    snapshot_window_end: row.snapshot_window_end,
    captured_at: row.captured_at,
  }));
}

export async function hasUserLikedBetween(
  username,
  startDate = DEFAULT_ACTIVITY_START,
  endDate,
  clientId
) {
  const normalized = normalizeLikeUsername(username);
  if (!normalized) return 0;

  const startParam = toTimestampParam(startDate) || DEFAULT_ACTIVITY_START;
  const endParam = toTimestampParam(endDate);
  const params = [normalized, startParam, endParam];

  let clientParamIndex = null;
  if (clientId) {
    clientParamIndex = params.push(clientId);
  }

  const queryText = `
    SELECT COUNT(DISTINCT p.shortcode) AS total_activity
    FROM insta_like l
    JOIN insta_post p ON p.shortcode = l.shortcode
    ${clientParamIndex ? 'JOIN insta_post_clients pc ON pc.shortcode = p.shortcode' : ''}
    JOIN LATERAL (
      SELECT lower(replace(trim(
        COALESCE(elem->>'username', trim(both '"' FROM elem::text))
      ), '@', '')) AS username
      FROM jsonb_array_elements(COALESCE(l.likes, '[]'::jsonb)) AS elem
    ) AS liked ON liked.username = $1
    WHERE (p.created_at AT TIME ZONE 'Asia/Jakarta') BETWEEN $2::timestamptz AND COALESCE($3::timestamptz, NOW())
      ${clientParamIndex ? `AND LOWER(pc.client_id) = LOWER($${clientParamIndex})` : ''}
  `;

  const { rows } = await query(queryText, params);
  const total = Number(rows[0]?.total_activity || 0);
  return Number.isFinite(total) ? total : 0;
}

/**
 * Rekap likes IG per user, per hari/bulan ini
 * @param {string} client_id
 * @param {string} periode "harian"|"bulanan"
 * @param {Object} options
 * @param {boolean} [options.officialAccountsOnly=false] Batasi konten ke akun Instagram official klien.
 * @returns {Promise<Array>}
 */

export async function getRekapLikesByClient(
  client_id,
  periode = "harian",
  tanggal,
  start_date,
  end_date,
  role,
  options = {}
) {
  const roleLower = role ? role.toLowerCase() : null;
  const {
    postClientId: postClientIdOverride = null,
    userClientId: userClientIdOverride = null,
    userRoleFilter = null,
    includePostRoleFilter = null,
    postRoleFilterName = null,
    matchLikeClientId = true,
    officialAccountsOnly = false,
    regionalId = null,
  } = options;
  const normalizedRegionalId = regionalId
    ? String(regionalId).trim().toUpperCase()
    : null;
  const params = [];
  const addParam = value => {
    params.push(value);
    return params.length;
  };
  const postParams = [];
  const addPostParam = value => {
    postParams.push(value);
    return postParams.length;
  };

  const shouldIncludeRoleFilter =
    includePostRoleFilter !== null ? includePostRoleFilter : roleLower === 'ditbinmas';
  const resolvedPostRoleName =
    postRoleFilterName ?? (roleLower === 'ditbinmas' ? roleLower : null);
  const resolvedPostClientId =
    postClientIdOverride ?? (roleLower === 'ditbinmas' ? null : client_id);
  const resolvedUserClientId =
    userClientIdOverride ?? (roleLower === 'ditbinmas' ? null : client_id);
  const resolvedUserRole =
    userRoleFilter ?? (roleLower === 'ditbinmas' ? roleLower : null);

  let userClientParamIdx = null;
  if (resolvedUserClientId) {
    userClientParamIdx = addParam(resolvedUserClientId);
  }
  const regionalParamIdx = normalizedRegionalId
    ? addParam(normalizedRegionalId)
    : null;
  const normalizedPostClientId = resolvedPostClientId
    ? String(resolvedPostClientId).toLowerCase()
    : null;
  const normalizedUserClientId = resolvedUserClientId
    ? String(resolvedUserClientId).toLowerCase()
    : null;
  const sharedClientParamIdx =
    normalizedPostClientId &&
    normalizedUserClientId &&
    normalizedPostClientId === normalizedUserClientId
      ? userClientParamIdx
      : null;
  const hasSharedRoleParam =
    resolvedUserRole &&
    shouldIncludeRoleFilter &&
    resolvedPostRoleName &&
    String(resolvedUserRole).toLowerCase() === String(resolvedPostRoleName).toLowerCase();
  const sharedRoleParamIdx = hasSharedRoleParam ? addParam(resolvedUserRole) : null;

  const buildTanggalFilter = addParamFn => {
    let filter =
      "p.created_at::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date";
    if (start_date && end_date) {
      const startIdx = addParamFn(start_date);
      const endIdx = addParamFn(end_date);
      filter =
        `(p.created_at AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $${startIdx}::date AND $${endIdx}::date`;
    } else if (periode === 'bulanan') {
      if (tanggal) {
        const monthDate = tanggal.length === 7 ? `${tanggal}-01` : tanggal;
        const idx = addParamFn(monthDate);
        filter =
          `date_trunc('month', p.created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', $${idx}::date)`;
      } else {
        filter =
          "date_trunc('month', p.created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta')";
      }
    } else if (periode === 'mingguan') {
      if (tanggal) {
        const idx = addParamFn(tanggal);
        filter =
          `date_trunc('week', p.created_at) = date_trunc('week', $${idx}::date)`;
      } else {
        filter = "date_trunc('week', p.created_at) = date_trunc('week', NOW())";
      }
    } else if (periode === 'semua') {
      filter = '1=1';
    } else if (tanggal) {
      const idx = addParamFn(tanggal);
      filter = `p.created_at::date = $${idx}::date`;
    }
    return filter;
  };

  const tanggalFilter = buildTanggalFilter(addParam);
  const postTanggalFilter = buildTanggalFilter(addPostParam);

  const buildPostFilters = (
    addParamFn,
    sharedClientIdx = null,
    sharedRoleIdx = null,
    useOfficialAccounts = false
  ) => {
    let postClientFilter = '1=1';
    let postClientJoin = '';
    let postRoleJoin = '';
    let postRoleFilter = '';
    let postRegionalJoin = '';
    let postRegionalFilter = '';
    let postOfficialJoin = '';
    let postOfficialFilter = '';

    if (resolvedPostClientId) {
      const postClientIdx =
        sharedClientIdx ?? addParamFn(resolvedPostClientId);
      postClientJoin = 'JOIN insta_post_clients pc ON pc.shortcode = p.shortcode';
      postClientFilter = `LOWER(pc.client_id) = LOWER($${postClientIdx})`;
    }

    if (shouldIncludeRoleFilter && resolvedPostRoleName) {
      const roleIdx = sharedRoleIdx ?? addParamFn(resolvedPostRoleName);
      const roleFilterCondition =
        `LOWER(pc.client_id) = LOWER($${roleIdx}) OR LOWER(pr.role_name) = LOWER($${roleIdx})`;
      postRoleJoin = 'LEFT JOIN insta_post_roles pr ON pr.shortcode = p.shortcode';
      postRoleFilter = `AND (${roleFilterCondition})`;
      // Ensure junction table is joined if not already
      if (!postClientJoin) {
        postClientJoin = 'LEFT JOIN insta_post_clients pc ON pc.shortcode = p.shortcode';
      }
    }

    if (normalizedRegionalId) {
      const regionalIdx = addParamFn(normalizedRegionalId);
      // Join to clients via junction table if not already joined
      if (!postClientJoin) {
        postClientJoin = 'JOIN insta_post_clients pc ON pc.shortcode = p.shortcode';
      }
      postRegionalJoin = 'JOIN clients cp ON cp.client_id = pc.client_id';
      postRegionalFilter = `AND UPPER(cp.regional_id) = UPPER($${regionalIdx})`;
    }

    if (useOfficialAccounts) {
      // Join via junction table for official accounts
      if (!postClientJoin) {
        postClientJoin = 'JOIN insta_post_clients pc ON pc.shortcode = p.shortcode';
      }
      postOfficialJoin = `
      JOIN satbinmas_official_media som
        ON som.code = p.shortcode
       AND LOWER(som.client_id) = LOWER(pc.client_id)
      JOIN satbinmas_official_accounts soa
        ON soa.satbinmas_account_id = som.satbinmas_account_id`;
      postOfficialFilter =
        "AND soa.is_active = TRUE AND LOWER(soa.platform) = 'instagram'";
    }

    return {
      postClientFilter,
      postClientJoin,
      postRoleJoin,
      postRoleFilter,
      postRegionalJoin,
      postRegionalFilter,
      postOfficialJoin,
      postOfficialFilter,
    };
  };

  const {
    postClientFilter,
    postClientJoin,
    postRoleJoin: postRoleJoinLikes,
    postRoleFilter,
    postRegionalJoin: postRegionalJoinLikes,
    postRegionalFilter: postRegionalFilterLikes,
    postOfficialJoin: postOfficialJoinLikes,
    postOfficialFilter: postOfficialFilterLikes,
  } = buildPostFilters(
    addParam,
    sharedClientParamIdx,
    sharedRoleParamIdx,
    officialAccountsOnly
  );
  const {
    postClientFilter: postClientFilterPosts,
    postClientJoin: postClientJoinPosts,
    postRoleJoin: postRoleJoinPosts,
    postRoleFilter: postRoleFilterPosts,
    postRegionalJoin: postRegionalJoinPosts,
    postRegionalFilter: postRegionalFilterPosts,
    postOfficialJoin: postOfficialJoinPosts,
    postOfficialFilter: postOfficialFilterPosts,
  } = buildPostFilters(addPostParam, null, null, officialAccountsOnly);

  let userWhere = '1=1';
  let likeCountsSelect = `
    SELECT username, client_id, COUNT(DISTINCT shortcode) AS jumlah_like
    FROM valid_likes
    GROUP BY username, client_id
  `;
  let likeJoin = `
    lower(replace(trim(u.insta), '@', '')) = lc.username
    AND LOWER(u.client_id) = LOWER(lc.client_id)
  `;
  if (userClientParamIdx !== null) {
    userWhere = `LOWER(u.client_id) = LOWER($${userClientParamIdx})`;
  }
  if (userClientParamIdx === null || !matchLikeClientId) {
    likeJoin = "lower(replace(trim(u.insta), '@', '')) = lc.username";
    likeCountsSelect = `
      SELECT username, COUNT(DISTINCT shortcode) AS jumlah_like
      FROM valid_likes
      GROUP BY username
    `;
  }

  if (resolvedUserRole || sharedRoleParamIdx) {
    const roleIdx = sharedRoleParamIdx ?? addParam(resolvedUserRole);
    const roleFilterCondition = `EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      WHERE ur.user_id = u.user_id AND LOWER(r.role_name) = LOWER($${roleIdx})
    )`;
    userWhere = userWhere === '1=1'
      ? roleFilterCondition
      : `${userWhere} AND ${roleFilterCondition}`;
  }

  if (regionalParamIdx !== null) {
    const regionalFilter = `UPPER(c.regional_id) = UPPER($${regionalParamIdx})`;
    userWhere = userWhere === '1=1'
      ? regionalFilter
      : `${userWhere} AND ${regionalFilter}`;
  }

  

  const likeParams = [...params];
  const addPriorityParam = value => {
    likeParams.push(value);
    return likeParams.length;
  };
  const { priorityCase, fallbackRank } = buildPriorityOrderClause('u.nama', addPriorityParam);
  const priorityExpr = `(${priorityCase})`;

  const { rows } = await query(`
    WITH valid_likes AS (
      SELECT
        l.shortcode,
        p.created_at,
        pc.client_id,
        lower(replace(trim(lk.username), '@', '')) AS username
      FROM insta_like l
      JOIN insta_post p ON p.shortcode = l.shortcode
      ${postClientJoin}
      ${postRegionalJoinLikes}
      ${postRoleJoinLikes}
      ${postOfficialJoinLikes}
      JOIN LATERAL (
        SELECT COALESCE(elem->>'username', trim(both '"' FROM elem::text)) AS username
        FROM jsonb_array_elements(l.likes) AS elem
      ) AS lk ON TRUE
      WHERE ${postClientFilter}
        ${postRoleFilter}
        ${postRegionalFilterLikes}
        ${postOfficialFilterLikes}
        AND ${tanggalFilter}
    ),
    like_counts AS (
      ${likeCountsSelect}
    )
    SELECT
      u.user_id,
      u.title,
      u.nama,
      u.insta AS username,
      u.divisi,
      u.exception,
      u.client_id,
      c.nama AS client_name,
      c.regional_id AS regional_id,
      COALESCE(lc.jumlah_like, 0) AS jumlah_like
    FROM "user" u
    JOIN clients c ON c.client_id = u.client_id
    LEFT JOIN like_counts lc
      ON ${likeJoin}
    WHERE u.status = true
      AND ${userWhere}
    ORDER BY
      ${priorityExpr} ASC,
      CASE WHEN ${priorityExpr} = ${fallbackRank} THEN UPPER(u.nama) END ASC,
      jumlah_like DESC,
      UPPER(u.nama) ASC
  `, likeParams);

  for (const user of rows) {
    user.jumlah_like = parseInt(user.jumlah_like, 10);
  }

  const { rows: postRows } = await query(
    `WITH posts AS (
      SELECT p.shortcode
      FROM insta_post p
      ${postClientJoinPosts}
      ${postRegionalJoinPosts}
      ${postRoleJoinPosts}
      ${postOfficialJoinPosts}
      WHERE ${postClientFilterPosts}
        ${postRoleFilterPosts}
        ${postRegionalFilterPosts}
        ${postOfficialFilterPosts}
        AND ${postTanggalFilter}
    )
    SELECT COUNT(DISTINCT shortcode) AS total_post FROM posts`,
    postParams
  );
  const totalKonten = parseInt(postRows[0]?.total_post || '0', 10);

  return { rows, totalKonten };
}
