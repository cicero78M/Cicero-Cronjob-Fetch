import cron from 'node-cron';
let cronJobServicePromise;

function loadCronJobService() {
  if (!cronJobServicePromise) {
    cronJobServicePromise = import('../service/cronJobConfigService.js');
  }
  return cronJobServicePromise;
}

const DEFAULT_LOG_PREFIX = '[CRON]';
const CRON_STATUS_LOOKUP_STRATEGY = {
  FAIL_OPEN: 'fail_open',
  FAIL_CLOSED: 'fail_closed',
};

function log(message, ...args) {
  console.log(`${DEFAULT_LOG_PREFIX} ${message}`, ...args);
}

function logError(message, error) {
  console.error(`${DEFAULT_LOG_PREFIX} ${message}`, error);
}

function getStatusLookupStrategy() {
  const configuredStrategy =
    process.env.CRON_STATUS_LOOKUP_STRATEGY?.trim().toLowerCase() ||
    CRON_STATUS_LOOKUP_STRATEGY.FAIL_OPEN;

  if (configuredStrategy === CRON_STATUS_LOOKUP_STRATEGY.FAIL_CLOSED) {
    return CRON_STATUS_LOOKUP_STRATEGY.FAIL_CLOSED;
  }

  return CRON_STATUS_LOOKUP_STRATEGY.FAIL_OPEN;
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
      let statusLookupFailed = false;
      let lastStatusLookupError;

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
            statusLookupFailed = true;
            lastStatusLookupError = err;
            logError(
              `Failed to check status for job ${jobKey} (attempt ${attempt}).`,
              err,
            );

            if (attempt === 2) {
              const statusLookupStrategy = getStatusLookupStrategy();
              if (statusLookupStrategy === CRON_STATUS_LOOKUP_STRATEGY.FAIL_CLOSED) {
                logError(
                  `ALERT: Skipping job ${jobKey} because status lookup failed and CRON_STATUS_LOOKUP_STRATEGY=fail_closed.`,
                  lastStatusLookupError,
                );
                return;
              }

              if (statusLookupFailed) {
                log(
                  `Proceeding with job ${jobKey} handler after status lookup failures (strategy: fail_open).`,
                );
              }
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
