import { query } from "../db/index.js";
import { normalizeHandleValue } from "../utils/handleNormalizer.js";
import { fetchInstagramInfo } from "./instaRapidService.js";
import { fetchTiktokProfile } from "./tiktokRapidService.js";
import { hasUserLikedBetween } from "../model/instaLikeModel.js";
import { hasUserCommentedBetween } from "../model/tiktokCommentModel.js";
import { normalizeUserWhatsAppId, safeSendMessage } from "../utils/waHelper.js";
import waClient, { waitForWaReady } from "./waService.js";

const numberFormatter = new Intl.NumberFormat("id-ID");
export const UPDATE_DATA_LINK = "https://papiqo.com/claim";
const ACTIVITY_START_DATE = "2025-09-01";
const ID_DATE_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function formatNumber(value) {
  if (value === null || value === undefined) return "-";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return numberFormatter.format(num);
}

function formatIdDate(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return ID_DATE_FORMATTER.format(date);
}

function buildRecordedActivitySolution({
  issueText,
  platform,
  activityVerb,
  handle,
  activityCount,
  startDate = ACTIVITY_START_DATE,
  endDate = new Date(),
}) {
  const decoratedHandle = handle ? `*${handle}*` : "akun tersebut";
  const startLabel =
    formatIdDate(startDate) ||
    formatIdDate(ACTIVITY_START_DATE) ||
    "1 September 2025";
  const endLabel = formatIdDate(endDate) || formatIdDate(new Date());
  const activitySummary = formatNumber(activityCount);
  const platformMenuInfo =
    platform === "Instagram"
      ? {
          menu: "*Absensi Likes Instagram*",
          refreshInstruction:
            "Buka menu tersebut di dashboard Cicero, pilih ulang filter satker/periode lalu tekan tombol *Refresh* untuk memuat riwayat terbaru.",
        }
      : {
          menu: "*Absensi Komentar TikTok*",
          refreshInstruction:
            "Buka menu tersebut di dashboard Cicero, pilih ulang filter satker/periode kemudian klik *Refresh* atau muat ulang riwayat tugasnya.",
        };
  const lines = [
    `Ringkasan pengecekan: akun ${decoratedHandle} tercatat ${activityVerb} pada ${activitySummary} konten ${platform} dalam periode ${startLabel} hingga ${endLabel}.`,
    "Sistem Cicero tidak menemukan gangguan pencatatan untuk aktivitas tersebut.",
    "",
    `Menu dashboard yang perlu dicek: ${platformMenuInfo.menu}. ${platformMenuInfo.refreshInstruction}`,
    "Bila data tetap belum muncul, minta personel mengirim tangkapan layar hasil refresh dan hubungi operator piket untuk pendampingan lebih lanjut.",
  ];
  return lines.join("\n").trim();
}

function isZeroMetric(value) {
  if (value === null || value === undefined) return false;
  const num = Number(value);
  if (Number.isNaN(num)) return false;
  return num === 0;
}

function buildSuspiciousAccountNote(platform, handle) {
  const decoratedHandle = handle ? `*${handle}*` : "tersebut";
  if (platform === "instagram") {
    return [
      "⚠️ Catatan Instagram",
      `Akun ${decoratedHandle} terlihat tanpa aktivitas (posting, pengikut, dan mengikuti semuanya 0).`,
      "Mohon periksa langsung di aplikasi Instagram untuk memastikan username benar dan akun masih aktif.",
    ].join("\n");
  }
  return [
    "⚠️ Catatan TikTok",
    `Akun ${decoratedHandle} terlihat tanpa aktivitas (video, pengikut, dan mengikuti semuanya 0 dengan jumlah likes tidak tersedia).`,
    "Mohon cek ulang di aplikasi TikTok guna memastikan username valid atau akun tidak sedang dibatasi.",
  ].join("\n");
}

function ensureHandle(value) {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

function toPositiveNumber(value) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (Number.isNaN(num) || !Number.isFinite(num)) return null;
  return num > 0 ? num : null;
}

function hasFullMetrics(status, keys = ["posts", "followers", "following"]) {
  if (!status) return false;
  return keys.every((key) => toPositiveNumber(status[key]) !== null);
}

function buildPlatformSummary(platformLabel, status) {
  if (!status) return `${platformLabel}: Data tidak tersedia.`;
  if (status.error) {
    return `${platformLabel}: Gagal mengambil data (${status.error}).`;
  }
  if (!status.found) {
    return `${platformLabel}: Username belum tercatat di database.`;
  }
  const metrics = [];
  if (status.posts !== null) metrics.push(`Postingan ${formatNumber(status.posts)}`);
  if (status.followers !== null)
    metrics.push(`Followers ${formatNumber(status.followers)}`);
  if (status.following !== null)
    metrics.push(`Following ${formatNumber(status.following)}`);
  if (status.likes !== null) metrics.push(`Likes ${formatNumber(status.likes)}`);
  const detail = metrics.length ? metrics.join(" | ") : "Belum ada statistik terbaru";
  return `${platformLabel}: ${status.state || "Aktif"}${detail ? ` – ${detail}` : ""}`;
}

