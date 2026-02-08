import dotenv from "dotenv";
dotenv.config();

import { scheduleCronJob } from "../utils/cronScheduler.js";
import { findAllActiveClientsWithSosmed } from "../model/clientModel.js";
import { getInstaPostCount, getTiktokPostCount } from "../service/postCountService.js";
import { fetchAndStoreInstaContent } from "../handler/fetchpost/instaFetchPost.js";
import { handleFetchLikesInstagram } from "../handler/fetchengagement/fetchLikesInstagram.js";
import { fetchAndStoreTiktokContent } from "../handler/fetchpost/tiktokFetchPost.js";
import { handleFetchKomentarTiktokBatch } from "../handler/fetchengagement/fetchCommentTiktok.js";
import { detectChanges, hasNotableChanges } from "../service/tugasChangeDetector.js";
import { sendTugasNotification, buildChangeSummary } from "../service/tugasNotificationService.js";
import { waGatewayClient } from "../service/waService.js";
import { sendTelegramLog, sendTelegramError } from "../service/telegramService.js";

const LOG_TAG = "CRON DIRFETCH SOSMED";

const lastStateByClient = new Map();
let isFetchInFlight = false;

// Scheduled notification times (Jakarta time) - always send notifications at these times
const SCHEDULED_NOTIFICATION_TIMES = [
  { hour: 6, minute: 30 },   // 06:30
  { hour: 14, minute: 0 },   // 14:00
  { hour: 17, minute: 0 }    // 17:00
];

/**
 * Check if current time matches any scheduled notification time
 * @returns {boolean} True if current time is a scheduled notification time
 */
function isScheduledNotificationTime() {
  const now = new Date();
  // Convert to Jakarta time (UTC+7)
  const jakartaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const currentHour = jakartaTime.getHours();
  const currentMinute = jakartaTime.getMinutes();
  
  return SCHEDULED_NOTIFICATION_TIMES.some(
    scheduledTime => scheduledTime.hour === currentHour && scheduledTime.minute === currentMinute
  );
}

