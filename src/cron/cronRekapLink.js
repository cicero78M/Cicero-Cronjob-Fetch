import { scheduleCronJob } from "../utils/cronScheduler.js";
import dotenv from "dotenv";
dotenv.config();

import waClient from "../service/waService.js";
import { sendDebug } from "../middleware/debugHandler.js";
import { normalizeUserWhatsAppId, minPhoneDigitLength } from "../utils/waHelper.js";

import { absensiLink } from "../handler/fetchabsensi/link/absensiLinkAmplifikasi.js";

async function getActiveClients() {
  const { query } = await import("../db/index.js");
  const rows = await query(
    `SELECT client_id, nama, client_operator, client_super, client_group
     FROM clients
     WHERE client_status=true AND client_amplify_status=true
       AND LOWER(client_type)='org'
     ORDER BY client_id`
  );
  return rows.rows;
}

function logInvalidRecipient(value) {
  console.warn("[SKIP WA] invalid recipient", value);
}

function normalizeUserRecipient(value) {
  const normalized = normalizeUserWhatsAppId(value, minPhoneDigitLength);
  if (!normalized) {
    logInvalidRecipient(value);
    return null;
  }
  return normalized;
}

function toWAid(id) {
  if (!id || typeof id !== "string") return null;
  const trimmed = id.trim();
  if (!trimmed) return null;
  if (trimmed.endsWith("@g.us")) return trimmed;
  return normalizeUserRecipient(trimmed);
}

function getAdminWAIds() {
  return (process.env.ADMIN_WHATSAPP || "")
    .split(",")
    .map(n => n.trim())
    .filter(Boolean)
    .map(toWAid)
    .filter(Boolean);
}

function getRecipients(client) {
  const result = new Set();
  getAdminWAIds().forEach(n => result.add(n));
  [client.client_operator, client.client_super, client.client_group]
    .map(toWAid)
    .filter(Boolean)
    .forEach(n => result.add(n));
  return Array.from(result);
}

export async function runCron() {
  sendDebug({ tag: "CRON LINK", msg: "Mulai rekap link harian" });
  try {
    const clients = await getActiveClients();
    for (const client of clients) {
      try {
        const msg = await absensiLink(client.client_id, { roleFlag: "operator" });
        const targets = getRecipients(client);
        for (const wa of targets) {
          await waClient.sendMessage(wa, msg).catch(() => {});
        }
        sendDebug({
          tag: "CRON LINK",
          msg: `[${client.client_id}] Rekap absensi link dikirim ke ${targets.length} penerima`,
        });
      } catch (err) {
        sendDebug({
          tag: "CRON LINK",
          msg: `[${client.client_id}] ERROR absensi link: ${err.message}`,
        });
      }
    }
  } catch (err) {
    sendDebug({ tag: "CRON LINK", msg: `[ERROR GLOBAL] ${err.message || err}` });
  }
}

const JOB_KEY = "./src/cron/cronRekapLink.js";

scheduleCronJob(JOB_KEY, "5 15,18,21 * * *", runCron, { timezone: "Asia/Jakarta" });
export { getActiveClients, getRecipients };

export default null;