export function buildUpdateDataInstructions(platformLabel) {
  const steps = [
    `1. Buka tautan berikut: ${UPDATE_DATA_LINK}`,
    "2. Login menggunakan NRP/NIP dan kata sandi aplikasi Cicero.",
    `3. Pilih menu *Update Data Personil* kemudian perbarui username ${platformLabel}.`,
    "4. Pastikan username sesuai dengan akun aktif yang dipakai saat tugas, lalu simpan perubahan.",
    "5. Konfirmasi kepada admin setelah data diperbarui agar dapat sinkron otomatis.",
  ];
  return steps.join("\n");
}

export function normalizeComplaintHandle(value) {
  return normalizeHandleValue(value);
}

export function parseComplaintMessage(message) {
  const lines = String(message || "")
    .split(/\r?\n/)
    .map((line) => line.trim());
  const data = {
    raw: String(message || ""),
    nrp: "",
    name: "",
    polres: "",
    instagram: "",
    tiktok: "",
    issues: [],
  };

  const stripListPrefix = (value) =>
    value.replace(/^[•●*\-]+\s*/, "").replace(/^\d+[.)]\s*/, "");

  const isIssueHeader = (value) => {
    const normalizedHeader = stripListPrefix(value)
      .replace(/[:：]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (!normalizedHeader) {
      return false;
    }

    if (/^kendala\b/.test(normalizedHeader)) {
      return true;
    }

    const headerVariations =
      /(?:^|\s)(?:rincian|detail|uraian|keterangan|deskripsi)\s+kendala\b/;
    const suffixVariations = /\bkendala\s+(?:yang\s+(?:dihadapi|dialami)|berikut)\b/;

    return headerVariations.test(normalizedHeader) || suffixVariations.test(normalizedHeader);
  };

  const extractField = (line) => {
    const [, ...rest] = line.split(/[:：]/);
    return rest.join(":").trim();
  };

  const parseFieldLine = (line) => {
    if (!line.includes(":") && !line.includes("：")) {
      return null;
    }
    const [rawKey] = line.split(/[:：]/);
    const key = rawKey.trim().toLowerCase();
    if (!key) {
      return null;
    }

    if (
      /^nrp\b/.test(key) ||
      /^nip\b/.test(key) ||
      /^nrp\s*\/\s*nip\b/.test(key)
    ) {
      return { field: "nrp", value: extractField(line) };
    }
    if (/^nama\b/.test(key)) {
      return { field: "name", value: extractField(line) };
    }
    if (/^polres\b/.test(key)) {
      return { field: "polres", value: extractField(line) };
    }
    if (/^(username\s+ig|username\s+instagram|instagram)\b/.test(key)) {
      return { field: "instagram", value: extractField(line) };
    }
    if (/^(username\s+tiktok|tiktok)\b/.test(key)) {
      return { field: "tiktok", value: extractField(line) };
    }

    return null;
  };

  let inIssues = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const contentLine = stripListPrefix(line);
    const normalized = contentLine.toLowerCase();
    if (/^pesan\s+komplain/.test(normalized)) {
      continue;
    }
    if (isIssueHeader(line)) {
      inIssues = true;
      continue;
    }

    const parsedField = parseFieldLine(contentLine);
    if (parsedField) {
      if (parsedField.field === "instagram" || parsedField.field === "tiktok") {
        data[parsedField.field] = normalizeComplaintHandle(parsedField.value);
      } else {
        data[parsedField.field] = parsedField.value;
      }
      continue;
    }

    if (inIssues) {
      const issueContent = stripListPrefix(line).trim();
      if (issueContent) {
        data.issues.push(issueContent);
      }
      continue;
    }
  }

  return data;
}

export function detectKnownIssueKey(issueText) {
  if (!issueText) return null;
  const normalized = issueText
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;

  const hasInstagram = /instagram|ig/.test(normalized);
  const hasTiktok = /tiktok|tt/.test(normalized);
  const mentionsExecuted = /sudah\s+melaksanakan/.test(normalized);
  const mentionsNotRecorded = /(belum|blm|tidak)\s+terdata/.test(normalized);
  const mentionsLessAttendance = /terabsen\s+kurang|absen\s+kurang/.test(normalized);
  const mentionsFlaggedNotDone =
    /terabsen[si]?\s+(?:belum|blm)\s+melaksanakan|status\s+belum\s+melaksanakan/.test(
      normalized
    );

  if (mentionsExecuted && hasInstagram && mentionsNotRecorded) {
    return "instagram_not_recorded";
  }
  if (mentionsExecuted && hasTiktok && mentionsNotRecorded) {
    return "tiktok_not_recorded";
  }
  if (mentionsExecuted && mentionsLessAttendance) {
    return "attendance_less";
  }
  if (mentionsFlaggedNotDone) {
    return "activity_flagged_not_done";
  }
  return null;
}

