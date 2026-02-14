// src/model/instaPostModel.js
import { query } from '../repository/db.js';

export async function upsertInstaPost(data) {
  // Pastikan field yang dipakai sesuai dengan kolom di DB
  const {
    client_id,
    shortcode,
    caption = null,
    comment_count = 0,
    thumbnail_url = null,
    is_video = false,
    video_url = null,
    image_url = null,
    images_url = null,
    is_carousel = false,
  } = data;

  // created_at bisa dihandle via taken_at di service (lihat service)
  await query(
    `INSERT INTO insta_post (client_id, shortcode, caption, comment_count, thumbnail_url, is_video, video_url, image_url, images_url, is_carousel, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11, NOW()))
     ON CONFLICT (shortcode) DO UPDATE
      SET client_id = EXCLUDED.client_id,
          caption = EXCLUDED.caption,
          comment_count = EXCLUDED.comment_count,
          thumbnail_url = EXCLUDED.thumbnail_url,
          is_video = EXCLUDED.is_video,
          video_url = EXCLUDED.video_url,
          image_url = EXCLUDED.image_url,
          images_url = EXCLUDED.images_url,
          is_carousel = EXCLUDED.is_carousel,
          created_at = EXCLUDED.created_at`,
    [client_id, shortcode, caption, comment_count, thumbnail_url, is_video, video_url, image_url, JSON.stringify(images_url), is_carousel, data.created_at || null]
  );
}

export async function findPostByShortcode(shortcode) {
  const res = await query('SELECT * FROM insta_post WHERE shortcode = $1', [shortcode]);
  return res.rows[0] || null;
}

export async function getShortcodesTodayByClient(identifier) {
  const today = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Asia/Jakarta'
  });

  const typeRes = await query(
    'SELECT client_type FROM clients WHERE LOWER(client_id) = LOWER($1)',
    [identifier]
  );

  const isDitbinmas = identifier.toLowerCase() === 'ditbinmas';
  const clientType = typeRes.rows[0]?.client_type?.toLowerCase();

  let sql;
  let params;

  const useRoleFilter =
    typeRes.rows.length === 0 ||
    (clientType === 'direktorat' && !isDitbinmas);

  if (useRoleFilter) {
    sql =
      `SELECT p.shortcode FROM insta_post p\n` +
      `JOIN insta_post_roles pr ON pr.shortcode = p.shortcode\n` +
      `WHERE LOWER(pr.role_name) = LOWER($1)\n` +
      `  AND (p.created_at AT TIME ZONE 'Asia/Jakarta')::date = $2::date\n` +
      `ORDER BY p.created_at ASC, p.shortcode ASC`;
    params = [identifier, today];
  } else {
    sql =
      `SELECT shortcode FROM insta_post\n` +
      `WHERE LOWER(client_id) = LOWER($1) AND (created_at AT TIME ZONE 'Asia/Jakarta')::date = $2::date\n` +
      `ORDER BY created_at ASC, shortcode ASC`;
    params = [identifier, today];
  }

  let rows = (await query(sql, params)).rows;

  if (useRoleFilter && clientType === 'direktorat' && rows.length === 0) {
    const fallbackQuery =
      `SELECT shortcode FROM insta_post\n` +
      `WHERE LOWER(client_id) = LOWER($1) AND (created_at AT TIME ZONE 'Asia/Jakarta')::date = $2::date\n` +
      `ORDER BY created_at ASC, shortcode ASC`;
    rows = (await query(fallbackQuery, [identifier, today])).rows;
  }

  return rows.map((r) => r.shortcode);
}

export async function getShortcodesYesterdayByClient(identifier) {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  const yesterday = date.toLocaleDateString('en-CA', {
    timeZone: 'Asia/Jakarta'
  });

  const typeRes = await query(
    'SELECT client_type FROM clients WHERE LOWER(client_id) = LOWER($1)',
    [identifier]
  );

  const isDitbinmas = identifier.toLowerCase() === 'ditbinmas';
  const clientType = typeRes.rows[0]?.client_type?.toLowerCase();

  let sql;
  let params;

  if (
    typeRes.rows.length === 0 ||
    (clientType === 'direktorat' && !isDitbinmas)
  ) {
    sql =
      `SELECT p.shortcode FROM insta_post p\n` +
      `JOIN insta_post_roles pr ON pr.shortcode = p.shortcode\n` +
      `WHERE LOWER(pr.role_name) = LOWER($1)\n` +
      `  AND (p.created_at AT TIME ZONE 'Asia/Jakarta')::date = $2::date`;
    params = [identifier, yesterday];
  } else {
    sql =
      `SELECT shortcode FROM insta_post\n` +
      `WHERE LOWER(client_id) = LOWER($1) AND (created_at AT TIME ZONE 'Asia/Jakarta')::date = $2::date`;
    params = [identifier, yesterday];
  }

  const res = await query(sql, params);
  return res.rows.map((r) => r.shortcode);
}

