import {
  getShortcodesTodayByClient,
  getPostsTodayByClient as getInstaPostsTodayByClient,
} from "../../model/instaPostModel.js";
import {
  getLikesByShortcode,
  getLatestLikeAuditByWindow,
} from "../../model/instaLikeModel.js";
import { getPostsTodayByClient as getTiktokPostsToday } from "../../model/tiktokPostModel.js";
import {
  getCommentsByVideoId,
  getLatestCommentAuditByWindow,
} from "../../model/tiktokCommentModel.js";
import { findClientById } from "../../service/clientService.js";
import { handleFetchLikesInstagram } from "../fetchengagement/fetchLikesInstagram.js";
import { handleFetchKomentarTiktokBatch } from "../fetchengagement/fetchCommentTiktok.js";

const DEFAULT_WINDOW_MS = 30 * 60 * 1000;

function formatUploadTime(date) {
  if (!date) return null;
  try {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    const formatted = parsed.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Jakarta",
    });
    return formatted.replace(/\./g, ":");
  } catch {
    return null;
  }
}

function normalizeDateInput(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeUsernamesArray(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((val) => {
        if (typeof val === "string") return val;
        if (val && typeof val === "object") {
          if (typeof val.username === "string") return val.username;
          if (typeof val.user === "string") return val.user;
        }
        return null;
      })
      .filter(Boolean);
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? normalizeUsernamesArray(parsed) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeSnapshotWindow(snapshotWindowStart, snapshotWindowEnd) {
  const start = normalizeDateInput(snapshotWindowStart);
  const end = normalizeDateInput(snapshotWindowEnd);
  if (start && !end) {
    const computedEnd = new Date(start.getTime() + DEFAULT_WINDOW_MS);
    return { start, end: computedEnd };
  }
  if (end && !start) {
    const computedStart = new Date(end.getTime() - DEFAULT_WINDOW_MS);
    return { start: computedStart, end };
  }
  if (!start || !end) return null;
  return { start, end };
}

function formatWibTime(date) {
  try {
    const formatted = date.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Jakarta",
    });
    return formatted.replace(/\./g, ":");
  } catch {
    return null;
  }
}

function formatSnapshotWindowLabel(snapshotWindow) {
  if (!snapshotWindow?.start || !snapshotWindow?.end) return null;
  const startLabel = formatWibTime(snapshotWindow.start);
  const endLabel = formatWibTime(snapshotWindow.end);
  if (!startLabel || !endLabel) return null;
  return `Data rentang ${startLabel}–${endLabel} WIB`;
}

async function fetchLikesWithAudit(shortcodes, snapshotWindow) {
  if (!Array.isArray(shortcodes) || shortcodes.length === 0) {
    return { likesList: [], auditUsed: false };
  }
  if (!snapshotWindow) {
    const likesList = await Promise.all(
      shortcodes.map((sc) => getLikesByShortcode(sc).catch(() => []))
    );
    return { likesList: likesList.map(normalizeUsernamesArray), auditUsed: false };
  }
  const auditRows = await getLatestLikeAuditByWindow(
    shortcodes,
    snapshotWindow.start,
    snapshotWindow.end
  );
  const auditMap = new Map(
    auditRows.map((row) => [row.shortcode, normalizeUsernamesArray(row.usernames)])
  );
  const likesList = [];
  for (const sc of shortcodes) {
    if (auditMap.has(sc)) {
      likesList.push(auditMap.get(sc));
      continue;
    }
    const fallback = await getLikesByShortcode(sc).catch(() => []);
    likesList.push(normalizeUsernamesArray(fallback));
  }
  return { likesList, auditUsed: auditMap.size > 0 };
}

async function fetchCommentsWithAudit(posts, snapshotWindow) {
  if (!Array.isArray(posts) || posts.length === 0) {
    return { commentList: [], auditUsed: false };
  }
  const videoIds = posts.map((post) => post.video_id);
  if (!snapshotWindow) {
    const commentList = await Promise.all(
      videoIds.map((vid) =>
        getCommentsByVideoId(vid).catch(() => ({ comments: [] }))
      )
    );
    return {
      commentList: commentList.map((entry) =>
        normalizeUsernamesArray(entry?.comments || [])
      ),
      auditUsed: false,
    };
  }
  const auditRows = await getLatestCommentAuditByWindow(
    videoIds,
    snapshotWindow.start,
    snapshotWindow.end
  );
  const auditMap = new Map(
    auditRows.map((row) => [row.video_id, normalizeUsernamesArray(row.usernames)])
  );
  const commentList = [];
  for (const vid of videoIds) {
    if (auditMap.has(vid)) {
      commentList.push(auditMap.get(vid));
      continue;
    }
    const fallback = await getCommentsByVideoId(vid).catch(() => ({ comments: [] }));
    commentList.push(normalizeUsernamesArray(fallback?.comments || []));
  }
  return { commentList, auditUsed: auditMap.size > 0 };
}