function handlesEqual(a, b) {
  if (!a || !b) return false;
  return a.replace(/^@/, "").toLowerCase() === b.replace(/^@/, "").toLowerCase();
}

async function verifyInstagramHandle(handle) {
  const normalized = normalizeComplaintHandle(handle);
  if (!normalized) {
    return { summary: "", error: null, status: null };
  }
  try {
    const profile = await fetchInstagramInfo(normalized.replace(/^@/, ""));
    const data = profile || {};
    const followerCount =
      data.followers_count ??
      data.follower_count ??
      data.edge_followed_by?.count ??
      null;
    const followingCount =
      data.following_count ?? data.following ?? data.edge_follow?.count ?? null;
    const mediaCount =
      data.media_count ?? data.posts_count ?? data.edge_owner_to_timeline_media?.count ?? null;
    const state = data.is_private === true ? "Aktif (Privat)" : "Aktif";

    const status = {
      found: Boolean(data),
      posts: mediaCount,
      followers: followerCount,
      following: followingCount,
      state,
    };

    return {
      summary: buildPlatformSummary(`Instagram (${normalized})`, status),
      error: null,
      status,
    };
  } catch (err) {
    const message = err?.message || "tidak diketahui";
    const status = {
      found: false,
      posts: null,
      followers: null,
      following: null,
      state: "",
      error: message,
    };
    return {
      summary: buildPlatformSummary(`Instagram (${normalized})`, status),
      error: message,
      status,
    };
  }
}

async function verifyTiktokHandle(handle) {
  const normalized = normalizeComplaintHandle(handle);
  if (!normalized) {
    return { summary: "", error: null, status: null };
  }
  try {
    const profile = await fetchTiktokProfile(normalized.replace(/^@/, ""));
    const data = profile || {};
    const followerCount = data.follower_count ?? data.stats?.followerCount ?? null;
    const followingCount = data.following_count ?? data.stats?.followingCount ?? null;
    const likeCount = data.like_count ?? data.stats?.heart ?? null;
    const videoCount = data.video_count ?? data.stats?.videoCount ?? null;
    const state = data.username || data.nickname ? "Aktif" : "";

    const status = {
      found: Boolean(data.username || data.nickname || data.stats),
      posts: videoCount,
      followers: followerCount,
      following: followingCount,
      likes: likeCount,
      state: state || "Aktif",
    };

    return {
      summary: buildPlatformSummary(`TikTok (${normalized})`, status),
      error: null,
      status,
    };
  } catch (err) {
    const message = err?.message || "tidak diketahui";
    const status = {
      found: false,
      posts: null,
      followers: null,
      following: null,
      likes: null,
      state: "",
      error: message,
    };
    return {
      summary: buildPlatformSummary(`TikTok (${normalized})`, status),
      error: message,
      status,
    };
  }
}

