import dotenv from "dotenv";
dotenv.config();

import waClient from "../service/waService.js";
import { formatRekapUserData, formatExecutiveSummary } from "../service/dirRequestService.js";
import { safeSendMessage, normalizeUserWhatsAppId, minPhoneDigitLength } from "../utils/waHelper.js";
import { sendDebug } from "../middleware/debugHandler.js";
import { scheduleCronJob } from "../utils/cronScheduler.js";

const DIRREQUEST_GROUP = "120363419830216549@g.us";

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
    .map((n) => n.trim())
    .filter(Boolean)
    .map(toWAid)
    .filter(Boolean);
}

export async function runCron() {
  sendDebug({ tag: "CRON DIRREQ REKAP", msg: "Mulai cron dirrequest rekap update" });
  try {
    const executive = await formatExecutiveSummary("DITBINMAS", "ditbinmas");
    const rekap = await formatRekapUserData("DITBINMAS", "ditbinmas");

    const recipients = new Set([...getAdminWAIds(), DIRREQUEST_GROUP]);
    for (const wa of recipients) {
      await safeSendMessage(waClient, wa, executive.trim());
      await safeSendMessage(waClient, wa, rekap.trim());
    }

    sendDebug({
      tag: "CRON DIRREQ REKAP",
      msg: `Laporan dikirim ke ${recipients.size} penerima`,
    });
  } catch (err) {
    sendDebug({
      tag: "CRON DIRREQ REKAP",
      msg: `[ERROR] ${err.message || err}`,
    });
  }
}

const JOB_KEY = "./src/cron/cronDirRequestRekapUpdate.js";

if (process.env.JEST_WORKER_ID === undefined) {
  scheduleCronJob(JOB_KEY, "0 8-18/4 * * *", () => runCron(), { timezone: "Asia/Jakarta" });
}

export default null;
