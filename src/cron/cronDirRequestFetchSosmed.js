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
import { acquireDistributedLock } from "../service/distributedLockService.js";

const LOG_TAG = "CRON DIRFETCH SOSMED";
const DISTRIBUTED_LOCK_KEY = "cron:dirfetch:sosmed";
const CRON_MAX_RUN_MINUTES = 30;
const LOCK_TTL_SECONDS = (CRON_MAX_RUN_MINUTES + 5) * 60;

const lastStateByClient = new Map();
const lastNotificationByClient = new Map();
let isFetchInFlight = false;

// Notification interval: 1 hour (in milliseconds)
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const NOTIFICATION_INTERVAL_MS = MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND; // 1 hour

/**
 * Check if enough time has passed since last notification for a client
 * @param {string} clientId - Client ID
 * @returns {boolean} True if 1 hour has passed since last notification
 */
function shouldSendHourlyNotification(clientId) {
  const lastNotificationTime = lastNotificationByClient.get(clientId);
  
  // If no previous notification, send one
  if (!lastNotificationTime) {
    return true;
  }
  
  const now = Date.now();
  const timeSinceLastNotification = now - lastNotificationTime;
  
  // Send if 1 hour has passed
  return timeSinceLastNotification >= NOTIFICATION_INTERVAL_MS;
}

/**
 * Update the last notification timestamp for a client
 * @param {string} clientId - Client ID
 */
function updateLastNotificationTime(clientId) {
  lastNotificationByClient.set(clientId, Date.now());
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

/**
 * Determine if we should fetch posts based on current time
 * Cron runs until 16:30, so we check if hour < 17 to allow the 16:30 job to execute
 * @returns {boolean} True if it's time to fetch posts (06:00-16:59 allows 16:30 job)
 */
function shouldFetchPosts() {
  const now = new Date();
  // Get current hour in Jakarta timezone (UTC+7)
  const jakartaHour = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })).getHours();
  
  // Check if hour is between 6 and 16 (allows jobs scheduled at 06:00, 06:30, ..., 16:30)
  return jakartaHour >= 6 && jakartaHour < 17;
}

/**
 * Determine if we should send hourly notifications based on current time
 * Notifications align with post fetch period (cron runs until 16:30)
 * @returns {boolean} True if within notification time (06:00-16:59 allows 16:30 notifications)
 */
function shouldSendHourlyNotifications() {
  const now = new Date();
  // Get current hour in Jakarta timezone (UTC+7)
  const jakartaHour = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })).getHours();
  
  // Check if hour is between 6 and 16 (allows notifications during post fetch period)
  return jakartaHour >= 6 && jakartaHour < 17;
}

export async function runCron(options = {}) {
  const { forceEngagementOnly = false } = options;
  const runStartedAt = Date.now();
  const distributedLock = await acquireDistributedLock({
    key: DISTRIBUTED_LOCK_KEY,
    ttlSeconds: LOCK_TTL_SECONDS,
  });

  if (!distributedLock.acquired) {
    logMessage("lock", null, "lock_skipped", "skipped", null, null, "Distributed lock already held, skipping run", {
      metric: "lock_skipped",
      lockKey: DISTRIBUTED_LOCK_KEY,
      reason: distributedLock.reason || "lock_held",
    });
    return;
  }

  logMessage("lock", null, "lock_acquired", "acquired", null, null, "Distributed lock acquired", {
    metric: "lock_acquired",
    lockKey: DISTRIBUTED_LOCK_KEY,
  });

  if (isFetchInFlight) {
    logMessage("lock", null, "inFlight", "queued", null, null, "Run already in progress, skipping.");
    return;
  }

  isFetchInFlight = true;

  try {
    // Determine if we should fetch posts based on time
    const isPostFetchTime = shouldFetchPosts();
    const skipPostFetch = forceEngagementOnly || !isPostFetchTime;
    
    const timeBasedMessage = isPostFetchTime 
      ? "post fetch period (last run 17:03)" 
      : "engagement only period (17:30-22:00)";
    
    logMessage("start", null, "cron", "start", null, null, "", { 
      forceEngagementOnly, 
      skipPostFetch,
      timeBasedMessage 
    });
    await sendTelegramLog("INFO", `🚀 Cron job started: ${LOG_TAG} - ${timeBasedMessage}${forceEngagementOnly ? " (forced engagement only)" : ""}`);

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

        // Check if it's time for hourly notification (during post fetch period, last run 16:30)
        const isNotificationTime = shouldSendHourlyNotifications();
        const shouldSendHourly = isNotificationTime && shouldSendHourlyNotification(clientId);
        const hasChanges = hasNotableChanges(changes);
        
        // Send WhatsApp notification if:
        // 1. There are notable changes (original behavior), OR
        // 2. 1 hour has passed since last notification AND within post fetch period (hourly notifications)
        if (hasChanges || shouldSendHourly) {
          const changeSummary = buildChangeSummary(changes);
          const notificationReason = shouldSendHourly 
            ? `Hourly notification (${hasChanges ? 'with changes: ' + changeSummary : 'no changes'})`
            : `Changes detected: ${changeSummary}`;
          
          logMessage("waNotification", clientId, "sendNotification", "start", countsBefore, countsAfter,
            `Sending WA notification: ${notificationReason}`);

          try {
            // Use only waGatewayClient for task notifications
            if (waGatewayClient) {
              const notificationOptions = {
                forceScheduled: shouldSendHourly,
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
                // Update last notification time only if notification was actually sent
                updateLastNotificationTime(clientId);
                
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
            "No notable changes detected and not time for hourly notification");
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
    const runDurationMs = Date.now() - runStartedAt;
    logMessage("metric", null, "run_duration", "completed", null, null, `Cron duration ${runDurationMs}ms`, {
      metric: "run_duration",
      durationMs: runDurationMs,
    });
    await distributedLock.release();
    isFetchInFlight = false;
  }
}

export const JOB_KEY = "./src/cron/cronDirRequestFetchSosmed.js";

// Posts fetch: Run every 30 minutes from 6 AM until 5 PM Jakarta time
// Last execution at 16:30 (4:30 PM), ensuring no overlap with engagement-only period
// This includes: 6:00, 6:30, 7:00, 7:30, ..., 16:00, 16:30
const POST_FETCH_SCHEDULE = "5,30 6-16 * * *";

// Engagement only: Run every 30 minutes from 5:30 PM to 10 PM Jakarta time
// First execution at 17:30 (5:30 PM), after post fetch period ends
// This includes: 17:30, 18:00, 18:30, 19:00, 19:30, 20:00, 20:30, 21:00, 21:30, 22:00
const ENGAGEMENT_ONLY_SCHEDULES = [
  "30 17-21 * * *",  // 17:30, 18:30, 19:30, 20:30, 21:30
  "0 18-22 * * *"    // 18:00, 19:00, 20:00, 21:00, 22:00
];

const CRON_OPTIONS = { timezone: "Asia/Jakarta" };

// Schedule post fetch job (every 30 min from 06:00 to 16:30)
scheduleCronJob(JOB_KEY + ":post-fetch", POST_FETCH_SCHEDULE, runCron, CRON_OPTIONS);

// Schedule engagement only jobs (17:30 to 22:00)
ENGAGEMENT_ONLY_SCHEDULES.forEach((schedule, index) => {
  scheduleCronJob(
    JOB_KEY + `:engagement-only-${index}`, 
    schedule, 
    () => runCron({ forceEngagementOnly: true }), 
    CRON_OPTIONS
  );
});
