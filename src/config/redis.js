import { createClient } from 'redis';
import { env } from './env.js';

const redisUrl = env.REDIS_URL;

const redis = createClient({ url: redisUrl });

redis.on('error', (err) => console.error('Redis Client Error', err));

await redis.connect();

export default redis;
