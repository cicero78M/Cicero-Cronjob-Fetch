import redis from '../config/redis.js';
import { findById as findClientById } from '../model/clientModel.js';
import { getInstaPostCount, getTiktokPostCount } from './postCountService.js';
import { query } from '../repository/db.js';
import { getUserDirectoryUsers } from './userDirectoryService.js';

const TTL_SEC = 60;
export const ALLOWED_TIME_RANGES = ['today', '7d', '30d', '90d', 'custom', 'all'];

const clientTypeCache = new Map();

function toJakartaDateString(date) {
  const jsDate = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(jsDate.getTime())) {
    return null;
  }
  return jsDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

function buildRangeStrings(startDate, endDate) {
  const startStr = toJakartaDateString(startDate);
  const endStr = toJakartaDateString(endDate);
  if (!startStr || !endStr) return null;
  return {
    startDate: `${startStr}T00:00:00+07:00`,
    endDate: `${endStr}T23:59:59.999+07:00`,
  };
}

function shiftJakartaDate(base, days) {
  const baseStr = toJakartaDateString(base);
  if (!baseStr) return null;
  const dateObj = new Date(`${baseStr}T00:00:00+07:00`);
  if (Number.isNaN(dateObj.getTime())) return null;
  dateObj.setDate(dateObj.getDate() + days);
  return toJakartaDateString(dateObj);
}

export function resolveTimeRange(timeRange, startDateInput, endDateInput) {
  const normalizedRange = (timeRange || '').toLowerCase() || '7d';
  const today = toJakartaDateString(new Date());
  if (!today) {
    return { error: 'Tanggal saat ini tidak valid' };
  }

  let startDateStr = today;
  let endDateStr = today;

  if (normalizedRange === 'today') {
    startDateStr = today;
    endDateStr = today;
  } else if (normalizedRange === '7d') {
    startDateStr = shiftJakartaDate(today, -6);
  } else if (normalizedRange === '30d') {
    startDateStr = shiftJakartaDate(today, -29);
  } else if (normalizedRange === '90d') {
    startDateStr = shiftJakartaDate(today, -89);
  } else if (normalizedRange === 'custom') {
    const customRange = buildRangeStrings(startDateInput, endDateInput);
    if (!customRange) {
      return { error: 'start_date dan end_date wajib diisi untuk time_range custom' };
    }
    const startTs = new Date(customRange.startDate).getTime();
    const endTs = new Date(customRange.endDate).getTime();
    if (Number.isNaN(startTs) || Number.isNaN(endTs) || startTs > endTs) {
      return { error: 'Rentang tanggal tidak valid' };
    }
    return {
      timeRange: normalizedRange,
      startDate: customRange.startDate,
      endDate: customRange.endDate,
    };
  } else if (normalizedRange === 'all') {
    const built = buildRangeStrings('2000-01-01', endDateInput || today);
    if (!built) {
      return { error: 'Rentang waktu tidak valid' };
    }
    const startTs = new Date(built.startDate).getTime();
    const endTs = new Date(built.endDate).getTime();
    if (Number.isNaN(startTs) || Number.isNaN(endTs) || startTs > endTs) {
      return { error: 'Rentang tanggal tidak valid' };
    }
    return { timeRange: normalizedRange, ...built };
  } else {
    return { error: 'time_range tidak valid' };
  }

  const builtRange = buildRangeStrings(startDateStr, endDateStr);
  if (!builtRange) {
    return { error: 'Rentang tanggal tidak valid' };
  }
  const startTs = new Date(builtRange.startDate).getTime();
  const endTs = new Date(builtRange.endDate).getTime();
  if (Number.isNaN(startTs) || Number.isNaN(endTs) || startTs > endTs) {
    return { error: 'Rentang tanggal tidak valid' };
  }
  return { timeRange: normalizedRange, ...builtRange };
}

async function getClientType(clientId) {
  if (!clientId) return null;
  const key = String(clientId).toLowerCase();
  if (clientTypeCache.has(key)) {
    return clientTypeCache.get(key);
  }
  const client = await findClientById(clientId);
  const type = client?.client_type ? client.client_type.toLowerCase() : null;
  if (type) {
    clientTypeCache.set(key, type);
  }
  return type;
}

