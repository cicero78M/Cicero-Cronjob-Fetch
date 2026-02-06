import redis from '../config/redis.js';

export async function insertCache(username, posts) {
  if (!username) return;
  const key = `insta:posts:${username}`;
  const value = JSON.stringify({ posts, fetched_at: new Date().toISOString() });
  await redis.set(key, value);
}

