// src/handler/fetchpost/tiktokFetchPost.js

import { query } from "../../db/index.js";
import { update } from "../../model/clientModel.js";
import { upsertTiktokPosts } from "../../model/tiktokPostModel.js";
import { sendDebug } from "../../middleware/debugHandler.js";
import {
  fetchTiktokPosts,
  fetchTiktokPostsBySecUid,
  fetchTiktokInfo,
  fetchTiktokPostDetail,
} from "../../service/tiktokApi.js";
import { extractVideoId } from "../../utils/tiktokHelper.js";
import dotenv from "dotenv";
dotenv.config();

const ADMIN_WHATSAPP = (process.env.ADMIN_WHATSAPP || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);


/**
 * Cek apakah unixTimestamp adalah hari ini (Asia/Jakarta)
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

function normalizeClientId(id) {
  return typeof id === "string" ? id.trim().toLowerCase() : id;
}

function parseNumeric(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    const normalized = trimmed.replace(/[^0-9.-]/g, "");
    const num = Number(normalized);
    if (!Number.isNaN(num)) return num;
  }
  return fallback;
}

function parseCreatedAt(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? new Date(value) : new Date(value * 1000);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      return num > 1e12 ? new Date(num) : new Date(num * 1000);
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return null;
}

/**
 * Cek apakah sekarang (Asia/Jakarta) berada di antara 11:00 sampai 17:15.
 * Dipakai untuk membatasi fallback RapidAPI via username agar hanya berjalan pada jam sibuk.
 */
function isWithinJakartaFallbackWindow() {
  const nowJakarta = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
  );
  const start = new Date(nowJakarta);
  start.setHours(11, 0, 0, 0);
  const end = new Date(nowJakarta);
  end.setHours(17, 15, 0, 0);
  return nowJakarta >= start && nowJakarta <= end;
}

export async function fetchAndStoreSingleTiktokPost(clientId, videoInput) {
  if (!clientId) {
    throw new Error("Client ID wajib diisi.");
  }

  const normalizedClientId = normalizeClientId(clientId);
  const clientRes = await query(
    "SELECT client_id FROM clients WHERE LOWER(TRIM(client_id)) = $1 LIMIT 1",
    [normalizedClientId]
  );
  const dbClientId = clientRes.rows[0]?.client_id;
  if (!dbClientId) {
    throw new Error(`Client ${clientId} tidak ditemukan.`);
  }

  const videoId = extractVideoId(videoInput);
  if (!videoId) {
    throw new Error(
      "Format link atau video ID TikTok tidak dikenali. Pastikan link berisi /video/<ID>."
    );
  }

  sendDebug({
    tag: "TIKTOK MANUAL",
    msg: `Manual fetch TikTok videoId=${videoId}`,
    client_id: dbClientId,
  });

  const detail = await fetchTiktokPostDetail(videoId);
  const createdAt =
    parseCreatedAt(detail?.createTime) ||
    parseCreatedAt(detail?.create_time) ||
    parseCreatedAt(detail?.timestamp);

  const stats = detail?.stats || {};
  const statsV2 = detail?.statsV2 || {};

  const likeCount =
    parseNumeric(stats.diggCount) ??
    parseNumeric(detail?.digg_count) ??
    parseNumeric(detail?.like_count) ??
    parseNumeric(statsV2.diggCount) ??
    0;

  const commentCount =
    parseNumeric(stats.commentCount) ??
    parseNumeric(detail?.comment_count) ??
    parseNumeric(statsV2.commentCount) ??
    0;

  const postPayload = {
    video_id: detail?.id || detail?.video_id || videoId,
    caption: detail?.desc || detail?.caption || "",
    created_at: createdAt,
    like_count: likeCount,
    comment_count: commentCount,
  };

  await upsertTiktokPosts(dbClientId, [postPayload]);

  sendDebug({
    tag: "TIKTOK MANUAL",
    msg: `Sukses upsert manual TikTok videoId=${postPayload.video_id}`,
    client_id: dbClientId,
  });

  return {
    clientId: dbClientId,
    videoId: postPayload.video_id,
    caption: postPayload.caption,
    createdAt,
    likeCount,
    commentCount,
  };
}

