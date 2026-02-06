import dotenv from "dotenv";
dotenv.config();

import { scheduleCronJob } from "../utils/cronScheduler.js";
import waClient, { waGatewayClient, waUserClient } from "../service/waService.js";
import { findAllActiveClientsWithSosmed } from "../model/clientModel.js";
import { getInstaPostCount, getTiktokPostCount } from "../service/postCountService.js";
import { fetchAndStoreInstaContent } from "../handler/fetchpost/instaFetchPost.js";
import { handleFetchLikesInstagram } from "../handler/fetchengagement/fetchLikesInstagram.js";
import { fetchAndStoreTiktokContent } from "../handler/fetchpost/tiktokFetchPost.js";
import { handleFetchKomentarTiktokBatch } from "../handler/fetchengagement/fetchCommentTiktok.js";
import { generateSosmedTaskMessage } from "../handler/fetchabsensi/sosmedTask.js";
import { getAdminWAIds, sendWithClientFallback } from "../utils/waHelper.js";
import { sendDebug } from "../middleware/debugHandler.js";
import { getShortcodesTodayByClient } from "../model/instaPostModel.js";
import { getVideoIdsTodayByClient } from "../model/tiktokPostModel.js";

const LOG_TAG = "CRON DIRFETCH SOSMED";

const lastStateByClient = new Map();
const adminRecipients = new Set(getAdminWAIds());
let isFetchInFlight = false;
let rerunScheduled = false;
let pendingRun = false;
let pendingRunCount = 0;
let pendingRunOptions = null;
let pendingRunRequestedAt = null;
const waFallbackClients = [
  { client: waGatewayClient, label: "WA-GATEWAY" },
  { client: waClient, label: "WA" },
  { client: waUserClient, label: "WA-USER" },
];

function getCurrentJakartaTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);

  const hour = Number.parseInt(parts.find((part) => part.type === "hour")?.value ?? "0", 10);
  const minute = Number.parseInt(
    parts.find((part) => part.type === "minute")?.value ?? "0",
    10
  );

  return {
    hour,
    minute,
    label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

const GROUP_ID_PATTERN = /^(\d{10,22})(?:@g\.us)?$/i;

export function normalizeGroupId(groupId) {
  if (!groupId) return null;

  const trimmed = String(groupId).trim();
  if (!trimmed) return null;

  const invitePrefix = /^(?:https?:\/\/)?chat\.whatsapp\.com\/(?:invite\/)?/i;
  const withoutPrefix = invitePrefix.test(trimmed)
    ? trimmed.replace(invitePrefix, "").split(/[?#]/)[0]
    : trimmed;

  const token = withoutPrefix.replace(/\/+$/, "");
  const match = token.match(GROUP_ID_PATTERN);
  const candidate = match ? `${match[1]}@g.us` : token;

  return /^\d{10,22}@g\.us$/.test(candidate) ? candidate.toLowerCase() : null;
}

export function getRecipientsForClient(client) {
  const recipients = new Set();

  if (client?.client_status === false) {
    return recipients;
  }

  const waGroup = normalizeGroupId(client?.client_group);

  if (waGroup) {
    recipients.add(waGroup);
  }

  return recipients;
}

function buildLogEntry({
  phase,
  clientId,
  action,
  result,
  countsBefore,
  countsAfter,
  recipients,
  message,
  meta,
}) {
  return {
    phase,
    clientId,
    action,
    result,
    countsBefore,
    countsAfter,
    recipients: recipients ? Array.from(recipients) : undefined,
    message,
    meta,
  };
}

function mergeRunOptions(existing = {}, incoming = {}) {
  const existingForce = Boolean(existing.forceEngagementOnly);
  const incomingForce = Boolean(incoming.forceEngagementOnly);
  return {
    ...existing,
    ...incoming,
    forceEngagementOnly: existingForce && incomingForce,
  };
}

function queueNextRun(options = {}) {
  pendingRun = true;
  pendingRunCount += 1;
  pendingRunOptions = mergeRunOptions(pendingRunOptions || {}, options);
  if (!pendingRunRequestedAt) {
    pendingRunRequestedAt = new Date();
  }
}

function formatCountsDelta(countsBefore, countsAfter) {
  if (!countsBefore && !countsAfter) return null;

  const beforeIg = Number.isFinite(countsBefore?.ig) ? countsBefore.ig : null;
  const beforeTiktok = Number.isFinite(countsBefore?.tiktok)
    ? countsBefore.tiktok
    : null;
  const afterIg = Number.isFinite(countsAfter?.ig) ? countsAfter.ig : null;
  const afterTiktok = Number.isFinite(countsAfter?.tiktok) ? countsAfter.tiktok : null;

  const parts = [];
  if (beforeIg !== null || afterIg !== null) {
    const delta =
      beforeIg !== null && afterIg !== null ? `Δ${afterIg - beforeIg}` : undefined;
    parts.push(`IG ${beforeIg ?? "?"}→${afterIg ?? "?"}${delta ? ` (${delta})` : ""}`);
  }
  if (beforeTiktok !== null || afterTiktok !== null) {
    const delta =
      beforeTiktok !== null && afterTiktok !== null
        ? `Δ${afterTiktok - beforeTiktok}`
        : undefined;
    parts.push(
      `TikTok ${beforeTiktok ?? "?"}→${afterTiktok ?? "?"}${delta ? ` (${delta})` : ""}`
    );
  }

  return parts.length > 0 ? parts.join(" | ") : null;
}

function formatAdminLogMessage(entry) {
  if (!entry) return null;
  if (typeof entry === "string") return `[${LOG_TAG}] ${entry}`.trim();

  const prefix =
    `[${LOG_TAG}]` +
    (entry.clientId ? `[${entry.clientId}]` : "") +
    (entry.phase ? `[${entry.phase}]` : "");
  const countText = formatCountsDelta(entry.countsBefore, entry.countsAfter);
  const recipientText = Array.isArray(entry.recipients)
    ? `recipients=${entry.recipients.length}`
    : undefined;
  const details = [
    entry.action ? `action=${entry.action}` : null,
    entry.result ? `result=${entry.result}` : null,
    countText,
    recipientText,
    entry.message,
    entry.meta ? `meta=${JSON.stringify(entry.meta).slice(0, 500)}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return `${prefix} ${details}`.trim();
}

function hasLinkDifference(prevLinks = [], nextLinks = []) {
  const prev = Array.isArray(prevLinks) ? prevLinks : [];
  const next = Array.isArray(nextLinks) ? nextLinks : [];

  const prevSet = new Set(prev);
  const nextSet = new Set(next);
  if (prevSet.size !== nextSet.size) return true;

  for (const link of prevSet) {
    if (!nextSet.has(link)) return true;
  }
  for (const link of nextSet) {
    if (!prevSet.has(link)) return true;
  }

  return false;
}

async function sendAdminLog(entry) {
  if (!entry || adminRecipients.size === 0) return;
  const text = formatAdminLogMessage(entry);
  if (!text) return;

  for (const admin of adminRecipients) {
    await sendWithClientFallback({
      chatId: admin,
      message: text.trim(),
      clients: waFallbackClients,
      reportClient: waClient,
      reportContext: { tag: LOG_TAG, admin },
    });
  }
}

async function sendStructuredLog(entry) {
  const payload = typeof entry === "string" ? buildLogEntry({ message: entry }) : entry;
  sendDebug({ tag: LOG_TAG, msg: payload });
  await sendAdminLog(payload);
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
    igShortcodes: [],
    tiktokVideoIds: [],
  };

  lastStateByClient.set(normalizedId, initialState);
  return initialState;
}

export async function runCron(options = {}) {
  const { forceEngagementOnly = false } = options;

  if (isFetchInFlight || rerunScheduled) {
    const wasPending = pendingRun;
    queueNextRun(options);
    await sendStructuredLog(
      buildLogEntry({
        phase: "lock",
        action: isFetchInFlight ? "inFlight" : "rerunScheduled",
        result: wasPending ? "coalesced" : "queued",
        message: wasPending
          ? "Run sebelumnya masih berjalan; permintaan baru digabung ke antrean."
          : "Run sebelumnya masih berjalan; permintaan baru akan dijalankan setelah selesai.",
        meta: {
          pendingRunCount,
          pendingRunRequestedAt: pendingRunRequestedAt?.toISOString(),
          requestedOptions: pendingRunOptions,
        },
      })
    );
    return;
  }

  isFetchInFlight = true;

  await sendStructuredLog(
    buildLogEntry({
      phase: "start",
      action: "cron",
      result: "start",
      meta: { forceEngagementOnly },
    })
  );
  try {
    const jakartaTime = getCurrentJakartaTime();
    const isAfterSendCutoff =
      jakartaTime.hour > 17 || (jakartaTime.hour === 17 && jakartaTime.minute >= 15);

    if (isAfterSendCutoff) {
      await sendStructuredLog(
        buildLogEntry({
          phase: "init",
          action: "timeCheck",
          result: "limited",
          message:
            "Setelah 17:15 WIB pengiriman ke grup dikunci; fetch post & refresh engagement tetap jalan supaya data komentar malam tetap terbaru",
          meta: { jakartaTime: jakartaTime.label },
        })
      );
    }

    const skipPostFetch = Boolean(forceEngagementOnly);
    const skipReason = forceEngagementOnly
      ? "Lewati fetch post karena forceEngagementOnly=true"
      : null;
    const activeClients = await findAllActiveClientsWithSosmed();

    if (skipPostFetch) {
      await sendStructuredLog(
        buildLogEntry({
          phase: "prefetch",
          action: "fetch",
          result: "skipped",
          message: skipReason,
        })
      );
    }

    if (activeClients.length === 0) {
      await sendStructuredLog(
        buildLogEntry({
          phase: "init",
          action: "loadClients",
          result: "empty",
          message: "Tidak ada client aktif dengan Instagram atau TikTok aktif",
        })
      );
      return;
    }

    for (const client of activeClients) {
      try {
        const clientId = String(client.client_id || "").trim().toUpperCase();
        const hasInstagram = client?.client_insta_status !== false;
        const hasTiktok = client?.client_tiktok_status !== false;
        const previousState = await ensureClientState(clientId);
        const previousIgShortcodes = await getShortcodesTodayByClient(clientId);
        const previousTiktokVideoIds = await getVideoIdsTodayByClient(clientId);
        const countsBefore = {
          ig: previousState.igCount,
          tiktok: previousState.tiktokCount,
        };

        if (!skipPostFetch && hasInstagram) {
          await sendStructuredLog(
            buildLogEntry({
              phase: "instagramFetch",
              clientId,
              action: "fetchInstagram",
              result: "start",
              countsBefore,
            })
          );
          await fetchAndStoreInstaContent(
            ["shortcode", "caption", "like_count", "timestamp"],
            null,
            null,
            clientId
          );
          await sendStructuredLog(
            buildLogEntry({
              phase: "instagramFetch",
              clientId,
              action: "fetchInstagram",
              result: "completed",
              countsBefore,
            })
          );
        } else {
          await sendStructuredLog(
            buildLogEntry({
              phase: "instagramFetch",
              clientId,
              action: "fetchInstagram",
              result: "skipped",
              countsBefore,
              message: !hasInstagram
                ? "Lewati fetch Instagram karena status akun nonaktif"
                : skipReason,
            })
          );
        }

        if (!skipPostFetch && hasTiktok) {
          await sendStructuredLog(
            buildLogEntry({
              phase: "tiktokFetch",
              clientId,
              action: "fetchTiktok",
              result: "start",
              countsBefore,
            })
          );
          await fetchAndStoreTiktokContent(clientId);
          await sendStructuredLog(
            buildLogEntry({
              phase: "tiktokFetch",
              clientId,
              action: "fetchTiktok",
              result: "completed",
              countsBefore,
            })
          );
        } else {
          await sendStructuredLog(
            buildLogEntry({
              phase: "tiktokFetch",
              clientId,
              action: "fetchTiktok",
              result: "skipped",
              countsBefore,
              message: !hasTiktok
                ? "Lewati fetch TikTok karena status akun nonaktif"
                : skipReason,
            })
          );
        }

        if (hasInstagram) {
          await sendStructuredLog(
            buildLogEntry({
              phase: "likesRefresh",
              clientId,
              action: "refreshLikes",
              result: "start",
              countsBefore,
            })
          );
          await handleFetchLikesInstagram(null, null, clientId);
          await sendStructuredLog(
            buildLogEntry({
              phase: "likesRefresh",
              clientId,
              action: "refreshLikes",
              result: "completed",
              countsBefore,
            })
          );
        } else {
          await sendStructuredLog(
            buildLogEntry({
              phase: "likesRefresh",
              clientId,
              action: "refreshLikes",
              result: "skipped",
              countsBefore,
              message: "Lewati refresh likes karena status Instagram nonaktif",
            })
          );
        }

        await sendStructuredLog(
          buildLogEntry({
            phase: "commentRefresh",
            clientId,
            action: "refreshComments",
            result: "start",
            countsBefore,
          })
        );
        await handleFetchKomentarTiktokBatch(null, null, clientId);
        await sendStructuredLog(
          buildLogEntry({
            phase: "commentRefresh",
            clientId,
            action: "refreshComments",
            result: "completed",
            countsBefore,
          })
        );

        await sendStructuredLog(
          buildLogEntry({
            phase: "messageGeneration",
            clientId,
            action: "generateMessage",
            result: "start",
            countsBefore,
          })
        );
        const { text, igCount, tiktokCount, state } = await generateSosmedTaskMessage(
          clientId,
          {
            skipTiktokFetch: true,
            skipLikesFetch: true,
            previousState: {
              igShortcodes: previousIgShortcodes,
              tiktokVideoIds: previousTiktokVideoIds,
            },
          }
        );

        const countsAfter = { ig: igCount, tiktok: tiktokCount };

        await sendStructuredLog(
          buildLogEntry({
            phase: "messageGeneration",
            clientId,
            action: "generateMessage",
            result: "completed",
            countsBefore,
            countsAfter,
          })
        );

        const recipients = getRecipientsForClient(client);
        const hasNewCounts =
          igCount !== previousState.igCount || tiktokCount !== previousState.tiktokCount;

        const nextState = {
          igCount,
          tiktokCount,
          igShortcodes: state?.igShortcodes ?? previousIgShortcodes ?? previousState.igShortcodes,
          tiktokVideoIds:
            state?.tiktokVideoIds ?? previousTiktokVideoIds ?? previousState.tiktokVideoIds,
        };

        const hasLinkChanges =
          hasLinkDifference(previousState.igShortcodes, nextState.igShortcodes) ||
          hasLinkDifference(previousState.tiktokVideoIds, nextState.tiktokVideoIds);

        lastStateByClient.set(clientId, nextState);

        if (!hasNewCounts && !hasLinkChanges) {
          await sendStructuredLog(
            buildLogEntry({
              phase: "sendLoop",
              clientId,
              action: "sendReport",
              result: "no_changes",
              countsBefore,
              countsAfter,
              recipients,
              message: "Tidak ada perubahan post atau link, laporan tidak dikirim",
            })
          );
          continue;
        }

        if (recipients.size === 0) {
          await sendStructuredLog(
            buildLogEntry({
              phase: "sendLoop",
              clientId,
              action: "sendReport",
              result: "skipped",
              countsBefore,
              countsAfter,
              recipients,
              message: "Lewati pengiriman karena tidak ada penerima yang valid",
            })
          );
          continue;
        }

        if (isAfterSendCutoff) {
          await sendStructuredLog(
            buildLogEntry({
              phase: "sendLoop",
              clientId,
              action: "sendReport",
              result: "suppressed",
              countsBefore,
              countsAfter,
              recipients,
              message: "Pengiriman laporan ke grup dikunci setelah 17:15 WIB",
              meta: { jakartaTime: jakartaTime.label },
            })
          );
          continue;
        }

        await sendStructuredLog(
          buildLogEntry({
            phase: "sendLoop",
            clientId,
            action: "sendReport",
            result: "start",
            countsBefore,
            countsAfter,
            recipients,
            meta: {
              reason: hasNewCounts ? "post_count_changed" : "link_changed",
            },
          })
        );
        for (const wa of recipients) {
          await sendWithClientFallback({
            chatId: wa,
            message: text.trim(),
            clients: waFallbackClients,
            reportClient: waClient,
            reportContext: { tag: LOG_TAG, clientId },
          });
        }
        await sendStructuredLog(
          buildLogEntry({
            phase: "sendLoop",
            clientId,
            action: "sendReport",
            result: "sent",
            countsBefore,
            countsAfter,
            recipients,
            message: `Laporan dikirim ke ${recipients.size} penerima`,
          })
        );
      } catch (clientErr) {
        const clientId = String(client?.client_id || "").trim().toUpperCase();
        const errorMeta = {
          name: clientErr?.name,
          message: clientErr?.message,
          stack: clientErr?.stack,
        };
        await sendStructuredLog(
          buildLogEntry({
            phase: "client",
            clientId,
            action: "processClient",
            result: "error",
            message: clientErr?.message || String(clientErr),
            meta: errorMeta,
          })
        );
      }
    }
  } catch (err) {
    const errorMeta = { name: err?.name, message: err?.message, stack: err?.stack };
    await sendStructuredLog(
      buildLogEntry({
        phase: "cron",
        action: "run",
        result: "error",
        message: err?.message || String(err),
        meta: errorMeta,
      })
    );
  } finally {
    isFetchInFlight = false;
    if (pendingRun && !rerunScheduled) {
      const queuedOptions = pendingRunOptions || {};
      const queuedAt = pendingRunRequestedAt?.toISOString();
      const coalescedCount = pendingRunCount;
      pendingRun = false;
      pendingRunCount = 0;
      pendingRunOptions = null;
      pendingRunRequestedAt = null;
      rerunScheduled = true;
      await sendStructuredLog(
        buildLogEntry({
          phase: "lock",
          action: "rerun",
          result: "start",
          message: "Menjalankan ulang setelah in-flight selesai.",
          meta: {
            queuedAt,
            coalescedCount,
            requestedOptions: queuedOptions,
          },
        })
      );
      setTimeout(() => {
        rerunScheduled = false;
        runCron(queuedOptions).catch(async (error) => {
          await sendStructuredLog(
            buildLogEntry({
              phase: "lock",
              action: "rerun",
              result: "error",
              message: error?.message || String(error),
              meta: {
                name: error?.name,
                stack: error?.stack,
              },
            })
          );
        });
      }, 0);
    }
  }
}

export const JOB_KEY = "./src/cron/cronDirRequestFetchSosmed.js";

const CRON_SCHEDULES = ["0,30 6-21 * * *", "0 22 * * *"];
const CRON_OPTIONS = { timezone: "Asia/Jakarta" };

CRON_SCHEDULES.forEach((cronExpression) => {
  scheduleCronJob(JOB_KEY, cronExpression, runCron, CRON_OPTIONS);
});