export async function generateSosmedTaskMessage(
  clientId = "DITBINMAS",
  options = {}
) {
  if (typeof options === "boolean") {
    options = { skipTiktokFetch: options };
  }
  const {
    skipTiktokFetch = false,
    skipLikesFetch = false,
    previousState = {},
  } = options;
  const snapshotWindow = normalizeSnapshotWindow(
    options.snapshotWindowStart ||
      options.snapshotWindow?.snapshotWindowStart ||
      options.snapshotWindow?.start,
    options.snapshotWindowEnd ||
      options.snapshotWindow?.snapshotWindowEnd ||
      options.snapshotWindow?.end
  );
  const snapshotWindowLabel = formatSnapshotWindowLabel(snapshotWindow);

  const previousIgShortcodes = Array.isArray(previousState.igShortcodes)
    ? previousState.igShortcodes
    : [];
  const previousTiktokVideoIds = Array.isArray(previousState.tiktokVideoIds)
    ? previousState.tiktokVideoIds
    : [];

  let clientName = clientId;
  let tiktokUsername = "";

  try {
    const client = await findClientById(clientId);
    clientName = (client?.nama || clientId).toUpperCase();
    tiktokUsername = (client?.client_tiktok || "").replace(/^@/, "");
  } catch {
    // ignore errors, use defaults
  }

  let shortcodes = [];
  let instaPosts = [];
  try {
    shortcodes = await getShortcodesTodayByClient(clientId);
    instaPosts = await getInstaPostsTodayByClient(clientId);
    if (!skipLikesFetch) {
      await handleFetchLikesInstagram(null, null, clientId, {
        snapshotWindow: snapshotWindow
          ? { start: snapshotWindow.start, end: snapshotWindow.end }
          : undefined,
      });
    }
  } catch {
    shortcodes = [];
    instaPosts = [];
  }

  const instaPostMap = new Map(
    (instaPosts || []).map((post) => [post.shortcode, post])
  );

  const { likesList: likeResults } = await fetchLikesWithAudit(
    shortcodes,
    snapshotWindow
  );

  let totalLikes = 0;
  const igDetails = shortcodes.map((sc, idx) => {
    const likes = likeResults[idx];
    const count = Array.isArray(likes) ? likes.length : 0;
    totalLikes += count;
    const suffix = count === 1 ? "like" : "likes";
    const uploadTime = formatUploadTime(instaPostMap.get(sc)?.created_at);
    const uploadLabel = uploadTime
      ? `(upload ${uploadTime} WIB)`
      : "(upload tidak diketahui)";
    const isNew = !previousIgShortcodes.includes(sc);
    const newLabel = isNew ? "[BARU] " : "";
    return `${idx + 1}. ${newLabel}https://www.instagram.com/p/${sc} ${uploadLabel} : ${count} ${suffix}`;
  });

  let tiktokPosts = [];
  try {
    tiktokPosts = await getTiktokPostsToday(clientId);
    if (!skipTiktokFetch) {
      await handleFetchKomentarTiktokBatch(null, null, clientId, {
        snapshotWindow: snapshotWindow
          ? { start: snapshotWindow.start, end: snapshotWindow.end }
          : undefined,
      });
    }
  } catch {
    tiktokPosts = [];
  }

  const { commentList: commentResults } = await fetchCommentsWithAudit(
    tiktokPosts,
    snapshotWindow
  );

  let totalComments = 0;
  const tiktokDetails = tiktokPosts.map((post, idx) => {
    const comments = commentResults[idx] || [];
    const count = Array.isArray(comments) ? comments.length : 0;
    totalComments += count;
    const link = tiktokUsername
      ? `https://www.tiktok.com/@${tiktokUsername}/video/${post.video_id}`
      : `https://www.tiktok.com/video/${post.video_id}`;
    const uploadTime = formatUploadTime(post?.created_at);
    const uploadLabel = uploadTime
      ? `(upload ${uploadTime} WIB)`
      : "(upload tidak diketahui)";
    const isNew = !previousTiktokVideoIds.includes(post.video_id);
    const newLabel = isNew ? "[BARU] " : "";
    return `${idx + 1}. ${newLabel}${link} ${uploadLabel} : ${count} komentar`;
  });

  let msg =
    "Mohon Ijin Komandan, Senior, Rekan Operator dan Personil pelaksana Tugas Likes dan komentar Sosial Media " +
    `${clientName}.\n\n` +
    "Tugas Likes dan Komentar Konten Instagram dan Tiktok \n" +
    `${clientName}\n` +
    `Jumlah konten Instagram hari ini: ${shortcodes.length} \n` +
    `Total likes semua konten: ${totalLikes} \n\n` +
    "Rincian:\n";
  msg += igDetails.length ? igDetails.join("\n") : "-";
  msg +=
    `\n\nJumlah konten Tiktok hari ini: ${tiktokPosts.length} \n` +
    `Total komentar semua konten: ${totalComments}\n\n` +
    "Rincian:\n";
  msg += tiktokDetails.length ? tiktokDetails.join("\n") : "-";
  if (snapshotWindowLabel) {
    msg += `\n\n${snapshotWindowLabel}`;
  }
  msg += "\n\nSilahkan Melaksanakan Likes, Komentar dan Share.";
  return {
    text: msg.trim(),
    igCount: shortcodes.length,
    tiktokCount: tiktokPosts.length,
    state: {
      igShortcodes: [...shortcodes],
      tiktokVideoIds: tiktokPosts.map((post) => post.video_id),
    },
  };
}

export default generateSosmedTaskMessage;
