import redis from '../config/redis.js';
import { countPostsByClient as countInstaPostsByClient } from '../model/instaPostModel.js';
import { countPostsByClient as countTiktokPostsByClient } from '../model/tiktokPostModel.js';

const TTL_SEC = 60; // cache 1 minute
const DATE_TTL_SEC = 10; // shorter cache for specific date queries

function buildKey(platform, clientId, periode, tanggal, startDate, endDate, role, scope, regionalId) {
  const normalizedRole = role ? String(role).toLowerCase() : '';
  const normalizedScope = scope ? String(scope).toLowerCase() : '';
  const normalizedRegionalId = regionalId ? String(regionalId).toUpperCase() : '';
  return [
    platform,
    'post_count',
    clientId,
    periode,
    tanggal || '',
    startDate || '',
    endDate || '',
    normalizedRole,
    normalizedScope,
    normalizedRegionalId,
  ].join(':');
}

function normalizeOptions(roleOrOptions, scopeOrOptions, regionalIdArg) {
  if (typeof roleOrOptions === 'object' && roleOrOptions !== null && !Array.isArray(roleOrOptions)) {
    return roleOrOptions;
  }
  if (typeof scopeOrOptions === 'object' && scopeOrOptions !== null && !Array.isArray(scopeOrOptions)) {
    return { ...scopeOrOptions, role: roleOrOptions };
  }
  return {
    role: roleOrOptions ?? null,
    scope: scopeOrOptions ?? null,
    regionalId: regionalIdArg ?? null,
  };
}

async function getCachedCount(platform, clientId, periode, tanggal, startDate, endDate, options, fetchFn) {
  const {
    role = null,
    scope = null,
    regionalId = null,
    useCache = true,
    cacheTtlSeconds,
    dateCacheTtlSeconds,
  } = options || {};
  if (!useCache) {
    return fetchFn(clientId, periode, tanggal, startDate, endDate, options || {});
  }
  const key = buildKey(platform, clientId, periode, tanggal, startDate, endDate, role, scope, regionalId);
  const cached = await redis.get(key);
  if (cached !== null) return parseInt(cached, 10);
  const count = await fetchFn(clientId, periode, tanggal, startDate, endDate, options || {});
  const ttlSeconds =
    cacheTtlSeconds ?? (tanggal ? dateCacheTtlSeconds ?? DATE_TTL_SEC : TTL_SEC);
  await redis.set(key, String(count), { EX: ttlSeconds });
  return count;
}

export function getInstaPostCount(clientId, periode, tanggal, startDate, endDate, roleOrOptions, scopeOrOptions, regionalIdArg) {
  const options = normalizeOptions(roleOrOptions, scopeOrOptions, regionalIdArg);
  const cacheClientId = options.igClientIdOverride || clientId;
  return getCachedCount(
    'instagram',
    cacheClientId,
    periode,
    tanggal,
    startDate,
    endDate,
    options,
    (id, per, tgl, start, end, opts) =>
      countInstaPostsByClient(id, per, tgl, start, end, opts)
  );
}

export function getTiktokPostCount(clientId, periode, tanggal, startDate, endDate, roleOrOptions, scopeOrOptions, regionalIdArg) {
  const options = normalizeOptions(roleOrOptions, scopeOrOptions, regionalIdArg);
  return getCachedCount(
    'tiktok',
    clientId,
    periode,
    tanggal,
    startDate,
    endDate,
    options,
    (id, per, tgl, start, end, opts) =>
      countTiktokPostsByClient(id, per, tgl, start, end, opts)
  );
}