function buildCacheKey(prefix, { clientId, startDate, endDate, role, scope, regionalId }) {
  return [
    prefix,
    clientId || 'all',
    startDate || 'start',
    endDate || 'end',
    role || 'role',
    scope || 'scope',
    regionalId || 'regional',
  ]
    .map((segment) => String(segment).trim().toLowerCase())
    .join(':');
}

function normalizeInstaUsername(username) {
  if (!username) return null;
  const trimmed = String(username).trim();
  if (!trimmed) return null;
  return trimmed.replace(/^@+/, '').toLowerCase();
}

function normalizeTiktokUsername(username) {
  if (!username) return null;
  const trimmed = String(username).trim();
  if (!trimmed) return null;
  return trimmed.replace(/^@+/, '').toLowerCase();
}

function mapFromObject(obj) {
  return new Map(Object.entries(obj || {}).map(([key, value]) => [key, Number(value) || 0]));
}

function buildUserDirectory(users) {
  return users.map((user) => ({
    user_id: user.user_id,
    nama: user.nama,
    divisi: user.divisi,
    client_id: user.client_id,
    kontak_sosial: {
      instagram: user.insta || null,
      tiktok: user.tiktok || null,
    },
  }));
}

function mapEngagementPerUser(users, byUserMap, platform) {
  const normalizer = platform === 'instagram' ? normalizeInstaUsername : normalizeTiktokUsername;
  const metricKey = platform === 'instagram' ? 'likes' : 'comments';
  const totalsByUserId = new Map();
  const perUser = [];
  const seenUsernames = new Set();

  users.forEach((user) => {
    const username = normalizer(user[platform === 'instagram' ? 'insta' : 'tiktok']);
    const total = username ? byUserMap.get(username) || 0 : 0;
    if (username) {
      seenUsernames.add(username);
    }
    totalsByUserId.set(user.user_id, total);
    perUser.push({
      user_id: user.user_id,
      nama: user.nama,
      divisi: user.divisi,
      client_id: user.client_id,
      username,
      kontak_sosial: {
        instagram: user.insta || null,
        tiktok: user.tiktok || null,
      },
      [metricKey]: total,
    });
  });

  for (const [username, total] of byUserMap.entries()) {
    if (seenUsernames.has(username)) continue;
    perUser.push({
      user_id: null,
      nama: null,
      divisi: null,
      client_id: null,
      username,
      [metricKey]: total,
      unmapped: true,
    });
  }

  return { perUser, totalsByUserId };
}

