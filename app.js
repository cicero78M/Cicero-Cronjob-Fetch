import './src/utils/logger.js';
import './src/cron/cronDirRequestFetchSosmed.js';
import './src/cron/cronWaOutboxWorker.js';

console.log('='.repeat(60));
console.log('Cicero Social Media Fetch CronJob Service');
console.log('='.repeat(60));
console.log('Service started successfully');
console.log('Only social media fetch cron jobs are running');
console.log('- Fetching Instagram posts, likes, and comments');
console.log('- Fetching TikTok posts and comments');
console.log('- Processing WhatsApp outbox queue for task notifications (every minute)');
console.log('Schedule: Every 30 minutes from 6 AM to 10 PM Jakarta time');
console.log('='.repeat(60));
