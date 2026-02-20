// src/handler/fetchpost/instaFetchPost.js

import pLimit from "p-limit";
import { query } from "../../db/index.js";
import { sendDebug } from "../../middleware/debugHandler.js";
import { fetchInstagramPosts, fetchInstagramPostInfo } from "../../service/instagramApi.js";
import { savePostWithMedia } from "../../model/instaPostExtendedModel.js";
import { upsertInstaPost as upsertInstaPostKhusus } from "../../model/instaPostKhususModel.js";
import { upsertInstaPost } from "../../model/instaPostModel.js";
import { addClientToPost } from "../../model/instaPostClientsModel.js";
import { extractInstagramShortcode } from "../../utils/utilsHelper.js";

const ADMIN_WHATSAPP = (process.env.ADMIN_WHATSAPP || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const limit = pLimit(6);
const previousFetchMetadataByClient = new Map();

const DEFAULT_SAFE_DELETE_THRESHOLD_PERCENT = Number(
  process.env.IG_SAFE_DELETE_THRESHOLD_PERCENT || 40
);

const RAW_DROP_ALERT_PERCENT = Number(process.env.IG_RAW_DROP_ALERT_PERCENT || 60);

const safeDeleteThresholdPercentByClient = (() => {
  const rawConfig = process.env.IG_SAFE_DELETE_THRESHOLD_BY_CLIENT;
  if (!rawConfig) return {};
  try {
    const parsed = JSON.parse(rawConfig);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    sendDebug({
      tag: "IG SAFE DELETE",
      msg: "Konfigurasi IG_SAFE_DELETE_THRESHOLD_BY_CLIENT tidak valid JSON, fallback ke default.",
    });
    return {};
  }
})();

/**
 * Utility: Cek apakah unixTimestamp adalah hari ini (Asia/Jakarta)
 */
function isTodayJakarta(unixTimestamp) {
  if (!unixTimestamp) return false;
  
  // Convert Unix timestamp to Date object
  const postDate = new Date(unixTimestamp * 1000);
  
  // Get the date string in Jakarta timezone (format: YYYY-MM-DD)
  const postDateJakarta = postDate.toLocaleDateString("en-CA", {
    timeZone: "Asia/Jakarta",
  });
  
  // Get today's date string in Jakarta timezone (format: YYYY-MM-DD)
  const todayJakarta = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Jakarta",
  });
  
  // Compare the date strings directly
  return postDateJakarta === todayJakarta;
}

