// src/handler/fetchengagement/fetchCommentTiktok.js

import pLimit from "p-limit";
import { query } from "../../db/index.js";
import { sendDebug } from "../../middleware/debugHandler.js";
import { fetchAllTiktokComments } from "../../service/tiktokApi.js";
import { saveCommentSnapshotAudit } from "../../model/tiktokCommentModel.js";
import {
  extractUsernamesFromCommentTree,
  normalizeTiktokCommentUsername,
} from "../../utils/tiktokCommentUsernameExtractor.js";

const MAX_COMMENT_FETCH_ATTEMPTS = 3;
const COMMENT_FETCH_RETRY_DELAY_MS = 2000;
const SNAPSHOT_INTERVAL_MS = 30 * 60 * 1000;
const SPECIAL_POLICY_USER_ID = "77030046";
const SPECIAL_POLICY_CUTOFF_HOUR = 18;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const limit = pLimit(3); // atur parallel fetch sesuai kebutuhan

function normalizeClientId(id) {
  return typeof id === "string" ? id.trim().toLowerCase() : id;
}

function normalizeDateInput(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveSnapshotWindow(windowOverrides = {}) {
  const now = new Date();
  const snapshotWindowEnd =
    normalizeDateInput(windowOverrides.snapshotWindowEnd || windowOverrides.end) || now;
  const defaultStart = new Date(snapshotWindowEnd.getTime() - SNAPSHOT_INTERVAL_MS);
  const snapshotWindowStart =
    normalizeDateInput(windowOverrides.snapshotWindowStart || windowOverrides.start) || defaultStart;
  const capturedAt =
    normalizeDateInput(windowOverrides.capturedAt) ||
    normalizeDateInput(windowOverrides.captured_at) ||
    now;
  return { snapshotWindowStart, snapshotWindowEnd, capturedAt };
}

function resolveJakartaDateString(referenceDate = new Date()) {
  return referenceDate.toLocaleDateString("en-CA", {
    timeZone: "Asia/Jakarta",
  });
}

function normalizeComparableUsername(value) {
  return normalizeTiktokCommentUsername(value)?.replace(/^@+/, "").toLowerCase() || null;
}

function isBeforeSpecialPolicyCutoff(referenceDate = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(referenceDate);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  return hour < SPECIAL_POLICY_CUTOFF_HOUR;
}

async function resolveClientScope(clientId) {
  const { rows } = await query(
    "SELECT client_type FROM clients WHERE LOWER(TRIM(client_id)) = $1 LIMIT 1",
    [clientId]
  );
  const clientType = rows[0]?.client_type
    ? String(rows[0].client_type).toLowerCase()
    : null;
  return {
    clientType,
    isRoleScoped: clientType === "direktorat",
  };
}

async function resolveSpecialUserPolicy(clientId, jakartaDate, scope, observedTaskResults, referenceDate = new Date()) {
  const { isRoleScoped = false } = scope;
  const userRes = (await query(
    `SELECT u.user_id, u.client_id,
            COALESCE((SELECT usa.username FROM user_social_accounts usa
                      WHERE usa.user_id = u.user_id AND LOWER(usa.platform) = 'tiktok'
                        AND usa.is_active = TRUE AND TRIM(COALESCE(usa.username, '')) <> ''
                      ORDER BY usa.account_order ASC, usa.created_at ASC LIMIT 1), u.tiktok) AS effective_tiktok,
            COALESCE((SELECT usa.username FROM user_social_accounts usa
                      WHERE usa.user_id = u.user_id AND LOWER(usa.platform) IN ('instagram', 'insta')
                        AND usa.is_active = TRUE AND TRIM(COALESCE(usa.username, '')) <> ''
                      ORDER BY usa.account_order ASC, usa.created_at ASC LIMIT 1), u.insta) AS effective_insta
       FROM "user" u
      WHERE u.user_id = $1
        AND u.status = TRUE
        AND (LOWER(TRIM(COALESCE(u.client_id, ''))) = $2
             OR ($3 = TRUE AND EXISTS (
               SELECT 1 FROM user_roles ur
               JOIN roles r ON r.role_id = ur.role_id
              WHERE ur.user_id = u.user_id
                AND LOWER(TRIM(COALESCE(r.role_name, ''))) = $2
             )))
      LIMIT 1`,
    [SPECIAL_POLICY_USER_ID, clientId, isRoleScoped]
  )) || { rows: [] };
  const user = userRes.rows[0];
  if (!user) return { enabled: false };

  const specialUsername = normalizeComparableUsername(user.effective_tiktok);
  if (!specialUsername) return { enabled: false };

  const actualTiktokDone = new Set(
    observedTaskResults
      .filter((result) => result.status === "success")
      .filter((result) => result.observedUsernames.some((username) => normalizeComparableUsername(username) === specialUsername))
      .map((result) => result.videoId)
  ).size;

  let instagramComplete = false;
  const effectiveInstagram = normalizeComparableUsername(user.effective_insta);
  if (effectiveInstagram) {
    const postScopeFilter = isRoleScoped
      ? `(LOWER(TRIM(COALESCE(pc.client_id, ''))) = $1
          OR LOWER(TRIM(COALESCE(p.client_id, ''))) = $1
          OR LOWER(TRIM(COALESCE(pr.role_name, ''))) = $1)`
      : `(LOWER(TRIM(COALESCE(pc.client_id, ''))) = $1
          OR LOWER(TRIM(COALESCE(p.client_id, ''))) = $1)`;
    const instagramRes = (await query(
      `WITH scoped_posts AS (
         SELECT DISTINCT p.shortcode
           FROM insta_post p
           LEFT JOIN insta_post_clients pc ON pc.shortcode = p.shortcode
           LEFT JOIN insta_post_roles pr ON pr.shortcode = p.shortcode
          WHERE ${postScopeFilter}
            AND (p.created_at AT TIME ZONE 'Asia/Jakarta')::date = $2::date
       )
       SELECT COUNT(DISTINCT sp.shortcode) AS total_posts,
              COUNT(DISTINCT l.shortcode) FILTER (
                WHERE LOWER(REPLACE(TRIM(COALESCE(elem->>'username', TRIM(BOTH '"' FROM elem::text))), '@', '')) = $3
              ) AS liked_posts
         FROM scoped_posts sp
         LEFT JOIN insta_like l ON l.shortcode = sp.shortcode
         LEFT JOIN LATERAL jsonb_array_elements(COALESCE(l.likes, '[]'::jsonb)) AS elem ON TRUE`,
      [clientId, jakartaDate, effectiveInstagram]
    )) || { rows: [] };
    const totalPosts = Number(instagramRes.rows[0]?.total_posts || 0);
    const likedPosts = Number(instagramRes.rows[0]?.liked_posts || 0);
    instagramComplete = totalPosts > 0 && likedPosts >= totalPosts;
  }

  const beforeCutoff = isBeforeSpecialPolicyCutoff(referenceDate);
  const shouldOverride = beforeCutoff
    ? actualTiktokDone >= 1
    : instagramComplete;
  return {
    enabled: true,
    userId: SPECIAL_POLICY_USER_ID,
    username: normalizeTiktokCommentUsername(user.effective_tiktok),
    actualTiktokDone,
    instagramComplete,
    beforeCutoff,
    shouldOverride,
  };
}

/**
 * Fetch semua komentar TikTok untuk 1 video_id dari API terbaru
 * Return: array komentar (object asli dari API)
 */

/**
 * Ekstrak & normalisasi username dari array objek komentar TikTok.
 * Diprioritaskan dari: user.unique_id, fallback: username (kalau ada)
 * Return: array string username unik (lowercase, diawali @)
 */
function extractUniqueUsernamesFromComments(commentsArr) {
  const commentUsernames = extractUsernamesFromCommentTree(commentsArr);
  return [...new Set(commentUsernames)];
}

async function getEligibleExceptionTiktokUsers(clientId, jakartaDate, scope = {}) {
  const { isRoleScoped = false } = scope;
  const postScopeFilter = isRoleScoped
    ? `(
          LOWER(TRIM(COALESCE(pc.client_id, ''))) = $1
          OR LOWER(TRIM(COALESCE(p.client_id, ''))) = $1
          OR LOWER(TRIM(COALESCE(pr.role_name, ''))) = $1
        )`
    : `(
          LOWER(TRIM(COALESCE(pc.client_id, ''))) = $1
          OR LOWER(TRIM(COALESCE(p.client_id, ''))) = $1
        )`;
  const userScopeFilter = isRoleScoped
    ? `(
          LOWER(TRIM(u.client_id)) = $1
          OR EXISTS (
            SELECT 1
            FROM user_roles ur
            JOIN roles r ON ur.role_id = r.role_id
            WHERE ur.user_id = u.user_id
              AND LOWER(TRIM(COALESCE(r.role_name, ''))) = $1
          )
        )`
    : "LOWER(TRIM(u.client_id)) = $1";

  const { rows } = await query(
    `WITH scoped_posts AS (
       SELECT DISTINCT p.shortcode
         FROM insta_post p
         LEFT JOIN insta_post_clients pc ON pc.shortcode = p.shortcode
         LEFT JOIN insta_post_roles pr ON pr.shortcode = p.shortcode
        WHERE (
          ${postScopeFilter}
          AND (p.created_at AT TIME ZONE 'Asia/Jakarta')::date = $2::date
        )
     ),
     total_post_scope AS (
       SELECT COUNT(DISTINCT shortcode) AS total_post_ig
         FROM scoped_posts
     ),
     like_counts AS (
       SELECT
         LOWER(REPLACE(TRIM(COALESCE(elem->>'username', TRIM(BOTH '"' FROM elem::text))), '@', '')) AS username_ig,
         COUNT(DISTINCT l.shortcode) AS jumlah_like_user
       FROM scoped_posts sp
       JOIN insta_like l ON l.shortcode = sp.shortcode
       JOIN LATERAL jsonb_array_elements(COALESCE(l.likes, '[]'::jsonb)) AS elem ON TRUE
       GROUP BY 1
     )
     SELECT
       u.user_id,
       u.nama,
       u.insta,
       u.tiktok,
       COALESCE(tps.total_post_ig, 0) AS total_post_ig,
       COALESCE(lc.jumlah_like_user, 0) AS jumlah_like_user,
       CASE
         WHEN COALESCE(u.exception_tiktok, false) <> true THEN 'exception_tiktok=false'
         WHEN NULLIF(TRIM(COALESCE(u.tiktok, '')), '') IS NULL THEN 'username_tiktok_kosong'
         WHEN NULLIF(TRIM(COALESCE(u.insta, '')), '') IS NULL THEN 'username_ig_kosong'
         WHEN COALESCE(lc.jumlah_like_user, 0) < COALESCE(tps.total_post_ig, 0) THEN 'likes_belum_lengkap'
         ELSE 'eligible'
       END AS eligibility_reason
     FROM "user" u
     CROSS JOIN total_post_scope tps
     LEFT JOIN like_counts lc
       ON LOWER(REPLACE(TRIM(COALESCE(u.insta, '')), '@', '')) = lc.username_ig
    WHERE ${userScopeFilter}
      AND u.status = true`
    ,
    [clientId, jakartaDate]
  );

  return rows;
}

// Ambil komentar lama (existing) dari DB (username string array)
async function getExistingUsernames(video_id) {
  const res = (await query(
    "SELECT comments FROM tiktok_comment WHERE video_id = $1",
    [video_id]
  )) || { rows: [] };
  if (res.rows.length && Array.isArray(res.rows[0].comments)) {
    // pastikan string array
    return res.rows[0].comments
      .map((u) => normalizeTiktokCommentUsername(u))
      .filter(Boolean);
  }
  return [];
}

/**
 * Upsert ke DB hanya username (string array).
 * - Gabungkan username baru + lama, unikkan.
 */
async function upsertTiktokUserComments(video_id, usernamesArr, policyOverride = null) {
  // Existing username dari DB
  const existing = await getExistingUsernames(video_id);
  const actualUsernames = new Set(usernamesArr.map((username) => normalizeTiktokCommentUsername(username)).filter(Boolean));
  const specialUsername = normalizeTiktokCommentUsername(policyOverride?.username);
  const retainedExisting = existing.filter((username) => {
    const normalized = normalizeTiktokCommentUsername(username);
    return normalized !== specialUsername || actualUsernames.has(normalized) || policyOverride?.shouldOverride;
  });
  const syntheticUsername = policyOverride?.shouldOverride ? specialUsername : null;
  const finalUsernames = [...new Set([
    ...retainedExisting,
    ...usernamesArr,
    ...(syntheticUsername ? [syntheticUsername] : []),
  ])];

  const sql = `
    INSERT INTO tiktok_comment (video_id, comments, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (video_id)
    DO UPDATE SET comments = $2, updated_at = NOW()
  `;
  await query(sql, [video_id, JSON.stringify(finalUsernames)]);
  return finalUsernames;
}

/**
 * Handler: Fetch komentar semua video TikTok hari ini (per client)
 * Simpan ke DB: hanya array username unik!
 */
export async function handleFetchKomentarTiktokBatch(waClient = null, chatId = null, client_id = null, options = {}) {
  try {
    const todayJakarta = resolveJakartaDateString();
    const normalizedId = normalizeClientId(client_id);
    if (!normalizedId) {
      throw new Error("client_id wajib diisi untuk fetch komentar TikTok");
    }
    const scope = await resolveClientScope(normalizedId);
    const videoScopeFilter = scope.isRoleScoped
      ? `(LOWER(TRIM(COALESCE(p.client_id, ''))) = $1 OR LOWER(TRIM(COALESCE(pr.role_name, ''))) = $1)`
      : "LOWER(TRIM(COALESCE(p.client_id, ''))) = $1";
    const { rows: scopedVideoRows } = await query(
      `SELECT DISTINCT p.video_id,
              COALESCE(NULLIF(TRIM(p.source_type), ''), 'cron_fetch') AS source_type
         FROM tiktok_post p
         LEFT JOIN tiktok_post_roles pr ON pr.video_id = p.video_id
        WHERE ${videoScopeFilter}
          AND (p.created_at AT TIME ZONE 'Asia/Jakarta')::date = $2::date
          AND NULLIF(TRIM(p.video_id), '') IS NOT NULL`,
      [normalizedId, todayJakarta]
    );
    const scopedSourceTypeBreakdown = scopedVideoRows.reduce((acc, row) => {
      const sourceType = String(row.source_type || "cron_fetch").toLowerCase();
      acc[sourceType] = (acc[sourceType] || 0) + 1;
      return acc;
    }, {});
    const scopedVideoIds = [...new Set(scopedVideoRows.map((r) => r.video_id).filter(Boolean))];
    const eligibleExceptionUsers = await getEligibleExceptionTiktokUsers(normalizedId, todayJakarta, scope);
    const eligibleRows = eligibleExceptionUsers.filter((row) => row.eligibility_reason === "eligible");
    const skipReasonCounts = eligibleExceptionUsers.reduce((acc, row) => {
      const reason = row.eligibility_reason;
      if (reason !== "eligible") {
        acc[reason] = (acc[reason] || 0) + 1;
      }
      return acc;
    }, {});
    const exceptionUsernames = eligibleRows
      .map((r) => normalizeTiktokCommentUsername(r.tiktok))
      .filter(Boolean);
    sendDebug({
      tag: "TTK COMMENT",
      msg: `Client ${client_id}: Jumlah video hari ini: ${scopedVideoIds.length}. source_type=${JSON.stringify(scopedSourceTypeBreakdown)}`,
      client_id,
    });
    sendDebug({
      tag: "TTK COMMENT ELIGIBILITY",
      msg: `Client ${client_id}: eligible exception_tiktok users=${eligibleRows.length}, skipped=${eligibleExceptionUsers.length - eligibleRows.length}, skip_reasons=${JSON.stringify(skipReasonCounts)}`,
      client_id,
    });
    if (waClient && chatId) {
      await waClient.sendMessage(chatId, `⏳ Fetch komentar ${scopedVideoIds.length} video TikTok...`);
    }

    if (!scopedVideoIds.length) {
      if (waClient && chatId) await waClient.sendMessage(chatId, `Tidak ada konten TikTok hari ini untuk client ${client_id}.`);
      sendDebug({
        tag: "TTK COMMENT",
        msg: `Tidak ada video TikTok untuk client ${client_id} hari ini.`,
        client_id,
      });
      return;
    }

    const snapshotWindow = resolveSnapshotWindow({
      snapshotWindowStart:
        options.snapshotWindowStart ||
        options.snapshotWindow?.snapshotWindowStart ||
        options.snapshotWindow?.start,
      snapshotWindowEnd:
        options.snapshotWindowEnd ||
        options.snapshotWindow?.snapshotWindowEnd ||
        options.snapshotWindow?.end,
      capturedAt: options.capturedAt || options.snapshotWindow?.capturedAt,
    });

    const taskResults = await Promise.all(
      scopedVideoIds.map((videoId) =>
        limit(async () => {
          const startedAt = Date.now();
          try {
            let commentsToday = null;
            for (let attempt = 1; attempt <= MAX_COMMENT_FETCH_ATTEMPTS; attempt++) {
              try {
                commentsToday = await fetchAllTiktokComments(videoId);
                break;
              } catch (err) {
                if (attempt >= MAX_COMMENT_FETCH_ATTEMPTS) throw err;
                sendDebug({
                  tag: "TTK COMMENT RETRY",
                  msg: `Video ${videoId}: percobaan ${attempt} gagal (${(err && err.message) || String(err)}), mencoba ulang...`,
                  client_id: videoId,
                });
                const waitMs = COMMENT_FETCH_RETRY_DELAY_MS * attempt;
                await delay(waitMs);
              }
            }
            commentsToday = commentsToday || [];
            const uniqueUsernames = extractUniqueUsernamesFromComments(commentsToday);
            return { status: "success", videoId, observedUsernames: uniqueUsernames };
          } catch (err) {
            const durationMs = Date.now() - startedAt;
            sendDebug({
              tag: "TTK COMMENT ERROR",
              msg: `Gagal fetch/merge video ${videoId}: ${(err && err.message) || String(err)} (durasi ${durationMs}ms)`,
              client_id: videoId,
            });
            return { status: "failed", videoId, durationMs };
          }
        })
      )
    );

    const specialPolicy = await resolveSpecialUserPolicy(
      normalizedId,
      todayJakarta,
      scope,
      taskResults,
      normalizeDateInput(options.policyReferenceDate) || new Date()
    );
    sendDebug({
      tag: "TTK SPECIAL POLICY",
      msg: specialPolicy.enabled
        ? `User ${SPECIAL_POLICY_USER_ID}: before_cutoff=${specialPolicy.beforeCutoff}, tiktok_done=${specialPolicy.actualTiktokDone}, instagram_complete=${specialPolicy.instagramComplete}, username_override=${specialPolicy.shouldOverride}`
        : `User ${SPECIAL_POLICY_USER_ID}: tidak berada pada scope client ${client_id}`,
      client_id,
    });

    const persistedResults = await Promise.all(
      taskResults.map((result) => limit(async () => {
        if (result.status !== "success") return result;
        const allUsernames = [...new Set([
          ...result.observedUsernames,
          ...exceptionUsernames,
        ])];
        const mergedUsernames = await upsertTiktokUserComments(
          result.videoId,
          allUsernames,
          specialPolicy.enabled && specialPolicy.shouldOverride
            ? specialPolicy
            : null
        );
        try {
          await saveCommentSnapshotAudit({
            video_id: result.videoId,
            usernames: mergedUsernames,
            observedUsernames: result.observedUsernames,
            snapshotWindowStart: snapshotWindow.snapshotWindowStart,
            snapshotWindowEnd: snapshotWindow.snapshotWindowEnd,
            capturedAt: snapshotWindow.capturedAt,
          });
        } catch (auditErr) {
          sendDebug({
            tag: "TTK COMMENT AUDIT ERROR",
            msg: `Gagal menyimpan audit komentar ${result.videoId}: ${(auditErr && auditErr.message) || String(auditErr)}`,
            client_id: result.videoId,
          });
        }
        const durationMs = Date.now() - (result.startedAt || Date.now());
        sendDebug({
          tag: "TTK COMMENT MERGE",
          msg: `Video ${result.videoId}: Berhasil simpan/merge komentar (${mergedUsernames.length} username unik)`,
          client_id: result.videoId,
        });
        return { ...result, durationMs };
      }))
    );

    const sukses = persistedResults.filter((result) => result.status === "success").length;
    const gagal = persistedResults.length - sukses;

    if (waClient && chatId) {
      await waClient.sendMessage(
        chatId,
        `✅ Selesai fetch komentar TikTok client ${client_id}. Berhasil: ${sukses}, Gagal: ${gagal}`
      );
    }
    sendDebug({
      tag: "TTK COMMENT FINAL",
      msg: `Fetch komentar TikTok client ${client_id} selesai. Berhasil: ${sukses}, Gagal: ${gagal}`,
      client_id,
    });

  } catch (err) {
    if (waClient && chatId) {
      await waClient.sendMessage(
        chatId,
        `❌ Error utama fetch komentar TikTok: ${(err && err.message) || String(err)}`
      );
    }
    sendDebug({
      tag: "TTK COMMENT ERROR",
      msg: (err && err.message) || String(err),
      client_id,
    });
  }
}