/**
 * Dapatkan semua video_id tiktok hari ini dari DB
 */
async function getVideoIdsToday(clientId = null) {
  const todayJakarta = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Jakarta",
  });
  let sql =
    "SELECT video_id FROM tiktok_post WHERE DATE((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta') = $1";
  const params = [todayJakarta];
  if (clientId) {
    sql += ` AND LOWER(TRIM(client_id)) = $2`;
    params.push(normalizeClientId(clientId));
  }
  const res = await query(sql, params);
  return res.rows.map((r) => r.video_id);
}

async function deleteVideoIds(videoIdsToDelete, clientId = null) {
  if (!videoIdsToDelete.length) return;
  const todayJakarta = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Jakarta",
  });
  let sql =
    "DELETE FROM tiktok_post WHERE video_id = ANY($1) AND DATE((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta') = $2";
  const params = [videoIdsToDelete, todayJakarta];
  if (clientId) {
    sql += ` AND LOWER(TRIM(client_id)) = $3`;
    params.push(normalizeClientId(clientId));
  }
  await query(sql, params);
}

/**
 * Get all eligible TikTok clients from DB
 */
async function getEligibleTiktokClients() {
  const res = await query(
    `SELECT client_id as id, client_tiktok, tiktok_secuid FROM clients WHERE client_status = true AND client_tiktok IS NOT NULL`
  );
  return res.rows;
}

// Ambil secUid dari DB atau API TikTok
export async function getTiktokSecUid(client) {
  if (client && client.tiktok_secuid) return client.tiktok_secuid;
  if (!client || !client.client_tiktok)
    throw new Error("Username TikTok kosong di database.");
  const username = client.client_tiktok.replace(/^@/, "");
  const data = await fetchTiktokInfo(username);
  const secUid = data?.userInfo?.user?.secUid;
  if (!secUid) throw new Error("Gagal fetch secUid dari API.");
  await update(client.id, { tiktok_secuid: secUid });
  return secUid;
}

/**
 * Fungsi utama: fetch & simpan post hari ini SAJA (update jika sudah ada)
 */
