import { env } from '../config/env.js';

export function withAxiosTimeout(config = {}, timeoutMs = env.HTTP_REQUEST_TIMEOUT_MS) {
  return {
    ...config,
    timeout: config.timeout ?? timeoutMs,
  };
}

export function withFetchTimeout(options = {}, timeoutMs = env.HTTP_REQUEST_TIMEOUT_MS) {
  if (options.signal) return options;

  return {
    ...options,
    signal: globalThis.AbortSignal.timeout(timeoutMs),
  };
}