export async function buildAccountStatus(user) {
  const result = {
    adminMessage: "",
    instagram: {
      username: "",
      found: false,
      posts: null,
      followers: null,
      following: null,
      state: "",
      error: "",
      summaryForSolution: "",
      reviewNote: "",
    },
    tiktok: {
      username: "",
      found: false,
      posts: null,
      followers: null,
      following: null,
      likes: null,
      state: "",
      error: "",
      summaryForSolution: "",
      reviewNote: "",
    },
  };

  const lines = ["📱 *Status Akun Sosial Media*"];

  const instaUsernameRaw =
    typeof user?.insta === "string" ? user.insta.trim() : user?.insta || "";
  const instaHandle = ensureHandle(instaUsernameRaw);
  result.instagram.username = instaHandle;
  if (!instaHandle) {
    lines.push("", "📸 Instagram: Belum diisi di profil Cicero.");
    result.instagram.summaryForSolution =
      "Instagram: Username belum tercatat, mohon perbarui melalui tautan data personel.";
  } else {
    try {
      const profile = await fetchInstagramInfo(instaHandle.replace(/^@/, ""));
      const data = profile || {};
      const followerCount =
        data.followers_count ??
        data.follower_count ??
        data.edge_followed_by?.count ??
        null;
      const followingCount =
        data.following_count ?? data.following ?? data.edge_follow?.count ?? null;
      const mediaCount =
        data.media_count ??
        data.posts_count ??
        data.edge_owner_to_timeline_media?.count ??
        null;
      const state = data.is_private === true ? "Aktif (Privat)" : "Aktif";

      Object.assign(result.instagram, {
        found: true,
        posts: mediaCount,
        followers: followerCount,
        following: followingCount,
        state,
        summaryForSolution: buildPlatformSummary(`Instagram (${instaHandle})`, {
          found: true,
          posts: mediaCount,
          followers: followerCount,
          following: followingCount,
          state,
        }),
      });

      lines.push(
        "",
        `📸 Instagram *${instaHandle}*`,
        `Status: ${state}`,
        `Postingan: ${formatNumber(mediaCount)}`,
        `Followers: ${formatNumber(followerCount)}`,
        `Following: ${formatNumber(followingCount)}`
      );

      if (
        isZeroMetric(mediaCount) &&
        isZeroMetric(followerCount) &&
        isZeroMetric(followingCount)
      ) {
        const note = buildSuspiciousAccountNote("instagram", instaHandle);
        result.instagram.reviewNote = note;
        result.instagram.summaryForSolution = result.instagram.summaryForSolution
          ? `${result.instagram.summaryForSolution}\n\n${note}`
          : note;
        lines.push("", note);
      }
    } catch (err) {
      const errorMsg = err?.message || "tidak diketahui";
      result.instagram.error = errorMsg;
      result.instagram.summaryForSolution = buildPlatformSummary("Instagram", {
        error: errorMsg,
      });
      lines.push(
        "",
        `📸 Instagram *${instaHandle}*`,
        `Status: Gagal mengambil data (${errorMsg}).`
      );
    }
  }

  const tiktokUsernameRaw =
    typeof user?.tiktok === "string" ? user.tiktok.trim() : user?.tiktok || "";
  const tiktokHandle = ensureHandle(tiktokUsernameRaw);
  result.tiktok.username = tiktokHandle;
  if (!tiktokHandle) {
    lines.push("", "🎵 TikTok: Belum diisi di profil Cicero.");
    result.tiktok.summaryForSolution =
      "TikTok: Username belum tercatat, mohon perbarui melalui tautan data personel.";
  } else {
    try {
      const profile = await fetchTiktokProfile(tiktokHandle.replace(/^@/, ""));
      const data = profile || {};
      const followerCount = data.follower_count ?? data.stats?.followerCount ?? null;
      const followingCount = data.following_count ?? data.stats?.followingCount ?? null;
      const likeCount = data.like_count ?? data.stats?.heart ?? null;
      const videoCount = data.video_count ?? data.stats?.videoCount ?? null;
      const state = data.username || data.nickname ? "Aktif" : "";

      Object.assign(result.tiktok, {
        found: Boolean(data.username || data.nickname || data.stats),
        posts: videoCount,
        followers: followerCount,
        following: followingCount,
        likes: likeCount,
        state: state || "Aktif",
        summaryForSolution: buildPlatformSummary(`TikTok (${tiktokHandle})`, {
          found: Boolean(data.username || data.nickname || data.stats),
          posts: videoCount,
          followers: followerCount,
          following: followingCount,
          likes: likeCount,
          state: state || "Aktif",
        }),
      });

      lines.push(
        "",
        `🎵 TikTok *${tiktokHandle}*`,
        `Status: ${state || "Aktif"}`,
        `Video: ${formatNumber(videoCount)}`,
        `Followers: ${formatNumber(followerCount)}`,
        `Following: ${formatNumber(followingCount)}`,
        `Likes: ${formatNumber(likeCount)}`
      );

      const likesUnavailable = likeCount === null || likeCount === undefined;
      if (
        isZeroMetric(videoCount) &&
        isZeroMetric(followerCount) &&
        isZeroMetric(followingCount) &&
        (likesUnavailable || isZeroMetric(likeCount))
      ) {
        const note = buildSuspiciousAccountNote("tiktok", tiktokHandle);
        result.tiktok.reviewNote = note;
        result.tiktok.summaryForSolution = result.tiktok.summaryForSolution
          ? `${result.tiktok.summaryForSolution}\n\n${note}`
          : note;
        lines.push("", note);
      }
    } catch (err) {
      const errorMsg = err?.message || "tidak diketahui";
      result.tiktok.error = errorMsg;
      result.tiktok.summaryForSolution = buildPlatformSummary("TikTok", {
        error: errorMsg,
      });
      lines.push(
        "",
        `🎵 TikTok *${tiktokHandle}*`,
        `Status: Gagal mengambil data (${errorMsg}).`
      );
    }
  }

  result.adminMessage = lines.join("\n").trim();
  return result;
}