export async function getShortcodesByDateRange(identifier, startDate, endDate) {
  if (!identifier) return [];
  if (!startDate || !endDate) return [];

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [];
  }

  const startStr = start.toLocaleDateString('en-CA', {
    timeZone: 'Asia/Jakarta'
  });
  const endStr = end.toLocaleDateString('en-CA', {
    timeZone: 'Asia/Jakarta'
  });

  const [startBound, endBound] = startStr <= endStr ? [startStr, endStr] : [endStr, startStr];

  const typeRes = await query(
    'SELECT client_type FROM clients WHERE LOWER(client_id) = LOWER($1)',
    [identifier]
  );

  const isDitbinmas = identifier.toLowerCase() === 'ditbinmas';
  const clientType = typeRes.rows[0]?.client_type?.toLowerCase();

  let sql;
  let params;

  if (
    typeRes.rows.length === 0 ||
    (clientType === 'direktorat' && !isDitbinmas)
  ) {
    sql =
      `SELECT p.shortcode FROM insta_post p\n` +
      `JOIN insta_post_roles pr ON pr.shortcode = p.shortcode\n` +
      `WHERE LOWER(pr.role_name) = LOWER($1)\n` +
      `  AND (p.created_at AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $2::date AND $3::date`;
    params = [identifier, startBound, endBound];
  } else {
    sql =
      `SELECT shortcode FROM insta_post\n` +
      `WHERE LOWER(client_id) = LOWER($1)\n` +
      `  AND (created_at AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $2::date AND $3::date`;
    params = [identifier, startBound, endBound];
  }

  const res = await query(sql, params);
  return res.rows.map((r) => r.shortcode);
}

export async function getShortcodesTodayByUsername(username) {
  if (!username) return [];
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const res = await query(
    `SELECT p.shortcode FROM insta_post p JOIN clients c ON c.client_id = p.client_id
     WHERE c.client_insta = $1 AND DATE(p.created_at) = $2`,
    [username, `${yyyy}-${mm}-${dd}`]
  );
  return res.rows.map(r => r.shortcode);
}


export async function getPostsTodayByClient(client_id) {
  const res = await query(
    `SELECT p.*, 
            CASE
              WHEN jsonb_typeof(il.likes) = 'array' THEN jsonb_array_length(il.likes)
              ELSE 0
            END AS like_count
     FROM insta_post p
     LEFT JOIN insta_like il ON il.shortcode = p.shortcode
     WHERE LOWER(client_id) = LOWER($1)
       AND (p.created_at AT TIME ZONE 'Asia/Jakarta')::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date
     ORDER BY p.created_at ASC`,
    [client_id]
  );
  return res.rows;
}

export async function getPostsByClientId(clientId) {
  const res = await query(
    `SELECT DISTINCT ON (shortcode) *
     FROM insta_post
     WHERE client_id = $1
     ORDER BY shortcode, created_at DESC`,
    [clientId]
  );
  return res.rows;
}

export async function findByClientId(clientId) {
  return getPostsByClientId(clientId);
}

