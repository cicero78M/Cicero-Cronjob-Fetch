import dotenv from 'dotenv';

const envFile = process.env.PREFLIGHT_ENV_FILE;
dotenv.config(envFile ? { path: envFile } : undefined);

const startedAt = Date.now();
const checks = {};

function record(name, ok, detail = {}) {
  checks[name] = { ok, ...detail };
}

const requiredConfig = [
  'DB_HOST',
  'DB_NAME',
  'DB_USER',
  'DB_PASS',
  'REDIS_URL',
  'RAPIDAPI_KEY',
  'GATEWAY_WA_CLIENT_ID',
];

const missingConfig = requiredConfig.filter((key) => !String(process.env[key] || '').trim());
record('configuration', missingConfig.length === 0, { missing: missingConfig });
record('providerFallback', Boolean(
  String(process.env.RAPIDAPI_FALLBACK_KEY || '').trim()
  && String(process.env.RAPIDAPI_FALLBACK_HOST || '').trim()
));

let closeDatabase;
try {
  const database = await import('../src/db/index.js');
  closeDatabase = database.close;
  const dbStartedAt = Date.now();
  const result = await database.withTransaction(
    async (client) => client.query(
      `SELECT
         to_regclass('public.clients') IS NOT NULL AS clients_ready,
         to_regclass('public.insta_post') IS NOT NULL AS instagram_ready,
         to_regclass('public.tiktok_post') IS NOT NULL AS tiktok_ready,
         to_regclass('public.wa_notification_outbox') IS NOT NULL AS outbox_ready,
         to_regclass('public.wa_notification_scheduler_state') IS NOT NULL AS scheduler_state_ready`
    ),
    { sessionSettings: { default_transaction_read_only: 'on' } }
  );
  const schema = result.rows[0];
  record('database', Object.values(schema).every(Boolean), {
    latencyMs: Date.now() - dbStartedAt,
    schema,
  });
} catch (error) {
  record('database', false, { error: error?.code || error?.name || 'database_error' });
} finally {
  await closeDatabase?.();
}

let redis;
try {
  const redisStartedAt = Date.now();
  ({ default: redis } = await import('../src/config/redis.js'));
  await redis.ping();
  record('redis', true, { latencyMs: Date.now() - redisStartedAt });
} catch (error) {
  record('redis', false, { error: error?.code || error?.name || 'redis_error' });
} finally {
  if (redis?.isOpen) await redis.quit();
}

const ok = Object.values(checks).every((check) => check.ok);
console.log(JSON.stringify({
  ok,
  mode: 'read_only_preflight',
  durationMs: Date.now() - startedAt,
  checks,
}, null, 2));

if (!ok) process.exitCode = 1;