async function buildInstagramIssueSolution(issueText, parsed, user, accountStatus) {
  const dbHandle = ensureHandle(user?.insta);
  const complaintHandle = normalizeComplaintHandle(parsed.instagram);
  const clientId = user?.client_id || user?.clientId || null;
  if (dbHandle) {
    const now = new Date();
    const likeCount = await hasUserLikedBetween(
      dbHandle,
      ACTIVITY_START_DATE,
      now,
      clientId
    );
    if (likeCount > 0) {
      return buildRecordedActivitySolution({
        issueText,
        platform: "Instagram",
        activityVerb: "memberikan like",
        handle: dbHandle,
        activityCount: likeCount,
        startDate: ACTIVITY_START_DATE,
        endDate: now,
      });
    }
  }

  const lines = [`• Kendala: ${issueText}`];
  const dbStatus = accountStatus?.instagram || {};
  const handlesMatch =
    complaintHandle && dbHandle ? handlesEqual(complaintHandle, dbHandle) : false;
  const treatAsSameHandle = handlesMatch || !complaintHandle;
  const complaintCheck = complaintHandle
    ? await verifyInstagramHandle(complaintHandle)
    : { summary: "", error: null, status: null };

  lines.push("", "Perbandingan data:");
  lines.push(`- Username pada database Cicero: ${dbHandle || "Belum tercatat."}`);
  lines.push(
    `- Username pada pesan komplain: ${complaintHandle || "Tidak dicantumkan."}`
  );

  const rapidLines = [];
  if (dbStatus.summaryForSolution) {
    if (treatAsSameHandle) {
      rapidLines.push(dbStatus.summaryForSolution);
    } else {
      rapidLines.push(`- Database: ${dbStatus.summaryForSolution}`);
    }
  } else if (dbHandle) {
    const fallbackStatus = dbStatus.error ? { error: dbStatus.error } : { found: false };
    const fallbackLabel = dbHandle ? `Instagram (${dbHandle})` : "Instagram";
    const fallbackSummary = buildPlatformSummary(fallbackLabel, fallbackStatus);
    if (treatAsSameHandle) rapidLines.push(fallbackSummary);
    else rapidLines.push(`- Database: ${fallbackSummary}`);
  }

  if (!treatAsSameHandle && complaintHandle) {
    if (complaintCheck.summary) {
      rapidLines.push(`- Komplain: ${complaintCheck.summary}`);
    } else if (complaintCheck.error) {
      rapidLines.push(`- Komplain: Gagal diperiksa (${complaintCheck.error}).`);
    } else {
      rapidLines.push(
        `- Komplain: Username ${complaintHandle} belum terbaca di RapidAPI.`
      );
    }
  }

  if (rapidLines.length) {
    lines.push("", "Hasil pengecekan RapidAPI:");
    lines.push(...rapidLines);
  }

  const dbFound = Boolean(dbStatus?.found);
  const dbActive = dbFound && hasFullMetrics(dbStatus);
  const complaintFound = Boolean(complaintCheck.status?.found);
  const complaintActive = complaintFound && hasFullMetrics(complaintCheck.status);
  const actions = [];
  const rapidMetricsEmpty = !dbActive && !complaintActive;

  const decoratedHandle = treatAsSameHandle
    ? dbHandle || complaintHandle || "akun Instagram tersebut"
    : `${dbHandle || "akun database"} / ${complaintHandle || "akun komplain"}`;
  const activityDescriptor = (() => {
    if (dbActive || complaintActive) return "terdeteksi aktif";
    if (dbFound || complaintFound)
      return "terdeteksi namun metrik aktivitasnya masih kosong";
    return "belum terbaca aktif";
  })();

  actions.push("Ringkasan tindak lanjut:");
  actions.push(
    `- Akun ${decoratedHandle} ${activityDescriptor}, namun belum ada data aktivitas like/komentar Instagram yang tercatat di sistem.`
  );

  actions.push("", "Panduan verifikasi:");
  actions.push(
    `1) Pastikan like dan komentar dilakukan menggunakan akun yang tercatat (Instagram: ${dbHandle || complaintHandle || "-"}).`
  );
  actions.push(
    "2) Kirim tautan/URL unggahan yang sudah di-like atau dikomentari beserta tanggal dan waktu aksi dilakukan."
  );
  actions.push(
    "3) Beri waktu sinkronisasi ±1 jam; jika tetap belum masuk, kirim ulang bukti (tautan + screenshot aksi) untuk dicek operator."
  );
  actions.push(
    "4) Jika ada target konten tertentu dari satker, pastikan aksi dilakukan pada konten tersebut."
  );

  if (!handlesMatch || rapidMetricsEmpty) {
    actions.push("", "Verifikasi lanjutan:");
    actions.push(
      "- Kirim screenshot profil Instagram terbaru yang menampilkan username, foto, dan bio untuk validasi.",
      "- Konfirmasi ulang username yang benar dan pastikan formatnya sesuai (sering tertukar karakter `_` dan `.`)."
    );
    if (!handlesMatch || !dbHandle) {
      actions.push("- Jika username di database perlu disesuaikan, lakukan pembaruan berikut:");
      actions.push(buildUpdateDataInstructions("Instagram"));
    }
    actions.push(
      "- Setelah dikonfirmasi, ulangi satu like atau komentar pada konten resmi dengan akun yang bersifat publik, lalu tunggu sinkronisasi ±1 jam sebelum pengecekan ulang."
    );
  }

  actions.push("", "Eskalasi:");
  actions.push(
    "- Jika setelah verifikasi di atas data masih belum terbaca, eskalasi ke operator piket untuk pengecekan log sistem."
  );

  lines.push("", "Langkah tindak lanjut:");
  lines.push(...actions);

  return lines.join("\n").trim();
}

