import './src/utils/logger.js';
// Note: Environment validation happens automatically through imports in services
import cronManifest from './src/cron/cronManifest.js';
import { registerDirRequestCrons } from './src/cron/dirRequest/index.js';
import { waClient, waGatewayClient } from './src/service/waService.js';
import { startOtpWorker } from './src/service/otpQueue.js';

const cronBuckets = cronManifest.reduce((buckets, { bucket, modulePath }) => {
  if (!bucket || !modulePath) return buckets;
  if (!buckets[bucket]) buckets[bucket] = [];

  if (!buckets[bucket].includes(modulePath)) {
    buckets[bucket].push(modulePath);
  }

  return buckets;
}, { always: [] });

const loadedCronModules = new Set();

async function loadCronModules(modules = []) {
  const pendingModules = modules.filter(modulePath => !loadedCronModules.has(modulePath));
  if (!pendingModules.length) return false;

  await Promise.all(pendingModules.map(async modulePath => {
    await import(modulePath);
    loadedCronModules.add(modulePath);
    console.log(`[CRON] Activated ${modulePath}`);
  }));

  return true;
}

function logBucketStatus(label, activated) {
  const status = activated ? 'activated' : 'already active';
  console.log(`[CRON] ${label} cron bucket ${status}`);
}

function scheduleCronBucket(client, bucketKey, label) {
  const modules = cronBuckets[bucketKey] || [];
  if (!modules.length) return;

  const activateBucket = () =>
    loadCronModules(modules)
      .then(activated => logBucketStatus(label, activated))
      .catch(err => console.error(`[CRON] Failed to activate ${label} cron bucket`, err));

  client.on('ready', () => {
    console.log(`[CRON] ${label} client ready event`);
    activateBucket();
  });

  client
    .waitForWaReady()
    .then(() => {
      console.log(`[CRON] ${label} client ready`);
      return activateBucket();
    })
    .catch(err => console.error(`[CRON] Error waiting for ${label} readiness`, err));
}

loadCronModules(cronBuckets.always)
  .then(activated => logBucketStatus('Always', activated))
  .catch(err => console.error('[CRON] Failed to activate always cron bucket', err));

scheduleCronBucket(waClient, 'waClient', 'WA client');
registerDirRequestCrons(waGatewayClient);

startOtpWorker().catch(err => console.error('[OTP] worker error', err));

console.log('Cicero CronJob service started - Web endpoints and wabot menus removed');
console.log('Only automated cron jobs and background workers are running');
