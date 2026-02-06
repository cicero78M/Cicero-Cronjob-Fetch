import redis from '../config/redis.js';

const TTL_SEC = 3600; // 1 hour

export async function getProfile(platform, username) {
  const key = `${platform}:profile:${username}`;
  const val = await redis.get(key);
  return val ? JSON.parse(val) : null;
}

export async function setProfile(platform, username, profile) {
  const key = `${platform}:profile:${username}`;
  await redis.set(key, JSON.stringify(profile), { EX: TTL_SEC });
}
