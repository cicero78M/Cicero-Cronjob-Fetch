import dotenv from "dotenv";
dotenv.config();
import pLimit from "p-limit";

import { scheduleCronJob } from "../utils/cronScheduler.js";
import { findAllActiveClientsWithSosmed } from "../model/clientModel.js";
import { getInstaPostCount, getTiktokPostCount } from "../service/postCountService.js";
import { fetchAndStoreInstaContent } from "../handler/fetchpost/instaFetchPost.js";
import { handleFetchLikesInstagram } from "../handler/fetchengagement/fetchLikesInstagram.js";
import { fetchAndStoreTiktokContent } from "../handler/fetchpost/tiktokFetchPost.js";
import { handleFetchKomentarTiktokBatch } from "../handler/fetchengagement/fetchCommentTiktok.js";
import { detectChanges, hasNotableChanges } from "../service/tugasChangeDetector.js";
import { enqueueTugasNotification, buildChangeSummary } from "../service/tugasNotificationService.js";
import { sendTelegramLog, sendTelegramError } from "../service/telegramService.js";
import { acquireDistributedLock } from "../service/distributedLockService.js";
import {
  getSchedulerStateMapByClientIds,
  upsertSchedulerState,
} from "../model/waNotificationReminderStateModel.js";

const LOG_TAG = "CRON DIRFETCH SOSMED";
const DISTRIBUTED_LOCK_KEY = "cron:dirfetch:sosmed";
const CRON_MAX_RUN_MINUTES = 30;
const LOCK_TTL_SECONDS = (CRON_MAX_RUN_MINUTES + 5) * 60;
const DEFAULT_CLIENT_CONCURRENCY = 4;
const DEFAULT_MAX_RUN_DURATION_MS = (CRON_MAX_RUN_MINUTES - 2) * 60 * 1000;
const DEADLINE_INTAKE_BUFFER_MS = 20 * 1000;

let isFetchInFlight = false;

const JAKARTA_TIMEZONE = "Asia/Jakarta";
const HOURLY_SLOT_ANCHOR_MINUTE = 0;

const CLIENT_SCHEDULE_PROFILES = Object.freeze({
  ditbinmas: {
    key: "ditbinmas",
    startHour: 11,
    endHour: 20,
    include2200EngagementSlot: false,
  },
  bidhumas: {
    key: "bidhumas",
    startHour: 10,
    endHour: 21,
    include2200EngagementSlot: true,
  },
  ditintelkam: {
    key: "ditintelkam",
    startHour: 10,
    endHour: 21,
    include2200EngagementSlot: true,
  },
  org: {
    key: "org",
    startHour: 7,
    endHour: 20,
    include2200EngagementSlot: false,
  },
  default: {
    key: "default",
    startHour: 6,
    endHour: 21,
    include2200EngagementSlot: false,
  },
});

function normalizeClientId(clientId) {
  return String(clientId || "").trim().toUpperCase();
}

function toNormalizedClientIdSet(clientIds = []) {
  const normalized = clientIds
    .map((clientId) => normalizeClientId(clientId))
    .filter(Boolean);
  return new Set(normalized);
}

function toIsoOrNull(value) {
  if (!value) return null;
  const asDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(asDate.getTime())) return null;
  return asDate.toISOString();
}

function buildFallbackState(clientId) {
  return {
    clientId,
    lastIgCount: null,
    lastTiktokCount: null,
    lastNotifiedAt: null,
    lastNotifiedSlot: null,
  };
}

/**
 * Build Jakarta time parts so we can generate deterministic slot keys
 * regardless of server timezone.
 * @param {Date} date
 * @returns {{year: number, month: number, day: number, hour: number, minute: number}}
 */
function getJakartaTimeParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA_TIMEZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const partMap = parts.reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    year: Number(partMap.year),
    month: Number(partMap.month),
    day: Number(partMap.day),
    hour: Number(partMap.hour),
    minute: Number(partMap.minute),
  };
}

