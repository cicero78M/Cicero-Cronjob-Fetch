import { query } from '../repository/db.js';
import { buildPriorityOrderClause } from '../utils/sqlPriority.js';

const OPERATOR_ROLE_NAME = 'operator';

export async function createLinkReport(data) {
  const res = await query(
    `INSERT INTO link_report_khusus (
        shortcode, user_id, instagram_link, facebook_link,
        twitter_link, tiktok_link, youtube_link, created_at
     )
     SELECT p.shortcode, $2, $3, $4, $5, $6, $7, p.created_at
     FROM insta_post_khusus p
     WHERE p.shortcode = $1
       AND p.created_at::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date
     ON CONFLICT (shortcode, user_id) DO UPDATE
     SET instagram_link = EXCLUDED.instagram_link,
         facebook_link = EXCLUDED.facebook_link,
         twitter_link = EXCLUDED.twitter_link,
         tiktok_link = EXCLUDED.tiktok_link,
         youtube_link = EXCLUDED.youtube_link,
         created_at = EXCLUDED.created_at
     RETURNING *`,
    [
      data.shortcode,
      data.user_id || null,
      data.instagram_link || null,
      data.facebook_link || null,
      data.twitter_link || null,
      data.tiktok_link || null,
      data.youtube_link || null
    ]
  );

  if (res.rows.length === 0) {
    const err = new Error('shortcode not found or not from today');
    err.statusCode = 400;
    throw err;
  }

  return res.rows[0];
}

