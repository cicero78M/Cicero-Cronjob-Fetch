// src/model/tiktokPostModel.js
import { query } from '../repository/db.js';

function normalizeClientId(id) {
  return typeof id === "string" ? id.trim().toLowerCase() : id;
}

function toInteger(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.trunc(numeric);
}

function resolveJakartaDate(referenceDate) {
  const baseDate = referenceDate ? new Date(referenceDate) : new Date();
  const validDate = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate;
  return validDate.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

function normalizeUtcCreatedAt(input) {
  if (!input) return null;
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function jakartaDateCast(columnAlias = "created_at") {
  return `(${columnAlias} AT TIME ZONE 'Asia/Jakarta')`;
}

/**
 * Ambil satu post TikTok berdasarkan video_id.
 * @param {string} video_id
 * @returns {Promise<object|null>}
 */
export async function findPostByVideoId(video_id) {
  const normalizedVideoId = (video_id || "").trim();
  if (!normalizedVideoId) {
    return null;
  }
  const { rows } = await query(
    `SELECT * FROM tiktok_post WHERE video_id = $1 LIMIT 1`,
    [normalizedVideoId]
  );
  return rows[0] || null;
}

/**
 * Hapus post TikTok berdasarkan video_id.
 * Mengembalikan jumlah baris yang dihapus.
 * @param {string} video_id
 * @returns {Promise<number>}
 */
export async function deletePostByVideoId(video_id) {
  const normalizedVideoId = (video_id || "").trim();
  if (!normalizedVideoId) {
    return 0;
  }
  const res = await query(
    `DELETE FROM tiktok_post WHERE video_id = $1`,
    [normalizedVideoId]
  );
  return res.rowCount || 0;
}

/**
 * Simpan/update satu atau banyak post TikTok (array of objects)
 * @param {string} client_id
 * @param {Array} posts
 */
export async function upsertTiktokPosts(client_id, posts) {
  if (!Array.isArray(posts)) return;
  for (const post of posts) {
    await query(
      `INSERT INTO tiktok_post (client_id, video_id, caption, like_count, comment_count, created_at, original_created_at, source_type)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, NOW()), $7::timestamptz, $8)
       ON CONFLICT (video_id) DO UPDATE
         SET client_id = EXCLUDED.client_id,
             caption = EXCLUDED.caption,
             like_count = EXCLUDED.like_count,
             comment_count = EXCLUDED.comment_count,
             created_at = EXCLUDED.created_at,
             original_created_at = EXCLUDED.original_created_at,
             source_type = EXCLUDED.source_type`,
      [
        client_id,
        post.video_id || post.id,
        post.desc || post.caption || "",
        post.digg_count ?? post.like_count ?? 0,
        post.comment_count ?? 0,
        normalizeUtcCreatedAt(
          post.created_at || post.create_time || post.createTime || null
        ),
        normalizeUtcCreatedAt(
          post.original_created_at || post.create_time || post.createTime || post.timestamp || null
        ),
        post.source_type || 'cron_fetch',
      ]
    );
  }
}

/**
 * Upsert satu post TikTok dan kembalikan status inserted/updated.
 * Menggunakan flag xmax agar kompatibel dengan Postgres terbaru.
 * @param {object} payload
 * @param {string} payload.client_id
 * @param {string} payload.video_id
 * @param {string} [payload.caption]
 * @param {number} [payload.like_count]
 * @param {number} [payload.comment_count]
 * @param {Date|string|number} [payload.created_at]
 * @param {Date|string|number} [payload.original_created_at]
 * @returns {Promise<{ inserted: boolean, updated: boolean }>}
 */
export async function upsertTiktokPostWithStatus({
  client_id,
  video_id,
  caption,
  like_count,
  comment_count,
  created_at,
  original_created_at,
  source_type,
}) {
  const normalizedVideoId = (video_id || "").trim();
  if (!normalizedVideoId) return { inserted: false, updated: false };

  const res = await query(
    `INSERT INTO tiktok_post (client_id, video_id, caption, like_count, comment_count, created_at, original_created_at, source_type)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, NOW()), $7::timestamptz, $8)
     ON CONFLICT (video_id) DO UPDATE
       SET client_id = EXCLUDED.client_id,
           caption = EXCLUDED.caption,
           like_count = EXCLUDED.like_count,
           comment_count = EXCLUDED.comment_count,
           created_at = EXCLUDED.created_at,
           original_created_at = EXCLUDED.original_created_at,
           source_type = EXCLUDED.source_type
     RETURNING xmax = '0'::xid AS inserted`,
    [
      client_id,
      normalizedVideoId,
      caption || "",
      toInteger(like_count) ?? 0,
      toInteger(comment_count) ?? 0,
      normalizeUtcCreatedAt(created_at || null),
      normalizeUtcCreatedAt(original_created_at || null),
      source_type || 'cron_fetch',
    ]
  );

  const inserted = Boolean(res.rows?.[0]?.inserted);
  return { inserted, updated: !inserted };
}

/**
 * Ambil semua TikTok video_id untuk client di hari ini
 * @param {string} client_id
 * @returns {Array} Array of video_id
 */
export async function getVideoIdsTodayByClient(client_id, referenceDate) {
  const targetDate = resolveJakartaDate(referenceDate);
  const normalizedId = normalizeClientId(client_id);
  const res = await query(
    `SELECT video_id FROM tiktok_post
     WHERE LOWER(TRIM(client_id)) = $1
     AND ${jakartaDateCast("created_at")}::date = $2::date`,
    [normalizedId, targetDate]
  );
  return res.rows.map((r) => r.video_id);
}

/**
 * Ambil semua TikTok post (row) hari ini berdasarkan client_id
 * @param {string} client_id
 * @returns {Array} Array of post object
 */
export async function getPostsTodayByClient(client_id, referenceDate) {
  const normalizedId = normalizeClientId(client_id);
  const targetDate = resolveJakartaDate(referenceDate);
  const res = await query(
    `SELECT tp.*, c.client_tiktok as author_username 
     FROM tiktok_post tp
     LEFT JOIN clients c ON tp.client_id = c.client_id
     WHERE LOWER(TRIM(tp.client_id)) = $1 AND ${jakartaDateCast(
      "tp.created_at"
    )}::date = $2::date ORDER BY tp.created_at ASC, tp.video_id ASC`,
    [normalizedId, targetDate]
  );
  return res.rows;
}

/**
 * Ambil semua TikTok post (row) untuk client tanpa filter hari
 * @param {string} client_id
 * @returns {Array} Array of post object
 */
export async function getPostsByClientId(client_id) {
  const normalizedId = normalizeClientId(client_id);
  const res = await query(
    `SELECT * FROM tiktok_post WHERE LOWER(TRIM(client_id)) = $1 ORDER BY created_at DESC`,
    [normalizedId]
  );
  return res.rows;
}

export const findByClientId = getPostsByClientId;

export async function getPostsByClientAndDateRange(client_id, startDate, endDate) {
  if (!client_id) return [];
  if (!startDate || !endDate) return [];

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [];
  }

  const [startBound, endBound] =
    start <= end ? [start, end] : [end, start];

  const startStr = startBound.toLocaleDateString('en-CA', {
    timeZone: 'Asia/Jakarta'
  });
  const endStr = endBound.toLocaleDateString('en-CA', {
    timeZone: 'Asia/Jakarta'
  });

  const normalizedId = normalizeClientId(client_id);
  const res = await query(
    `SELECT * FROM tiktok_post
     WHERE LOWER(TRIM(client_id)) = $1
       AND ${jakartaDateCast("created_at")}::date BETWEEN $2::date AND $3::date
     ORDER BY created_at DESC`,
    [normalizedId, startStr, endStr]
  );
  return res.rows;
}

export async function countPostsByClient(
  client_id,
  periode = 'harian',
  tanggal,
  start_date,
  end_date,
  roleOrOptions,
  scopeOrOptions,
  regionalIdArg
) {
  const options =
    typeof roleOrOptions === 'object' && roleOrOptions !== null && !Array.isArray(roleOrOptions)
      ? roleOrOptions
      : typeof scopeOrOptions === 'object' && scopeOrOptions !== null && !Array.isArray(scopeOrOptions)
        ? { ...scopeOrOptions, role: roleOrOptions }
        : {
            role: roleOrOptions,
            scope: scopeOrOptions,
            regionalId: regionalIdArg,
          };

  const normalizedClientId = client_id ? String(client_id).trim() : null;
  const normalizedRole = options.role ? String(options.role).trim().toLowerCase() : null;
  const normalizedRegionalId = options.regionalId
    ? String(options.regionalId).trim().toUpperCase()
    : null;

  const addDateFilter = (addParamFn) => {
    const jakartaColumn = jakartaDateCast("p.created_at");
    const nowJakarta = "(NOW() AT TIME ZONE 'Asia/Jakarta')";
    let filter = `${jakartaColumn}::date = ${nowJakarta}::date`;
    if (start_date && end_date) {
      const startIdx = addParamFn(start_date);
      const endIdx = addParamFn(end_date);
      filter = `${jakartaColumn}::date BETWEEN ${startIdx}::date AND ${endIdx}::date`;
    } else if (periode === 'semua') {
      filter = '1=1';
    } else if (periode === 'mingguan') {
      if (tanggal) {
        const tanggalIdx = addParamFn(tanggal);
        filter = `date_trunc('week', ${jakartaColumn}) = date_trunc('week', ${tanggalIdx}::date)`;
      } else {
        filter = `date_trunc('week', ${jakartaColumn}) = date_trunc('week', ${nowJakarta})`;
      }
    } else if (periode === 'bulanan') {
      if (tanggal) {
        const monthDate = tanggal.length === 7 ? `${tanggal}-01` : tanggal;
        const monthIdx = addParamFn(monthDate);
        filter = `date_trunc('month', ${jakartaColumn}) = date_trunc('month', ${monthIdx}::date)`;
      } else {
        filter =
          `date_trunc('month', ${jakartaColumn}) = date_trunc('month', ${nowJakarta})`;
      }
    } else if (tanggal) {
      const tanggalIdx = addParamFn(tanggal);
      filter = `${jakartaColumn}::date = ${tanggalIdx}::date`;
    }
    return filter;
  };

  const shouldUseRoleFilter = Boolean(normalizedRole);

  const executeCount = async (useRoleFilter) => {
    const params = [];
    const addParam = (value) => {
      params.push(value);
      return `$${params.length}`;
    };

    const joins = [];
    const whereClauses = [];

    if (useRoleFilter && normalizedRole) {
      joins.push('LEFT JOIN tiktok_post_roles pr ON pr.video_id = p.video_id');
      const roleIdx = addParam(normalizedRole);
      const roleFilter =
        `LOWER(TRIM(p.client_id)) = LOWER(${roleIdx}) OR LOWER(TRIM(pr.role_name)) = LOWER(${roleIdx})`;
      whereClauses.push(`(${roleFilter})`);
    } else if (normalizedClientId) {
      const clientIdx = addParam(normalizedClientId);
      whereClauses.push(`LOWER(TRIM(p.client_id)) = LOWER(${clientIdx})`);
    }

    if (normalizedRegionalId) {
      joins.push('JOIN clients c ON c.client_id = p.client_id');
      const regionalIdx = addParam(normalizedRegionalId);
      whereClauses.push(`UPPER(c.regional_id) = ${regionalIdx}`);
    }

    const dateFilter = addDateFilter(addParam);
    if (dateFilter) {
      whereClauses.push(dateFilter);
    }

    const whereSql = whereClauses.length ? whereClauses.join(' AND ') : '1=1';
    const joinSql = joins.length ? ` ${joins.join(' ')}` : '';

    const { rows } = await query(
      `SELECT COUNT(DISTINCT p.video_id) AS jumlah_post FROM tiktok_post p${joinSql} WHERE ${whereSql}`,
      params
    );
    return parseInt(rows[0]?.jumlah_post || '0', 10);
  };

  const initialCount = await executeCount(shouldUseRoleFilter);

  return initialCount;
}
