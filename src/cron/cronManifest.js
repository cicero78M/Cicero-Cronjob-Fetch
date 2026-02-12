export default [
  {
    jobKey: './src/cron/cronDirRequestFetchSosmed.js',
    modulePath: './src/cron/cronDirRequestFetchSosmed.js',
    bucket: 'always',
    description: 'Fetch Instagram/TikTok posts, likes, and comments for all active clients.',
  },
  {
    jobKey: './src/cron/cronWaOutboxWorker.js',
    modulePath: './src/cron/cronWaOutboxWorker.js',
    bucket: 'always',
    description: 'Dispatch pending WhatsApp notification outbox with retry backoff and dead-letter handling.',
  },
];