export async function fetchAndStoreTiktokContent(
  targetClientId = null,
  waClient = null,
  chatId = null
) {
  let processing = true;
  if (!waClient)
    sendDebug({
      tag: "TIKTOK FETCH",
      msg: "fetchAndStoreTiktokContent: mode cronjob/auto",
    });
  else
    sendDebug({
      tag: "TIKTOK FETCH",
      msg: "fetchAndStoreTiktokContent: mode WA handler",
    });

  const intervalId = setInterval(() => {
    if (
      processing &&
      waClient &&
      typeof waClient.sendMessage === "function" &&
      chatId
    ) {
      waClient.sendMessage(chatId, "⏳ Processing fetch TikTok data...");
    }
  }, 4000);

  const dbVideoIdsToday = await getVideoIdsToday(targetClientId);
  let fetchedVideoIdsToday = [];
  let hasSuccessfulFetch = false;

  const clients = await getEligibleTiktokClients();
  const clientsToFetch = targetClientId
    ? clients.filter((c) => c.id === targetClientId)
    : clients;
  sendDebug({
    tag: "TIKTOK FETCH",
    msg: `Eligible clients for TikTok fetch: jumlah client: ${clientsToFetch.length}`,
  });
  if (targetClientId && clientsToFetch.length === 0) {
    processing = false;
    clearInterval(intervalId);
    throw new Error(`Client ID ${targetClientId} tidak ditemukan atau tidak aktif`);
  }

  for (const client of clientsToFetch) {
    let secUid;
    const username = client.client_tiktok;
    const canFallbackToUsername = Boolean(username);
    let triedUsernameFallback = false;
    let itemList = [];

    const tryUsernameFallback = async (reason) => {
      if (!canFallbackToUsername || triedUsernameFallback) return false;
      if (!isWithinJakartaFallbackWindow()) {
        sendDebug({
          tag: "TIKTOK FETCH",
          msg: `${reason}. Lewati fallback RapidAPI karena di luar jam 11:00-17:15 WIB`,
          client_id: client.id,
        });
        return false;
      }
      triedUsernameFallback = true;
      sendDebug({
        tag: "TIKTOK FETCH",
        msg: `${reason}. Coba fallback host RapidAPI via username ${username}`,
        client_id: client.id,
      });
      itemList = await fetchTiktokPosts(username, 35);
      return true;
    };

    try {
      secUid = await getTiktokSecUid(client);
    } catch (err) {
      sendDebug({
        tag: "TIKTOK FETCH ERROR",
        msg: `Gagal fetch secUid: ${err.message || err}`,
        client_id: client.id,
      });
      continue;
    }

    try {
      sendDebug({
        tag: "TIKTOK FETCH",
        msg: `Fetch posts for client: ${client.id} / @${client.client_tiktok}`,
      });

      if (secUid) {
        itemList = await fetchTiktokPostsBySecUid(secUid, 35);
      } else if (username) {
        itemList = await fetchTiktokPosts(username, 35);
      }

      if (canFallbackToUsername && (!itemList || itemList.length === 0)) {
        await tryUsernameFallback(`Primary fetch kosong untuk ${client.id}`);
      }

      console.log(
        `[DEBUG TIKTOK][${client.id}] Response items: ${itemList.length}`
      );
      sendDebug({
        tag: "TIKTOK FETCH",
        msg: `API /api/user/posts jumlah konten: ${itemList.length}`,
        client_id: client.id,
      });

      for (const post of itemList) {
        sendDebug({
          tag: "TIKTOK RAW",
          msg: `ID: ${post.id || post.video_id} | createTime: ${post.createTime || post.create_time || "-"} | Lokal: ${new Date(
            ((post.createTime || post.create_time || 0) * 1000)
          ).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`,
          client_id: client.id,
        });
      }
      } catch (err) {
        console.error(`[ERROR][TIKTOK][${client.id}]`, err.message);
        sendDebug({
          tag: "TIKTOK POST ERROR",
          msg: err.message,
          client_id: client.id,
        });
        if (canFallbackToUsername) {
          try {
            const attempted = await tryUsernameFallback(
              `Gagal fetch utama untuk ${client.id}`
            );
            if (!attempted) continue;
          } catch (fallbackErr) {
            sendDebug({
              tag: "TIKTOK POST ERROR",
              msg: `Fallback TikTok gagal: ${fallbackErr.message}`,
              client_id: client.id,
            });
            continue;
          }
        } else {
          continue;
        }
      }

    const filterItemsForToday = () =>
      (itemList || []).filter((post) => {
        const ts = post.createTime || post.create_time || post.timestamp;
        return isTodayJakarta(ts);
      });

    // ==== FILTER HANYA KONTEN YANG DI-POST HARI INI (Asia/Jakarta) ====
    let items = filterItemsForToday();

    if (
      items.length === 0 &&
      canFallbackToUsername &&
      !triedUsernameFallback &&
      secUid
    ) {
      try {
        await tryUsernameFallback(
          `Konten hari ini kosong dari fetch utama ${client.id}`
        );
        items = filterItemsForToday();
      } catch (fallbackErr) {
        sendDebug({
          tag: "TIKTOK POST ERROR",
          msg: `Fallback TikTok gagal saat konten kosong: ${fallbackErr.message}`,
          client_id: client.id,
        });
        continue;
      }
    }

    sendDebug({
      tag: "TIKTOK FILTER",
      msg: `Filtered post hari ini: ${items.length} dari ${itemList.length} (client: ${client.id})`,
      client_id: client.id,
    });

    if (items.length > 0) hasSuccessfulFetch = true;

    for (const post of items) {
      const toSave = {
        client_id: client.id,
        video_id: post.id || post.video_id,
        caption: post.desc || post.caption || "",
        created_at: parseCreatedAt(
          post.createTime || post.create_time || post.timestamp
        ),
        like_count:
          post.stats?.diggCount ?? post.digg_count ?? post.like_count ?? 0,
        comment_count: post.stats?.commentCount ?? post.comment_count ?? 0,
      };

      fetchedVideoIdsToday.push(toSave.video_id);

      sendDebug({
        tag: "TIKTOK FETCH",
        msg: `[DB] Upsert TikTok post: ${toSave.video_id}`,
        client_id: client.id,
      });
      await upsertTiktokPosts(client.id, [toSave]);
      sendDebug({
        tag: "TIKTOK FETCH",
        msg: `[DB] Sukses upsert TikTok post: ${toSave.video_id}`,
        client_id: client.id,
      });
    }
  }

  // PATCH: Hapus hanya jika ada minimal 1 fetch sukses (dan ada minimal 1 post hari ini)
  if (hasSuccessfulFetch) {
    const videoIdsToDelete = dbVideoIdsToday.filter(
      (x) => !fetchedVideoIdsToday.includes(x)
    );
    sendDebug({
      tag: "TIKTOK SYNC",
      msg: `Akan menghapus video_id yang tidak ada hari ini: jumlah=${videoIdsToDelete.length}`,
    });
    await deleteVideoIds(videoIdsToDelete, targetClientId);
  } else {
    sendDebug({
      tag: "TIKTOK SYNC",
      msg: `Tidak ada fetch TikTok berhasil (mungkin API down atau semua kosong), database hari ini tidak dihapus!`,
    });
  }

  processing = false;
  clearInterval(intervalId);

  // PATCH: Ambil semua client TikTok untuk mapping client_id => username
  const clientsForMap = await query(
    `SELECT client_id, client_tiktok FROM clients WHERE client_status = true AND client_tiktok IS NOT NULL`
  );
  const clientMap = {};
  for (const c of clientsForMap.rows) {
    clientMap[c.client_id] = c.client_tiktok?.replace(/^@/, "") || "_";
  }

  // Ambil konten hari ini beserta client_id
  const todayJakarta = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Jakarta",
  });
  let kontenHariIniSql =
    "SELECT video_id, client_id, created_at FROM tiktok_post WHERE DATE((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta') = $1";
  const kontenParams = [todayJakarta];
  if (targetClientId) {
    kontenHariIniSql += ` AND LOWER(TRIM(client_id)) = $2`;
    kontenParams.push(normalizeClientId(targetClientId));
  }
  const kontenHariIniRes = await query(kontenHariIniSql, kontenParams);

  // Bangun link dengan username TikTok asli (jika ada)
  const kontenLinksToday = kontenHariIniRes.rows.map((r) => {
    const username = clientMap[r.client_id] || "_";
    return `https://www.tiktok.com/@${username}/video/${r.video_id}`;
  });

  let msg = `✅ Fetch TikTok selesai!`;
  if (targetClientId) msg += `\nClient: *${targetClientId}*`;
  msg += `\nJumlah konten hari ini: *${kontenLinksToday.length}*`;
  let maxPerMsg = 30;
  const totalMsg = Math.ceil(kontenLinksToday.length / maxPerMsg);

  if (
    waClient &&
    typeof waClient.sendMessage === "function" &&
    (chatId || ADMIN_WHATSAPP.length)
  ) {
    const sendTargets = chatId ? [chatId] : ADMIN_WHATSAPP;
    for (const target of sendTargets) {
      await waClient.sendMessage(target, msg);
      for (let i = 0; i < totalMsg; i++) {
        const linksMsg = kontenLinksToday
          .slice(i * maxPerMsg, (i + 1) * maxPerMsg)
          .join("\n");
        await waClient.sendMessage(target, `Link konten TikTok:\n${linksMsg}`);
      }
    }
  } else {
    sendDebug({
      tag: "TIKTOK FETCH",
      msg: msg,
    });
    if (kontenLinksToday.length) {
      sendDebug({
        tag: "TIKTOK FETCH",
        msg: kontenLinksToday.join("\n"),
      });
    }
  }
}