export async function getLinkReports({ userId, postId } = {}) {
  const params = [];
  const conditions = [];

  if (userId) {
    params.push(userId);
    conditions.push(`r.user_id = $${params.length}`);
  }

  if (postId) {
    params.push(postId);
    conditions.push(`r.shortcode = $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const res = await query(
    `SELECT r.*, p.caption, p.image_url, p.thumbnail_url
     FROM link_report_khusus r
     LEFT JOIN insta_post_khusus p ON p.shortcode = r.shortcode
     ${whereClause}
     ORDER BY r.created_at DESC`,
    params
  );
  return res.rows;
}

export async function findLinkReportByShortcode(shortcode, user_id) {
  const params = [shortcode];
  const condition = user_id ? 'AND r.user_id = $2' : '';
  if (user_id) params.push(user_id);
  const res = await query(
    `SELECT r.*, p.caption, p.image_url, p.thumbnail_url
     FROM link_report_khusus r
     LEFT JOIN insta_post_khusus p ON p.shortcode = r.shortcode
     WHERE r.shortcode = $1 ${condition}`,
    params
  );
  return res.rows[0] || null;
}

export async function updateLinkReport(shortcode, user_id, data) {
  const old = await findLinkReportByShortcode(shortcode, user_id);
  if (!old) return null;
  const merged = { ...old, ...data };
  const res = await query(
    `UPDATE link_report_khusus SET
      instagram_link=$3,
      facebook_link=$4,
      twitter_link=$5,
      tiktok_link=$6,
      youtube_link=$7,
      created_at=$8
     WHERE shortcode=$1 AND user_id=$2 RETURNING *`,
    [
      shortcode,
      user_id,
      merged.instagram_link || null,
      merged.facebook_link || null,
      merged.twitter_link || null,
      merged.tiktok_link || null,
      merged.youtube_link || null,
      merged.created_at || null
    ]
  );
  return res.rows[0];
}

export async function deleteLinkReport(shortcode, user_id) {
  const res = await query('DELETE FROM link_report_khusus WHERE shortcode=$1 AND user_id=$2 RETURNING *', [shortcode, user_id]);
  return res.rows[0] || null;
}

export async function getReportsTodayByClient(client_id, roleFlag = null) {
  let whereClause = 'u.client_id = $1';
  let joinClause = 'JOIN "user" u ON u.user_id = r.user_id';
  
  if (roleFlag && roleFlag.toLowerCase() === OPERATOR_ROLE_NAME) {
    joinClause += ' JOIN user_roles ur ON ur.user_id = u.user_id JOIN roles ro ON ur.role_id = ro.role_id';
    whereClause += ` AND LOWER(ro.role_name) = '${OPERATOR_ROLE_NAME}'`;
  }
  
  const res = await query(
    `SELECT r.* FROM link_report_khusus r
     ${joinClause}
     WHERE ${whereClause} AND r.created_at::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date
     ORDER BY r.created_at ASC`,
    [client_id]
  );
  return res.rows;
}

export async function getReportsTodayByShortcode(client_id, shortcode, roleFlag = null) {
  let whereClause = 'u.client_id = $1 AND r.shortcode = $2';
  let joinClause = 'JOIN "user" u ON u.user_id = r.user_id';
  
  if (roleFlag && roleFlag.toLowerCase() === OPERATOR_ROLE_NAME) {
    joinClause += ' JOIN user_roles ur ON ur.user_id = u.user_id JOIN roles ro ON ur.role_id = ro.role_id';
    whereClause += ` AND LOWER(ro.role_name) = '${OPERATOR_ROLE_NAME}'`;
  }
  
  const res = await query(
    `SELECT r.* FROM link_report_khusus r
     ${joinClause}
     WHERE ${whereClause}
       AND r.created_at::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date
     ORDER BY r.created_at ASC`,
    [client_id, shortcode]
  );
  return res.rows;
}
export async function getRekapLinkByClient(
  client_id,
  periode = 'harian',
  tanggal,
  roleFlag = null,
  options = {}
) {
  const {
    userClientId: userClientIdOverride = null,
    userRoleFilter = null
  } = options;
  let dateFilterPost = "p.created_at::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date";
  let dateFilterReport = "r.created_at::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date";
  const params = [client_id];
  if (periode === 'semua') {
    dateFilterPost = '1=1';
    dateFilterReport = '1=1';
  } else if (periode === 'mingguan') {
    if (tanggal) {
      params.push(tanggal);
      dateFilterPost = "date_trunc('week', p.created_at) = date_trunc('week', $2::date)";
      dateFilterReport = "date_trunc('week', r.created_at) = date_trunc('week', $2::date)";
    } else {
      dateFilterPost = "date_trunc('week', p.created_at) = date_trunc('week', NOW())";
      dateFilterReport = "date_trunc('week', r.created_at) = date_trunc('week', NOW())";
    }
  } else if (periode === 'bulanan') {
    if (tanggal) {
      const monthDate = tanggal.length === 7 ? `${tanggal}-01` : tanggal;
      params.push(monthDate);
      dateFilterPost = "date_trunc('month', p.created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', $2::date)";
      dateFilterReport = "date_trunc('month', r.created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', $2::date)";
    } else {
      dateFilterPost = "date_trunc('month', p.created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta')";
      dateFilterReport = "date_trunc('month', r.created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta')";
    }
  } else if (tanggal) {
    params.push(tanggal);
    dateFilterPost = 'p.created_at::date = $2::date';
    dateFilterReport = 'r.created_at::date = $2::date';
  }

  const { rows: postRows } = await query(
    `SELECT COUNT(*) AS jumlah_post FROM insta_post_khusus p WHERE p.client_id = $1 AND ${dateFilterPost}`,
    params
  );
  const maxLink = parseInt(postRows[0]?.jumlah_post || '0', 10) * 5;

  const linkParams = [...params];
  const addPriorityParam = value => {
    linkParams.push(value);
    return linkParams.length;
  };
  const { priorityCase, fallbackRank } = buildPriorityOrderClause('u.nama', addPriorityParam);
  const priorityExpr = `(${priorityCase})`;

  const resolvedUserClientId = userClientIdOverride ?? client_id;
  const resolvedUserRole = userRoleFilter ?? (roleFlag ? roleFlag.toLowerCase() : null);
  
  let operatorRoleFilter = '';
  if (resolvedUserRole === OPERATOR_ROLE_NAME) {
    linkParams.push(OPERATOR_ROLE_NAME);
    operatorRoleFilter = `AND EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      WHERE ur.user_id = u.user_id AND LOWER(r.role_name) = LOWER($${linkParams.length})
    )`;
  }

  // Apply additional client_id filter when explicitly overridden (e.g., for operator role in ORG scope)
  // This ensures we filter by the authenticated user's client_id rather than the requested client_id
  // Only apply when they differ; if they're equal, the base WHERE clause already handles it
  let userClientFilter = '';
  if (userClientIdOverride && userClientIdOverride !== client_id) {
    linkParams.push(resolvedUserClientId);
    userClientFilter = `AND u.client_id = $${linkParams.length}`;
  }

  const { rows } = await query(
    `WITH cli AS (
       SELECT client_type FROM clients WHERE client_id = $1
     ),
     link_sum AS (
       SELECT r.user_id,
         SUM(
           (CASE WHEN r.instagram_link IS NOT NULL AND r.instagram_link <> '' THEN 1 ELSE 0 END) +
           (CASE WHEN r.facebook_link IS NOT NULL AND r.facebook_link <> '' THEN 1 ELSE 0 END) +
           (CASE WHEN r.twitter_link IS NOT NULL AND r.twitter_link <> '' THEN 1 ELSE 0 END) +
           (CASE WHEN r.tiktok_link IS NOT NULL AND r.tiktok_link <> '' THEN 1 ELSE 0 END) +
           (CASE WHEN r.youtube_link IS NOT NULL AND r.youtube_link <> '' THEN 1 ELSE 0 END)
         ) AS jumlah_link
       FROM link_report_khusus r
       JOIN insta_post_khusus p ON p.shortcode = r.shortcode
       WHERE p.client_id = $1 AND ${dateFilterReport}
       GROUP BY r.user_id
     )
     SELECT
       u.user_id,
       u.title,
       u.nama,
       u.insta AS username,
       u.divisi,
       u.exception,
       COALESCE(ls.jumlah_link, 0) AS jumlah_link
     FROM "user" u
     LEFT JOIN link_sum ls ON ls.user_id = u.user_id
     WHERE u.status = true
       AND (
         (SELECT client_type FROM cli) <> 'direktorat' AND u.client_id = $1
       OR (SELECT client_type FROM cli) = 'direktorat' AND EXISTS (
         SELECT 1 FROM user_roles ur
          JOIN roles r ON ur.role_id = r.role_id
          WHERE ur.user_id = u.user_id AND r.role_name = $1
        )
      )
      ${operatorRoleFilter}
      ${userClientFilter}
    ORDER BY
      ${priorityExpr} ASC,
      CASE WHEN ${priorityExpr} = ${fallbackRank} THEN UPPER(u.nama) END ASC,
      jumlah_link DESC,
      UPPER(u.nama) ASC`,
    linkParams
  );

  for (const user of rows) {
    if (
      user.exception === true ||
      user.exception === 'true' ||
      user.exception == 1 ||
      user.exception === '1'
    ) {
      user.jumlah_link = maxLink;
    } else {
      user.jumlah_link = parseInt(user.jumlah_link, 10) || 0;
    }
    user.display_nama = user.title ? `${user.title} ${user.nama}` : user.nama;
  }

  return rows;
}