async function buildTiktokIssueSolution(issueText, parsed, user, accountStatus) {
  const dbHandle = ensureHandle(user?.tiktok);
  const complaintHandle = normalizeComplaintHandle(parsed.tiktok);
  const clientId = user?.client_id || user?.clientId || null;
  let commentCount = null;
  if (dbHandle) {
    const now = new Date();
    commentCount = await hasUserCommentedBetween(
      dbHandle,
      ACTIVITY_START_DATE,
      now,
      clientId
    );
    if (commentCount > 0) {
      return buildRecordedActivitySolution({
        issueText,
        platform: "TikTok",
        activityVerb: "memberikan komentar",
        handle: dbHandle,
        activityCount: commentCount,
        startDate: ACTIVITY_START_DATE,
        endDate: now,
      });
    }
  }

  const lines = [`• Kendala: ${issueText}`];
  const dbStatus = accountStatus?.tiktok || {};
  const handlesMatch =
    complaintHandle && dbHandle ? handlesEqual(complaintHandle, dbHandle) : false;
  const treatAsSameHandle = handlesMatch || !complaintHandle;
  const complaintCheck = complaintHandle
    ? await verifyTiktokHandle(complaintHandle)
    : { summary: "", error: null, status: null };

  lines.push("", "Perbandingan data:");
  lines.push(`- Username pada database Cicero: ${dbHandle || "Belum tercatat."}`);
  lines.push(
    `- Username pada pesan komplain: ${complaintHandle || "Tidak dicantumkan."}`
  );

  const rapidLines = [];
  if (dbStatus.summaryForSolution) {
    if (treatAsSameHandle) {
      rapidLines.push(dbStatus.summaryForSolution);
    } else {
      rapidLines.push(`- Database: ${dbStatus.summaryForSolution}`);
    }
  } else if (dbHandle) {
    const fallbackStatus = dbStatus.error ? { error: dbStatus.error } : { found: false };
    const fallbackLabel = dbHandle ? `TikTok (${dbHandle})` : "TikTok";
    const fallbackSummary = buildPlatformSummary(fallbackLabel, fallbackStatus);
    if (treatAsSameHandle) rapidLines.push(fallbackSummary);
    else rapidLines.push(`- Database: ${fallbackSummary}`);
  }

  if (!treatAsSameHandle && complaintHandle) {
    if (complaintCheck.summary) {
      rapidLines.push(`- Komplain: ${complaintCheck.summary}`);
    } else if (complaintCheck.error) {
      rapidLines.push(`- Komplain: Gagal diperiksa (${complaintCheck.error}).`);
    } else {
      rapidLines.push(
        `- Komplain: Username ${complaintHandle} belum terbaca di RapidAPI.`
      );
    }
  }

  if (rapidLines.length) {
    lines.push("", "Hasil pengecekan RapidAPI:");
    lines.push(...rapidLines);
  }

  const dbFound = Boolean(dbStatus?.found);
  const dbActive = dbFound && hasFullMetrics(dbStatus);
  const complaintFound = Boolean(complaintCheck.status?.found);
  const complaintActive = complaintFound && hasFullMetrics(complaintCheck.status);
  const hasRecordedComment = typeof commentCount === "number" && commentCount > 0;
  const activeButNoCommentRecord = (dbActive || complaintActive) && !hasRecordedComment;
  const needsHandleUpdate = !handlesMatch || !dbHandle;
  const actions = [];

  const decoratedHandle = treatAsSameHandle
    ? dbHandle || complaintHandle || "akun TikTok tersebut"
    : `${dbHandle || "akun database"} / ${complaintHandle || "akun komplain"}`;
  const activityDescriptor = (() => {
    if (dbActive || complaintActive) return "terdeteksi aktif";
    if (dbFound || complaintFound)
      return "terdeteksi namun metrik aktivitasnya masih kosong";
    return "belum terbaca aktif";
  })();

  actions.push("Ringkasan tindak lanjut:");
  actions.push(
    `- Akun ${decoratedHandle} ${activityDescriptor}, namun belum ada data aktivitas komentar TikTok yang tercatat di sistem.`
  );

  actions.push("", "Panduan verifikasi:");
  actions.push(
    `1) Pastikan komentar dilakukan menggunakan akun yang tercatat (TikTok: ${dbHandle || complaintHandle || "-"}).`
  );
  actions.push(
    "2) Kirim tautan/URL video yang sudah dikomentari beserta tanggal dan waktu aksi dilakukan."
  );
  actions.push(
    "3) Beri waktu sinkronisasi ±1 jam; jika tetap belum masuk, kirim ulang bukti (tautan + screenshot aksi) untuk dicek operator."
  );
  actions.push(
    "4) Jika ada target konten tertentu dari satker, pastikan aksi dilakukan pada konten tersebut."
  );

  if (activeButNoCommentRecord) {
    actions.push("", "Validasi akun & bukti komentar:");
    actions.push(
      "- Verifikasi akun yang dipakai saat komentar; perhatikan perbedaan karakter mirip seperti `_` vs `.` ketika memastikan username benar.",
      "- Kirim screenshot profil TikTok terbaru yang menampilkan username serta tautan video yang sudah dikomentari.",
      "- Ulangi satu komentar pada konten resmi satker untuk uji pencatatan, lalu tunggu sinkronisasi ±1 jam sebelum pengecekan ulang.",
      "- Hindari emoji atau karakter khusus yang mungkin tidak terbaca sistem ketika mengirim komentar maupun bukti."
    );
    if (needsHandleUpdate) {
      actions.push("- Jika username di database perlu disesuaikan, lakukan pembaruan berikut:");
      actions.push(buildUpdateDataInstructions("TikTok"));
    }
  } else if (needsHandleUpdate) {
    actions.push("", "Pembaruan username:");
    actions.push("- Jika username di database perlu disesuaikan, lakukan pembaruan berikut:");
    actions.push(buildUpdateDataInstructions("TikTok"));
  }

  actions.push("", "Eskalasi:");
  actions.push(
    "- Jika setelah verifikasi di atas data masih belum terbaca, eskalasi ke operator piket untuk pengecekan log sistem."
  );
  actions.push(
    "- Setelah sinkronisasi ±1 jam data tetap kosong, minta operator mengecek log integrasi TikTok (RapidAPI/API) termasuk potensi batasan rate limit."
  );

  lines.push("", "Langkah tindak lanjut:");
  lines.push(...actions);

  return lines.join("\n").trim();
}