function normalizeHandle(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

function getSafeDeleteThresholdPercent(clientId) {
  const clientThreshold = Number(safeDeleteThresholdPercentByClient?.[clientId]);
  if (Number.isFinite(clientThreshold) && clientThreshold >= 0) {
    return clientThreshold;
  }
  if (
    Number.isFinite(DEFAULT_SAFE_DELETE_THRESHOLD_PERCENT) &&
    DEFAULT_SAFE_DELETE_THRESHOLD_PERCENT >= 0
  ) {
    return DEFAULT_SAFE_DELETE_THRESHOLD_PERCENT;
  }
  return 40;
}

function createFetchMetadata({
  clientId,
  username,
  rawItems,
  durationMs,
  apiStatus,
  errorCode = null,
  partialErrorFlag = false,
}) {
  const rawArray = Array.isArray(rawItems) ? rawItems : [];
  const shortcodeList = rawArray.map((post) => String(post?.code || "").trim()).filter(Boolean);
  const uniqueShortcodes = new Set(shortcodeList);
  const duplicateCount = shortcodeList.length - uniqueShortcodes.size;
  const inconsistentCount = rawArray.filter((post) => !post?.code || !post?.taken_at).length;

  const previousMetadata = previousFetchMetadataByClient.get(clientId);
  const previousRawCount = previousMetadata?.rawItemCount || 0;
  const dropPercent = previousRawCount > 0
    ? Number((((previousRawCount - rawArray.length) / previousRawCount) * 100).toFixed(2))
    : 0;
  const hasDrasticDrop = previousRawCount > 0 && dropPercent >= RAW_DROP_ALERT_PERCENT;

  return {
    clientId,
    username,
    apiStatus,
    errorCode,
    durationMs,
    rawItemCount: rawArray.length,
    duplicateCount,
    inconsistentCount,
    partialErrorFlag: Boolean(partialErrorFlag),
    previousRawItemCount: previousRawCount,
    rawDropPercent: dropPercent,
    hasDrasticDrop,
    createdAt: new Date().toISOString(),
  };
}

function shouldSkipDeleteForPartialResponse(fetchMetadata) {
  const reasons = [];
  if (fetchMetadata.partialErrorFlag) reasons.push("partial_error_flag");
  if (fetchMetadata.hasDrasticDrop) reasons.push("raw_items_drop_drastic");
  if (fetchMetadata.duplicateCount > 0) reasons.push("duplicate_shortcode_detected");
  if (fetchMetadata.inconsistentCount > 0) reasons.push("inconsistent_item_detected");
  return {
    shouldSkip: reasons.length > 0,
    reasons,
  };
}

function toSafeDeleteAuditLog(payload) {
  return JSON.stringify({
    event: "ig_safe_delete",
    ...payload,
  });
}

async function getShortcodesToday(clientId = null) {
  if (clientId) {
    // Use junction table for client-specific shortcodes
    const res = await query(
      `SELECT pc.shortcode 
       FROM insta_post_clients pc
       JOIN insta_post p ON p.shortcode = pc.shortcode
       WHERE pc.client_id = $1 
         AND (p.created_at AT TIME ZONE 'Asia/Jakarta')::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date`,
      [clientId]
    );
    return res.rows.map((r) => r.shortcode);
  } else {
    // Get all shortcodes for today (no client filter)
    const res = await query(
      "SELECT shortcode FROM insta_post WHERE (created_at AT TIME ZONE 'Asia/Jakarta')::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date"
    );
    return res.rows.map((r) => r.shortcode);
  }
}

async function tableExists(tableName) {
  const res = await query(`SELECT to_regclass($1) AS table_name`, [
    `public.${tableName}`,
  ]);
  return Boolean(res.rows[0]?.table_name);
}

async function deleteShortcodes(shortcodesToDelete, clientId = null) {
  if (!shortcodesToDelete.length) return;
  
  if (clientId) {
    // For client-specific delete: remove from junction table only
    // The post will be deleted via CASCADE only if this was the last client
    await query(
      `DELETE FROM insta_post_clients 
       WHERE shortcode = ANY($1) AND client_id = $2`,
      [shortcodesToDelete, clientId]
    );
    
    // Find shortcodes that no longer have any clients
    const orphanedRes = await query(
      `SELECT DISTINCT p.shortcode 
       FROM insta_post p
       WHERE p.shortcode = ANY($1)
         AND (p.created_at AT TIME ZONE 'Asia/Jakarta')::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date
         AND NOT EXISTS (
           SELECT 1 FROM insta_post_clients pc 
           WHERE pc.shortcode = p.shortcode
         )`,
      [shortcodesToDelete]
    );
    const orphanedShortcodes = orphanedRes.rows.map((r) => r.shortcode);
    
    if (orphanedShortcodes.length > 0) {
      sendDebug({
        tag: "IG SYNC",
        msg: `Menghapus ${orphanedShortcodes.length} post yang tidak lagi dikaitkan dengan client manapun`,
        client_id: clientId
      });
      
      // Delete orphaned posts and their related data
      await query(`DELETE FROM insta_like_audit WHERE shortcode = ANY($1)`, [orphanedShortcodes]);
      await query(`DELETE FROM insta_like WHERE shortcode = ANY($1)`, [orphanedShortcodes]);
      if (await tableExists("insta_comment")) {
        await query(`DELETE FROM insta_comment WHERE shortcode = ANY($1)`, [orphanedShortcodes]);
      }
      // ig_ext_posts rows cascade when insta_post entries are deleted
      await query(
        `DELETE FROM insta_post 
         WHERE shortcode = ANY($1) 
           AND (created_at AT TIME ZONE 'Asia/Jakarta')::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date`,
        [orphanedShortcodes]
      );
    }
  } else {
    // Global delete (no client specified) - delete all
    await query(`DELETE FROM insta_like_audit WHERE shortcode = ANY($1)`, [shortcodesToDelete]);
    await query(`DELETE FROM insta_like WHERE shortcode = ANY($1)`, [shortcodesToDelete]);
    if (await tableExists("insta_comment")) {
      await query(`DELETE FROM insta_comment WHERE shortcode = ANY($1)`, [shortcodesToDelete]);
    }
    // This will cascade delete from insta_post_clients via ON DELETE CASCADE
    await query(
      `DELETE FROM insta_post 
       WHERE shortcode = ANY($1) 
         AND (created_at AT TIME ZONE 'Asia/Jakarta')::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date`,
      [shortcodesToDelete]
    );
  }
}

async function filterOfficialInstagramShortcodes(shortcodes = [], clientId = null) {
  if (!shortcodes.length) return [];

  const normalizedClientId = String(clientId || "").trim();
  if (!normalizedClientId) {
    return [];
  }

  const officialRes = await query(
    `SELECT client_insta FROM clients WHERE client_id = $1 LIMIT 1`,
    [normalizedClientId]
  );

  const officialUsername = normalizeHandle(officialRes.rows[0]?.client_insta);
  if (!officialUsername) {
    sendDebug({
      tag: "IG SYNC",
      msg: `Lewati auto-delete: username resmi client ${normalizedClientId} tidak ditemukan.`,
      client_id: normalizedClientId,
    });
    return [];
  }

  const hasExtendedPosts = await tableExists("ig_ext_posts");
  const hasExtendedUsers = await tableExists("ig_ext_users");
  if (!hasExtendedPosts || !hasExtendedUsers) {
    sendDebug({
      tag: "IG SYNC",
      msg: `Tabel ig_ext_posts/ig_ext_users belum tersedia, hapus semua shortcode dari akun resmi ${normalizedClientId} tanpa validasi tambahan.`,
      client_id: normalizedClientId,
    });
    return shortcodes;
  }

  const usernameRes = await query(
    `SELECT p.shortcode, p.source_type, u.username
       FROM insta_post p
       JOIN insta_post_clients pc ON pc.shortcode = p.shortcode
       LEFT JOIN ig_ext_posts ep ON ep.shortcode = p.shortcode
       LEFT JOIN ig_ext_users u ON u.user_id = ep.user_id
      WHERE p.shortcode = ANY($1)
        AND pc.client_id = $2`,
    [shortcodes, normalizedClientId]
  );

  const safeToDelete = usernameRes.rows
    .filter((row) => {
      if (row.source_type !== "cron_fetch") return false;
      const rowUsername = normalizeHandle(row.username);
      // Jika tidak ada data extended (misal savePostWithMedia gagal), anggap post resmi
      // selama sumbernya cron fetch dari akun official
      if (!rowUsername) return true;
      return rowUsername === officialUsername;
    })
    .map((row) => row.shortcode);

  const skippedCount = shortcodes.length - safeToDelete.length;
  if (skippedCount > 0) {
    sendDebug({
      tag: "IG SYNC",
      msg: `Lewati ${skippedCount} shortcode non-resmi/manual untuk client ${normalizedClientId}.`,
      client_id: normalizedClientId,
    });
  }

  return safeToDelete;
}

async function getEligibleClients() {
  const res = await query(
    `SELECT client_id as id, client_insta FROM clients
      WHERE client_status=true
        AND (client_insta_status=true OR client_amplify_status=true)
        AND client_insta IS NOT NULL`
  );
  return res.rows;
}

/**
 * Fungsi utama: fetch & simpan post hari ini SAJA (update jika sudah ada)
 */
export async function fetchAndStoreInstaContent(
  keys,
  waClient = null,
  chatId = null,
  targetClientId = null
) {
  let processing = true;
  if (!waClient)
    sendDebug({ tag: "IG FETCH", msg: "fetchAndStoreInstaContent: mode cronjob/auto" });
  else
    sendDebug({ tag: "IG FETCH", msg: "fetchAndStoreInstaContent: mode WA handler" });

  const intervalId = setInterval(() => {
    if (
      processing &&
      waClient &&
      chatId &&
      typeof waClient.sendMessage === "function"
    ) {
      waClient.sendMessage(chatId, "⏳ Processing fetch data...");
    }
  }, 4000);

  const clients = await getEligibleClients();
  const clientsToFetch = targetClientId
    ? clients.filter((c) => c.id === targetClientId)
    : clients;

  if (targetClientId && clientsToFetch.length === 0) {
    processing = false;
    clearInterval(intervalId);
    throw new Error(`Client ID ${targetClientId} tidak ditemukan atau tidak aktif`);
  }

  const summary = {};

  sendDebug({
    tag: "IG FETCH",
    msg: `Eligible clients for Instagram fetch: jumlah client: ${clientsToFetch.length}`
  });

  for (const client of clientsToFetch) {
    const dbShortcodesToday = await getShortcodesToday(client.id);
    let fetchedShortcodesToday = [];
    let hasSuccessfulFetch = false;
    const username = client.client_insta;
    let postsRes = [];
    const fetchStartedAt = Date.now();
    let fetchApiStatus = "success";
    let fetchErrorCode = null;
    let partialErrorFlag = false;
    try {
      sendDebug({
        tag: "IG FETCH",
        msg: `Fetch posts for client: ${client.id} / @${username}`
      });
      postsRes = await limit(() => fetchInstagramPosts(username, 50));
      sendDebug({
        tag: "IG FETCH",
        msg: `RapidAPI posts fetched: ${postsRes.length}`,
        client_id: client.id
      });
    } catch (err) {
      fetchApiStatus = "error";
      fetchErrorCode =
        err?.code ||
        err?.statusCode ||
        err?.response?.status ||
        "UNKNOWN_API_ERROR";
      const fetchDurationMs = Date.now() - fetchStartedAt;
      const failedFetchMetadata = createFetchMetadata({
        clientId: client.id,
        username,
        rawItems: [],
        durationMs: fetchDurationMs,
        apiStatus: fetchApiStatus,
        errorCode: fetchErrorCode,
        partialErrorFlag: true,
      });
      previousFetchMetadataByClient.set(client.id, failedFetchMetadata);
      sendDebug({
        tag: "IG POST ERROR",
        msg: err.response?.data ? JSON.stringify(err.response.data) : err.message,
        client_id: client.id
      });
      sendDebug({
        tag: "IG FETCH META",
        msg: toSafeDeleteAuditLog({
          action: "fetch_failed",
          metadata: failedFetchMetadata,
        }),
        client_id: client.id,
      });
      continue;
    }

    if (!Array.isArray(postsRes)) {
      fetchApiStatus = "partial";
      partialErrorFlag = true;
      postsRes = [];
    }

    const fetchDurationMs = Date.now() - fetchStartedAt;
    const fetchMetadata = createFetchMetadata({
      clientId: client.id,
      username,
      rawItems: postsRes,
      durationMs: fetchDurationMs,
      apiStatus: fetchApiStatus,
      errorCode: fetchErrorCode,
      partialErrorFlag,
    });

    previousFetchMetadataByClient.set(client.id, fetchMetadata);
    sendDebug({
      tag: "IG FETCH META",
      msg: toSafeDeleteAuditLog({
        action: "fetch_completed",
        metadata: fetchMetadata,
      }),
      client_id: client.id,
    });

    // ==== FILTER HANYA KONTEN YANG DI-POST HARI INI ====
    const items = Array.isArray(postsRes)
      ? postsRes.filter((post) => isTodayJakarta(post.taken_at))
      : [];
    sendDebug({
      tag: "IG FETCH",
      msg: `Jumlah post IG HARI INI SAJA: ${items.length}`,
      client_id: client.id
    });
    if (postsRes.length > 0) hasSuccessfulFetch = true;

    for (const post of items) {
      const toSave = {
        client_id: client.id,
        shortcode: post.code,
        comment_count:
          typeof post.comment_count === "number" ? post.comment_count : 0,
        like_count: typeof post.like_count === "number" ? post.like_count : 0,
        thumbnail_url:
          post.thumbnail_url ||
          post.thumbnail_src ||
          post.display_url ||
          (post.image_versions?.items?.[0]?.url) || null,
        is_video: post.is_video || false,
        video_url: post.video_url || (post.video_versions?.[0]?.url) || null,
        image_url: post.image_versions?.items?.[0]?.url || null,
        images_url: (() => {
          const arr = (post.carousel_media || [])
            .map((m) => m.image_versions?.items?.[0]?.url)
            .filter(Boolean);
          if (!arr.length && post.image_versions?.items?.[0]?.url) {
            arr.push(post.image_versions.items[0].url);
          }
          return arr.length ? arr : null;
        })(),
        is_carousel:
          Array.isArray(post.carousel_media) && post.carousel_media.length > 1,
        caption:
          post.caption && typeof post.caption === "object" && post.caption.text
            ? post.caption.text
            : typeof post.caption === "string"
            ? post.caption
            : null,
      };

      fetchedShortcodesToday.push(toSave.shortcode);

      // UPSERT ke DB: update jika sudah ada (berdasarkan shortcode)
      sendDebug({
        tag: "IG FETCH",
        msg: `[DB] Upsert IG post: ${toSave.shortcode}`,
        client_id: client.id
      });
      await query(
        `INSERT INTO insta_post (client_id, shortcode, caption, comment_count, like_count, thumbnail_url, is_video, video_url, image_url, images_url, is_carousel, source_type, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,to_timestamp($13))
         ON CONFLICT (shortcode) DO UPDATE
          SET caption = EXCLUDED.caption,
              comment_count = EXCLUDED.comment_count,
              like_count = EXCLUDED.like_count,
              thumbnail_url = EXCLUDED.thumbnail_url,
              is_video = EXCLUDED.is_video,
              video_url = EXCLUDED.video_url,
              image_url = EXCLUDED.image_url,
              images_url = EXCLUDED.images_url,
              is_carousel = EXCLUDED.is_carousel,
              source_type = EXCLUDED.source_type,
              created_at = to_timestamp($13)`,
        [
          toSave.client_id,
          toSave.shortcode,
          toSave.caption || null,
          toSave.comment_count,
          toSave.like_count,
          toSave.thumbnail_url,
          toSave.is_video,
          toSave.video_url,
          toSave.image_url,
          JSON.stringify(toSave.images_url),
          toSave.is_carousel,
          "cron_fetch",
          post.taken_at,
        ]
      );
      
      // Add client to junction table (supports collaboration posts)
      await addClientToPost(toSave.shortcode, client.id);
      
      sendDebug({
        tag: "IG FETCH",
        msg: `[DB] Sukses upsert IG post: ${toSave.shortcode}`,
        client_id: client.id
      });

      // store extended post data
      try {
        await savePostWithMedia(post);
      } catch (err) {
        sendDebug({ tag: "IG EXT", msg: err.message });
      }
    }

    // Hapus konten hari ini yang sudah tidak ada di hasil fetch hari ini
    const shortcodesToDelete = dbShortcodesToday.filter(
      (x) => !fetchedShortcodesToday.includes(x)
    );

    if (hasSuccessfulFetch) {
      const partialGuard = shouldSkipDeleteForPartialResponse(fetchMetadata);
      if (partialGuard.shouldSkip) {
        sendDebug({
          tag: "IG SAFE DELETE",
          msg: toSafeDeleteAuditLog({
            action: "delete_skipped_partial_guard",
            reasons: partialGuard.reasons,
            metadata: fetchMetadata,
            dbShortcodesToday: dbShortcodesToday.length,
            fetchedShortcodesToday: fetchedShortcodesToday.length,
            deleteCandidates: shortcodesToDelete.length,
          }),
          client_id: client.id,
        });
      } else {

      const safeShortcodesToDelete = await filterOfficialInstagramShortcodes(
        shortcodesToDelete,
        client.id
      );

      const thresholdPercent = getSafeDeleteThresholdPercent(client.id);
      const dbCountToday = dbShortcodesToday.length;
      const deletePercentOfDb = dbCountToday > 0
        ? Number(((safeShortcodesToDelete.length / dbCountToday) * 100).toFixed(2))
        : 0;
      const exceedsThreshold = dbCountToday > 0 && deletePercentOfDb > thresholdPercent;

      if (exceedsThreshold) {
        sendDebug({
          tag: "IG SAFE DELETE",
          msg: toSafeDeleteAuditLog({
            action: "delete_deferred_threshold",
            reason: "delete_candidate_exceeds_threshold",
            thresholdPercent,
            deletePercentOfDb,
            dbShortcodesToday: dbCountToday,
            deleteCandidates: safeShortcodesToDelete.length,
            metadata: fetchMetadata,
          }),
          client_id: client.id,
        });
      } else {

      sendDebug({
        tag: "IG SYNC",
        msg: `Akan menghapus shortcodes akun resmi yang tidak ada hari ini: jumlah=${safeShortcodesToDelete.length}`,
        client_id: client.id
      });

      sendDebug({
        tag: "IG SAFE DELETE",
        msg: toSafeDeleteAuditLog({
          action: "delete_execute",
          thresholdPercent,
          deletePercentOfDb,
          dbShortcodesToday: dbCountToday,
          fetchedShortcodesToday: fetchedShortcodesToday.length,
          deleteCandidates: safeShortcodesToDelete.length,
          metadata: fetchMetadata,
        }),
        client_id: client.id,
      });

      await deleteShortcodes(safeShortcodesToDelete, client.id);
      }
      }
    } else {
      sendDebug({
        tag: "IG SYNC",
        msg: `Tidak ada fetch IG berhasil untuk client ${client.id}, database tidak dihapus`,
        client_id: client.id
      });

      sendDebug({
        tag: "IG SAFE DELETE",
        msg: toSafeDeleteAuditLog({
          action: "delete_skipped_no_successful_fetch",
          metadata: previousFetchMetadataByClient.get(client.id),
        }),
        client_id: client.id,
      });
    }

    // Hitung jumlah konten hari ini untuk summary
    const countRes = await query(
      "SELECT shortcode FROM insta_post WHERE client_id = $1 AND (created_at AT TIME ZONE 'Asia/Jakarta')::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date",
      [client.id]
    );
    summary[client.id] = { count: countRes.rows.length };
  }

  processing = false;
  clearInterval(intervalId);

  // Ringkasan WA/console
  let sumSql =
    "SELECT shortcode, created_at FROM insta_post WHERE (created_at AT TIME ZONE 'Asia/Jakarta')::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date";
  const sumParams = [];
  if (targetClientId) {
    sumSql += " AND client_id = $1";
    sumParams.push(targetClientId);
  }
  const kontenHariIniRes = await query(sumSql, sumParams);
  const kontenLinksToday = kontenHariIniRes.rows.map(
    (r) => `https://www.instagram.com/p/${r.shortcode}`
  );

  let msg = `✅ Fetch selesai!`;
  if (targetClientId) msg += `\nClient: *${targetClientId}*`;
  msg += `\nJumlah konten hari ini: *${kontenLinksToday.length}*`;
  let maxPerMsg = 30;
  const totalMsg = Math.ceil(kontenLinksToday.length / maxPerMsg);

  if (waClient && (chatId || ADMIN_WHATSAPP.length)) {
    const sendTargets = chatId ? [chatId] : ADMIN_WHATSAPP;
    for (const target of sendTargets) {
      await waClient.sendMessage(target, msg);
      for (let i = 0; i < totalMsg; i++) {
        const linksMsg = kontenLinksToday
          .slice(i * maxPerMsg, (i + 1) * maxPerMsg)
          .join("\n");
        await waClient.sendMessage(
          target,
          `Link konten Instagram:\n${linksMsg}`
        );
      }
    }
  } else {
    sendDebug({
      tag: "IG FETCH",
      msg: msg
    });
    if (kontenLinksToday.length) {
      sendDebug({
        tag: "IG FETCH",
        msg: kontenLinksToday.join("\n")
      });
    }
  }
  return summary;
}

export async function fetchSinglePostKhusus(linkOrCode, clientId) {
  const code = extractInstagramShortcode(linkOrCode);
  if (!code) throw new Error('invalid link');
  const info = await fetchInstagramPostInfo(code);
  if (!info) throw new Error('post not found');
  const data = {
    client_id: clientId,
    shortcode: code,
    caption: info.caption?.text || info.caption || null,
    comment_count: info.comment_count || 0,
    thumbnail_url:
      info.thumbnail_url ||
      info.display_url ||
      info.image_versions?.items?.[0]?.url || null,
    is_video: info.is_video || false,
    video_url: info.video_url || null,
    image_url: info.image_versions?.items?.[0]?.url || null,
    images_url: Array.isArray(info.carousel_media)
      ? info.carousel_media.map(i => i.image_versions?.items?.[0]?.url).filter(Boolean)
      : null,
    is_carousel: Array.isArray(info.carousel_media) && info.carousel_media.length > 1,
    source_type: "manual_input",
    created_at: info.taken_at ? new Date(info.taken_at * 1000).toISOString() : null
  }; 
  await upsertInstaPostKhusus(data);
  await upsertInstaPost(data);
  // Add client to junction table (supports collaboration posts)
  await addClientToPost(code, clientId);
  try {
    await savePostWithMedia(info);
  } catch (e) {
    sendDebug({ tag: 'IG FETCH', msg: `ext save error ${e.message}` });
  }
  return data;
}
