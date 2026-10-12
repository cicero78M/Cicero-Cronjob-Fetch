import axios from 'axios';

const DEFAULT_MIN_INTERVAL_MS = 500;
const DEFAULT_ENTITLEMENT_COOLDOWN_MS = 15 * 60 * 1000;

const minIntervalMs = Math.max(
  0,
  Number(process.env.TIKTOK_RAPIDAPI_MIN_INTERVAL_MS || DEFAULT_MIN_INTERVAL_MS),
);
const entitlementCooldownMs = Math.max(
  1000,
  Number(process.env.TIKTOK_RAPIDAPI_ENTITLEMENT_COOLDOWN_MS || DEFAULT_ENTITLEMENT_COOLDOWN_MS),
);

let queue = Promise.resolve();
let nextAllowedAt = 0;
const suppressedHosts = new Map();

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function responseText(error) {
  const data = error?.response?.data;
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data || error?.message || '');
  } catch {
    return String(error?.message || '');
  }
}

export function isProviderEntitlementError(error) {
  const text = responseText(error).toLowerCase();
  return /not subscribed|subscription|invalid api key|api key is invalid|access denied/.test(text)
    || [401, 403].includes(Number(error?.response?.status || error?.statusCode));
}

export function isRateLimitError(error) {
  return Number(error?.response?.status || error?.statusCode) === 429;
}

export function getRetryAfterMs(error, fallbackMs = 1000) {
  const raw = error?.response?.headers?.['retry-after']
    ?? error?.response?.headers?.['Retry-After'];
  if (raw !== undefined) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateMs = Date.parse(raw);
    if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  }
  return fallbackMs;
}

function markHostSuppressed(host) {
  if (host) suppressedHosts.set(host, Date.now() + entitlementCooldownMs);
}

function assertHostAvailable(host) {
  const until = suppressedHosts.get(host);
  if (!until) return;
  if (until <= Date.now()) {
    suppressedHosts.delete(host);
    return;
  }
  const error = new Error(`RapidAPI host ${host} temporarily suppressed after entitlement error`);
  error.code = 'RAPIDAPI_HOST_SUPPRESSED';
  error.retryable = false;
  throw error;
}

export function rapidApiGet(host, path, config = {}) {
  const task = queue.then(async () => {
    assertHostAvailable(host);
    const waitMs = Math.max(0, nextAllowedAt - Date.now());
    if (waitMs) await delay(waitMs);
    nextAllowedAt = Date.now() + minIntervalMs;
    try {
      const response = await axios.get(
        `https://${host}/${path}`,
        config,
      );
      return response;
    } catch (error) {
      if (isProviderEntitlementError(error)) markHostSuppressed(host);
      throw error;
    }
  });
  queue = task.catch(() => undefined);
  return task;
}

export function enqueueRapidApiRequest(task, host = null) {
  const queued = queue.then(async () => {
    assertHostAvailable(host);
    const waitMs = Math.max(0, nextAllowedAt - Date.now());
    if (waitMs) await delay(waitMs);
    nextAllowedAt = Date.now() + minIntervalMs;
    try {
      return await task();
    } catch (error) {
      if (isProviderEntitlementError(error)) markHostSuppressed(host);
      throw error;
    }
  });
  queue = queued.catch(() => undefined);
  return queued;
}

export function resetRapidApiGuardForTests() {
  queue = Promise.resolve();
  nextAllowedAt = 0;
  suppressedHosts.clear();
}
