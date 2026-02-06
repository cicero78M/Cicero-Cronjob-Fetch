import { getUsersByClient } from "../model/userModel.js";
import { getCommentsByVideoId } from "../model/tiktokCommentModel.js";
import { getPostsTodayByClient } from "../model/tiktokPostModel.js";
import { getRekapKomentarByClient } from "../model/tiktokCommentModel.js";
import { formatNama } from "../utils/utilsHelper.js";
import { matchesKasatBinmasJabatan } from "./kasatkerAttendanceService.js";
import {
  extractUsernamesFromComments,
  normalizeUsername,
} from "../handler/fetchabsensi/tiktok/absensiKomentarTiktok.js";

const DITBINMAS_CLIENT_ID = "DITBINMAS";
const TARGET_ROLE = "ditbinmas";
const JAKARTA_TIMEZONE = "Asia/Jakarta";

const STATUS_SECTIONS = [
  { key: "lengkap", icon: "✅", label: "Lengkap (sesuai target)" },
  { key: "sebagian", icon: "🟡", label: "Sebagian (belum semua konten)" },
  { key: "belum", icon: "❌", label: "Belum komentar" },
  { key: "noUsername", icon: "⚠️❌", label: "Belum update akun TikTok" },
];

const PANGKAT_ORDER = [
  "KOMISARIS BESAR POLISI",
  "AKBP",
  "KOMPOL",
  "AKP",
  "IPTU",
  "IPDA",
  "AIPTU",
  "AIPDA",
  "BRIPKA",
  "BRIGPOL",
  "BRIGADIR",
  "BRIGADIR POLISI",
  "BRIPTU",
  "BRIPDA",
];

function rankWeight(rank) {
  const normalized = String(rank || "").toUpperCase();
  const idx = PANGKAT_ORDER.indexOf(normalized);
  return idx === -1 ? PANGKAT_ORDER.length : idx;
}

function toZonedDate(baseDate = new Date(), timeZone = JAKARTA_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(baseDate)
    .reduce((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});

  const year = Number(parts.year);
  const month = Number(parts.month) - 1;
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);

  const normalizedHour = hour === 24 ? 0 : hour;

  return new Date(Date.UTC(year, month, day, normalizedHour, minute, second));
}

function toJakartaDate(baseDate = new Date()) {
  return toZonedDate(baseDate, JAKARTA_TIMEZONE);
}

export function resolveBaseDate(referenceDate) {
  if (!referenceDate) {
    return toJakartaDate(new Date());
  }

  const candidateDate = new Date(referenceDate);
  if (Number.isNaN(candidateDate.getTime())) {
    return toJakartaDate(new Date());
  }

  const jakartaCandidate = toJakartaDate(candidateDate);
  const todayJakarta = toJakartaDate(new Date());
  if (jakartaCandidate.getTime() > todayJakarta.getTime()) {
    return todayJakarta;
  }

  return jakartaCandidate;
}

