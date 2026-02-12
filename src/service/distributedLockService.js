import redis from "../config/redis.js";

const LOCK_RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

/**
 * Acquire distributed lock in Redis using NX+EX semantics.
 * @param {object} options
 * @param {string} options.key
 * @param {number} options.ttlSeconds
 * @param {string} [options.ownerId]
 * @returns {Promise<{acquired: boolean, key: string, ownerId: string, release: () => Promise<void>, reason?: string}>}
 */
export async function acquireDistributedLock({ key, ttlSeconds, ownerId }) {
  const lockOwnerId = ownerId || `${process.pid}:${Date.now()}:${Math.random().toString(16).slice(2)}`;

  try {
    const result = await redis.set(key, lockOwnerId, {
      NX: true,
      EX: ttlSeconds,
    });

    if (result !== "OK") {
      return {
        acquired: false,
        key,
        ownerId: lockOwnerId,
        release: async () => {},
        reason: "lock_held",
      };
    }

    return {
      acquired: true,
      key,
      ownerId: lockOwnerId,
      release: async () => {
        await redis.eval(LOCK_RELEASE_SCRIPT, {
          keys: [key],
          arguments: [lockOwnerId],
        });
      },
    };
  } catch (error) {
    console.error(`[distributedLockService] Failed to acquire lock key=${key}:`, error?.message || error);
    return {
      acquired: false,
      key,
      ownerId: lockOwnerId,
      release: async () => {},
      reason: "lock_error",
    };
  }
}
