import crypto from 'crypto';

let redisClient = null;
async function getRedis() {
  if (!redisClient) {
    const mod = await import('../config/redis.js');
    redisClient = mod.default;
  }
  return redisClient;
}

export function createRequestHash(req, userPart = '') {
  return crypto
    .createHash('sha1')
    .update(
      req.method + req.originalUrl + JSON.stringify(req.body || {}) + userPart
    )
    .digest('hex');
}

export async function storeRequestHash(hash, ttlSec) {
  const redis = await getRedis();
  const key = `dedup:${hash}`;
  await redis.set(key, '1', { EX: ttlSec });
}
