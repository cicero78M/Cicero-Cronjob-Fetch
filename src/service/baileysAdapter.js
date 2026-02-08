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
  const clearAuthSession = shouldClearAuthSession();

  // Create auth directory if it doesn't exist
  if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true });
  }

  let sock = null;
  let connectInProgress = null;
  let connectStartedAt = null;
  let reinitInProgress = false;
  let reconnectTimeout = null;

  // Pino logger configuration (silent unless debug is enabled)
  const logger = P({ 
    level: debugLoggingEnabled ? 'debug' : 'silent',
    timestamp: debugLoggingEnabled
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
        // Load auth state from file system
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        
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
            emitter.emit('authenticated');
            emitter.emit('ready');
          }

          // Connection closed
          if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            console.log(
              `[BAILEYS] Connection closed (statusCode: ${statusCode}, shouldReconnect: ${shouldReconnect})`
            );

            const reason = getDisconnectReason(statusCode);
            emitter.emit('disconnected', reason);

            if (shouldReconnect && !reinitInProgress) {
              console.log('[BAILEYS] Attempting to reconnect...');
              reconnectTimeout = setTimeout(() => startConnect('auto-reconnect'), 3000);
            }
          }
        });

        // Message events
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
          if (type !== 'notify') return;

          for (const msg of messages) {
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
   * Reinitialize client
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
      // Close existing connection
      if (sock) {
        sock.end();
        sock = null;
      }

      // Clear session if requested
      if (shouldClearSession) {
        try {
          await rm(sessionPath, { recursive: true, force: true });
          fs.mkdirSync(sessionPath, { recursive: true });
          console.warn(`[BAILEYS] Cleared auth session for clientId=${clientId} at ${sessionPath}.`);
        } catch (err) {
          console.warn(
            `[BAILEYS] Failed to clear auth session for clientId=${clientId}:`,
            err?.message || err
          );
        }
      }

      // Reconnect
      await startConnect(`reinitialize:${trigger}`);
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

  console.log(`[BAILEYS] Client created for clientId=${clientId}`);

  return emitter;
}
