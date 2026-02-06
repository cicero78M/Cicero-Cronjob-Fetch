import { sendDebug } from "../middleware/debugHandler.js";
import waClient, { waGatewayClient, waUserClient } from "../service/waService.js";
import { getAdminWAIds, sendWithClientFallback } from "../utils/waHelper.js";
import {
  buildSatbinmasOfficialInstagramRecap,
  buildSatbinmasOfficialTiktokRecap,
} from "../service/satbinmasOfficialReportService.js";

export const JOB_KEY = "./src/cron/cronDirRequestSatbinmasOfficialMedia.js";
const CRON_TAG = "CRON DIRREQ SATBINMAS OFFICIAL MEDIA";
const waFallbackClients = [
  { client: waGatewayClient, label: "WA-GATEWAY" },
  { client: waClient, label: "WA" },
  { client: waUserClient, label: "WA-USER" },
];

function getRecipients() {
  const adminRecipients = getAdminWAIds().filter((wid) => wid.endsWith("@c.us"));
  return new Set(adminRecipients);
}

async function sendRecapToRecipients(message, recipients) {
  for (const wid of recipients) {
    await sendWithClientFallback({
      chatId: wid,
      message,
      clients: waFallbackClients,
      reportClient: waClient,
      reportContext: { jobKey: JOB_KEY, recipient: wid },
    });
  }
}

export async function runCron() {
  const recipients = getRecipients();
  sendDebug({ tag: CRON_TAG, msg: "Mulai cron dirrequest Satbinmas Official (IG & TikTok)" });

  if (!recipients.size) {
    sendDebug({
      tag: CRON_TAG,
      msg: "Lewati cron Satbinmas Official karena tidak ada admin WA penerima",
    });
    return;
  }

  try {
    const instagramRecap = await buildSatbinmasOfficialInstagramRecap();
    await sendRecapToRecipients(instagramRecap, recipients);
    sendDebug({
      tag: CRON_TAG,
      msg: `Rekap Instagram dikirim ke ${recipients.size} penerima`,
    });
  } catch (error) {
    sendDebug({
      tag: CRON_TAG,
      msg: `[ERROR IG] ${error?.message || error}`,
    });
  }

  try {
    const tiktokRecap = await buildSatbinmasOfficialTiktokRecap();
    await sendRecapToRecipients(tiktokRecap, recipients);
    sendDebug({
      tag: CRON_TAG,
      msg: `Rekap TikTok dikirim ke ${recipients.size} penerima`,
    });
  } catch (error) {
    sendDebug({
      tag: CRON_TAG,
      msg: `[ERROR TIKTOK] ${error?.message || error}`,
    });
  }
}