async function fetchInstagramLikeStats(clientId, startDate, endDate, { role, scope, regionalId }) {
  const normalizedClientId = clientId ? String(clientId).trim() : null;
  const normalizedRole = role ? String(role).trim().toLowerCase() : null;
  const normalizedScope = scope ? String(scope).trim().toLowerCase() : null;
  const normalizedRegionalId = regionalId ? String(regionalId).trim().toUpperCase() : null;

  const clientType = await getClientType(normalizedClientId);
  const shouldUseRoleFilter =
    Boolean(normalizedRole) && (normalizedScope === 'direktorat' || clientType === 'direktorat');

  const executeAggregation = async (useRoleFilter) => {
    const params = [];
    const addParam = (value) => {
      params.push(value);
      return `$${params.length}`;
    };

    const joins = ['JOIN insta_post p ON p.shortcode = l.shortcode'];
    const whereClauses = [];

    if (useRoleFilter && normalizedRole) {
      joins.push('LEFT JOIN insta_post_roles pr ON pr.shortcode = p.shortcode');
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

    const startIdx = addParam(startDate);
    const endIdx = addParam(endDate);
    whereClauses.push(
      `(p.created_at AT TIME ZONE 'Asia/Jakarta') BETWEEN ${startIdx}::timestamptz AND ${endIdx}::timestamptz`
    );

    const whereSql = whereClauses.length ? whereClauses.join(' AND ') : '1=1';
    const joinSql = joins.length ? ` ${joins.join(' ')}` : '';

    const { rows } = await query(
      `
      SELECT
        lower(replace(trim(COALESCE(lk.username, '')), '@', '')) AS username,
        COUNT(DISTINCT p.shortcode) AS total
      FROM insta_like l
      ${joinSql}
      JOIN LATERAL (
        SELECT COALESCE(elem->>'username', trim(both '"' FROM elem::text)) AS username
        FROM jsonb_array_elements(l.likes) AS elem
      ) AS lk ON TRUE
      WHERE ${whereSql}
      GROUP BY username
    `,
      params
    );

    const byUser = new Map();
    let totalLikes = 0;
    for (const row of rows) {
      const username = row.username ? row.username.toLowerCase() : null;
      if (!username) continue;
      const count = Number(row.total) || 0;
      totalLikes += count;
      byUser.set(username, count);
    }
    return { totalLikes, byUser };
  };

  const initial = await executeAggregation(shouldUseRoleFilter);
  if (
    initial.totalLikes === 0 &&
    shouldUseRoleFilter &&
    normalizedClientId &&
    clientType === 'direktorat'
  ) {
    return executeAggregation(false);
  }
  return initial;
}

async function fetchTiktokCommentStats(clientId, startDate, endDate, { role, scope, regionalId }) {
  const normalizedClientId = clientId ? String(clientId).trim() : null;
  const normalizedRole = role ? String(role).trim().toLowerCase() : null;
  const normalizedScope = scope ? String(scope).trim().toLowerCase() : null;
  const normalizedRegionalId = regionalId ? String(regionalId).trim().toUpperCase() : null;

  const clientType = await getClientType(normalizedClientId);
  const shouldUseRoleFilter =
    Boolean(normalizedRole) && (normalizedScope === 'direktorat' || clientType === 'direktorat');

  const executeAggregation = async (useRoleFilter) => {
    const params = [];
    const addParam = (value) => {
      params.push(value);
      return `$${params.length}`;
    };

    const joins = ['JOIN tiktok_post p ON p.video_id = c.video_id'];
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
      joins.push('JOIN clients c2 ON c2.client_id = p.client_id');
      const regionalIdx = addParam(normalizedRegionalId);
      whereClauses.push(`UPPER(c2.regional_id) = ${regionalIdx}`);
    }

    const startIdx = addParam(startDate);
    const endIdx = addParam(endDate);
    whereClauses.push(
      `(p.created_at AT TIME ZONE 'Asia/Jakarta') BETWEEN ${startIdx}::timestamptz AND ${endIdx}::timestamptz`
    );

    const whereSql = whereClauses.length ? whereClauses.join(' AND ') : '1=1';
    const joinSql = joins.length ? ` ${joins.join(' ')}` : '';

    const { rows } = await query(
      `
      SELECT
        lower(replace(trim(commenters.raw_username), '@', '')) AS username,
        COUNT(DISTINCT p.video_id) AS total
      FROM tiktok_comment c
      ${joinSql}
      JOIN LATERAL (
        SELECT raw_username
        FROM jsonb_array_elements_text(COALESCE(c.comments, '[]'::jsonb)) AS raw(raw_username)
      ) AS commenters ON TRUE
      WHERE ${whereSql}
      GROUP BY username
    `,
      params
    );

    const byUser = new Map();
    let totalComments = 0;
    for (const row of rows) {
      const username = row.username ? row.username.toLowerCase() : null;
      if (!username) continue;
      const count = Number(row.total) || 0;
      totalComments += count;
      byUser.set(username, count);
    }
    return { totalComments, byUser };
  };

  const initial = await executeAggregation(shouldUseRoleFilter);
  if (
    initial.totalComments === 0 &&
    shouldUseRoleFilter &&
    normalizedClientId &&
    clientType === 'direktorat'
  ) {
    return executeAggregation(false);
  }
  return initial;
}

async function getInstagramLikeStats(clientId, startDate, endDate, options) {
  const key = buildCacheKey('anev:ig_likes', { clientId, startDate, endDate, ...options });
  const cached = await redis.get(key);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      return {
        totalLikes: Number(parsed.totalLikes) || 0,
        byUser: mapFromObject(parsed.byUser),
      };
    } catch {
      // ignore cache parse errors
    }
  }
  const result = await fetchInstagramLikeStats(clientId, startDate, endDate, options);
  await redis.set(
    key,
    JSON.stringify({ totalLikes: result.totalLikes, byUser: Object.fromEntries(result.byUser) }),
    { EX: TTL_SEC }
  );
  return result;
}

