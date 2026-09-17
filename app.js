import './src/utils/logger.js';
import { env } from './src/config/env.js';
import { close as closeDatabase } from './src/db/index.js';

let shuttingDown = false;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[APP] ${signal} received; closing database pool`);
    try {
      await closeDatabase();
    } catch (error) {
      console.error('[APP] Failed to close database pool:', error?.message || error);
    } finally {
      process.exit(0);
    }
  });
}

if (env.FETCH_SCHEDULER_ENABLED) {
  await import('./src/cron/cronDirRequestFetchSosmed.js');
}

if (env.WA_OUTBOX_ENABLED) {
  await import('./src/cron/cronWaOutboxWorker.js');
}

if (!env.FETCH_SCHEDULER_ENABLED && !env.WA_OUTBOX_ENABLED) {
  setInterval(() => {}, 60_000);
}

console.log('='.repeat(60));
console.log('Cicero Social Media Fetch CronJob Service');
console.log('='.repeat(60));
console.log('Service started successfully');
console.log(`Fetch scheduler: ${env.FETCH_SCHEDULER_ENABLED ? 'enabled' : 'disabled'}`);
console.log(`WhatsApp outbox worker: ${env.WA_OUTBOX_ENABLED ? 'enabled' : 'disabled'}`);
console.log('- Fetching Instagram posts, likes, and comments');
console.log('- Fetching TikTok posts and comments');
console.log('- Processing WhatsApp outbox queue for task notifications (every minute)');
console.log('Schedule: Every 30 minutes from 6 AM to 10 PM Jakarta time');
console.log('='.repeat(60));