export function shortenCaption(text, max = 120) {
  if (!text) return "(tanpa caption)";
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function pickPrimaryRole(user) {
  if (!user) return null;
  if (user.ditbinmas) return "ditbinmas";
  if (user.ditlantas) return "ditlantas";
  if (user.bidhumas) return "bidhumas";
  if (user.operator) return "operator";
  return null;
}

export async function fetchPendingTasksForToday(user) {
  if (!user?.user_id || !user?.client_id) {
    return { posts: [], pending: [], error: null };
  }

  try {
    const clientRes = await query(
      "SELECT LOWER(client_type) AS client_type FROM clients WHERE LOWER(client_id) = LOWER($1)",
      [user.client_id]
    );
    const clientType = clientRes.rows[0]?.client_type;
    const params = [];
    let joinClause = "";
    const conditions = [
      "(p.created_at AT TIME ZONE 'Asia/Jakarta')::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date",
    ];

    if (clientType === "direktorat") {
      const roleName = pickPrimaryRole(user) || user.client_id;
      if (!roleName) {
        return { posts: [], pending: [], error: null };
      }
      joinClause =
        "JOIN insta_post_roles pr ON pr.shortcode = p.shortcode JOIN roles r ON pr.role_id = r.role_id";
      params.push(roleName);
      conditions.unshift("LOWER(r.role_name) = LOWER($1)");
    } else {
      params.push(user.client_id);
      conditions.unshift("LOWER(p.client_id) = LOWER($1)");
    }

    const postsRes = await query(
      `SELECT p.shortcode, COALESCE(p.caption, '') AS caption
       FROM insta_post p
       ${joinClause}
       WHERE ${conditions.join(" AND ")}
       ORDER BY p.created_at ASC`,
      params
    );
    const posts = postsRes.rows || [];

    if (!posts.length) {
      return { posts: [], pending: [], error: null };
    }

    const reportRes = await query(
      `SELECT shortcode,
              instagram_link,
              facebook_link,
              twitter_link,
              tiktok_link,
              youtube_link
         FROM link_report
        WHERE user_id = $1
          AND (created_at AT TIME ZONE 'Asia/Jakarta')::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date`,
      [user.user_id]
    );

    const completed = new Set(
      reportRes.rows
        .filter((row) =>
          [
            row.instagram_link,
            row.facebook_link,
            row.twitter_link,
            row.tiktok_link,
            row.youtube_link,
          ].some((value) => typeof value === "string" && value.trim() !== "")
        )
        .map((row) => row.shortcode)
    );

    const pending = posts.filter((post) => !completed.has(post.shortcode));

    return { posts, pending, error: null };
  } catch (err) {
    return { posts: [], pending: [], error: err };
  }
}

async function buildAttendanceIssueSolution(issueText, user) {
  const lines = [`• Kendala: ${issueText}`];
  const { pending, error } = await fetchPendingTasksForToday(user);
  if (error) {
    lines.push(`Gagal mengambil data tugas: ${error.message}`);
  } else if (!pending.length) {
    lines.push(
      "Semua link tugas hari ini sudah tercatat di sistem. Jika masih terdapat perbedaan, mohon kirim bukti pengiriman link."
    );
  } else {
    lines.push("Berikut daftar link tugas yang belum tercatat pada sistem hari ini:");
    pending.forEach((post, idx) => {
      const link = `https://www.instagram.com/p/${post.shortcode}/`;
      lines.push(`${idx + 1}. ${shortenCaption(post.caption)}`);
      lines.push(`   ${link}`);
    });
  }
  lines.push(
    "",
    "Silakan lakukan update link melalui menu *Update Tugas* pada aplikasi Cicero setelah melaksanakan tugas."
  );
  lines.push(
    "Jika seluruh tugas sudah dikerjakan, mohon kirimkan bukti screenshot update link kepada admin untuk verifikasi."
  );
  return lines.join("\n").trim();
}

function buildFlaggedNotDoneSolution(issueText, accountStatus) {
  const lines = [`• Kendala: ${issueText}`];

  const instaHandle = accountStatus?.instagram?.username || "";
  const tiktokHandle = accountStatus?.tiktok?.username || "";
  const activeInstagram = hasFullMetrics(accountStatus?.instagram);
  const activeTiktok = hasFullMetrics(accountStatus?.tiktok);

  if (instaHandle || tiktokHandle) {
    lines.push("", "Status akun yang tercatat:");
    if (instaHandle) {
      lines.push(`- Instagram: ${instaHandle}${activeInstagram ? " (Aktif)" : ""}`);
    }
    if (tiktokHandle) {
      lines.push(`- TikTok: ${tiktokHandle}${activeTiktok ? " (Aktif)" : ""}`);
    }
  }

  if (!activeInstagram && !activeTiktok) {
    return "";
  }

  const handleLabel =
    [instaHandle, tiktokHandle].filter(Boolean).join(" / ") || "akun yang terdaftar";

  lines.push("", "Ringkasan tindak lanjut:");
  lines.push(
    "- Akun sosial media pelapor terdeteksi aktif dan telah digunakan untuk like/komentar, namun status absensi masih tertulis 'belum melaksanakan'."
  );
  lines.push("- Sistem akan membantu pengecekan ulang pencatatan aksi tersebut pada menu absensi terkait.");

  lines.push("", "Panduan verifikasi:");
  lines.push(`1) Pastikan seluruh aksi dilakukan memakai ${handleLabel} yang tercatat di Cicero.`);
  lines.push(
    "2) Kirim tautan konten yang sudah di-like/dikomentari beserta waktu pelaksanaan sebagai bukti pengecekan."
  );
  lines.push(
    "3) Buka menu Absensi Likes Instagram atau Absensi Komentar TikTok di dashboard Cicero, pilih ulang satker & periode, lalu tekan *Refresh* untuk memuat data terbaru."
  );
  lines.push(
    "4) Jika status tetap 'belum melaksanakan' setelah refresh ±1 jam, kirim tangkapan layar aksi dan hasil refresh untuk eskalasi ke operator piket."
  );

  return lines.join("\n").trim();
}

export async function buildComplaintSolutionsFromIssues(parsed, user, accountStatus) {
  const issues = Array.isArray(parsed.issues)
    ? parsed.issues.map((issue) => issue.trim()).filter(Boolean)
    : [];
  if (!issues.length) {
    return { solutionText: "", handledKeys: new Set() };
  }

  const handledKeys = new Set();
  const solutions = [];

  for (const issueText of issues) {
    const key = detectKnownIssueKey(issueText);
    if (!key || handledKeys.has(key)) {
      continue;
    }
    handledKeys.add(key);

    if (key === "instagram_not_recorded") {
      solutions.push(await buildInstagramIssueSolution(issueText, parsed, user, accountStatus));
      continue;
    }
    if (key === "tiktok_not_recorded") {
      solutions.push(await buildTiktokIssueSolution(issueText, parsed, user, accountStatus));
      continue;
    }
    if (key === "attendance_less") {
      solutions.push(await buildAttendanceIssueSolution(issueText, user));
      continue;
    }
    if (key === "activity_flagged_not_done") {
      const solution = buildFlaggedNotDoneSolution(issueText, accountStatus);
      if (solution) solutions.push(solution);
    }
  }

  return { solutionText: solutions.join("\n\n"), handledKeys };
}

function buildWhatsappDeliveryStatus(rawNumber) {
  const normalizedRaw =
    typeof rawNumber === "string" ? rawNumber.trim() : rawNumber ?? "";
  if (!normalizedRaw) {
    return { status: "skipped", reason: "empty", target: null };
  }
  const normalizedTarget = normalizeUserWhatsAppId(normalizedRaw);
  if (!normalizedTarget) {
    return { status: "invalid", reason: "invalid_number", target: null };
  }
  return { status: "pending", reason: null, target: normalizedTarget };
}

export async function sendComplaintWhatsappResponse({
  message,
  personnelWhatsapp,
  dashboardWhatsapp,
} = {}) {
  const personnel = buildWhatsappDeliveryStatus(personnelWhatsapp);
  const dashboardUser = buildWhatsappDeliveryStatus(dashboardWhatsapp);

  const targets = [personnel, dashboardUser].filter(
    (entry) => entry.status === "pending"
  );

  if (!targets.length) {
    return { personnel, dashboardUser };
  }

  try {
    await waitForWaReady();
  } catch (err) {
    const reason = `wa_not_ready: ${err?.message || "unknown_error"}`;
    targets.forEach((entry) => {
      entry.status = "failed";
      entry.reason = reason;
    });
    return { personnel, dashboardUser };
  }

  for (const entry of targets) {
    const sent = await safeSendMessage(waClient, entry.target, message);
    entry.status = sent ? "sent" : "failed";
    if (!sent) {
      entry.reason = "send_failed";
    }
  }

  return { personnel, dashboardUser };
}
