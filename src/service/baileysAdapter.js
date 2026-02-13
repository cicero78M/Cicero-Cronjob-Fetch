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
  let consecutiveMacErrors = 0;
  const MAX_CONSECUTIVE_MAC_ERRORS = 2; // Reduced from 3 to 2 for faster recovery
  let lastMacErrorTime = 0;
  const MAC_ERROR_RESET_TIMEOUT = 60000; // Reset counter after 60 seconds without errors
  const MAC_ERROR_RAPID_THRESHOLD = 5000; // If errors occur within 5 seconds, consider it rapid/serious
  const MAC_ERROR_BURST_THRESHOLD = 1000; // If errors occur within 1 second, it's a burst (immediate action)
  let lockHeldByCurrentProcess = false;
  let lastRecoveryAttemptTime = 0;
  const RECOVERY_COOLDOWN = 30000; // Don't attempt recovery more than once every 30 seconds

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

  /**
   * Handle Bad MAC errors detected in logger output or message processing
   * @param {string} errorMsg - The error message
   * @param {string} source - Source of the error ('logger' or 'message')
   * @param {string} [senderJid] - JID of the sender (for message-level errors)
   */
  const handleBadMacError = (errorMsg, source = 'logger', senderJid = null) => {
    const now = Date.now();
    const previousErrorTime = lastMacErrorTime;
    const timeSinceLastError = previousErrorTime > 0 ? now - previousErrorTime : 0;
    const timeSinceLastRecovery = lastRecoveryAttemptTime > 0 ? now - lastRecoveryAttemptTime : Infinity;
    
    // Reset counter if too much time has passed
    if (previousErrorTime > 0 && timeSinceLastError > MAC_ERROR_RESET_TIMEOUT) {
      console.log(
        `[BAILEYS] Resetting Bad MAC counter due to timeout (${Math.round(timeSinceLastError/1000)}s since last error)`
      );
      consecutiveMacErrors = 0;
    }
    
    // Check if we're in a cooldown period to prevent excessive recovery attempts
    if (timeSinceLastRecovery < RECOVERY_COOLDOWN) {
      console.warn(
        `[BAILEYS] Bad MAC error detected but in recovery cooldown (${Math.round((RECOVERY_COOLDOWN - timeSinceLastRecovery)/1000)}s remaining), skipping recovery`
      );
      return;
    }
    
    consecutiveMacErrors++;
    lastMacErrorTime = now;
    
    const isBurstError = previousErrorTime > 0 && timeSinceLastError < MAC_ERROR_BURST_THRESHOLD;
    const isRapidError = previousErrorTime > 0 && timeSinceLastError < MAC_ERROR_RAPID_THRESHOLD;
    
    const errorType = isBurstError ? '[BURST]' : (isRapidError ? '[RAPID]' : '');
    const senderInfo = senderJid ? ` from ${senderJid}` : '';
    
    console.error(
      `[BAILEYS] Bad MAC error detected in ${source} (${consecutiveMacErrors}/${MAX_CONSECUTIVE_MAC_ERRORS})${errorType}${senderInfo}:`,
      errorMsg
    );
    
    // Trigger recovery if:
    // 1. We've hit the threshold for consecutive errors, OR
    // 2. We're getting rapid errors (within 5 seconds), OR
    // 3. We're getting burst errors (within 1 second) - immediate action
    const shouldRecover = consecutiveMacErrors >= MAX_CONSECUTIVE_MAC_ERRORS || 
                         (isRapidError && consecutiveMacErrors >= 1) ||
                         isBurstError; // Burst errors trigger immediate recovery
    
    if (shouldRecover && !reinitInProgress) {
      let reason;
      if (isBurstError) {
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
      
      // Schedule reinitialization asynchronously to avoid blocking
      // For burst errors, use immediate execution; for others, use setImmediate
      const executeRecovery = async () => {
        if (!reinitInProgress) {
          try {
            await reinitializeClient(
              'bad-mac-error-decryption',
              reason,
              { clearAuthSessionOverride: true }
            );
            consecutiveMacErrors = 0;
            lastMacErrorTime = 0;
          } catch (err) {
            console.error('[BAILEYS] Failed to reinitialize after Bad MAC:', err?.message || err);
            // Reset recovery attempt time on failure to allow retry after cooldown
            lastRecoveryAttemptTime = 0;
          }
        }
      };
      
      if (isBurstError) {
        // For burst errors, execute immediately
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
              if (arg.msg) stringCandidates.push(arg.msg);
              if (arg.message) stringCandidates.push(arg.message);
              if (arg.err?.message) stringCandidates.push(arg.err.message);

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
          const badMacPatterns = [
            'failed to decrypt message with any known session',
            'session error',
            'bad mac',
          ];
          const matchedPattern = badMacPatterns.find((pattern) => combinedErrorText.includes(pattern));

          if (matchedPattern) {
            // Handle Bad MAC error asynchronously (single trigger per log event)
            setImmediate(() => handleBadMacError(combinedErrorText, 'logger'));
            console.warn(`[BAILEYS-LOGGER] Matched pattern "${matchedPattern}", forwarding to Bad MAC handler`);
            // Always log Bad MAC errors to console for visibility
            console.error('[BAILEYS-LOGGER] Bad MAC error detected:', combinedErrorText);
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

  /**
   * Initialize and connect the Baileys client
   */
  const startConnect = async (trigger = 'connect') => {
    if (connectInProgress) {
      console.log(`[BAILEYS] Connection already in progress for clientId=${clientId}`);
      return connectInProgress;
    }

    connectStartedAt = Date.now();
    console.log(`[BAILEYS] Starting connection for clientId=${clientId} (trigger: ${trigger})`);

    connectInProgress = (async () => {
      try {
        await writeSessionLock();

        // Load auth state from file system
        console.log(`[BAILEYS] Loading auth state from: ${sessionPath}`);
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        console.log(`[BAILEYS] Auth state loaded successfully`);
        
        // Fetch latest Baileys version
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`[BAILEYS] Using WA version ${version.join('.')}, isLatest: ${isLatest}`);

        // Create socket
        sock = makeWASocket({
          version,
          logger,
          printQRInTerminal: false,
          auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
          },
          browser: Browsers.ubuntu('Chrome'),
          generateHighQualityLinkPreview: true,
        });

        // Save credentials whenever they are updated
        sock.ev.on('creds.update', saveCreds);

        // Connection state updates
        sock.ev.on('connection.update', async (update) => {
          const { connection, lastDisconnect, qr } = update;

          // QR code
          if (qr) {
            console.log('[BAILEYS] QR Code received');
            emitter.emit('qr', qr);
          }

          // Connection opened
          if (connection === 'open') {
            console.log('[BAILEYS] Connection opened successfully');
            consecutiveMacErrors = 0; // Reset counter on successful connection
            lastMacErrorTime = 0; // Reset timestamp
            emitter.emit('authenticated');
            emitter.emit('ready');
          }

          // Connection closed
          if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const isLoggedOut = statusCode === DisconnectReason.loggedOut;
            const shouldReconnect = !isLoggedOut;
            
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
            } else if (shouldReconnect && !reinitInProgress) {
              console.log('[BAILEYS] Attempting to reconnect...');
              reconnectTimeout = setTimeout(() => startConnect('auto-reconnect'), 3000);
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
              const now = Date.now();
              const previousErrorTime = lastMacErrorTime;
              const timeSinceLastRecovery = lastRecoveryAttemptTime > 0 ? now - lastRecoveryAttemptTime : Infinity;
              
              // Check if we're in a cooldown period
              if (timeSinceLastRecovery < RECOVERY_COOLDOWN) {
                console.warn(
                  `[BAILEYS] Bad MAC error in connection handler but in recovery cooldown (${Math.round((RECOVERY_COOLDOWN - timeSinceLastRecovery)/1000)}s remaining)`
                );
                return;
              }
              
              // Check if this is a rapid error (within 5 seconds of previous error)
              const timeSinceLastError = previousErrorTime > 0 ? now - previousErrorTime : 0;
              const isBurstError = previousErrorTime > 0 && timeSinceLastError < MAC_ERROR_BURST_THRESHOLD;
              const isRapidError = previousErrorTime > 0 && timeSinceLastError < MAC_ERROR_RAPID_THRESHOLD;
              
              // Reset counter if too much time has passed since last error (errors are not consecutive)
              if (previousErrorTime > 0 && timeSinceLastError > MAC_ERROR_RESET_TIMEOUT) {
                console.log(
                  `[BAILEYS] Resetting Bad MAC counter due to timeout (${Math.round(timeSinceLastError/1000)}s since last error)`
                );
                consecutiveMacErrors = 0;
              }
              
              consecutiveMacErrors++;
              lastMacErrorTime = now;
              
              const errorType = isBurstError ? '[BURST]' : (isRapidError ? '[RAPID]' : '');
              
              console.error(
                `[BAILEYS] Bad MAC error in connection handler (${consecutiveMacErrors}/${MAX_CONSECUTIVE_MAC_ERRORS})${errorType}:`,
                errorMessage
              );
              
              // Trigger recovery if:
              // 1. We've hit the threshold for consecutive errors, OR
              // 2. We're getting rapid errors (sign of serious corruption), OR
              // 3. We're getting burst errors (immediate action needed)
              const shouldRecover = consecutiveMacErrors >= MAX_CONSECUTIVE_MAC_ERRORS || 
                                   (isRapidError && consecutiveMacErrors >= 1) ||
                                   isBurstError;
              
              if (shouldRecover && !reinitInProgress) {
                let reason;
                if (isBurstError) {
                  reason = `Burst Bad MAC errors in connection (${timeSinceLastError}ms between errors) - immediate recovery`;
                } else if (isRapidError) {
                  reason = `Rapid Bad MAC errors in connection (${Math.round(timeSinceLastError/1000)}s between errors)`;
                } else {
                  reason = `${MAX_CONSECUTIVE_MAC_ERRORS} consecutive MAC failures in connection`;
                }
                
                console.warn(
                  `[BAILEYS] Too many Bad MAC errors in connection, reinitializing with session clear (reason: ${reason})`
                );
                
                lastRecoveryAttemptTime = now;
                
                // Reinitialize with session clear, reset counter after successful trigger
                await reinitializeClient(
                  'bad-mac-error',
                  reason,
                  { clearAuthSessionOverride: true }
                );
                
                // Reset counter only after reinit is triggered
                consecutiveMacErrors = 0;
                lastMacErrorTime = 0;
              }
            }
          }
        });

        // Message events
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
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

        console.log(`[BAILEYS] Client initialized for clientId=${clientId}`);
        
      } catch (error) {
        console.error(`[BAILEYS] Connection error for clientId=${clientId}:`, error.message);
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

    console.warn(
      `[BAILEYS] Reinitializing clientId=${clientId} after ${trigger}${
        reason ? ` (${reason})` : ''
      }${clearSessionLabel}.`
    );

    try {
      // Close existing connection gracefully
      if (sock) {
        try {
          sock.end();
        } catch (err) {
          console.warn('[BAILEYS] Error closing socket:', err?.message || err);
        }
        sock = null;
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
            
            // Remove the entire session directory
            await rm(sessionPath, { recursive: true, force: true });
            
            // Recreate the directory
            fs.mkdirSync(sessionPath, { recursive: true });
            
            console.warn(`[BAILEYS] Cleared and recreated auth session for clientId=${clientId} at ${sessionPath}.`);
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
      await startConnect(`reinitialize:${trigger}`);
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

  emitter.connect = async () => startConnect('connect');

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
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    if (sock) {
      sock.end();
      sock = null;
    }
    await releaseSessionLock();
  };

  emitter.getNumberId = async (phone) => {
    if (!sock) {
      console.warn('[BAILEYS] Socket not initialized');
      return null;
    }

    try {
      const [result] = await sock.onWhatsApp(phone);
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
    if (!sock) {
      throw new Error('[BAILEYS] Socket not initialized');
    }

    const safeOptions = options && typeof options === 'object' ? options : {};

    try {
      let sentMsg;
      let messagePreview = '';

      // Handle document sending
      if (content && typeof content === 'object' && 'document' in content) {
        messagePreview = `document: ${content.fileName || 'unnamed'}`;
        console.log(`[BAILEYS] Sending document to ${jid}: ${content.fileName || 'unnamed'}`);
        sentMsg = await sock.sendMessage(jid, {
          document: content.document,
          mimetype: content.mimetype || 'application/octet-stream',
          fileName: content.fileName || 'document',
        });
      } else {
        // Handle text messages
        const text = typeof content === 'string' ? content : content?.text ?? '';
        messagePreview = text.length > 64 ? text.substring(0, 64) + '...' : text;
        console.log(`[BAILEYS] Sending text message to ${jid}: ${messagePreview}`);
        sentMsg = await sock.sendMessage(jid, { text });
      }

      const messageId = sentMsg?.key?.id || '';
      console.log(`[BAILEYS] Message sent successfully to ${jid}, messageId: ${messageId}`);
      
      // Return message ID in compatible format
      return messageId;
    } catch (err) {
      console.error('[BAILEYS] sendMessage failed:', err?.message || err);
      const error = new Error(`sendMessage failed: ${err?.message || err}`);
      error.jid = jid;
      error.retryable = false;
      throw error;
    }
  };

  emitter.onMessage = (handler) => emitter.on('message', handler);
  emitter.onDisconnect = (handler) => emitter.on('disconnected', handler);

  emitter.isReady = async () => sock !== null && sock.user !== undefined;

  emitter.getState = async () => {
    if (!sock) return 'DISCONNECTED';
    if (sock.user) return 'CONNECTED';
    return 'OPENING';
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
    releaseSessionLock().catch((err) => {
      console.warn('[BAILEYS] Failed to release session lock during shutdown:', err?.message || err);
    });
  };

  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, shutdownHandler);
  }

  const originalDisconnect = emitter.disconnect;
  emitter.disconnect = async () => {
    await originalDisconnect();
    for (const signal of SHUTDOWN_SIGNALS) {
      process.off(signal, shutdownHandler);
    }
  };

  console.log(`[BAILEYS] Client created for clientId=${clientId}`);

  return emitter;
}
