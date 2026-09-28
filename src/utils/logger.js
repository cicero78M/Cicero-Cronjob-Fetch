import { formatJakartaIsoTimestamp } from './jakartaDateTime.js';
const originalLog = console.log.bind(console);
const originalWarn = console.warn.bind(console);
const originalError = console.error.bind(console);

const DEFAULT_SIGNAL_DECRYPT_LOG_INTERVAL_MS = 60_000;
const parsedSignalDecryptLogIntervalMs = Number.parseInt(
  String(process.env.WA_BAILEYS_DECRYPT_LOG_INTERVAL_MS || ''),
  10
);
const signalDecryptLogIntervalMs = Number.isFinite(parsedSignalDecryptLogIntervalMs)
  ? Math.min(300_000, Math.max(5_000, parsedSignalDecryptLogIntervalMs))
  : DEFAULT_SIGNAL_DECRYPT_LOG_INTERVAL_MS;

const signalDecryptLogState = {
  lastSummaryAt: 0,
  suppressed: 0,
};

export function isLibsignalDecryptNoise(args = []) {
  const firstArgument = String(args[0] || '');
  return (
    firstArgument.startsWith('Failed to decrypt message with any known session') ||
    firstArgument.startsWith(
      'Session error:SessionError: Over 2000 messages into the future!'
    )
  );
}

function getTimestamp() {
  return formatJakartaIsoTimestamp(new Date()) || new Date().toISOString();
}

function logSignalDecryptSummary(timestamp) {
  const suppressedSuffix = signalDecryptLogState.suppressed > 0
    ? `; suppressed ${signalDecryptLogState.suppressed} verbose libsignal lines`
    : '';

  originalError(
    `[${timestamp}]`,
    `[BAILEYS][SIGNAL] Incoming message session is out of sync${suppressedSuffix}; ` +
      'Baileys native retry will request fresh keys.'
  );
  signalDecryptLogState.lastSummaryAt = Date.now();
  signalDecryptLogState.suppressed = 0;
}

console.log = (...args) => {
  originalLog(`[${getTimestamp()}]`, ...args);
};

console.warn = (...args) => {
  originalWarn(`[${getTimestamp()}]`, ...args);
};

console.error = (...args) => {
  if (isLibsignalDecryptNoise(args)) {
    const now = Date.now();
    signalDecryptLogState.suppressed += 1;
    if (
      signalDecryptLogState.lastSummaryAt === 0 ||
      now - signalDecryptLogState.lastSummaryAt >= signalDecryptLogIntervalMs
    ) {
      logSignalDecryptSummary(getTimestamp());
    }
    return;
  }

  originalError(`[${getTimestamp()}]`, ...args);
};