export async function getPostsByFilters(
  client_id,
  {
    periode = 'harian',
    tanggal = null,
    startDate = null,
    endDate = null,
    role = null,
    scope = null,
    regionalId = null,
  } = {}
) {
  const normalizedClientId = client_id ? String(client_id).trim() : null;
  const normalizedRole = role ? String(role).trim().toLowerCase() : null;
  const normalizedScope = scope ? String(scope).trim().toLowerCase() : null;
  const normalizedRegionalId = regionalId
    ? String(regionalId).trim().toUpperCase()
    : null;

  let clientType = null;
  if (normalizedClientId) {
    const typeRes = await query(
      'SELECT client_type FROM clients WHERE LOWER(TRIM(client_id)) = $1 LIMIT 1',
      [normalizedClientId.toLowerCase()]
    );
    clientType = typeRes.rows[0]?.client_type?.toLowerCase() || null;
  }

  const addDateFilter = (addParamFn) => {
    let filter = "p.created_at::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date";
    if (startDate && endDate) {
      const startIdx = addParamFn(startDate);
      const endIdx = addParamFn(endDate);
      filter = `p.created_at::date BETWEEN ${startIdx}::date AND ${endIdx}::date`;
    } else if (periode === 'semua') {
      filter = '1=1';
    } else if (periode === 'mingguan') {
      if (tanggal) {
        const tanggalIdx = addParamFn(tanggal);
        filter = `date_trunc('week', p.created_at) = date_trunc('week', ${tanggalIdx}::date)`;
      } else {
        filter = "date_trunc('week', p.created_at) = date_trunc('week', NOW())";
      }
    } else if (periode === 'bulanan') {
      if (tanggal) {
        const monthDate = tanggal.length === 7 ? `${tanggal}-01` : tanggal;
        const monthIdx = addParamFn(monthDate);
        filter =
          `date_trunc('month', p.created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', ${monthIdx}::date)`;
      } else {
        filter =
          "date_trunc('month', p.created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta')";
      }
    } else if (tanggal) {
      const tanggalIdx = addParamFn(tanggal);
      filter = `p.created_at::date = ${tanggalIdx}::date`;
    }
    return filter;
  };

  const shouldUseRoleFilter =
    Boolean(normalizedRole) &&
    (normalizedScope === 'direktorat' || clientType === 'direktorat');

  const executeQuery = async (useRoleFilter) => {
    const params = [];
    const addParam = (value) => {
      params.push(value);
      return `$${params.length}`;
    };

    const joins = [];
    const whereClauses = [];

    if (useRoleFilter && normalizedRole) {
      joins.push('JOIN insta_post_roles pr ON pr.shortcode = p.shortcode');
      const roleIdx = addParam(normalizedRole);
      whereClauses.push(`LOWER(TRIM(pr.role_name)) = LOWER(${roleIdx})`);
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
      `SELECT DISTINCT ON (p.shortcode) p.*
       FROM insta_post p${joinSql}
       WHERE ${whereSql}
       ORDER BY p.shortcode, p.created_at ASC`,
      params
    );

    return rows;
  };

  const initialRows = await executeQuery(shouldUseRoleFilter);

  if (
    initialRows.length === 0 &&
    shouldUseRoleFilter &&
    normalizedClientId &&
    clientType === 'direktorat'
  ) {
    return executeQuery(false);
  }

  return initialRows;
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
            regionalId: regionalIdArg
          };

  const normalizedClientId = client_id ? String(client_id).trim() : null;
  const normalizedRole = options.role ? String(options.role).trim().toLowerCase() : null;
  const normalizedScope = options.scope ? String(options.scope).trim().toLowerCase() : null;
  const normalizedIgClientIdOverride = options.igClientIdOverride
    ? String(options.igClientIdOverride).trim()
    : null;
  const normalizedRegionalId = options.regionalId
    ? String(options.regionalId).trim().toUpperCase()
    : null;
  const shouldForceClientFilter =
    normalizedScope === 'org' && normalizedRole === 'operator';
  const resolvedClientId =
    shouldForceClientFilter && normalizedIgClientIdOverride
      ? normalizedIgClientIdOverride
      : normalizedClientId;

  const addDateFilter = (addParamFn) => {
    let filter = "p.created_at::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date";
    if (start_date && end_date) {
      const startIdx = addParamFn(start_date);
      const endIdx = addParamFn(end_date);
      filter = `p.created_at::date BETWEEN ${startIdx}::date AND ${endIdx}::date`;
    } else if (periode === 'semua') {
      filter = '1=1';
    } else if (periode === 'mingguan') {
      if (tanggal) {
        const tanggalIdx = addParamFn(tanggal);
        filter = `date_trunc('week', p.created_at) = date_trunc('week', ${tanggalIdx}::date)`;
      } else {
        filter = "date_trunc('week', p.created_at) = date_trunc('week', NOW())";
      }
    } else if (periode === 'bulanan') {
      if (tanggal) {
        const monthDate = tanggal.length === 7 ? `${tanggal}-01` : tanggal;
        const monthIdx = addParamFn(monthDate);
        filter =
          `date_trunc('month', p.created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', ${monthIdx}::date)`;
      } else {
        filter =
          "date_trunc('month', p.created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta')";
      }
    } else if (tanggal) {
      const tanggalIdx = addParamFn(tanggal);
      filter = `p.created_at::date = ${tanggalIdx}::date`;
    }
    return filter;
  };

  const shouldUseRoleFilter = Boolean(normalizedRole) && !shouldForceClientFilter;

  const executeCount = async (useRoleFilter) => {
    const params = [];
    const addParam = (value) => {
      params.push(value);
      return `$${params.length}`;
    };

    const joins = [];
    const whereClauses = [];

    if (useRoleFilter && normalizedRole) {
      joins.push('JOIN insta_post_roles pr ON pr.shortcode = p.shortcode');
      const roleIdx = addParam(normalizedRole);
      whereClauses.push(`LOWER(TRIM(pr.role_name)) = LOWER(${roleIdx})`);
    } else if (resolvedClientId) {
      const clientIdx = addParam(resolvedClientId);
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
      `SELECT COUNT(DISTINCT p.shortcode) AS jumlah_post FROM insta_post p${joinSql} WHERE ${whereSql}`,
      params
    );

    return parseInt(rows[0]?.jumlah_post || '0', 10);
  };

  const initialCount = await executeCount(shouldUseRoleFilter);

  return initialCount;
}
