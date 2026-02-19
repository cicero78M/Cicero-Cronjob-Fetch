import { query } from '../repository/db.js';
import { buildPriorityOrderClause } from '../utils/sqlPriority.js';

const LINK_REPORT_INTERVAL = '2 days';

export async function hasRecentLinkReport(shortcode, user_id) {
  const res = await query(
    `SELECT 1 FROM link_report
     WHERE shortcode = $1
       AND user_id IS NOT DISTINCT FROM $2
       AND created_at >= NOW() - INTERVAL '${LINK_REPORT_INTERVAL}'
     LIMIT 1`,
    [shortcode, user_id]
  );
  return res.rows.length > 0;
}

export async function createLinkReport(data) {
  if (await hasRecentLinkReport(data.shortcode, data.user_id || null)) {
    const err = new Error('anda mengirimkan link duplikasi');
    err.statusCode = 400;
    throw err;
  }

  const res = await query(
    `INSERT INTO link_report (
        shortcode, user_id, instagram_link, facebook_link,
        twitter_link, tiktok_link, youtube_link, created_at
     )
     SELECT p.shortcode, $2, $3, $4, $5, $6, $7, p.created_at
     FROM insta_post p
     WHERE p.shortcode = $1
       AND p.created_at >= (NOW() AT TIME ZONE 'Asia/Jakarta') - INTERVAL '${LINK_REPORT_INTERVAL}'
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
    const err = new Error(`shortcode not found or older than ${LINK_REPORT_INTERVAL}`);
    err.statusCode = 400;
    throw err;
  }

  return res.rows[0];
}

export async function getLinkReports({
  limit = 20,
  offset = 0,
  userId = null,
  postId = null
} = {}) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 20;
  const safeOffset = Number.isInteger(offset) && offset >= 0 ? offset : 0;

  const conditions = [];
  const params = [];
  const addParam = value => {
    params.push(value);
    return `$${params.length}`;
  };

  if (userId) {
    conditions.push(`r.user_id = ${addParam(userId)}`);
  }

  if (postId) {
    conditions.push(`r.shortcode = ${addParam(postId)}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rowsResult, countResult] = await Promise.all([
    query(
      `SELECT r.*, p.caption, p.image_url, p.thumbnail_url
       FROM link_report r
       LEFT JOIN insta_post p ON p.shortcode = r.shortcode
       ${whereClause}
       ORDER BY r.created_at DESC
       LIMIT ${addParam(safeLimit)} OFFSET ${addParam(safeOffset)}`,
      params
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM link_report r ${whereClause}`,
      params.slice(0, conditions.length)
    )
  ]);

  return {
    rows: rowsResult.rows,
    totalCount: Number(countResult.rows[0]?.count ?? 0),
    limit: safeLimit,
    offset: safeOffset
  };
}

export async function findLinkReportByShortcode(shortcode, user_id) {
  const params = [shortcode];
  const condition = user_id ? 'AND r.user_id = $2' : '';
  if (user_id) params.push(user_id);
  const res = await query(
    `SELECT r.*, p.caption, p.image_url, p.thumbnail_url
     FROM link_report r
     LEFT JOIN insta_post p ON p.shortcode = r.shortcode
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
    `UPDATE link_report SET
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
  const res = await query('DELETE FROM link_report WHERE shortcode=$1 AND user_id=$2 RETURNING *', [shortcode, user_id]);
  return res.rows[0] || null;
}

export async function getReportsTodayByClient(client_id) {
  const typeRes = await query(
    'SELECT client_type FROM clients WHERE client_id = $1',
    [client_id]
  );
  const clientType = typeRes.rows[0]?.client_type;
  let joinClause =
    'JOIN insta_post p ON p.shortcode = r.shortcode JOIN "user" u ON u.user_id = r.user_id';
  let whereClause = 'u.client_id = $1';
  if (clientType === 'direktorat') {
    joinClause +=
      ' JOIN user_roles ur ON ur.user_id = u.user_id JOIN roles ro ON ur.role_id = ro.role_id';
    whereClause = 'ro.role_name = $1';
  }
  const res = await query(
    `SELECT r.* FROM link_report r ${joinClause}
     WHERE ${whereClause} AND r.created_at::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date
       AND p.created_at::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date
     ORDER BY r.created_at ASC`,
    [client_id]
  );
  return res.rows;
}

export async function getReportsYesterdayByClient(client_id) {
  const typeRes = await query(
    'SELECT client_type FROM clients WHERE client_id = $1',
    [client_id]
  );
  const clientType = typeRes.rows[0]?.client_type;
  let joinClause =
    'JOIN insta_post p ON p.shortcode = r.shortcode JOIN "user" u ON u.user_id = r.user_id';
  let whereClause = 'u.client_id = $1';
  if (clientType === 'direktorat') {
    joinClause +=
      ' JOIN user_roles ur ON ur.user_id = u.user_id JOIN roles ro ON ur.role_id = ro.role_id';
    whereClause = 'ro.role_name = $1';
  }
  const res = await query(
    `SELECT r.* FROM link_report r ${joinClause}
     WHERE ${whereClause} AND r.created_at::date = (NOW() AT TIME ZONE 'Asia/Jakarta' - INTERVAL '1 day')::date
       AND p.created_at::date = (NOW() AT TIME ZONE 'Asia/Jakarta' - INTERVAL '1 day')::date
     ORDER BY r.created_at ASC`,
    [client_id]
  );
  return res.rows;
}

export async function getReportsTodayByShortcode(client_id, shortcode) {
  const typeRes = await query(
    'SELECT client_type FROM clients WHERE client_id = $1',
    [client_id]
  );
  const clientType = typeRes.rows[0]?.client_type;
  let joinClause = 'JOIN "user" u ON u.user_id = r.user_id';
  let whereClause = 'u.client_id = $1';
  if (clientType === 'direktorat') {
    joinClause +=
      ' JOIN user_roles ur ON ur.user_id = u.user_id JOIN roles ro ON ur.role_id = ro.role_id';
    whereClause = 'ro.role_name = $1';
  }
  const res = await query(
    `SELECT r.* FROM link_report r ${joinClause}
     WHERE ${whereClause} AND r.shortcode = $2
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
    matchLinkClientId = true,
    regionalId = null
  } = options;
  const normalizedRegionalId = regionalId
    ? String(regionalId).trim().toUpperCase()
    : null;

  const params = [];
  const addParam = value => {
    params.push(value);
    return params.length;
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

  let dateFilterPost = "p.created_at::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date";
  let dateFilterReport = "r.created_at::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date";
  if (start_date && end_date) {
    const startIdx = addParam(start_date);
    const endIdx = addParam(end_date);
    dateFilterPost = `(p.created_at AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $${startIdx}::date AND $${endIdx}::date`;
    dateFilterReport = `(r.created_at AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $${startIdx}::date AND $${endIdx}::date`;
  } else if (periode === 'semua') {
    dateFilterPost = '1=1';
    dateFilterReport = '1=1';
  } else if (periode === 'mingguan') {
    if (tanggal) {
      const idx = addParam(tanggal);
      dateFilterPost = `date_trunc('week', p.created_at) = date_trunc('week', $${idx}::date)`;
      dateFilterReport = `date_trunc('week', r.created_at) = date_trunc('week', $${idx}::date)`;
    } else {
      dateFilterPost = "date_trunc('week', p.created_at) = date_trunc('week', NOW())";
      dateFilterReport = "date_trunc('week', r.created_at) = date_trunc('week', NOW())";
    }
  } else if (periode === 'bulanan') {
    if (tanggal) {
      const monthDate = tanggal.length === 7 ? `${tanggal}-01` : tanggal;
      const idx = addParam(monthDate);
      dateFilterPost = `date_trunc('month', p.created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', $${idx}::date)`;
      dateFilterReport = `date_trunc('month', r.created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', $${idx}::date)`;
    } else {
      dateFilterPost =
        "date_trunc('month', p.created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta')";
      dateFilterReport =
        "date_trunc('month', r.created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta')";
    }
  } else if (tanggal) {
    const idx = addParam(tanggal);
    dateFilterPost = `p.created_at::date = $${idx}::date`;
    dateFilterReport = `r.created_at::date = $${idx}::date`;
  }

  const buildPostFilters = (sharedClientIdx = null, sharedRoleIdx = null) => {
    let postClientFilter = '1=1';
    let postClientJoin = '';
    let postRoleJoin = '';
    let postRoleFilter = '';
    let postRegionalJoin = '';
    let postRegionalFilter = '';

    if (resolvedPostClientId) {
      const postClientIdx =
        sharedClientIdx ?? addParam(resolvedPostClientId);
      postClientJoin = 'JOIN insta_post_clients pc ON pc.shortcode = p.shortcode';
      postClientFilter = `LOWER(pc.client_id) = LOWER($${postClientIdx})`;
    }

    if (shouldIncludeRoleFilter && resolvedPostRoleName) {
      const roleIdx = sharedRoleIdx ?? addParam(resolvedPostRoleName);
      const roleFilterCondition =
        `LOWER(pc.client_id) = LOWER($${roleIdx}) OR LOWER(pr.role_name) = LOWER($${roleIdx})`;
      postRoleJoin = 'LEFT JOIN insta_post_roles pr ON pr.shortcode = p.shortcode';
      postRoleFilter = `AND (${roleFilterCondition})`;
      // Ensure junction table is joined if not already
      if (!postClientJoin) {
        postClientJoin = 'LEFT JOIN insta_post_clients pc ON pc.shortcode = p.shortcode';
      }
    }

    if (regionalParamIdx !== null) {
      // Join to clients via junction table if not already joined
      if (!postClientJoin) {
        postClientJoin = 'JOIN insta_post_clients pc ON pc.shortcode = p.shortcode';
      }
      postRegionalJoin = 'JOIN clients cp ON cp.client_id = pc.client_id';
      postRegionalFilter = `AND UPPER(cp.regional_id) = UPPER($${regionalParamIdx})`;
    }

    return {
      postClientFilter,
      postClientJoin,
      postRoleJoin,
      postRoleFilter,
      postRegionalJoin,
      postRegionalFilter
    };
  };

  const {
    postClientFilter,
    postClientJoin,
    postRoleJoin,
    postRoleFilter,
    postRegionalJoin,
    postRegionalFilter
  } = buildPostFilters(sharedClientParamIdx, sharedRoleParamIdx);

  const shouldMatchLinkClientId = matchLinkClientId && userClientParamIdx !== null;
  const linkSumUserJoin = shouldMatchLinkClientId
    ? 'JOIN "user" lu ON lu.user_id = r.user_id'
    : '';
  const linkSumUserFilter = shouldMatchLinkClientId
    ? `AND LOWER(lu.client_id) = LOWER($${userClientParamIdx})`
    : '';

  const { rows: postRows } = await query(
    `SELECT COUNT(*) AS jumlah_post FROM insta_post p ${postClientJoin} ${postRegionalJoin} ${postRoleJoin}
     WHERE ${postClientFilter} ${postRoleFilter} ${postRegionalFilter} AND ${dateFilterPost}`,
    params
  );
  const maxLink = parseInt(postRows[0]?.jumlah_post || '0', 10) * 5;

  let userWhere = '1=1';
  if (userClientParamIdx !== null) {
    userWhere = `LOWER(u.client_id) = LOWER($${userClientParamIdx})`;
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

  const linkParams = [...params];
  const addPriorityParam = value => {
    linkParams.push(value);
    return linkParams.length;
  };
  const { priorityCase, fallbackRank } = buildPriorityOrderClause('u.nama', addPriorityParam);
  const priorityExpr = `(${priorityCase})`;

  const { rows } = await query(
    `WITH link_sum AS (
       SELECT r.user_id,
         SUM(
           (CASE WHEN r.instagram_link IS NOT NULL AND r.instagram_link <> '' THEN 1 ELSE 0 END) +
           (CASE WHEN r.facebook_link IS NOT NULL AND r.facebook_link <> '' THEN 1 ELSE 0 END) +
           (CASE WHEN r.twitter_link IS NOT NULL AND r.twitter_link <> '' THEN 1 ELSE 0 END) +
           (CASE WHEN r.tiktok_link IS NOT NULL AND r.tiktok_link <> '' THEN 1 ELSE 0 END) +
           (CASE WHEN r.youtube_link IS NOT NULL AND r.youtube_link <> '' THEN 1 ELSE 0 END)
       ) AS jumlah_link
      FROM link_report r
      JOIN insta_post p ON p.shortcode = r.shortcode
      ${postRoleJoin}
      ${postRegionalJoin}
      ${linkSumUserJoin}
      WHERE ${postClientFilter} ${postRoleFilter} AND ${dateFilterPost} AND ${dateFilterReport}
      ${postRegionalFilter}
      ${linkSumUserFilter}
      GROUP BY r.user_id
    )
    SELECT
      u.client_id,
      u.user_id,
      u.title,
      u.nama,
      u.insta AS username,
     u.divisi,
     u.exception,
      COALESCE(ls.jumlah_link, 0) AS jumlah_link
     FROM "user" u
     JOIN clients c ON c.client_id = u.client_id
     LEFT JOIN link_sum ls ON ls.user_id = u.user_id
     WHERE u.status = true
     AND ${userWhere}
    GROUP BY u.client_id,  u.user_id, u.title, u.nama, u.insta, u.divisi, u.exception, ls.jumlah_link
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
    user.sudahMelaksanakan = user.jumlah_link > 0;
  }

  return rows;
}

export async function getReportsThisMonthByClient(client_id) {
  const { rows } = await query(
    `SELECT
       r.created_at::date AS date,
       TRIM(CONCAT(u.title, ' ', u.nama)) AS pangkat_nama,
       u.client_id as kesatuan,
       u.user_id AS nrp,
       u.divisi AS satfung,
       r.instagram_link AS instagram,
       r.facebook_link AS facebook,
       r.twitter_link AS twitter,
       r.tiktok_link AS tiktok,
       r.youtube_link AS youtube
     FROM link_report r
     JOIN insta_post p ON p.shortcode = r.shortcode
     JOIN insta_post_clients pc ON pc.shortcode = p.shortcode
     JOIN "user" u ON u.user_id = r.user_id
     WHERE pc.client_id = $1
       AND date_trunc('month', r.created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta')
     ORDER BY r.created_at ASC`,
    [client_id]
  );
  return rows;
}

export async function getReportsPrevMonthByClient(client_id) {
  const { rows } = await query(
    `SELECT
       r.created_at::date AS date,
       TRIM(CONCAT(u.title, ' ', u.nama)) AS pangkat_nama,
       u.client_id as kesatuan,
       u.user_id AS nrp,
       u.divisi AS satfung,
       r.instagram_link AS instagram,
       r.facebook_link AS facebook,
       r.twitter_link AS twitter,
       r.tiktok_link AS tiktok,
       r.youtube_link AS youtube
     FROM link_report r
     JOIN insta_post p ON p.shortcode = r.shortcode
     JOIN insta_post_clients pc ON pc.shortcode = p.shortcode
     JOIN "user" u ON u.user_id = r.user_id
     WHERE pc.client_id = $1
       AND date_trunc('month', r.created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', (NOW() AT TIME ZONE 'Asia/Jakarta') - INTERVAL '1 month')
     ORDER BY r.created_at ASC`,
    [client_id]
  );
  return rows;
}
