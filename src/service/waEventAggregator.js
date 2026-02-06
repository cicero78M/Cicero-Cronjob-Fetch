// TTL-based cache for message deduplication to prevent memory leak
// Messages are kept for 24 hours by default (configurable via WA_MESSAGE_DEDUP_TTL_MS)
const seenMessages = new Map(); // key -> timestamp
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// Parse TTL from environment, with validation
function parseMessageDedupTTL() {
  const envValue = process.env.WA_MESSAGE_DEDUP_TTL_MS;
  if (!envValue) return DEFAULT_TTL_MS;
  
  const parsed = parseInt(envValue, 10);
  if (Number.isNaN(parsed) || parsed < 60000) {
    console.warn(
      `[WA-EVENT-AGGREGATOR] Invalid WA_MESSAGE_DEDUP_TTL_MS="${envValue}", ` +
      `using default ${DEFAULT_TTL_MS}ms (must be >= 60000ms)`
    );
    return DEFAULT_TTL_MS;
  }
  return parsed;
}

const MESSAGE_DEDUP_TTL_MS = parseMessageDedupTTL();

// Periodic cleanup of expired entries to prevent memory leak
function cleanupExpiredMessages() {
  const now = Date.now();
  let removedCount = 0;
  
  for (const [key, timestamp] of seenMessages.entries()) {
    if (now - timestamp > MESSAGE_DEDUP_TTL_MS) {
      seenMessages.delete(key);
      removedCount++;
    }
  }
  
  if (removedCount > 0 && debugLoggingEnabled) {
    console.log(
      `[WA-EVENT-AGGREGATOR] Cleaned up ${removedCount} expired message(s), ` +
      `current cache size: ${seenMessages.size}`
    );
  }
}

// Start periodic cleanup
const cleanupTimer = setInterval(cleanupExpiredMessages, CLEANUP_INTERVAL_MS);

// Ensure cleanup timer doesn't prevent process from exiting
if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

// Enable debug logging only when WA_DEBUG_LOGGING is set to "true"
const debugLoggingEnabled = process.env.WA_DEBUG_LOGGING === 'true';

/**
 * Deduplicate incoming messages from multiple adapters.
 * Messages received via wwebjs are preferred; baileys messages are delayed
 * briefly to allow wwebjs to handle the message first.
 * @param {string} fromAdapter
 * @param {object} msg
 * @param {(msg: object) => void} handler
 * @param {{ allowReplay?: boolean }} [options]
 */
export function handleIncoming(fromAdapter, msg, handler, options = {}) {
  const { allowReplay = false } = options;
  const jid = msg.key?.remoteJid || msg.from;
  const id = msg.key?.id || msg.id?.id || msg.id?._serialized;
  
  if (debugLoggingEnabled) {
    console.log(`[WA-EVENT-AGGREGATOR] Message received from adapter: ${fromAdapter}, jid: ${jid}, id: ${id}`);
  }
  
  const invokeHandler = () =>
    Promise.resolve(handler(msg)).catch((error) => {
      console.error("[WA] handler error", {
        jid,
        id,
        fromAdapter,
        error,
      });
    });
  if (!jid || !id) {
    if (debugLoggingEnabled) {
      console.log(`[WA-EVENT-AGGREGATOR] Invoking handler without jid/id (jid: ${jid}, id: ${id})`);
    }
    // Log warning for missing IDs to track potential issues
    if (!debugLoggingEnabled && (!jid || !id)) {
      console.warn(
        `[WA-EVENT-AGGREGATOR] Message missing identifier - jid: ${jid}, id: ${id}, ` +
        `fromAdapter: ${fromAdapter}`
      );
    }
    invokeHandler();
    return;
  }
  const key = `${jid}:${id}`;
  if (allowReplay) {
    if (debugLoggingEnabled) {
      console.log(`[WA-EVENT-AGGREGATOR] Allowing replay for message: ${key}`);
    }
    seenMessages.set(key, Date.now());
    invokeHandler();
    return;
  }
  if (seenMessages.has(key)) {
    if (debugLoggingEnabled) {
      console.log(`[WA-EVENT-AGGREGATOR] Duplicate message detected, skipping: ${key}`);
    }
    return;
  }

  if (fromAdapter === "baileys") {
    if (debugLoggingEnabled) {
      console.log(`[WA-EVENT-AGGREGATOR] Baileys message, delaying 200ms: ${key}`);
    }
    setTimeout(() => {
      if (seenMessages.has(key)) {
        if (debugLoggingEnabled) {
          console.log(`[WA-EVENT-AGGREGATOR] Baileys message already handled: ${key}`);
        }
        return;
      }
      if (debugLoggingEnabled) {
        console.log(`[WA-EVENT-AGGREGATOR] Processing delayed baileys message: ${key}`);
      }
      seenMessages.set(key, Date.now());
      invokeHandler();
    }, 200);
    return;
  }

  if (debugLoggingEnabled) {
    console.log(`[WA-EVENT-AGGREGATOR] Processing wwebjs message: ${key}`);
  }
  seenMessages.set(key, Date.now());
  invokeHandler();
}

/**
 * Get statistics about the message deduplication cache
 * @returns {{ size: number, ttlMs: number, oldestEntryAgeMs: number }}
 */
export function getMessageDedupStats() {
  const now = Date.now();
  let oldestTimestamp = now;
  
  for (const timestamp of seenMessages.values()) {
    if (timestamp < oldestTimestamp) {
      oldestTimestamp = timestamp;
    }
  }
  
  return {
    size: seenMessages.size,
    ttlMs: MESSAGE_DEDUP_TTL_MS,
    oldestEntryAgeMs: now - oldestTimestamp,
  };
}
