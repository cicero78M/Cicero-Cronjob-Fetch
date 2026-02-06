import cron from 'node-cron';
let cronJobServicePromise;

function loadCronJobService() {
  if (!cronJobServicePromise) {
    cronJobServicePromise = import('../service/cronJobConfigService.js');
  }
  return cronJobServicePromise;
}

const DEFAULT_LOG_PREFIX = '[CRON]';

function log(message, ...args) {
  console.log(`${DEFAULT_LOG_PREFIX} ${message}`, ...args);
}

function logError(message, error) {
  console.error(`${DEFAULT_LOG_PREFIX} ${message}`, error);
}

export function scheduleCronJob(jobKey, cronExpression, handler, options = {}) {
  if (!jobKey) {
    throw new Error('jobKey is required for scheduleCronJob');
  }
  if (typeof handler !== 'function') {
    throw new TypeError('handler must be a function');
  }

  return cron.schedule(
    cronExpression,
    async (...args) => {
      let config;
      let getCronJob;

      try {
        ({ getCronJob } = await loadCronJobService());
      } catch (err) {
        logError(
          `Failed to load cron config service for job ${jobKey}. Proceeding without status check.`,
          err,
        );
      }

      if (getCronJob) {
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            config = await getCronJob(jobKey);
            break;
          } catch (err) {
            logError(
              `Failed to check status for job ${jobKey} (attempt ${attempt}).`,
              err,
            );

            if (attempt === 2) {
              log(
                `Proceeding with job ${jobKey} handler after status lookup failures.`,
              );
            }
          }
        }
      }

      if (config && config.is_active === false) {
        log(`Skipping job ${jobKey} because it is inactive.`);
        return;
      }

      try {
        await handler(...args);
      } catch (err) {
        logError(`Handler for job ${jobKey} failed.`, err);
      }
    },
    options,
  );
}
