import fs from 'fs';
import { rm } from 'fs/promises';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
} from '@whiskeysockets/baileys';
import P from 'pino';

// Enable debug logging only when WA_DEBUG_LOGGING is set to "true"
const debugLoggingEnabled = process.env.WA_DEBUG_LOGGING === 'true';

const DEFAULT_AUTH_DATA_DIR = 'baileys_auth';
const DEFAULT_AUTH_DATA_PARENT_DIR = '.cicero';
const SESSION_LOCK_FILE_NAME = '.session.lock';
const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM'];
// Delay to ensure async file system operations complete before verification
const FILE_SYSTEM_OPERATION_DELAY = 100; // milliseconds

function readBoundedPositiveInt(name, fallback, { min = 1000, max = 300000 } = {}) {
  const parsed = Number.parseInt(String(process.env[name] || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function withOperationTimeout(promise, timeoutMs, operation) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const error = new Error(`[BAILEYS] ${operation} timed out after ${timeoutMs}ms`);
      error.code = 'WA_BAILEYS_OPERATION_TIMEOUT';
      reject(error);
    }, timeoutMs);

    Promise.resolve(promise).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function resolveDefaultAuthDataPath() {
  const homeDir = os.homedir?.();
  const baseDir = homeDir || process.cwd();
  return path.resolve(
    path.join(baseDir, DEFAULT_AUTH_DATA_PARENT_DIR, DEFAULT_AUTH_DATA_DIR)
  );
}

function resolveAuthDataPath() {
  const configuredPath = (process.env.WA_AUTH_DATA_PATH || '').trim();
  if (configuredPath) {
    return path.resolve(configuredPath);
  }
  return resolveDefaultAuthDataPath();
}

function shouldClearAuthSession() {
  return process.env.WA_AUTH_CLEAR_SESSION_ON_REINIT === 'true';
}

function shouldStrictSingleOwner() {
  return process.env.WA_BAILEYS_STRICT_SINGLE_OWNER === 'true';
}

function shouldAutoRecoverDecryptErrors() {
  return process.env.WA_BAILEYS_AUTO_RECOVER_DECRYPT_ERRORS === 'true';
}

function shouldRepairTargetedSignalSessions() {
  return process.env.WA_BAILEYS_TARGETED_SESSION_REPAIR !== 'false';
}

export function extractSignalSessionIds(errorText) {
  const matches = String(errorText || '').matchAll(/\b(\d+\.\d+)\s+\[as awaitable\]/gi);
  return [...new Set(Array.from(matches, (match) => match[1]))];
}

function isProcessRunning(pid) {
  if (!pid || pid === process.pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return false;
  }
}

function buildSessionLockGuardMessage({ clientId, sessionPath, lockPath, lockMetadata }) {
  const pid = lockMetadata?.pid ?? 'unknown';
  const reason = lockMetadata?.pid ? `pid=${lockMetadata.pid}` : 'active lock';
  return (
    `[BAILEYS] Shared session lock detected for clientId=${clientId} ` +
    `(sessionPath=${sessionPath}, lockPath=${lockPath}, reason=${reason}, pid=${pid}). ` +
    'Another process appears to be using this session. ' +
    'Use distinct WA_AUTH_DATA_PATH per process to avoid lock contention.'
  );
}

function emitSessionLockFatalLog({ clientId, sessionPath, lockPath, lockMetadata }) {
  const ownerClientId = lockMetadata?.clientId || 'unknown';
  const ownerPid = lockMetadata?.pid || 'unknown';
  const ownerHostname = lockMetadata?.hostname || 'unknown';
  const ownerStartedAt = lockMetadata?.startedAt || 'unknown';

  console.error(
    `[BAILEYS][FATAL] WA_BAILEYS_SHARED_SESSION_LOCK detected for clientId=${clientId}. ` +
      `Lock owner: clientId=${ownerClientId}, pid=${ownerPid}, hostname=${ownerHostname}, startedAt=${ownerStartedAt}. ` +
      `Session path: ${sessionPath} (lock file: ${lockPath}). ` +
      'Operational action: pastikan hanya 1 owner per clientId.'
  );
}

/**
 * Create a Baileys WhatsApp client
 * @param {string} clientId - Unique identifier for the client
 * @returns {Promise<EventEmitter>} EventEmitter with WhatsApp client methods
 */
export async function createBaileysClient(clientId = 'wa-admin') {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(50);

  const authBasePath = resolveAuthDataPath();
  const sessionPath = path.join(authBasePath, clientId);
  const sessionLockPath = path.join(sessionPath, SESSION_LOCK_FILE_NAME);
  const clearAuthSession = shouldClearAuthSession();
  const strictSingleOwner = shouldStrictSingleOwner();
  const autoRecoverDecryptErrors = shouldAutoRecoverDecryptErrors();
  const targetedSignalSessionRepair = shouldRepairTargetedSignalSessions();

  // Create auth directory if it doesn't exist
  // Ensure the full path is created recursively and verify it's writable
  try {
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
      console.log(`[BAILEYS] Created auth directory: ${sessionPath}`);
    }
  } catch (error) {
    console.error(`[BAILEYS] Failed to create auth directory: ${sessionPath}`, error);
    throw new Error(`Auth directory creation failed: ${error.message}`);
  }

  // Verify directory is writable
  try {
    fs.accessSync(sessionPath, fs.constants.W_OK | fs.constants.R_OK);
  } catch (error) {
    console.error(`[BAILEYS] Auth directory is not readable/writable: ${sessionPath}`, error);
    throw new Error(`Auth directory not accessible (check permissions): ${error.message}`);
  }

  let sock = null;
  let connectInProgress = null;
  let connectStartedAt = null;
  let reinitInProgress = false;
  let reconnectTimeout = null;
  let reconnectAttempts = 0;
  let badSessionRecoveryAttempts = 0;
  let connectionState = 'DISCONNECTED';
  let stopped = false;
  let socketGeneration = 0;
  let authKeyStore = null;
  const connectTimeoutMs = readBoundedPositiveInt(
    'WA_BAILEYS_CONNECT_TIMEOUT_MS',
    30000
  );
  const queryTimeoutMs = readBoundedPositiveInt(
    'WA_BAILEYS_QUERY_TIMEOUT_MS',
    60000
  );
  const keepAliveIntervalMs = readBoundedPositiveInt(
    'WA_BAILEYS_KEEPALIVE_INTERVAL_MS',
    20000,
    { min: 5000, max: 60000 }
  );
  const reconnectBaseDelayMs = readBoundedPositiveInt(
    'WA_BAILEYS_RECONNECT_BASE_DELAY_MS',
    3000,
    { min: 500, max: 60000 }
  );
  const reconnectMaxDelayMs = readBoundedPositiveInt(
    'WA_BAILEYS_RECONNECT_MAX_DELAY_MS',
    60000,
    { min: reconnectBaseDelayMs, max: 300000 }
  );
  const maxBadSessionRecoveryAttempts = readBoundedPositiveInt(
    'WA_BAILEYS_MAX_BAD_SESSION_RECOVERY_ATTEMPTS',
    2,
    { min: 1, max: 10 }
  );
  let consecutiveMacErrors = 0;
  const MAX_CONSECUTIVE_MAC_ERRORS = 2; // Reduced from 3 to 2 for faster recovery
  let lastMacErrorTime = 0;
  const MAC_ERROR_RESET_TIMEOUT = 60000; // Reset counter after 60 seconds without errors
  const MAC_ERROR_RAPID_THRESHOLD = 5000; // If errors occur within 5 seconds, consider it rapid/serious
  const MAC_ERROR_BURST_THRESHOLD = 1000; // If errors occur within 1 second, it's a burst (immediate action)
  let lockHeldByCurrentProcess = false;
  let lastRecoveryAttemptTime = 0;
  const RECOVERY_COOLDOWN = 30000; // Don't attempt recovery more than once every 30 seconds
  let errorsDuringCooldown = 0; // Track errors that occur during cooldown
  const MAX_ERRORS_DURING_COOLDOWN = 5; // Force recovery if too many errors during cooldown
  const COOLDOWN_LOG_INTERVAL = 5000; // Emit max one cooldown log per source every 5 seconds
  const MAC_ERROR_DEDUP_WINDOW = 1500; // Avoid double-counting same Bad MAC signal from multiple event paths
  const DECRYPT_LOG_INTERVAL = readBoundedPositiveInt(
    'WA_BAILEYS_DECRYPT_LOG_INTERVAL_MS',
    60000,
    { min: 5000, max: 300000 }
  );
  const maxSessionRepairAttempts = readBoundedPositiveInt(
    'WA_BAILEYS_MAX_SESSION_REPAIR_ATTEMPTS',
    3,
    { min: 1, max: 10 }
  );
  const sessionRepairWindowMs = readBoundedPositiveInt(
    'WA_BAILEYS_SESSION_REPAIR_WINDOW_MS',
    3600000,
    { min: 60000, max: 86400000 }
  );
  const pairingPhoneNumber = String(process.env.WA_BAILEYS_PAIRING_PHONE || '')
    .replace(/\D/g, '');
  let lastMacErrorSignature = null;
  let lastMacErrorSignatureTime = 0;
  let sessionRepairWindowStartedAt = 0;
  let sessionRepairAttempts = 0;
  let authRepairRequired = false;
  let lastNativeRetryNoticeAt = 0;
  const repairedSignalSessions = new Set();
  const repairingSignalSessions = new Set();
  const cooldownLogState = new Map();
  const decryptLogState = { lastLogAt: 0, suppressedCount: 0 };

  const BAD_MAC_CATEGORY_PATTERNS = [
    {
      category: 'bad-mac-decrypt',
      patterns: ['failed to decrypt message with any known session'],
      canonicalText: 'failed to decrypt message with any known session',
    },
    {
      category: 'signal-session-mismatch',
      patterns: ['no matching sessions found for message'],
      canonicalText: 'Signal session mismatch',
    },
    {
      category: 'signal-future-counter',
      patterns: ['over 2000 messages into the future'],
      canonicalText: 'Signal session counter is too far ahead',
    },
    {
      category: 'bad-mac-session-error',
      patterns: ['session error'],
      canonicalText: 'session error',
    },
    {
      category: 'bad-mac-decrypt',
      patterns: ['bad mac'],
      canonicalText: 'Bad MAC',
    },
  ];

  const normalizeBadMacErrorText = (errorMsg) => {
    return String(errorMsg || '')
      .toLowerCase()
      .replace(/\b\d{6,}\b/g, '<id>')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const extractBadMacCategory = (normalizedErrorText) => {
    for (const matcher of BAD_MAC_CATEGORY_PATTERNS) {
      if (matcher.patterns.some((pattern) => normalizedErrorText.includes(pattern))) {
        return {
          errorCategory: matcher.category,
          errorCoreText: matcher.canonicalText,
        };
      }
    }

    return {
      errorCategory: 'bad-mac-unknown',
      errorCoreText: 'bad mac',
    };
  };

  const getCooldownLogState = (source) => {
    if (!cooldownLogState.has(source)) {
      cooldownLogState.set(source, {
        lastLogAt: 0,
        suppressedCount: 0,
      });
    }

    return cooldownLogState.get(source);
  };

  const emitSuppressedCooldownSummary = (source, state) => {
    if (!state || state.suppressedCount <= 0) {
      return;
    }

    console.warn(
      `[BAILEYS] Suppressed ${state.suppressedCount} duplicate Bad MAC cooldown logs in last ${Math.round(
        COOLDOWN_LOG_INTERVAL / 1000
      )}s (source=${source})`
    );
    state.suppressedCount = 0;
  };

  const flushCooldownSuppressionSummary = () => {
    for (const [source, state] of cooldownLogState.entries()) {
      emitSuppressedCooldownSummary(source, state);
    }
  };

  const logDecryptErrorThrottled = (message) => {
    const now = Date.now();
    if (now - decryptLogState.lastLogAt < DECRYPT_LOG_INTERVAL) {
      decryptLogState.suppressedCount += 1;
      return;
    }

    if (decryptLogState.suppressedCount > 0) {
      console.warn(
        `[BAILEYS] Suppressed ${decryptLogState.suppressedCount} duplicate decrypt logs ` +
          `during the last ${Math.round(DECRYPT_LOG_INTERVAL / 1000)}s`
      );
      decryptLogState.suppressedCount = 0;
    }

    decryptLogState.lastLogAt = now;
    console.error('[BAILEYS-LOGGER] Bad MAC error detected:', message);
  };

  const quarantineAndDeleteSignalSessions = async (sessionIds, reason) => {
    if (!targetedSignalSessionRepair || !authKeyStore || sessionIds.length === 0) {
      return false;
    }

    const validSessionIds = sessionIds.filter(
      (sessionId) =>
        /^\d+\.\d+$/.test(sessionId) &&
        !repairedSignalSessions.has(sessionId) &&
        !repairingSignalSessions.has(sessionId)
    );
    if (validSessionIds.length === 0) {
      return false;
    }
    validSessionIds.forEach((sessionId) => repairingSignalSessions.add(sessionId));

    try {
      const quarantinePath = path.join(sessionPath, '.session-quarantine');
      await fs.promises.mkdir(quarantinePath, { recursive: true, mode: 0o700 });

      for (const sessionId of validSessionIds) {
        const sessionFileName = `session-${sessionId}.json`;
        const sourcePath = path.join(sessionPath, sessionFileName);
        const backupPath = path.join(quarantinePath, `${Date.now()}-${sessionFileName}`);

        try {
          await fs.promises.copyFile(sourcePath, backupPath);
          await fs.promises.chmod(backupPath, 0o600);
        } catch (error) {
          if (error?.code !== 'ENOENT') {
            throw error;
          }
        }
      }

      await authKeyStore.set({
        session: Object.fromEntries(validSessionIds.map((sessionId) => [sessionId, null])),
      });
      validSessionIds.forEach((sessionId) => repairedSignalSessions.add(sessionId));

      console.warn(
        `[BAILEYS] Quarantined and removed ${validSessionIds.length} peer Signal session key(s) ` +
          `after ${reason}; the authenticated device session remains intact.`
      );
      return true;
    } finally {
      validSessionIds.forEach((sessionId) => repairingSignalSessions.delete(sessionId));
    }
  };

  const cooldownSummaryInterval = setInterval(flushCooldownSuppressionSummary, COOLDOWN_LOG_INTERVAL);
  if (typeof cooldownSummaryInterval.unref === 'function') {
    cooldownSummaryInterval.unref();
  }

  const readSessionLock = async () => {
    try {
      const rawLock = await fs.promises.readFile(sessionLockPath, 'utf8');
      const parsed = JSON.parse(rawLock);
      const parsedPid = Number.parseInt(String(parsed?.pid || ''), 10);

      return {
        pid: Number.isNaN(parsedPid) ? null : parsedPid,
        hostname: parsed?.hostname || null,
        startedAt: parsed?.startedAt || null,
        clientId: parsed?.clientId || null,
      };
    } catch (err) {
      if (err?.code === 'ENOENT') {
        return null;
      }
      console.warn(`[BAILEYS] Failed to read session lock at ${sessionLockPath}:`, err?.message || err);
      return null;
    }
  };

  const removeSessionLock = async () => {
    try {
      await fs.promises.unlink(sessionLockPath);
      lockHeldByCurrentProcess = false;
      console.log(`[BAILEYS] Released session lock for clientId=${clientId} at ${sessionLockPath}`);
      return true;
    } catch (err) {
      if (err?.code === 'ENOENT') {
        lockHeldByCurrentProcess = false;
        return true;
      }
      console.warn(`[BAILEYS] Failed to remove session lock at ${sessionLockPath}:`, err?.message || err);
      return false;
    }
  };

  const writeSessionLock = async () => {
    const lockMetadata = {
      pid: process.pid,
      hostname: os.hostname(),
      startedAt: new Date().toISOString(),
      clientId,
    };
    const payload = `${JSON.stringify(lockMetadata, null, 2)}\n`;

    try {
      await fs.promises.writeFile(sessionLockPath, payload, { flag: 'wx' });
      lockHeldByCurrentProcess = true;
      return;
    } catch (err) {
      if (err?.code !== 'EEXIST') {
        throw err;
      }
    }

    const existingLock = await readSessionLock();

    if (existingLock?.pid === process.pid) {
      await fs.promises.writeFile(sessionLockPath, payload, 'utf8');
      lockHeldByCurrentProcess = true;
      return;
    }

    if (existingLock?.pid && isProcessRunning(existingLock.pid)) {
      emitSessionLockFatalLog({
        clientId,
        sessionPath,
        lockPath: sessionLockPath,
        lockMetadata: existingLock,
      });
      const lockError = new Error(
        buildSessionLockGuardMessage({
          clientId,
          sessionPath,
          lockPath: sessionLockPath,
          lockMetadata: existingLock,
        })
      );
      lockError.code = 'WA_BAILEYS_SHARED_SESSION_LOCK';
      lockError.lockPath = sessionLockPath;
      lockError.ownerPid = existingLock.pid;
      throw lockError;
    }

    await removeSessionLock();
    await fs.promises.writeFile(sessionLockPath, payload, { flag: 'wx' });
    lockHeldByCurrentProcess = true;
    console.warn(
      `[BAILEYS] Removed stale session lock for clientId=${clientId} and acquired a new lock at ${sessionLockPath}`
    );
  };

  const releaseSessionLock = async () => {
    const existingLock = await readSessionLock();

    if (!existingLock && !lockHeldByCurrentProcess) {
      return;
    }

    if (existingLock?.pid && existingLock.pid !== process.pid && isProcessRunning(existingLock.pid)) {
      return;
    }

    await removeSessionLock();
  };

  const markAuthRepairRequired = async (reason) => {
    if (authRepairRequired) return;
    authRepairRequired = true;
    stopped = true;
    connectionState = 'AUTH_REPAIR_REQUIRED';
    emitter.fatalInitError = {
      code: 'WA_AUTH_REPAIR_REQUIRED',
      message: 'WhatsApp Signal session requires manual re-pairing',
      reason,
      timestamp: Date.now(),
    };
    console.error(
      `[BAILEYS][FATAL] AUTH_REPAIR_REQUIRED for clientId=${clientId}: ${reason}. ` +
        'Automatic reconnect stopped; backup the auth directory and pair again.'
    );
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    if (sock) {
      const socketToClose = sock;
      sock = null;
      socketGeneration += 1;
      try {
        socketToClose.end();
      } catch (err) {
        console.warn('[BAILEYS] Error closing socket after auth repair request:', err?.message || err);
      }
    }
    await releaseSessionLock();
    emitter.emit('auth_failure', 'AUTH_REPAIR_REQUIRED');
  };

  /**
   * Handle Bad MAC errors detected in logger output or message processing
   * @param {string} errorMsg - The error message
   * @param {string} source - Source of the error ('logger' or 'message')
   * @param {string} [senderJid] - JID of the sender (for message-level errors)
   */
  const handleBadMacError = (
    errorMsg,
    source = 'logger',
    senderJid = null,
    signalSessionIds = []
  ) => {
    const now = Date.now();
    const normalizedError = normalizeBadMacErrorText(errorMsg);
    const { errorCategory, errorCoreText } = extractBadMacCategory(normalizedError);
    const senderKey = senderJid || '';
    const errorSignature = `${senderKey}|${errorCategory}|${signalSessionIds.join(',')}`;

    if (
      targetedSignalSessionRepair &&
      signalSessionIds.length > 0 &&
      ['bad-mac-decrypt', 'signal-session-mismatch', 'signal-future-counter'].includes(
        errorCategory
      )
    ) {
      void quarantineAndDeleteSignalSessions(signalSessionIds, errorCategory).catch((error) => {
        console.error(
          '[BAILEYS] Targeted Signal session repair failed:',
          error?.message || error
        );
      });
    }

    if (
      lastMacErrorSignature &&
      errorSignature === lastMacErrorSignature &&
      now - lastMacErrorSignatureTime < MAC_ERROR_DEDUP_WINDOW
    ) {
      if (debugLoggingEnabled) {
        console.log(
          `[BAILEYS] Skipping duplicate Bad MAC signal from ${source} within ${MAC_ERROR_DEDUP_WINDOW}ms`
        );
      }
      return;
    }

    lastMacErrorSignature = errorSignature;
    lastMacErrorSignatureTime = now;

    const previousErrorTime = lastMacErrorTime;
    const timeSinceLastError = previousErrorTime > 0 ? now - previousErrorTime : 0;
    const timeSinceLastRecovery = lastRecoveryAttemptTime > 0 ? now - lastRecoveryAttemptTime : Infinity;
    
    // Reset counter if too much time has passed
    if (previousErrorTime > 0 && timeSinceLastError > MAC_ERROR_RESET_TIMEOUT) {
      console.log(
        `[BAILEYS] Resetting Bad MAC counter due to timeout (${Math.round(timeSinceLastError/1000)}s since last error)`
      );
      consecutiveMacErrors = 0;
      errorsDuringCooldown = 0;
    }
    
    // Always increment the error counter and update timestamp
    consecutiveMacErrors++;
    lastMacErrorTime = now;
    
    // Check if we're in a cooldown period
    const inCooldown = timeSinceLastRecovery < RECOVERY_COOLDOWN;
    
    if (inCooldown) {
      errorsDuringCooldown++;
      
      // If too many errors during cooldown, force recovery anyway
      if (errorsDuringCooldown >= MAX_ERRORS_DURING_COOLDOWN) {
        flushCooldownSuppressionSummary();
        const cooldownElapsedMs = Math.max(0, timeSinceLastRecovery);
        const cooldownRemainingMs = Math.max(0, RECOVERY_COOLDOWN - timeSinceLastRecovery);
        console.error(
          `[BAILEYS] Forced recovery summary: ${errorsDuringCooldown} errors during cooldown (elapsed=${Math.round(
            cooldownElapsedMs / 1000
          )}s, remaining=${Math.round(cooldownRemainingMs / 1000)}s, triggerSource=${source})`
        );
        console.error(
          `[BAILEYS] CRITICAL: ${errorsDuringCooldown} Bad MAC errors during cooldown period - forcing immediate recovery`
        );
        // Don't return - continue to recovery logic below
      } else {
        const sourceCooldownState = getCooldownLogState(source);
        const canLogCooldown = now - sourceCooldownState.lastLogAt >= COOLDOWN_LOG_INTERVAL;

        if (canLogCooldown) {
          emitSuppressedCooldownSummary(source, sourceCooldownState);
          console.warn(
            `[BAILEYS] Bad MAC error detected during recovery cooldown (${Math.round((RECOVERY_COOLDOWN - timeSinceLastRecovery)/1000)}s remaining, error ${errorsDuringCooldown}/${MAX_ERRORS_DURING_COOLDOWN}, source=${source})`
          );
          sourceCooldownState.lastLogAt = now;
        } else {
          sourceCooldownState.suppressedCount++;
        }
        return;
      }
    } else {
      // Reset cooldown error counter when not in cooldown
      errorsDuringCooldown = 0;
    }
    
    const isBurstError = previousErrorTime > 0 && timeSinceLastError < MAC_ERROR_BURST_THRESHOLD;
    const isRapidError = previousErrorTime > 0 && timeSinceLastError < MAC_ERROR_RAPID_THRESHOLD;
    const isForcedRecovery = errorsDuringCooldown >= MAX_ERRORS_DURING_COOLDOWN;
    
    // Determine error type label for logging
    let errorType = '';
    if (isForcedRecovery) {
      errorType = '[FORCED]';
    } else if (isBurstError) {
      errorType = '[BURST]';
    } else if (isRapidError) {
      errorType = '[RAPID]';
    }
    
    const senderInfo = senderJid ? ` from ${senderJid}` : '';
    
    console.error(
      `[BAILEYS] Bad MAC error detected in ${source} (${consecutiveMacErrors}/${MAX_CONSECUTIVE_MAC_ERRORS})${errorType}${senderInfo} [${errorCategory}]:`,
      errorCoreText
    );
    
    // Trigger recovery if:
    // 1. We've hit the threshold for consecutive errors, OR
    // 2. We're getting rapid errors (within 5 seconds), OR
    // 3. We're getting burst errors (within 1 second) - immediate action, OR
    // 4. Too many errors during cooldown period (forced recovery)
    const shouldRecover = consecutiveMacErrors >= MAX_CONSECUTIVE_MAC_ERRORS || 
                         (isRapidError && consecutiveMacErrors >= 1) ||
                         isBurstError ||
                         isForcedRecovery;

    if (shouldRecover && !autoRecoverDecryptErrors) {
      if (now - lastNativeRetryNoticeAt >= DECRYPT_LOG_INTERVAL) {
        console.warn(
          '[BAILEYS] Decrypt/session mismatch detected; keeping the socket online so ' +
            'Baileys can request fresh peer keys through its native retry flow. ' +
            'Set WA_BAILEYS_AUTO_RECOVER_DECRYPT_ERRORS=true only for an operator-controlled fallback.'
        );
        lastNativeRetryNoticeAt = now;
      }
      consecutiveMacErrors = 0;
      errorsDuringCooldown = 0;
      lastMacErrorTime = 0;
      return;
    }
    
    if (shouldRecover && !reinitInProgress) {
      if (
        sessionRepairWindowStartedAt === 0 ||
        now - sessionRepairWindowStartedAt > sessionRepairWindowMs
      ) {
        sessionRepairWindowStartedAt = now;
        sessionRepairAttempts = 0;
      }
      sessionRepairAttempts += 1;

      if (sessionRepairAttempts > maxSessionRepairAttempts) {
        void markAuthRepairRequired(
          `${sessionRepairAttempts} decrypt recovery attempts within ` +
            `${Math.round(sessionRepairWindowMs / 60000)} minutes`
        );
        return;
      }

      let reason;
      if (isForcedRecovery) {
        reason = `${errorsDuringCooldown} Bad MAC errors during cooldown - forced recovery`;
      } else if (isBurstError) {
        reason = `Burst Bad MAC errors in ${source} (${timeSinceLastError}ms between errors) - immediate recovery`;
      } else if (isRapidError) {
        reason = `Rapid Bad MAC errors in ${source} (${Math.round(timeSinceLastError/1000)}s between errors)`;
      } else {
        reason = `${MAX_CONSECUTIVE_MAC_ERRORS} consecutive MAC failures in ${source}`;
      }
      
      console.warn(
        `[BAILEYS] Too many Bad MAC errors detected, scheduling reinitialization (reason: ${reason})`
      );
      
      lastRecoveryAttemptTime = now;
      errorsDuringCooldown = 0; // Reset cooldown counter since we're attempting recovery
      
      // Schedule reinitialization asynchronously to avoid blocking.
      // A Bad MAC indicates a Signal-session/key-sync problem, not proof that
      // the WhatsApp login is invalid. Clearing the whole auth directory here
      // invalidates the linked device and causes a reconnect/login storm,
      // making the outbox fail while the socket is not ready. Keep auth state
      // for automatic recovery; explicit reinitialize({ clearAuthSession:
      // true }) remains available for a real logout/manual re-pair.
      // For burst errors and forced recovery, use immediate execution; for others, use setImmediate
      const executeRecovery = async () => {
        if (!reinitInProgress) {
          try {
            await reinitializeClient(
              'bad-mac-error-decryption',
              reason,
              { clearAuthSessionOverride: false }
            );
            consecutiveMacErrors = 0;
            lastMacErrorTime = 0;
          } catch (err) {
            console.error('[BAILEYS] Failed to reinitialize after Bad MAC:', err?.message || err);
            // Reset recovery attempt time on failure to allow retry after cooldown
            lastRecoveryAttemptTime = 0;
            errorsDuringCooldown = 0;
          }
        }
      };
      
      if (isBurstError || isForcedRecovery) {
        // For burst errors and forced recovery, execute immediately
        executeRecovery().catch(err => {
          console.error('[BAILEYS] Error during immediate recovery:', err?.message || err);
        });
      } else {
        // For normal errors, use setImmediate
        setImmediate(executeRecovery);
      }
    }
  };

  // Custom Pino logger that intercepts error messages
  const logger = P({
    level: 'error', // Set to 'error' to intercept error-level logs from Baileys
    timestamp: true,
    hooks: {
      logMethod(inputArgs, method, level) {
        // Intercept error-level logs to detect Bad MAC errors
        if (level >= 50) { // 50 = error level in Pino
          const stringCandidates = [];
          let senderJid = null;

          for (const arg of inputArgs) {
            if (!arg) continue;

            if (typeof arg === 'string') {
              stringCandidates.push(arg);
              continue;
            }

            if (arg instanceof Error) {
              if (arg.message) {
                stringCandidates.push(arg.message);
              }
              if (arg.stack) {
                stringCandidates.push(arg.stack);
              }
            }

            if (typeof arg === 'object') {
              senderJid ||= arg.key?.remoteJid || arg.msg?.key?.remoteJid || null;
              if (arg.msg) stringCandidates.push(arg.msg);
              if (arg.message) stringCandidates.push(arg.message);
              if (arg.err?.message) stringCandidates.push(arg.err.message);
              if (arg.err?.stack) stringCandidates.push(arg.err.stack);

              try {
                stringCandidates.push(JSON.stringify(arg));
              } catch (serializationError) {
                stringCandidates.push(String(arg));
              }
            }
          }

          const normalizedCandidates = stringCandidates
            .map((candidate) => String(candidate).trim().toLowerCase())
            .filter(Boolean);
          const combinedErrorText = normalizedCandidates.join(' | ');
          const signalSessionIds = extractSignalSessionIds(combinedErrorText);
          const badMacPatterns = [
            'failed to decrypt message with any known session',
            'no matching sessions found for message',
            'over 2000 messages into the future',
            'session error',
            'bad mac',
          ];
          const matchedPattern = badMacPatterns.find((pattern) => combinedErrorText.includes(pattern));

          if (matchedPattern) {
            // Handle Bad MAC error asynchronously (single trigger per log event)
            setImmediate(() =>
              handleBadMacError(combinedErrorText, 'logger', senderJid, signalSessionIds)
            );
            if (debugLoggingEnabled) {
              console.warn(`[BAILEYS-LOGGER] Matched pattern "${matchedPattern}", forwarding to Bad MAC handler`);
            }
            // Always log Bad MAC errors to console for visibility
            logDecryptErrorThrottled(combinedErrorText);
            // Don't let Pino log it again
            return undefined;
          }
        }
        
        // Only allow Pino logging if debug is enabled
        if (debugLoggingEnabled) {
          return method.apply(this, inputArgs);
        }
        // Suppress other Baileys logs when debug is disabled
        return undefined;
      }
    }
  });

  const scheduleReconnect = (reason = 'connection-close') => {
    if (stopped || reinitInProgress || reconnectTimeout) {
      return;
    }

    const delayMs = Math.min(
      reconnectMaxDelayMs,
      reconnectBaseDelayMs * 2 ** Math.min(reconnectAttempts, 6)
    );
    reconnectAttempts += 1;
    console.warn(
      `[BAILEYS] Reconnect scheduled for clientId=${clientId} in ${delayMs}ms ` +
        `(attempt=${reconnectAttempts}, reason=${reason})`
    );

    reconnectTimeout = setTimeout(async () => {
      reconnectTimeout = null;
      if (stopped || reinitInProgress) return;

      try {
        await startConnect('auto-reconnect');
      } catch (err) {
        console.error(
          `[BAILEYS] Reconnect attempt failed for clientId=${clientId}:`,
          err?.message || err
        );
        scheduleReconnect('connect-error');
      }
    }, delayMs);

    if (typeof reconnectTimeout.unref === 'function') {
      reconnectTimeout.unref();
    }
  };

  /**
   * Initialize and connect the Baileys client
   */
  const startConnect = async (trigger = 'connect') => {
    if (stopped && trigger === 'auto-reconnect') {
      return null;
    }

    if (connectionState === 'CONNECTED' && sock) {
      return sock;
    }

    if (connectInProgress) {
      console.log(`[BAILEYS] Connection already in progress for clientId=${clientId}`);
      return connectInProgress;
    }

    connectStartedAt = Date.now();
    connectionState = 'CONNECTING';
    console.log(`[BAILEYS] Starting connection for clientId=${clientId} (trigger: ${trigger})`);

    connectInProgress = (async () => {
      try {
        await writeSessionLock();

        // Load auth state from file system
        console.log(`[BAILEYS] Loading auth state from: ${sessionPath}`);
        const { state, saveCreds } = await withOperationTimeout(
          useMultiFileAuthState(sessionPath),
          connectTimeoutMs,
          'auth state initialization'
        );
        console.log(`[BAILEYS] Auth state loaded successfully`);
        
        // Fetch latest Baileys version
        let versionConfig = {};
        try {
          const { version, isLatest } = await withOperationTimeout(
            fetchLatestBaileysVersion(),
            connectTimeoutMs,
            'WA version lookup'
          );
          versionConfig = { version };
          console.log(`[BAILEYS] Using WA version ${version.join('.')}, isLatest: ${isLatest}`);
        } catch (versionError) {
          console.warn(
            '[BAILEYS] Failed to fetch latest WA version; using Baileys bundled default:',
            versionError?.message || versionError
          );
        }

        // Create socket
        const currentGeneration = ++socketGeneration;
        const cachedSignalKeyStore = makeCacheableSignalKeyStore(state.keys, logger);
        authKeyStore = cachedSignalKeyStore;
        const currentSocket = makeWASocket({
          ...versionConfig,
          logger,
          printQRInTerminal: false,
          auth: {
            creds: state.creds,
            keys: cachedSignalKeyStore,
          },
          browser: Browsers.ubuntu('Chrome'),
          generateHighQualityLinkPreview: true,
          connectTimeoutMs,
          defaultQueryTimeoutMs: queryTimeoutMs,
          keepAliveIntervalMs,
          markOnlineOnConnect: false,
          syncFullHistory: false,
        });
        sock = currentSocket;

        // Save credentials whenever they are updated
        currentSocket.ev.on('creds.update', (...args) => {
          if (stopped || currentGeneration !== socketGeneration || sock !== currentSocket) return;
          return saveCreds(...args);
        });

        // Connection state updates
        currentSocket.ev.on('connection.update', async (update) => {
          if (stopped || currentGeneration !== socketGeneration || sock !== currentSocket) return;
          const { connection, lastDisconnect, qr } = update;

          if (connection === 'connecting') {
            connectionState = 'CONNECTING';
          }

          // QR code
          if (qr) {
            connectionState = 'AWAITING_QR';
            console.log('[BAILEYS] QR Code received');
            emitter.emit('qr', qr);
          }

          // Connection opened
          if (connection === 'open') {
            connectionState = 'CONNECTED';
            reconnectAttempts = 0;
            badSessionRecoveryAttempts = 0;
            emitter.fatalInitError = null;
            if (reconnectTimeout) {
              clearTimeout(reconnectTimeout);
              reconnectTimeout = null;
            }
            console.log('[BAILEYS] Connection opened successfully');
            consecutiveMacErrors = 0; // Reset counter on successful connection
            lastMacErrorTime = 0; // Reset timestamp
            lastMacErrorSignature = null;
            lastMacErrorSignatureTime = 0;
            errorsDuringCooldown = 0; // Reset cooldown error counter
            emitter.emit('authenticated');
            emitter.emit('ready');
          }

          // Connection closed
          if (connection === 'close') {
            const statusCode =
              lastDisconnect?.error?.output?.statusCode ??
              lastDisconnect?.error?.statusCode ??
              lastDisconnect?.error?.data?.statusCode;
            const isLoggedOut = statusCode === DisconnectReason.loggedOut;
            const isConnectionReplaced = statusCode === DisconnectReason.connectionReplaced;
            const isBadSession = statusCode === DisconnectReason.badSession && !isLoggedOut;
            const shouldReconnect = !isLoggedOut && !isConnectionReplaced && !isBadSession;
            connectionState = 'DISCONNECTED';
            
            console.log(
              `[BAILEYS] Connection closed (statusCode: ${statusCode}, shouldReconnect: ${shouldReconnect})`
            );

            const reason = getDisconnectReason(statusCode);
            emitter.emit('disconnected', reason);

            // If logged out, reinitialize with cleared session to show QR code again
            if (isLoggedOut && !reinitInProgress) {
              console.log('[BAILEYS] Logged out detected, reinitializing with cleared session...');
              try {
                await reinitializeClient('logged-out', 'User logged out', { clearAuthSessionOverride: true });
              } catch (err) {
                console.error('[BAILEYS] Failed to reinitialize after logout:', err?.message || err);
              }
            } else if (isBadSession && !reinitInProgress) {
              // A single 'badSession' close from Baileys does not always mean the
              // credentials are truly invalid (observed: transient closes with
              // statusCode 500 that recover after a normal reconnect). Attempt an
              // in-place reinitialize (auth kept intact) before declaring auth
              // failure, to avoid unnecessary manual re-authentication and outbox
              // dead-lettering during transient WhatsApp-side hiccups.
              badSessionRecoveryAttempts += 1;
              const attemptLabel = `${badSessionRecoveryAttempts}/${maxBadSessionRecoveryAttempts}`;

              if (badSessionRecoveryAttempts <= maxBadSessionRecoveryAttempts) {
                console.warn(
                  `[BAILEYS] Bad session detected for clientId=${clientId}. ` +
                    `Attempting in-place reinitialize (${attemptLabel}) before declaring auth failure.`
                );
                try {
                  await reinitializeClient('bad-session', reason, { clearAuthSessionOverride: false });
                } catch (err) {
                  console.error('[BAILEYS] Failed bad-session reinitialize:', err?.message || err);
                  emitter.emit('auth_failure', 'BAD_SESSION');
                  await releaseSessionLock();
                }
              } else {
                console.error(
                  `[BAILEYS] Bad session persisted after ${maxBadSessionRecoveryAttempts} recovery attempts ` +
                    `for clientId=${clientId}. Manual re-authentication is required.`
                );
                emitter.emit('auth_failure', 'BAD_SESSION');
                await releaseSessionLock();
              }
            } else if (shouldReconnect && !reinitInProgress) {
              scheduleReconnect(reason);
            } else if (isConnectionReplaced) {
              emitter.emit('auth_failure', 'CONNECTION_REPLACED');
              await releaseSessionLock();
            }
          }

          // Check for Bad MAC and session errors
          if (lastDisconnect?.error) {
            const error = lastDisconnect.error;
            const errorMessage = error?.message || String(error);
            const errorStack = error?.stack || '';
            
            // Detect Bad MAC errors from libsignal - be specific to avoid false positives
            const isBadMacError = errorMessage.includes('Bad MAC') || 
                                 errorStack.includes('Bad MAC');
            
            if (isBadMacError) {
              handleBadMacError(errorMessage, 'connection');
            }
          }
        });

        // Message events
        currentSocket.ev.on('messages.upsert', async ({ messages, type }) => {
          if (stopped || currentGeneration !== socketGeneration || sock !== currentSocket) return;
          if (type !== 'notify') return;

          for (const msg of messages) {
            try {
              if (!msg.message) continue;

              // Transform message to match wwebjs format for compatibility
              const transformedMessage = {
                from: msg.key.remoteJid,
                body: getMessageText(msg),
                id: {
                  id: msg.key.id,
                  _serialized: msg.key.id,
                },
                timestamp: msg.messageTimestamp,
                hasMedia: hasMedia(msg),
                isGroupMsg: msg.key.remoteJid?.endsWith('@g.us') || false,
                author: msg.key.participant || msg.key.remoteJid,
              };

              if (debugLoggingEnabled) {
                console.log('[BAILEYS] Message received:', {
                  from: transformedMessage.from,
                  hasBody: !!transformedMessage.body,
                });
              }

              emitter.emit('message', transformedMessage);
            } catch (error) {
              // Detect Bad MAC errors during message processing
              const errorMessage = error?.message || String(error);
              const errorStack = error?.stack || '';
              const senderJid = msg.key?.remoteJid || 'unknown';
              
              const isBadMacError = errorMessage.includes('Bad MAC') || 
                                   errorStack.includes('Bad MAC') ||
                                   errorMessage.includes('Failed to decrypt message');
              
              if (isBadMacError) {
                console.error(
                  '[BAILEYS] Bad MAC error during message decryption from',
                  senderJid,
                  ':',
                  errorMessage
                );
                
                // Handle Bad MAC error through centralized handler
                handleBadMacError(errorMessage, 'message', senderJid);
              } else {
                // Log non-MAC errors normally
                console.error(
                  '[BAILEYS] Error processing message from',
                  senderJid,
                  ':',
                  errorMessage
                );
              }
            }
          }
        });

        if (!state.creds.registered && pairingPhoneNumber) {
          setTimeout(async () => {
            if (stopped || currentGeneration !== socketGeneration || sock !== currentSocket) return;
            try {
              const pairingCode = await currentSocket.requestPairingCode(pairingPhoneNumber);
              emitter.emit('pairing_code', pairingCode);
              console.log('[BAILEYS] Pairing code generated and emitted to the local operator channel.');
            } catch (err) {
              console.error('[BAILEYS] Pairing code request failed:', err?.message || err);
            }
          }, 1500).unref?.();
        }

        console.log(`[BAILEYS] Client initialized for clientId=${clientId}`);
        
      } catch (error) {
        connectionState = 'DISCONNECTED';
        console.error(`[BAILEYS] Connection error for clientId=${clientId}:`, error.message);
        if (error?.code === 'WA_BAILEYS_SHARED_SESSION_LOCK') {
          const lockOwnerPid = error?.ownerPid || 'unknown';
          console.error(
            `[BAILEYS] Lock conflict detail for clientId=${clientId}: ownerPid=${lockOwnerPid}, ` +
              `sessionPath=${sessionPath}, lockPath=${sessionLockPath}.`
          );

          if (strictSingleOwner) {
            console.error(
              '[BAILEYS][FATAL] WA_BAILEYS_STRICT_SINGLE_OWNER=true, exiting process to enforce single owner policy.'
            );
            process.exit(1);
          }
        }
        emitter.fatalInitError = {
          message: error.message,
          timestamp: Date.now(),
        };
        throw error;
      } finally {
        connectInProgress = null;
      }
    })();

    return connectInProgress;
  };

  /**
   * Get disconnect reason string
   */
  const getDisconnectReason = (statusCode) => {
    switch (statusCode) {
      case DisconnectReason.badSession:
        return 'BAD_SESSION';
      case DisconnectReason.connectionClosed:
        return 'CONNECTION_CLOSED';
      case DisconnectReason.connectionLost:
        return 'CONNECTION_LOST';
      case DisconnectReason.connectionReplaced:
        return 'CONNECTION_REPLACED';
      case DisconnectReason.loggedOut:
        return 'LOGGED_OUT';
      case DisconnectReason.restartRequired:
        return 'RESTART_REQUIRED';
      case DisconnectReason.timedOut:
        return 'TIMEOUT';
      default:
        return 'UNKNOWN';
    }
  };

  /**
   * Extract text from message
   */
  const getMessageText = (msg) => {
    if (!msg.message) return '';
    
    if (msg.message.conversation) return msg.message.conversation;
    if (msg.message.extendedTextMessage?.text) return msg.message.extendedTextMessage.text;
    if (msg.message.imageMessage?.caption) return msg.message.imageMessage.caption;
    if (msg.message.videoMessage?.caption) return msg.message.videoMessage.caption;
    
    return '';
  };

  /**
   * Check if message has media
   */
  const hasMedia = (msg) => {
    if (!msg.message) return false;
    return !!(
      msg.message.imageMessage ||
      msg.message.videoMessage ||
      msg.message.audioMessage ||
      msg.message.documentMessage ||
      msg.message.stickerMessage
    );
  };

  /**
   * Reinitialize client with enhanced session clearing
   */
  const reinitializeClient = async (trigger, reason, options = {}) => {
    if (reinitInProgress) {
      console.warn(
        `[BAILEYS] Reinit already in progress for clientId=${clientId}, skipping ${trigger}.`
      );
      return;
    }

    const shouldClearSession = options?.clearAuthSessionOverride ?? clearAuthSession;
    const clearSessionLabel = shouldClearSession ? ' (clear session)' : '';
    reinitInProgress = true;
    stopped = false;

    console.warn(
      `[BAILEYS] Reinitializing clientId=${clientId} after ${trigger}${
        reason ? ` (${reason})` : ''
      }${clearSessionLabel}.`
    );

    try {
      // Close existing connection gracefully
      if (sock) {
        const socketToClose = sock;
        sock = null;
        socketGeneration += 1;
        connectionState = 'DISCONNECTED';
        try {
          socketToClose.end();
        } catch (err) {
          console.warn('[BAILEYS] Error closing socket:', err?.message || err);
        }
      }

      // Clear reconnect timeout
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }

      // Clear session if requested (especially for Bad MAC errors)
      if (shouldClearSession) {
        try {
          await releaseSessionLock();
          
          // More aggressive session clearing for Bad MAC errors
          if (trigger.includes('bad-mac')) {
            console.warn(`[BAILEYS] Performing aggressive session clear for Bad MAC error`);
            
            // Verify directory exists before removal
            if (fs.existsSync(sessionPath)) {
              console.warn(`[BAILEYS] Removing session directory: ${sessionPath}`);
              await rm(sessionPath, { recursive: true, force: true });
              
              // Add small delay to ensure async file system operations complete
              await new Promise(resolve => setTimeout(resolve, FILE_SYSTEM_OPERATION_DELAY));
              
              // Verify it was removed
              if (fs.existsSync(sessionPath)) {
                console.error(`[BAILEYS] WARNING: Session directory still exists after removal attempt`);
              } else {
                console.warn(`[BAILEYS] Session directory successfully removed`);
              }
            }
            
            // Recreate the directory
            fs.mkdirSync(sessionPath, { recursive: true });
            
            // Verify directory is writable
            try {
              fs.accessSync(sessionPath, fs.constants.W_OK | fs.constants.R_OK);
              console.warn(`[BAILEYS] Cleared and recreated auth session for clientId=${clientId} at ${sessionPath}.`);
            } catch (accessErr) {
              console.error(`[BAILEYS] ERROR: Recreated directory is not accessible:`, accessErr?.message || accessErr);
              throw accessErr;
            }
          } else {
            // Normal session clear
            await rm(sessionPath, { recursive: true, force: true });
            fs.mkdirSync(sessionPath, { recursive: true });
            console.warn(`[BAILEYS] Cleared auth session for clientId=${clientId} at ${sessionPath}.`);
          }
        } catch (err) {
          console.warn(
            `[BAILEYS] Failed to clear auth session for clientId=${clientId}:`,
            err?.message || err
          );
        }
      }

      // Add a small delay before reconnecting to ensure clean state
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Reconnect
      console.warn(`[BAILEYS] Starting reconnection after reinitialization (trigger: ${trigger})`);
      await startConnect(`reinitialize:${trigger}`);
      console.warn(`[BAILEYS] Successfully reinitialized and reconnected clientId=${clientId}`);
    } catch (err) {
      console.error(
        `[BAILEYS] Error during reinitialization for clientId=${clientId}:`,
        err?.message || err
      );
      throw err;
    } finally {
      reinitInProgress = false;
    }
  };

  // ======================
  // PUBLIC API
  // ======================

  emitter.connect = async () => {
    stopped = false;
    return startConnect('connect');
  };

  emitter.reinitialize = async (options = {}) => {
    const safeOptions = options && typeof options === 'object' ? options : {};
    const hasClearAuthSession = typeof safeOptions.clearAuthSession === 'boolean';
    const clearAuthSessionOverride = hasClearAuthSession
      ? safeOptions.clearAuthSession
      : undefined;
    const reason = safeOptions.reason || null;
    const trigger = safeOptions.trigger || 'manual';
    return reinitializeClient(trigger, reason, { clearAuthSessionOverride });
  };

  emitter.disconnect = async () => {
    stopped = true;
    connectionState = 'DISCONNECTED';
    reconnectAttempts = 0;
    socketGeneration += 1;
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    if (sock) {
      const socketToClose = sock;
      sock = null;
      socketToClose.end();
    }
    await releaseSessionLock();
  };

  emitter.getNumberId = async (phone) => {
    if (!sock) {
      console.warn('[BAILEYS] Socket not initialized');
      return null;
    }

    try {
      const [result] = await withOperationTimeout(
        sock.onWhatsApp(phone),
        queryTimeoutMs,
        'number lookup'
      );
      return result?.exists ? result.jid : null;
    } catch (err) {
      console.warn('[BAILEYS] getNumberId failed:', err?.message || err);
      return null;
    }
  };

  emitter.getChat = async (jid) => {
    if (!sock) {
      console.warn('[BAILEYS] Socket not initialized');
      return null;
    }

    try {
      // In Baileys, we don't have a direct getChat equivalent
      // Return a minimal chat object for compatibility
      return {
        id: { _serialized: jid },
        isGroup: jid?.endsWith('@g.us') || false,
      };
    } catch (err) {
      console.warn('[BAILEYS] getChat failed:', err?.message || err);
      return null;
    }
  };

  emitter.sendMessage = async (jid, content, options = {}) => {
    if (!sock || connectionState !== 'CONNECTED') {
      const error = new Error('[BAILEYS] Socket is not connected');
      error.code = 'WA_BAILEYS_NOT_READY';
      error.retryable = true;
      throw error;
    }

    const safeOptions = options && typeof options === 'object' ? options : {};

    try {
      let sentMsg;
      // Handle document sending
      if (content && typeof content === 'object' && 'document' in content) {
        console.log(`[BAILEYS] Sending document to ${jid}: ${content.fileName || 'unnamed'}`);
        sentMsg = await withOperationTimeout(
          sock.sendMessage(jid, {
            document: content.document,
            mimetype: content.mimetype || 'application/octet-stream',
            fileName: content.fileName || 'document',
          }),
          queryTimeoutMs,
          'document send'
        );
      } else {
        // Handle text messages
        const text = typeof content === 'string' ? content : content?.text ?? '';
        console.log(`[BAILEYS] Sending text message to ${jid} (${text.length} chars)`);
        sentMsg = await withOperationTimeout(
          sock.sendMessage(jid, { text }),
          queryTimeoutMs,
          'message send'
        );
      }

      const messageId = sentMsg?.key?.id || '';
      console.log(`[BAILEYS] Message sent successfully to ${jid}, messageId: ${messageId}`);
      
      // Return message ID in compatible format
      return messageId;
    } catch (err) {
      console.error('[BAILEYS] sendMessage failed:', err?.message || err);
      const error = new Error(`sendMessage failed: ${err?.message || err}`);
      error.jid = jid;
      error.retryable =
        connectionState !== 'CONNECTED' ||
        err?.code === 'WA_BAILEYS_OPERATION_TIMEOUT' ||
        ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNABORTED'].includes(err?.code) ||
        err?.output?.statusCode === DisconnectReason.connectionClosed ||
        err?.output?.statusCode === DisconnectReason.connectionLost ||
        err?.output?.statusCode === DisconnectReason.timedOut;
      throw error;
    }
  };

  emitter.onMessage = (handler) => emitter.on('message', handler);
  emitter.onDisconnect = (handler) => emitter.on('disconnected', handler);

  emitter.isReady = async () => connectionState === 'CONNECTED' && sock !== null;

  emitter.getState = async () => {
    if (connectionState === 'CONNECTED' || (sock && sock.user)) return 'CONNECTED';
    if (connectionState === 'AWAITING_QR') return 'AWAITING_QR';
    if (connectionState === 'CONNECTING' && sock) return 'OPENING';
    return 'DISCONNECTED';
  };

  emitter.sendSeen = async (jid) => {
    if (!sock) {
      console.warn('[BAILEYS] Socket not initialized');
      return false;
    }

    try {
      // Note: Baileys doesn't have a direct equivalent to mark all messages as read
      // This is a best-effort implementation for API compatibility
      // In practice, you would need the actual message keys to mark as read
      console.warn('[BAILEYS] sendSeen called but marking messages read requires actual message keys');
      return true;
    } catch (err) {
      console.warn('[BAILEYS] sendSeen failed:', err?.message || err);
      return false;
    }
  };

  emitter.getContact = async (jid) => {
    if (!sock) {
      console.warn('[BAILEYS] Socket not initialized');
      return null;
    }

    try {
      // In Baileys, contacts are stored in the auth state
      // Return a minimal contact object for compatibility
      return {
        id: { _serialized: jid },
        number: jid.split('@')[0],
      };
    } catch (err) {
      console.warn('[BAILEYS] getContact failed:', err?.message || err);
      return null;
    }
  };

  emitter.getConnectPromise = () => connectInProgress;
  emitter.getConnectStartedAt = () => connectStartedAt;
  emitter.clientId = clientId;
  emitter.sessionPath = sessionPath;
  emitter.getSessionPath = () => sessionPath;
  emitter.fatalInitError = null;

  const shutdownHandler = () => {
    stopped = true;
    connectionState = 'DISCONNECTED';
    socketGeneration += 1;
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    clearInterval(cooldownSummaryInterval);
    flushCooldownSuppressionSummary();
    releaseSessionLock().catch((err) => {
      console.warn('[BAILEYS] Failed to release session lock during shutdown:', err?.message || err);
    });
  };

  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, shutdownHandler);
  }

  const originalDisconnect = emitter.disconnect;
  emitter.disconnect = async () => {
    clearInterval(cooldownSummaryInterval);
    flushCooldownSuppressionSummary();
    await originalDisconnect();
    for (const signal of SHUTDOWN_SIGNALS) {
      process.off(signal, shutdownHandler);
    }
  };

  console.log(`[BAILEYS] Client created for clientId=${clientId}`);

  return emitter;
}