/**
 * Round the current Jakarta time into a fixed hourly slot key.
 * All runs in the same hour map to one key so hourly notification stays global.
 *
 * Example:
 * - 06:00 WIB => 2026-02-13-06@00
 * - 06:30 WIB => 2026-02-13-06@00
 * - 06:03 WIB => 2026-02-13-06@00
 *
 * @param {Date} date
 * @returns {string}
 */
function buildJakartaHourlySlotKey(date = new Date()) {
  const parts = getJakartaTimeParts(date);
  let slotHour = parts.hour;

  if (parts.minute < HOURLY_SLOT_ANCHOR_MINUTE) {
    slotHour -= 1;
  }

  if (slotHour < 0) {
    slotHour = 23;
    const rolloverDate = new Date(date.getTime() - (24 * 60 * 60 * 1000));
    const rolloverParts = getJakartaTimeParts(rolloverDate);
    return `${rolloverParts.year}-${String(rolloverParts.month).padStart(2, "0")}-${String(rolloverParts.day).padStart(2, "0")}-${String(slotHour).padStart(2, "0")}@${String(HOURLY_SLOT_ANCHOR_MINUTE).padStart(2, "0")}`;
  }

  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}-${String(slotHour).padStart(2, "0")}@${String(HOURLY_SLOT_ANCHOR_MINUTE).padStart(2, "0")}`;
}

/**
 * Check if we should send hourly notification for the current fixed slot
 * @param {object} schedulerState - scheduler state for client
 * @param {string} currentSlotKey - slot key of current run
 * @returns {boolean} True if current slot has never been sent
 */
function shouldSendHourlyNotification(schedulerState, currentSlotKey) {
  return schedulerState?.lastNotifiedSlot !== currentSlotKey;
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

function resolveCountsBefore(schedulerState, countsAfter, storageHealthy) {
  if (!storageHealthy || schedulerState.lastIgCount === null || schedulerState.lastTiktokCount === null) {
    return {
      ig: countsAfter.ig,
      tiktok: countsAfter.tiktok,
    };
  }

  return {
    ig: schedulerState.lastIgCount,
    tiktok: schedulerState.lastTiktokCount,
  };
}

function buildNextSchedulerState(schedulerState, countsAfter, notificationSent, currentSlotKey) {
  return {
    clientId: schedulerState.clientId,
    lastIgCount: countsAfter.ig,
    lastTiktokCount: countsAfter.tiktok,
    lastNotifiedAt: notificationSent ? new Date().toISOString() : toIsoOrNull(schedulerState.lastNotifiedAt),
    lastNotifiedSlot: notificationSent ? currentSlotKey : (schedulerState.lastNotifiedSlot || null),
  };
}

function isHalfHourlySlot(minute) {
  return minute === 0 || minute === 30;
}

export function resolveClientFetchSegment(client) {
  const clientId = normalizeClientId(client?.client_id).toLowerCase();
  const clientType = String(client?.client_type || "").trim().toLowerCase();

  if (clientId === "ditbinmas") {
    return CLIENT_SCHEDULE_PROFILES.ditbinmas;
  }

  if (clientId === "bidhumas") {
    return CLIENT_SCHEDULE_PROFILES.bidhumas;
  }

  if (clientId === "ditintelkam") {
    return CLIENT_SCHEDULE_PROFILES.ditintelkam;
  }

  if (clientType === "org") {
    return CLIENT_SCHEDULE_PROFILES.org;
  }

  return CLIENT_SCHEDULE_PROFILES.default;
}

function isWithinPostWindow(profile, hour, minute) {
  if (!isHalfHourlySlot(minute)) return false;
  if (hour < profile.startHour || hour > profile.endHour) return false;

  if (hour === profile.endHour) {
    return minute === 0;
  }

  return true;
}

function shouldProcessClientAtJakartaParts(client, jakartaParts) {
  const { hour, minute } = jakartaParts || {};
  const scheduleProfile = resolveClientFetchSegment(client);

  if (isWithinPostWindow(scheduleProfile, hour, minute)) {
    return true;
  }

  return scheduleProfile.include2200EngagementSlot && hour === 22 && minute === 0;
}

/**
 * Pure slot validator for Jakarta hour+minute.
 * Uses per-client schedule profiles.
 * @param {object} client
 * @param {{hour:number, minute:number}} jakartaParts
 * @returns {boolean}
 */
export function shouldFetchPostsForClientAtJakartaParts(client, jakartaParts) {
  const { hour, minute } = jakartaParts || {};
  const clientSchedule = resolveClientFetchSegment(client);
  return isWithinPostWindow(clientSchedule, hour, minute);
}

/**
 * Determine if we should fetch posts for a client based on current time.
 * @returns {boolean} True if it's time to fetch posts for the client.
 */
export function shouldFetchPostsForClient(client, date = new Date()) {
  return shouldFetchPostsForClientAtJakartaParts(client, getJakartaTimeParts(date));
}

/**
 * Determine if we should send hourly notifications based on current time
 * Notifications align with post fetch period including mandatory 17:05 slot.
 * @returns {boolean} True if within notification time (06:00-17:59 WIB)
 */
function shouldSendHourlyNotifications() {
  const jakartaHour = getJakartaTimeParts(new Date()).hour;

  // Check if hour is between 6 and 22 WIB.
  return jakartaHour >= 6 && jakartaHour <= 22;
}

export async function processClient(client, options = {}) {
  const {
    forceEngagementOnly,
    forcePostFetch,
    schedulerStateByClient,
    stateStorageHealthy,
  } = options;
  const clientStartTime = Date.now();
  const clientId = normalizeClientId(client?.client_id);
  const hasInstagram = client?.client_insta_status !== false;
  const hasTiktok = client?.client_tiktok_status !== false;
  const shouldRunForCurrentSlot = shouldProcessClientAtJakartaParts(client, getJakartaTimeParts(new Date()));
  if (!forcePostFetch && !forceEngagementOnly && !shouldRunForCurrentSlot) {
    logMessage("clientSchedule", clientId, "processClient", "skipped", null, null,
      "outside client processing slot");
    return {
      clientId,
      skipped: true,
      reason: "outside client processing slot",
    };
  }

  const skipPostFetch = forceEngagementOnly || (!forcePostFetch && !shouldFetchPostsForClient(client));
  const schedulerState = schedulerStateByClient.get(clientId) || buildFallbackState(clientId);
  const currentSlotKey = buildJakartaHourlySlotKey(new Date());

  // Fetch Instagram posts
  if (!skipPostFetch && hasInstagram) {
    logMessage("instagramFetch", clientId, "fetchInstagram", "start", null, null);
    await fetchAndStoreInstaContent(
      ["shortcode", "caption", "like_count", "timestamp"],
      null,
      null,
      clientId
    );
    logMessage("instagramFetch", clientId, "fetchInstagram", "completed", null, null);
  } else {
    logMessage("instagramFetch", clientId, "fetchInstagram", "skipped", null, null,
      !hasInstagram
        ? "Instagram account inactive"
        : (forceEngagementOnly ? "forceEngagementOnly=true" : "outside post-fetch slot for client segment"));
  }

  // Fetch TikTok posts
  if (!skipPostFetch && hasTiktok) {
    logMessage("tiktokFetch", clientId, "fetchTiktok", "start", null, null);
    await fetchAndStoreTiktokContent(clientId);
    logMessage("tiktokFetch", clientId, "fetchTiktok", "completed", null, null);
  } else {
    logMessage("tiktokFetch", clientId, "fetchTiktok", "skipped", null, null,
      !hasTiktok
        ? "TikTok account inactive"
        : (forceEngagementOnly ? "forceEngagementOnly=true" : "outside post-fetch slot for client segment"));
  }

  // Fetch Instagram likes
  if (hasInstagram) {
    logMessage("likesRefresh", clientId, "refreshLikes", "start", null, null);
    await handleFetchLikesInstagram(null, null, clientId);
    logMessage("likesRefresh", clientId, "refreshLikes", "completed", null, null);
  } else {
    logMessage("likesRefresh", clientId, "refreshLikes", "skipped", null, null,
      "Instagram account inactive");
  }

  // Fetch TikTok comments
  if (hasTiktok) {
    logMessage("commentRefresh", clientId, "refreshComments", "start", null, null);
    await handleFetchKomentarTiktokBatch(null, null, clientId);
    logMessage("commentRefresh", clientId, "refreshComments", "completed", null, null);
  } else {
    logMessage("commentRefresh", clientId, "refreshComments", "skipped", null, null,
      "TikTok account inactive");
  }

  // Get updated counts after successful fetch+refresh
  const [igCount, tiktokCount] = await Promise.all([
    getInstaPostCount(clientId),
    getTiktokPostCount(clientId),
  ]);

  const countsAfter = { ig: igCount, tiktok: tiktokCount };
  const countsBefore = resolveCountsBefore(schedulerState, countsAfter, stateStorageHealthy);

  // Detect changes for WhatsApp notification
  const changes = await detectChanges(
    { igCount: countsBefore.ig, tiktokCount: countsBefore.tiktok },
    { igCount: countsAfter.ig, tiktokCount: countsAfter.tiktok },
    clientId
  );

  logMessage("fetchComplete", clientId, "fetchComplete", "completed", countsBefore, countsAfter,
    "Social media fetch completed successfully");

  // Check if it's time for hourly notification (during post fetch period, last run 17:05)
  const isNotificationTime = shouldSendHourlyNotifications();
  const shouldSendHourly = isNotificationTime && shouldSendHourlyNotification(schedulerState, currentSlotKey);
  const hasChanges = hasNotableChanges(changes);
  let notificationSent = false;

  const hourlyReason = !isNotificationTime
    ? "outside hourly notification window"
    : shouldSendHourly
      ? "new hourly slot"
      : "slot already notified";

  logMessage("waNotification", clientId, "hourlySlotEvaluation", "completed", countsBefore, countsAfter,
    `Hourly slot decision`, {
      currentSlotKey,
      lastNotifiedSlot: schedulerState.lastNotifiedSlot || null,
      isNotificationTime,
      shouldSendHourly,
      hourlyReason,
      hasChanges,
    });

  // conservative fallback if state storage unavailable: don't do hourly-only sends
  const shouldNotify = stateStorageHealthy ? (hasChanges || shouldSendHourly) : hasChanges;

  if (shouldNotify) {
    const changeSummary = buildChangeSummary(changes);
    const notificationReason = shouldSendHourly
      ? `Hourly notification (${hasChanges ? 'with changes: ' + changeSummary : 'no changes'})`
      : `Changes detected: ${changeSummary}`;

    logMessage("waNotification", clientId, "sendNotification", "start", countsBefore, countsAfter,
      `Sending WA notification: ${notificationReason}`);

    try {
      const notificationOptions = {
        forceScheduled: shouldSendHourly,
      };

      const enqueueResult = await enqueueTugasNotification(
        clientId,
        changes,
        notificationOptions
      );

      notificationSent = enqueueResult.enqueuedCount > 0;

      if (notificationSent) {
        logMessage("waNotification", clientId, "enqueueNotification", "completed", countsBefore, countsAfter,
          `Outbox notification queued: ${notificationReason}`, {
            enqueuedCount: enqueueResult.enqueuedCount,
            duplicatedCount: enqueueResult.duplicatedCount,
          });
        await sendTelegramLog("INFO", `Task notification queued for client ${clientId}: ${notificationReason}`);
      } else {
        logMessage("waNotification", clientId, "enqueueNotification", "skipped", countsBefore, countsAfter,
          "No group configured, no message generated, or all events were duplicates", {
            duplicatedCount: enqueueResult.duplicatedCount,
          });
      }
    } catch (waErr) {
      logMessage("waNotification", clientId, "sendNotification", "error", countsBefore, countsAfter,
        waErr?.message || String(waErr),
        { name: waErr?.name, stack: waErr?.stack?.slice(0, 200) });
    }
  } else {
    logMessage("waNotification", clientId, "sendNotification", "skipped", countsBefore, countsAfter,
      stateStorageHealthy
        ? "No notable changes detected and not time for hourly notification"
        : "State storage unavailable, hourly notifications disabled (conservative mode)");
  }

  const nextSchedulerState = buildNextSchedulerState(schedulerState, countsAfter, notificationSent, currentSlotKey);
  if (stateStorageHealthy) {
    try {
      const persistedState = await upsertSchedulerState(nextSchedulerState);
      schedulerStateByClient.set(clientId, persistedState || nextSchedulerState);
    } catch (upsertErr) {
      logMessage("stateStorage", clientId, "saveSchedulerState", "warning", countsBefore, countsAfter,
        "Failed to persist scheduler state after client processing", {
          name: upsertErr?.name,
          message: upsertErr?.message,
        });
      await sendTelegramError(`${LOG_TAG}: Failed saving scheduler state for ${clientId}`, upsertErr);
    }
  }

  const durationMs = Date.now() - clientStartTime;
  logMessage("metric", clientId, "client_duration", "completed", countsBefore, countsAfter,
    `Client duration ${durationMs}ms`, {
      metric: "client_duration",
      clientId,
      durationMs,
    });

  return { clientId, durationMs };
}

export async function runCron(options = {}) {
  const {
    forceEngagementOnly = false,
    forcePostFetch = false,
    clientConcurrency = DEFAULT_CLIENT_CONCURRENCY,
    maxRunDurationMs = DEFAULT_MAX_RUN_DURATION_MS,
    targetClientIds = [],
  } = options;
  const targetClientIdSet = toNormalizedClientIdSet(targetClientIds);
  const hasTargetClientFilter = targetClientIdSet.size > 0;
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

  let lockHeldByCurrentRun = false;

  try {
    if (isFetchInFlight) {
      logMessage("lock", null, "inFlight", "queued", null, null, "Run already in progress, skipping.");
      return;
    }

    isFetchInFlight = true;
    lockHeldByCurrentRun = true;

    // Determine if we should fetch posts based on time
    const timeBasedMessage = forceEngagementOnly
      ? "engagement only period (forced by options)"
      : "post fetch/engagement period (global 07:00-22:00 schedule; runtime per-client profile gating)";

    logMessage("start", null, "cron", "start", null, null, "", {
      forceEngagementOnly,
      forcePostFetch,
      clientConcurrency,
      maxRunDurationMs,
      targetClientIds: hasTargetClientFilter ? [...targetClientIdSet] : null,
      timeBasedMessage
    });
    await sendTelegramLog("INFO", `🚀 Cron job started: ${LOG_TAG} - ${timeBasedMessage}${forceEngagementOnly ? " (forced engagement only)" : ""}`);

    const activeClients = await findAllActiveClientsWithSosmed();
    const scopedClients = hasTargetClientFilter
      ? activeClients.filter((client) => targetClientIdSet.has(normalizeClientId(client?.client_id)))
      : activeClients;

    if (scopedClients.length === 0) {
      logMessage("init", null, "loadClients", "empty", null, null, "No active clients with Instagram or TikTok");
      await sendTelegramLog("INFO", `${LOG_TAG}: No active clients to process`);
      return;
    }

    let schedulerStateByClient = new Map();
    let stateStorageHealthy = true;
    const activeClientIds = scopedClients.map((client) => normalizeClientId(client.client_id)).filter(Boolean);

    try {
      schedulerStateByClient = await getSchedulerStateMapByClientIds(activeClientIds);
    } catch (storageErr) {
      stateStorageHealthy = false;
      logMessage("stateStorage", null, "loadSchedulerState", "warning", null, null,
        "Failed to load scheduler state. Falling back to conservative notification behavior.", {
          name: storageErr?.name,
          message: storageErr?.message,
        });
      await sendTelegramError(`${LOG_TAG}: Failed loading scheduler state`, storageErr);
    }

    logMessage("init", null, "loadClients", "loaded", null, null, `Processing ${scopedClients.length} clients`);

    const limit = pLimit(clientConcurrency);
    const clientTasks = [];
    let processedCount = 0;
    let skippedDueToDeadline = 0;

    for (const client of scopedClients) {
      const elapsedMs = Date.now() - runStartedAt;
      const remainingMs = maxRunDurationMs - elapsedMs;

      if (remainingMs <= DEADLINE_INTAKE_BUFFER_MS) {
        skippedDueToDeadline += 1;
        continue;
      }

      clientTasks.push(limit(async () => {
        try {
          const result = await processClient(client, {
            forceEngagementOnly,
            forcePostFetch,
            schedulerStateByClient,
            stateStorageHealthy,
          });
          processedCount += 1;
          return result;
        } catch (clientErr) {
          const clientId = normalizeClientId(client?.client_id);
          logMessage("client", clientId, "processClient", "error", null, null,
            clientErr?.message || String(clientErr),
            { name: clientErr?.name, stack: clientErr?.stack?.slice(0, 200) });
          await sendTelegramError(`${LOG_TAG}: Client ${clientId}`, clientErr);
          return null;
        }
      }));
    }

    await Promise.all(clientTasks);

    if (skippedDueToDeadline > 0) {
      logMessage("deadline", null, "client_intake", "limited", null, null,
        `Stopped client intake due to deadline. Remaining clients will be processed in next run.`, {
          metric: "skipped_due_to_deadline",
          skippedDueToDeadline,
          maxRunDurationMs,
        });
    }

    const completionMessage = `✅ ${LOG_TAG} completed. processed_count=${processedCount}, skipped_due_to_deadline=${skippedDueToDeadline}, total_clients=${scopedClients.length}.`;
    logMessage("end", null, "cron", "completed", null, null, completionMessage);
    await sendTelegramLog("INFO", completionMessage);

    const runDurationMs = Date.now() - runStartedAt;
    if (runDurationMs >= Math.floor(maxRunDurationMs * 0.8)) {
      logMessage("metric", null, "duration_baseline", "warning", null, null,
        "Runtime baseline is high. Consider increasing interval or reducing per-run workload.", {
          metric: "duration_baseline_warning",
          runDurationMs,
          maxRunDurationMs,
        });
    }

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
    logMessage("lock", null, "lock_released", "released", null, null, "Distributed lock released", {
      metric: "lock_released",
      lockKey: DISTRIBUTED_LOCK_KEY,
    });

    if (lockHeldByCurrentRun) {
      isFetchInFlight = false;
    }
  }
}

export const JOB_KEY = "./src/cron/cronDirRequestFetchSosmed.js";

// Unified run every 30 minutes from 07:00-22:00 WIB.
// Runtime per-client profile decides whether each client fetches posts and/or engagement.
const UNIFIED_FETCH_SCHEDULES = [
  "0,30 7-21 * * *",
  "0 22 * * *",
];

const CRON_OPTIONS = { timezone: "Asia/Jakarta" };

// Schedule unified fetch jobs (07:00-22:00)
UNIFIED_FETCH_SCHEDULES.forEach((schedule, index) => {
  scheduleCronJob(
    JOB_KEY + `:unified-fetch-${index}`,
    schedule,
    runCron,
    CRON_OPTIONS
  );
});
