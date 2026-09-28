import { createClient } from 'redis';
import { env } from './env.js';

const parseSentinels = (raw) => String(raw || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const url = new URL(entry.includes('://') ? entry : `redis://${entry}`);
    return { host: url.hostname, port: Number(url.port || 26379) };
  });

const sentinelMode = Boolean(env.REDIS_SENTINELS || env.REDIS_SENTINEL_NAME);

if (sentinelMode && (!env.REDIS_SENTINELS || !env.REDIS_SENTINEL_NAME)) {
  throw new Error('REDIS_SENTINELS and REDIS_SENTINEL_NAME must be configured together');
}

const createSentinelClient = async () => {
  const { default: IORedis } = await import('ioredis');
  const client = new IORedis({
    sentinels: parseSentinels(env.REDIS_SENTINELS),
    name: env.REDIS_SENTINEL_NAME,
    ...(env.REDIS_USERNAME ? { username: env.REDIS_USERNAME } : {}),
    ...(env.REDIS_PASSWORD ? { password: env.REDIS_PASSWORD } : {}),
    ...(env.REDIS_TLS ? { tls: {} } : {}),
    connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS,
    maxRetriesPerRequest: null,
    retryStrategy: (times) => Math.min(250 * (2 ** Math.min(times - 1, 5)), 5000),
  });

  client.on('error', (err) => console.error('Redis Client Error', err));
  return {
    on: (...args) => client.on(...args),
    connect: async () => undefined,
    get: (...args) => client.get(...args),
    del: (...args) => client.del(...args),
    ttl: (...args) => client.ttl(...args),
    exists: (...args) => client.exists(...args),
    set: (key, value, options = {}) => {
      const args = [];
      if (options.NX) args.push('NX');
      if (typeof options.EX === 'number') args.push('EX', options.EX);
      if (typeof options.PX === 'number') args.push('PX', options.PX);
      return client.set(key, value, ...args);
    },
    eval: (script, options = {}) => client.eval(
      script,
      options.keys?.length || 0,
      ...(options.keys || []),
      ...(options.arguments || []),
    ),
    quit: () => client.quit(),
  };
};

const redisUrl = env.REDIS_URL;

const createEndpointClient = () => {
  const redis = createClient({
    url: redisUrl,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS,
      reconnectStrategy: (retries) => {
        if (retries >= 5) return new Error('Redis reconnect attempts exhausted');
        return Math.min(250 * (2 ** retries), 5000);
      },
    },
  });

  redis.on('error', (err) => console.error('Redis Client Error', err));
  return redis;
};

const redis = sentinelMode ? await createSentinelClient() : createEndpointClient();

if (!sentinelMode) await redis.connect();

export default redis;
