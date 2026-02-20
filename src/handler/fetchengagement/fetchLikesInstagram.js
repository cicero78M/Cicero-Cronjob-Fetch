// src/handler/fetchengagement/fetchLikesInstagram.js

import { query } from "../../db/index.js";
import { sendDebug } from "../../middleware/debugHandler.js";
import { fetchAllInstagramLikes } from "../../service/instagramApi.js";
import { getAllExceptionUsers } from "../../model/userModel.js";
import { saveLikeSnapshotAudit } from "../../model/instaLikeModel.js";

const SNAPSHOT_INTERVAL_MS = 30 * 60 * 1000;

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

function normalizeUsername(username) {
  return (username || "")
    .toString()
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

// Ambil likes lama (existing) dari database dan kembalikan sebagai array string
async function getExistingLikes(shortcode) {
  const res = await query(
    "SELECT likes FROM insta_like WHERE shortcode = $1",
    [shortcode]
  );
  if (!res.rows.length) return [];
  const val = res.rows[0].likes;
  if (!val) return [];
  if (Array.isArray(val)) return val.map(normalizeUsername);
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.map(normalizeUsername);
      return [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Ambil likes dari Instagram, upsert ke DB insta_like
 * @param {string} shortcode
 * @param {string|null} client_id
 */
async function fetchAndStoreLikes(shortcode, client_id = null, snapshotWindow = {}) {
  const allLikes = await fetchAllInstagramLikes(shortcode);
  const uniqueLikes = [...new Set(allLikes.map(normalizeUsername))];
  const exceptionUsers = await getAllExceptionUsers();
  const exceptionUsernames = exceptionUsers
    .map((u) => normalizeUsername(u.insta))
    .filter(Boolean);

  for (const uname of exceptionUsernames) {
    if (!uniqueLikes.includes(uname)) {
      uniqueLikes.push(uname);
    }
  }
  const existingLikes = await getExistingLikes(shortcode);
  const mergedSet = new Set([...existingLikes, ...uniqueLikes]);
  const mergedLikes = [...mergedSet];
  sendDebug({
    tag: "IG LIKES FINAL",
    msg: `Shortcode ${shortcode} FINAL jumlah unique: ${mergedLikes.length}`,
    client_id: client_id || shortcode,
  });

  // Simpan ke database (upsert), gabungkan dengan data lama
  await query(
    `INSERT INTO insta_like (shortcode, likes, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (shortcode) DO UPDATE
     SET likes = EXCLUDED.likes, updated_at = NOW()`,
    [shortcode, JSON.stringify(mergedLikes)]
  );

  sendDebug({
    tag: "IG FETCH",
    msg: `[DB] Sukses upsert likes IG: ${shortcode} | Total likes disimpan: ${mergedLikes.length}`,
    client_id: client_id || shortcode,
  });

  const { snapshotWindowStart, snapshotWindowEnd, capturedAt } =
    resolveSnapshotWindow(snapshotWindow);
  try {
    await saveLikeSnapshotAudit({
      shortcode,
      usernames: mergedLikes,
      snapshotWindowStart,
      snapshotWindowEnd,
      capturedAt,
    });
    sendDebug({
      tag: "IG FETCH",
      msg: `[DB] Audit likes IG tersimpan untuk ${shortcode} (${snapshotWindowStart.toISOString()} - ${snapshotWindowEnd.toISOString()})`,
      client_id: client_id || shortcode,
    });
  } catch (auditErr) {
    sendDebug({
      tag: "IG FETCH AUDIT ERROR",
      msg: `Gagal menyimpan audit likes IG ${shortcode}: ${(auditErr && auditErr.message) || String(auditErr)}`,
      client_id: client_id || shortcode,
    });
  }
}

/**
 * Handler fetch likes Instagram untuk 1 client
 * Akan fetch semua post IG milik client hari ini,
 * lalu untuk setiap post akan fetch likes dan simpan ke DB (upsert).
 * @param {*} waClient - instance WhatsApp client (untuk progress)
 * @param {*} chatId - WhatsApp chatId (untuk notifikasi)
 * @param {*} client_id - client yang ingin di-fetch likes-nya
 */
export async function handleFetchLikesInstagram(waClient, chatId, client_id, options = {}) {
  try {
    // Ambil semua post IG milik client hari ini.
    // - Konten cron fetch dipetakan via insta_post_clients
    // - Konten manual fetch tetap ikut lewat fallback client_id + source_type=manual_input
    // Seluruh tanggal ditentukan menggunakan timezone Asia/Jakarta.
    const { rows } = await query(
      `WITH scoped_posts AS (
         SELECT DISTINCT ON (p.shortcode)
                p.shortcode,
                p.created_at
           FROM insta_post p
           LEFT JOIN insta_post_clients pc ON pc.shortcode = p.shortcode
          WHERE (
            LOWER(TRIM(pc.client_id)) = LOWER(TRIM($1))
            AND (p.created_at AT TIME ZONE 'Asia/Jakarta')::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date
          )
             OR (
               LOWER(TRIM(p.client_id)) = LOWER(TRIM($1))
               AND COALESCE(NULLIF(TRIM(p.source_type), ''), 'cron_fetch') = 'manual_input'
               AND (p.created_at AT TIME ZONE 'Asia/Jakarta')::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date
             )
          ORDER BY p.shortcode, p.created_at DESC
       )
       SELECT shortcode
         FROM scoped_posts
        ORDER BY created_at ASC, shortcode ASC`,
      [client_id]
    );

    if (!rows.length) {
      if (waClient && chatId) {
        await waClient.sendMessage(
          chatId,
          `Tidak ada konten IG hari ini untuk client ${client_id}.`
        );
      }
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
    for (const r of rows) {
      try {
        await fetchAndStoreLikes(r.shortcode, client_id, snapshotWindow);
        sukses++;
      } catch (err) {
        sendDebug({
          tag: "IG FETCH LIKES ERROR",
          // Hanya log message/error string, jangan objek error utuh!
          msg: `Gagal fetch likes untuk shortcode: ${r.shortcode}, error: ${(err && err.message) || String(err)}`,
          client_id,
        });
        gagal++;
      }
    }

    if (waClient && chatId) {
      await waClient.sendMessage(
        chatId,
        `✅ Selesai fetch likes IG client ${client_id}. Berhasil: ${sukses}, Gagal: ${gagal}`
      );
    }
  } catch (err) {
    if (waClient && chatId) {
      await waClient.sendMessage(
        chatId,
        `❌ Error utama fetch likes IG: ${(err && err.message) || String(err)}`
      );
    }
    sendDebug({
      tag: "IG FETCH LIKES ERROR",
      msg: (err && err.message) || String(err),
      client_id: client_id || null,
    });
  }
}