function logMessage(phase, clientId, action, result, countsBefore, countsAfter, message = "", meta = {}) {
  const prefix = `[${LOG_TAG}]${clientId ? `[${clientId}]` : ""}[${phase}]`;
  const countText = countsBefore && countsAfter 
    ? `IG ${countsBefore.ig || 0}→${countsAfter.ig || 0} | TikTok ${countsBefore.tiktok || 0}→${countsAfter.tiktok || 0}`
    : "";
  
  const details = [
    action ? `action=${action}` : null,
    result ? `result=${result}` : null,
    countText,
    message,
    Object.keys(meta).length > 0 ? `meta=${JSON.stringify(meta).slice(0, 200)}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  console.log(`${prefix} ${details}`.trim());
}

async function ensureClientState(clientId) {
  const normalizedId = String(clientId || "").trim().toUpperCase();
  if (lastStateByClient.has(normalizedId)) {
    return lastStateByClient.get(normalizedId);
  }

  const [igCount, tiktokCount] = await Promise.all([
    getInstaPostCount(normalizedId),
    getTiktokPostCount(normalizedId),
  ]);

  const initialState = {
    igCount,
    tiktokCount,
  };

  lastStateByClient.set(normalizedId, initialState);
  return initialState;
}

export async function runCron(options = {}) {
  const { forceEngagementOnly = false } = options;

  if (isFetchInFlight) {
    logMessage("lock", null, "inFlight", "queued", null, null, "Run already in progress, skipping.");
    return;
  }

  isFetchInFlight = true;

  try {
    logMessage("start", null, "cron", "start", null, null, "", { forceEngagementOnly });
    await sendTelegramLog("INFO", `🚀 Cron job started: ${LOG_TAG}${forceEngagementOnly ? " (engagement only mode)" : ""}`);

    const skipPostFetch = Boolean(forceEngagementOnly);
    const activeClients = await findAllActiveClientsWithSosmed();

    if (activeClients.length === 0) {
      logMessage("init", null, "loadClients", "empty", null, null, "No active clients with Instagram or TikTok");
      await sendTelegramLog("INFO", `${LOG_TAG}: No active clients to process`);
      return;
    }

    logMessage("init", null, "loadClients", "loaded", null, null, `Processing ${activeClients.length} clients`);

    for (const client of activeClients) {
      try {
        const clientId = String(client.client_id || "").trim().toUpperCase();
        const hasInstagram = client?.client_insta_status !== false;
        const hasTiktok = client?.client_tiktok_status !== false;
        const previousState = await ensureClientState(clientId);
        
        const countsBefore = {
          ig: previousState.igCount,
          tiktok: previousState.tiktokCount,
        };

        // Fetch Instagram posts
        if (!skipPostFetch && hasInstagram) {
          logMessage("instagramFetch", clientId, "fetchInstagram", "start", countsBefore, null);
          await fetchAndStoreInstaContent(
            ["shortcode", "caption", "like_count", "timestamp"],
            null,
            null,
            clientId
          );
          logMessage("instagramFetch", clientId, "fetchInstagram", "completed", countsBefore, null);
        } else {
          logMessage("instagramFetch", clientId, "fetchInstagram", "skipped", countsBefore, null, 
            !hasInstagram ? "Instagram account inactive" : "forceEngagementOnly=true");
        }

        // Fetch TikTok posts
        if (!skipPostFetch && hasTiktok) {
          logMessage("tiktokFetch", clientId, "fetchTiktok", "start", countsBefore, null);
          await fetchAndStoreTiktokContent(clientId);
          logMessage("tiktokFetch", clientId, "fetchTiktok", "completed", countsBefore, null);
        } else {
          logMessage("tiktokFetch", clientId, "fetchTiktok", "skipped", countsBefore, null,
            !hasTiktok ? "TikTok account inactive" : "forceEngagementOnly=true");
        }

        // Fetch Instagram likes
        if (hasInstagram) {
          logMessage("likesRefresh", clientId, "refreshLikes", "start", countsBefore, null);
          await handleFetchLikesInstagram(null, null, clientId);
          logMessage("likesRefresh", clientId, "refreshLikes", "completed", countsBefore, null);
        } else {
          logMessage("likesRefresh", clientId, "refreshLikes", "skipped", countsBefore, null, 
            "Instagram account inactive");
        }

        // Fetch TikTok comments
        logMessage("commentRefresh", clientId, "refreshComments", "start", countsBefore, null);
        await handleFetchKomentarTiktokBatch(null, null, clientId);
        logMessage("commentRefresh", clientId, "refreshComments", "completed", countsBefore, null);

        // Get updated counts
        const [igCount, tiktokCount] = await Promise.all([
          getInstaPostCount(clientId),
          getTiktokPostCount(clientId),
        ]);

        const countsAfter = { ig: igCount, tiktok: tiktokCount };

        // Detect changes for WhatsApp notification
        const changes = await detectChanges(
          { igCount: countsBefore.ig, tiktokCount: countsBefore.tiktok },
          { igCount: countsAfter.ig, tiktokCount: countsAfter.tiktok },
          clientId
        );

        // Update state
        const nextState = {
          igCount,
          tiktokCount,
        };
        lastStateByClient.set(clientId, nextState);

        logMessage("fetchComplete", clientId, "fetchComplete", "completed", countsBefore, countsAfter,
          "Social media fetch completed successfully");

        // Determine if this is a scheduled notification time
        const isScheduledTime = isScheduledNotificationTime();
        const hasChanges = hasNotableChanges(changes);
        
        // Send WhatsApp notification if:
        // 1. There are notable changes (original behavior), OR
        // 2. It's a scheduled notification time (new behavior - always send at 6:30, 14:00, 17:00)
        if (hasChanges || isScheduledTime) {
          const changeSummary = buildChangeSummary(changes);
          const notificationReason = isScheduledTime 
            ? `Scheduled notification (${hasChanges ? 'with changes: ' + changeSummary : 'no changes'})`
            : `Changes detected: ${changeSummary}`;
          
          logMessage("waNotification", clientId, "sendNotification", "start", countsBefore, countsAfter,
            `Sending WA notification: ${notificationReason}`);

          try {
            // Use only waGatewayClient for task notifications
            if (waGatewayClient) {
              const notificationOptions = {
                forceScheduled: isScheduledTime,
                igCount: countsAfter.ig,
                tiktokCount: countsAfter.tiktok
              };
              
              const notificationSent = await sendTugasNotification(
                waGatewayClient, 
                clientId, 
                changes,
                notificationOptions
              );
              
              if (notificationSent) {
                logMessage("waNotification", clientId, "sendNotification", "completed", countsBefore, countsAfter,
                  `WA notification sent: ${notificationReason}`);
                
                // Send success log to Telegram
                await sendTelegramLog("INFO", `Task notification sent for client ${clientId}: ${notificationReason}`);
              } else {
                logMessage("waNotification", clientId, "sendNotification", "skipped", countsBefore, countsAfter,
                  "No group configured or no message sent");
              }
            } else {
              logMessage("waNotification", clientId, "sendNotification", "skipped", countsBefore, countsAfter,
                "WhatsApp client not available");
            }
          } catch (waErr) {
            logMessage("waNotification", clientId, "sendNotification", "error", countsBefore, countsAfter,
              waErr?.message || String(waErr),
              { name: waErr?.name, stack: waErr?.stack?.slice(0, 200) });
          }
        } else {
          logMessage("waNotification", clientId, "sendNotification", "skipped", countsBefore, countsAfter,
            "No notable changes detected and not a scheduled notification time");
        }

      } catch (clientErr) {
        const clientId = String(client?.client_id || "").trim().toUpperCase();
        logMessage("client", clientId, "processClient", "error", null, null, 
          clientErr?.message || String(clientErr),
          { name: clientErr?.name, stack: clientErr?.stack?.slice(0, 200) });
        await sendTelegramError(`${LOG_TAG}: Client ${clientId}`, clientErr);
      }
    }

    logMessage("end", null, "cron", "completed", null, null, "All clients processed successfully");
    await sendTelegramLog("INFO", `✅ ${LOG_TAG} completed successfully. Processed ${activeClients.length} clients.`);

  } catch (err) {
    logMessage("cron", null, "run", "error", null, null, err?.message || String(err),
      { name: err?.name, stack: err?.stack?.slice(0, 200) });
    await sendTelegramError(LOG_TAG, err);
  } finally {
    isFetchInFlight = false;
  }
}

export const JOB_KEY = "./src/cron/cronDirRequestFetchSosmed.js";

// Run every 30 minutes from 6 AM to 10 PM Jakarta time
const CRON_SCHEDULES = ["0,30 6-21 * * *", "0 22 * * *"];
const CRON_OPTIONS = { timezone: "Asia/Jakarta" };

CRON_SCHEDULES.forEach((cronExpression) => {
  scheduleCronJob(JOB_KEY, cronExpression, runCron, CRON_OPTIONS);
});