function toDateInput(date) {
  const zonedDate = date instanceof Date ? date : toJakartaDate(date);
  const year = zonedDate.getUTCFullYear();
  const month = String(zonedDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(zonedDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLong(date) {
  const jakartaDate = date instanceof Date ? date : toJakartaDate(date);
  return jakartaDate.toLocaleDateString("id-ID", {
    timeZone: "UTC",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatDayLabel(date) {
  const jakartaDate = date instanceof Date ? date : toJakartaDate(date);
  const weekday = jakartaDate.toLocaleDateString("id-ID", {
    weekday: "long",
    timeZone: "UTC",
  });
  return `${weekday}, ${formatDateLong(jakartaDate)}`;
}

function resolveWeeklyRange(baseDate = new Date()) {
  const date = baseDate instanceof Date ? baseDate : toJakartaDate(baseDate);
  const day = date.getUTCDay();
  const mondayDiff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date.getTime());
  monday.setUTCDate(date.getUTCDate() + mondayDiff);
  const sunday = new Date(monday.getTime());
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    start: monday,
    end: sunday,
    label: `${formatDayLabel(monday)} s.d. ${formatDayLabel(sunday)}`,
  };
}

function describePeriod(period = "daily", referenceDate) {
  const today = resolveBaseDate(referenceDate);
  if (period === "weekly") {
    const { start, end, label } = resolveWeeklyRange(today);
    return {
      periode: "mingguan",
      label,
      tanggal: toDateInput(start),
      startDate: toDateInput(start),
      endDate: toDateInput(end),
    };
  }
  if (period === "monthly") {
    const label = today.toLocaleDateString("id-ID", {
      timeZone: "UTC",
      month: "long",
      year: "numeric",
    });
    const zoned = today instanceof Date ? today : toJakartaDate(today);
    return {
      periode: "bulanan",
      label: `Bulan ${label}`,
      tanggal: `${zoned.getUTCFullYear()}-${String(zoned.getUTCMonth() + 1).padStart(2, "0")}`,
    };
  }
  return {
    periode: "harian",
    label: formatDayLabel(today),
    tanggal: toDateInput(today),
  };
}

export function describeKasatBinmasTiktokCommentPeriod(period = "daily", referenceDate) {
  return describePeriod(period, referenceDate);
}

function sortKasatEntries(entries) {
  return entries.slice().sort((a, b) => {
    const countA = Number(a.count) || 0;
    const countB = Number(b.count) || 0;
    const countDiff = countB - countA;
    if (countDiff !== 0) return countDiff;

    const rankDiff = rankWeight(a.user?.title) - rankWeight(b.user?.title);
    if (rankDiff !== 0) return rankDiff;

    const nameA = formatNama(a.user) || "";
    const nameB = formatNama(b.user) || "";
    return nameA.localeCompare(nameB, "id-ID", { sensitivity: "base" });
  });
}

function formatEntryLine(entry, index, totalKonten) {
  const user = entry.user;
  const polres = (user?.client_name || user?.client_id || "-").toUpperCase();
  const name = formatNama(user) || "(Tanpa Nama)";
  if (!user?.tiktok) {
    return `${index}. ${name} (${polres}) — Username TikTok belum tersedia`;
  }
  if (totalKonten === 0) {
    return `${index}. ${name} (${polres}) — Tidak ada konten untuk dikomentari`;
  }
  if (entry.count >= totalKonten) {
    return `${index}. ${name} (${polres}) — Lengkap (${entry.count}/${totalKonten} konten)`;
  }
  if (entry.count > 0) {
    return `${index}. ${name} (${polres}) — ${entry.count}/${totalKonten} konten`;
  }
  return `${index}. ${name} (${polres}) — 0/${totalKonten} konten`;
}

async function buildLiveFallbackCounts(kasatUsers, referenceDate) {
  const usernameToUsers = new Map();
  kasatUsers.forEach((user) => {
    const normalizedUsername = normalizeUsername(user?.tiktok);
    if (!normalizedUsername) return;
    if (!usernameToUsers.has(normalizedUsername)) {
      usernameToUsers.set(normalizedUsername, []);
    }
    usernameToUsers.get(normalizedUsername).push(user);
  });

  const commentCountByUser = new Map();
  try {
    const posts = await getPostsTodayByClient(
      DITBINMAS_CLIENT_ID,
      referenceDate
    );
    const totalKonten = posts.length;

    for (const post of posts) {
      try {
        const { comments } = await getCommentsByVideoId(post.video_id);
        const commenters = new Set(
          extractUsernamesFromComments(comments).map((uname) =>
            normalizeUsername(uname)
          )
        );

        commenters.forEach((username) => {
          const mappedUsers = usernameToUsers.get(username) || [];
          mappedUsers.forEach((user) => {
            commentCountByUser.set(
              user.user_id,
              (commentCountByUser.get(user.user_id) || 0) + 1
            );
          });
        });
      } catch (error) {
        return {
          success: false,
          totalKonten,
          commentCountByUser,
          error: `Gagal mengambil komentar untuk konten ${post.video_id}: ${
            error?.message || error
          }`,
        };
      }
    }

    return { success: true, totalKonten, commentCountByUser };
  } catch (error) {
    return {
      success: false,
      totalKonten: 0,
      commentCountByUser,
      error: error?.message || error,
    };
  }
}

export async function generateKasatBinmasTiktokCommentRecap({
  period = "daily",
  referenceDate,
} = {}) {
  const periodInfo = describePeriod(period, referenceDate);

  const users = await getUsersByClient(DITBINMAS_CLIENT_ID, TARGET_ROLE);
  const kasatUsers = (users || []).filter((user) => matchesKasatBinmasJabatan(user?.jabatan));

  if (!kasatUsers.length) {
    const totalUsers = users?.length || 0;
    return `Dari ${totalUsers} user aktif ${DITBINMAS_CLIENT_ID} (${TARGET_ROLE}), tidak ditemukan data Kasat Binmas.`;
  }

  const recapRows = await getRekapKomentarByClient(
    DITBINMAS_CLIENT_ID,
    periodInfo.periode,
    periodInfo.tanggal,
    periodInfo.startDate,
    periodInfo.endDate,
    TARGET_ROLE
  );

  let commentCountByUser = new Map();
  let totalKonten = Number(recapRows?.[0]?.total_konten ?? 0);
  (recapRows || []).forEach((row) => {
    if (!row) return;
    commentCountByUser.set(row.user_id, Number(row.jumlah_komentar) || 0);
  });

  const allowLiveFallback = periodInfo.periode === "harian";
  let warningMessage = "";
  if (!recapRows?.length || totalKonten === 0) {
    if (allowLiveFallback) {
      const fallback = await buildLiveFallbackCounts(kasatUsers, periodInfo.tanggal);
      if (fallback.success) {
        commentCountByUser = fallback.commentCountByUser;
        totalKonten = fallback.totalKonten;
        warningMessage =
          totalKonten === 0
            ? "Rekap periode kosong. Tidak ada konten TikTok Ditbinmas hari ini untuk dicek secara langsung."
            : "Rekap periode kosong. Data diambil langsung dari konten TikTok hari ini.";
      } else if (!recapRows?.length) {
        return (
          "Rekap komentar periode ini tidak tersedia dan pengambilan data langsung juga gagal. " +
          (fallback.error ? `Alasan: ${fallback.error}` : "")
        ).trim();
      } else {
        warningMessage =
          fallback.error ||
          "Rekap komentar tidak tersedia untuk periode ini dan pengambilan data langsung gagal.";
      }
    } else if (!recapRows?.length) {
      warningMessage =
        "Rekap periode kosong. Tidak ada data komentar TikTok yang tersimpan untuk periode ini.";
    }
  }

  const grouped = { lengkap: [], sebagian: [], belum: [], noUsername: [] };
  const totals = {
    total: kasatUsers.length,
    lengkap: 0,
    sebagian: 0,
    belum: 0,
    noUsername: 0,
  };

  kasatUsers.forEach((user) => {
    const count = commentCountByUser.get(user.user_id) || 0;
    let key = "belum";
    if (!user?.tiktok) {
      key = "noUsername";
    } else if (count >= totalKonten) {
      key = "lengkap";
    } else if (count > 0) {
      key = "sebagian";
    }

    totals[key] += 1;
    grouped[key].push({ user, count });
  });

  const sectionsText = STATUS_SECTIONS.map(({ key, icon, label }) => {
    const entries = sortKasatEntries(grouped[key] || []);
    const header = `${icon} *${label} (${entries.length} pers)*`;
    if (!entries.length) {
      return header;
    }
    const lines = entries.map(
      (entry, idx) => `   ${formatEntryLine(entry, idx + 1, totalKonten)}`
    );
    return [header, ...lines].join("\n");
  });

  const sectionsWithSpacing = sectionsText.flatMap((section, index) =>
    index === sectionsText.length - 1 ? [section] : [section, ""]
  );

  const totalKontenLine =
    totalKonten > 0
      ? `Total konten periode: ${totalKonten} video`
      : "Total konten periode: 0 (tidak ada konten untuk dikomentari)";
  const noKontenNote =
    totalKonten === 0
      ? "Tidak ada konten yang perlu dikomentari pada periode ini. Status lengkap berarti tidak ada kewajiban komentar."
      : "";

  const summaryLines = [
    "📋 *Absensi Komentar TikTok Kasat Binmas*",
    "",
    `🗓️ Periode: ${periodInfo.label}`,
    warningMessage,
    "",
    "*Ringkasan:*",
    `- ${totalKontenLine}`,
    `- Total Kasat Binmas: ${totals.total} pers`,
    `- Lengkap: ${totals.lengkap}/${totals.total} pers`,
    `- Sebagian: ${totals.sebagian}/${totals.total} pers`,
    `- Belum komentar: ${totals.belum}/${totals.total} pers`,
    `- Belum update akun TikTok: ${totals.noUsername} pers`,
    noKontenNote ? `- ${noKontenNote}` : "",
  ];

  return [
    ...summaryLines.filter(Boolean),
    "",
    "*Rincian per status:*",
    ...sectionsWithSpacing,
  ].join("\n");
}

export default { generateKasatBinmasTiktokCommentRecap, resolveBaseDate };
