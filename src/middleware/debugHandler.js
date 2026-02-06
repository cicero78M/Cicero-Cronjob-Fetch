// src/middleware/debugHandler.js

// Helper: stringifier aman untuk circular object
function safeStringify(obj) {
  try {
    if (typeof obj === "string") return obj;
    const seen = new WeakSet(); // PENTING: harus baru setiap pemanggilan!
    return JSON.stringify(obj, function (key, value) {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
      }
      return value;
    });
  } catch {
    try {
      return obj && obj.toString ? obj.toString() : "[Object]";
    } catch {
      return "[Object]";
    }
  }
}

/**
 * Kirim debug ke console (WhatsApp functionality removed).
 * @param {string} tag - Tag kategori pesan (misal: CRON TIKTOK)
 * @param {string|object} msg - Pesan yang akan dikirim/log.
 * @param {string} [client_id] - Opsional, client_id untuk prefix (jika ada)
 * @param {string} [clientName] - Opsional, nama client untuk prefix
 */
export function sendDebug({ tag = "DEBUG", msg, client_id = "", clientName = "" } = {}) {
  let safeMsg = typeof msg === "string" ? msg : safeStringify(msg);

  let prefix = `[${tag}]`;
  if (client_id) prefix += `[${client_id}]`;
  if (clientName) prefix += `[${clientName}]`;

  const fullMsg = `${prefix} ${safeMsg}`;
  console.log(fullMsg);
}

// Debug khusus yang hanya dicetak di console
export function sendConsoleDebug({ tag = "DEBUG", msg, client_id = "", clientName = "" } = {}) {
  const safeMsg = typeof msg === "string" ? msg : safeStringify(msg);
  let prefix = `[${tag}]`;
  if (client_id) prefix += `[${client_id}]`;
  if (clientName) prefix += `[${clientName}]`;
  console.log(`${prefix} ${safeMsg}`);
}
