# Redis Guide
*Last updated: 2025-06-25*

This document describes how Redis is configured and used in **Cicero_V2**. Redis stores login tokens, caches profiles, and detects duplicate API requests.

## 1. Installing Redis

Install the `redis-server` package on your system. On Debian-based distributions:

```bash
sudo apt-get install redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

## 2. Application Configuration

Set the `REDIS_URL` environment variable in `.env` to the Redis server address, for example:

```ini
REDIS_URL=redis://localhost:6379
```

The file `src/config/redis.js` reads this URL and creates the Redis client.

## 3. Usage within Cicero_V2

Modules that rely on Redis include:

- `authRoutes.js` – stores login tokens from `/auth/login` and `/auth/user-login` per client.
- `dedupRequestMiddleware.js` – prevents duplicate requests by storing a short-lived hash in Redis.
- `profileCacheService.js` – caches Instagram and TikTok profiles for one hour to speed up responses.
- `requestHash.js` – helper utility that also interacts with Redis to store request hashes.

## 4. Clearing Data

During development you may need to remove all Redis keys:

```bash
redis-cli FLUSHALL
```

The above command deletes all data from the current Redis instance.
