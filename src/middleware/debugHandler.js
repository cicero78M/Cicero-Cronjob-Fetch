// src/middleware/debugHandler.js

import waClient, { waitForWaReady } from "../service/waService.js";

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

function parseAdminWA() {
  return (process.env.ADMIN_WHATSAPP || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n) => (n.endsWith("@c.us") ? n : n.replace(/\D/g, "") + "@c.us"));
}

/**
 * Kirim debug ke admin WhatsApp & console.
 * @param {string} tag - Tag kategori pesan (misal: CRON TIKTOK)
 * @param {string|object} msg - Pesan yang akan dikirim/log.
 * @param {string} [client_id] - Opsional, client_id untuk prefix (jika ada)
 * @param {string} [clientName] - Opsional, nama client untuk prefix
 */
export function sendDebug({ tag = "DEBUG", msg, client_id = "", clientName = "" } = {}) {
  let safeMsg = typeof msg === "string" ? msg : safeStringify(msg);

  const adminWA = parseAdminWA();
  let prefix = `[${tag}]`;
  if (client_id) prefix += `[${client_id}]`;
  if (clientName) prefix += `[${clientName}]`;

  const fullMsg = `${prefix} ${safeMsg}`;

  const isStartOrEnd = /\b(mulai|start|selesai|end)\b/i.test(safeMsg);
  const isError = /error/i.test(safeMsg);

  if (isStartOrEnd || isError) {
    waitForWaReady()
      .then(() => {
        let waMsg = fullMsg;
        if (isError) {
          // kirim hanya potongan pendek agar tidak mengandung raw data
          waMsg = `${prefix} ${safeMsg.toString().substring(0, 200)}`;
        }
        for (const wa of adminWA) {
          waClient.sendMessage(wa, waMsg).catch(() => {});
        }
      })
      .catch(() => {
        console.warn(
          '[WA] Skipping debug WhatsApp send: WhatsApp client not ready'
        );
      });
  }

  console.log(fullMsg);
}

// Debug khusus yang hanya dicetak di console tanpa mengirim pesan WhatsApp
export function sendConsoleDebug({ tag = "DEBUG", msg, client_id = "", clientName = "" } = {}) {
  const safeMsg = typeof msg === "string" ? msg : safeStringify(msg);
  let prefix = `[${tag}]`;
  if (client_id) prefix += `[${client_id}]`;
  if (clientName) prefix += `[${clientName}]`;
  console.log(`${prefix} ${safeMsg}`);
}
