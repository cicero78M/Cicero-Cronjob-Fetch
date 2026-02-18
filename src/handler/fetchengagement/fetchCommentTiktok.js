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

// Ambil komentar lama (existing) dari DB (username string array)
async function getExistingUsernames(video_id) {
  const res = await query(
    "SELECT comments FROM tiktok_comment WHERE video_id = $1",
    [video_id]
  );
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
async function upsertTiktokUserComments(video_id, usernamesArr) {
  // Existing username dari DB
  const existing = await getExistingUsernames(video_id);
  const finalUsernames = [...new Set([...existing, ...usernamesArr])];

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
    const { rows } = await query(
      `SELECT video_id FROM tiktok_post WHERE LOWER(TRIM(client_id)) = $1 AND DATE((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta') = $2`,
      [normalizedId, todayJakarta]
    );
    const videoIds = rows.map((r) => r.video_id);
    const excRes = await query(
      `SELECT tiktok FROM "user" WHERE exception = true AND tiktok IS NOT NULL`
    );
    const exceptionUsernames = excRes.rows
      .map((r) => normalizeTiktokCommentUsername(r.tiktok))
      .filter(Boolean);
    sendDebug({
      tag: "TTK COMMENT",
      msg: `Client ${client_id}: Jumlah video hari ini: ${videoIds.length}`,
      client_id,
    });
    if (waClient && chatId) {
      await waClient.sendMessage(chatId, `⏳ Fetch komentar ${videoIds.length} video TikTok...`);
    }

    if (!videoIds.length) {
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

    let sukses = 0, gagal = 0;
    for (const video_id of videoIds) {
      await limit(async () => {
        try {
          let commentsToday = null;
          for (let attempt = 1; attempt <= MAX_COMMENT_FETCH_ATTEMPTS; attempt++) {
            try {
              commentsToday = await fetchAllTiktokComments(video_id);
              break;
            } catch (err) {
              if (attempt >= MAX_COMMENT_FETCH_ATTEMPTS) throw err;
              sendDebug({
                tag: "TTK COMMENT RETRY",
                msg: `Video ${video_id}: percobaan ${attempt} gagal (${(err && err.message) || String(err)}), mencoba ulang...`,
                client_id: video_id,
              });
              const waitMs = COMMENT_FETCH_RETRY_DELAY_MS * attempt;
              await delay(waitMs);
            }
          }
          commentsToday = commentsToday || [];
          const uniqueUsernames = extractUniqueUsernamesFromComments(commentsToday);
          const allUsernames = [...new Set([...uniqueUsernames, ...exceptionUsernames])];
          const mergedUsernames = await upsertTiktokUserComments(
            video_id,
            allUsernames
          );
          try {
            await saveCommentSnapshotAudit({
              video_id,
              usernames: mergedUsernames,
              snapshotWindowStart: snapshotWindow.snapshotWindowStart,
              snapshotWindowEnd: snapshotWindow.snapshotWindowEnd,
              capturedAt: snapshotWindow.capturedAt,
            });
            sendDebug({
              tag: "TTK COMMENT AUDIT",
              msg: `Snapshot komentar tersimpan untuk ${video_id} (${snapshotWindow.snapshotWindowStart.toISOString()} - ${snapshotWindow.snapshotWindowEnd.toISOString()})`,
              client_id: video_id,
            });
          } catch (auditErr) {
            sendDebug({
              tag: "TTK COMMENT AUDIT ERROR",
              msg: `Gagal menyimpan audit komentar ${video_id}: ${(auditErr && auditErr.message) || String(auditErr)}`,
              client_id: video_id,
            });
          }
          sukses++;
          sendDebug({
            tag: "TTK COMMENT MERGE",
            msg: `Video ${video_id}: Berhasil simpan/merge komentar (${mergedUsernames.length} username unik)`,
            client_id: video_id
          });
        } catch (err) {
          sendDebug({
            tag: "TTK COMMENT ERROR",
            msg: `Gagal fetch/merge video ${video_id}: ${(err && err.message) || String(err)}`,
            client_id: video_id
          });
          gagal++;
        }
      });
    }

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