async function getTiktokCommentStats(clientId, startDate, endDate, options) {
  const key = buildCacheKey('anev:tt_comments', { clientId, startDate, endDate, ...options });
  const cached = await redis.get(key);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      return {
        totalComments: Number(parsed.totalComments) || 0,
        byUser: mapFromObject(parsed.byUser),
      };
    } catch {
      // ignore cache parse errors
    }
  }
  const result = await fetchTiktokCommentStats(clientId, startDate, endDate, options);
  await redis.set(
    key,
    JSON.stringify({
      totalComments: result.totalComments,
      byUser: Object.fromEntries(result.byUser),
    }),
    { EX: TTL_SEC }
  );
  return result;
}

export async function getAnevSummary({
  clientId,
  role,
  scope,
  regionalId,
  startDate,
  endDate,
  timeRange,
  requesterRole,
  requesterClientId,
  requesterClientIds = [],
}) {
  const {
    users: activeUsers,
    clientId: resolvedClientId,
    role: normalizedRole,
    scope: normalizedScope,
  } = await getUserDirectoryUsers({
    requesterRole,
    tokenClientId: requesterClientId,
    tokenClientIds: requesterClientIds,
    clientId,
    role,
    scope,
    regionalId,
  });

  const targetClientId = resolvedClientId || clientId;
  const options = { role: normalizedRole, scope: normalizedScope, regionalId };
  const [igLikes, ttComments, igPosts, ttPosts] = await Promise.all([
    getInstagramLikeStats(targetClientId, startDate, endDate, options),
    getTiktokCommentStats(targetClientId, startDate, endDate, options),
    getInstaPostCount(targetClientId, 'custom', null, startDate, endDate, options),
    getTiktokPostCount(targetClientId, 'custom', null, startDate, endDate, options),
  ]);

  const expectedActions = (Number(igPosts) || 0) + (Number(ttPosts) || 0);
  const userDirectory = buildUserDirectory(activeUsers);
  const { perUser: instagramPerUser, totalsByUserId: instagramTotalsByUserId } =
    mapEngagementPerUser(activeUsers, igLikes.byUser, 'instagram');
  const { perUser: tiktokPerUser, totalsByUserId: tiktokTotalsByUserId } =
    mapEngagementPerUser(activeUsers, ttComments.byUser, 'tiktok');

  const compliance = activeUsers.map((user) => {
    const likes = instagramTotalsByUserId.get(user.user_id) || 0;
    const comments = tiktokTotalsByUserId.get(user.user_id) || 0;
    const totalActions = likes + comments;
    const completionRate = expectedActions > 0 ? totalActions / expectedActions : 0;
    return {
      user_id: user.user_id,
      nama: user.nama,
      divisi: user.divisi,
      client_id: user.client_id,
      likes,
      comments,
      total_actions: totalActions,
      completion_rate: Number(completionRate.toFixed(4)),
    };
  });

  return {
    filters: {
      client_id: targetClientId,
      role: normalizedRole || null,
      scope: normalizedScope || null,
      regional_id: regionalId || null,
      time_range: timeRange,
      start_date: startDate,
      end_date: endDate,
      permitted_time_ranges: ALLOWED_TIME_RANGES,
    },
    user_directory: userDirectory,
    instagram_engagement: {
      total_posts: Number(igPosts) || 0,
      total_likes: igLikes.totalLikes,
      per_user: instagramPerUser,
    },
    tiktok_engagement: {
      total_posts: Number(ttPosts) || 0,
      total_comments: ttComments.totalComments,
      per_user: tiktokPerUser,
    },
    aggregates: {
      total_users: activeUsers.length,
      instagram_posts: Number(igPosts) || 0,
      tiktok_posts: Number(ttPosts) || 0,
      total_likes: igLikes.totalLikes,
      total_comments: ttComments.totalComments,
      expected_actions: expectedActions,
      compliance_per_pelaksana: compliance,
    },
  };
}
