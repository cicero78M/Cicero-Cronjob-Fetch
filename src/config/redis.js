import { createClient } from 'redis';
import { env } from './env.js';

const redisUrl = env.REDIS_URL;

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

await redis.connect();

export default redis;
