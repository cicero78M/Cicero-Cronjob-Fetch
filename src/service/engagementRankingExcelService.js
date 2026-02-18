import { mkdir } from "fs/promises";
import path from "path";
import XLSX from "xlsx";

import { findClientById } from "./clientService.js";
import { getShortcodesByDateRange } from "../model/instaPostModel.js";
import { getLikesSets, groupUsersByClientDivision, normalizeUsername } from "../utils/likesHelper.js";
import { extractUsernamesFromCommentTree } from "../utils/tiktokCommentUsernameExtractor.js";
import { getPostsByClientAndDateRange } from "../model/tiktokPostModel.js";
import { getCommentsByVideoId } from "../model/tiktokCommentModel.js";
import { computeDitbinmasLikesStats } from "../handler/fetchabsensi/insta/ditbinmasLikesUtils.js";
import { hariIndo } from "../utils/constants.js";

const EXPORT_DIR = path.resolve("export_data/engagement_ranking");
const PERIOD_DESCRIPTIONS = {
  today: "hari ini",
  yesterday: "hari sebelumnya",
  this_week: "minggu ini",
  last_week: "minggu sebelumnya",
  this_month: "bulan ini",
  last_month: "bulan sebelumnya",
  all_time: "semua periode",
};

function getJakartaDate(baseDate = new Date()) {
  const reference =
    baseDate instanceof Date ? baseDate : new Date(baseDate ?? Date.now());
  if (Number.isNaN(reference.getTime())) {
    return new Date(NaN);
  }
  return new Date(
    reference.toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
  );
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDayDate(date) {
  const hari = hariIndo[date.getDay()] || date.toLocaleDateString("id-ID", {
    weekday: "long",
  });
  const tanggal = date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return `${hari}, ${tanggal}`;
}

function formatDateOnly(date) {
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatDateRangeText(startDate, endDate) {
  return `${formatDateOnly(startDate)} - ${formatDateOnly(endDate)}`;
}

function getIsoWeekNumber(date) {
  const target = new Date(date.valueOf());
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  firstThursday.setHours(0, 0, 0, 0);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000));
}

function resolvePeriodRange(
  period = "today",
  { startDate: customStart, endDate: customEnd } = {},
  referenceDate = getJakartaDate()
) {
  const normalizedPeriod = PERIOD_DESCRIPTIONS[period] ? period : "today";

  if (customStart && customEnd) {
    const start = getJakartaDate(customStart);
    const end = getJakartaDate(customEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return resolvePeriodRange(normalizedPeriod, {}, referenceDate);
    }
    const [startDateObj, endDateObj] =
      start.getTime() <= end.getTime() ? [start, end] : [end, start];
    const rangeLabel = `${formatDayDate(startDateObj)} - ${formatDayDate(endDateObj)}`;
    return {
      period: normalizedPeriod,
      startDate: toDateKey(startDateObj),
      endDate: toDateKey(endDateObj),
      label: `Periode Data: ${rangeLabel}`,
      description: PERIOD_DESCRIPTIONS[normalizedPeriod],
      fileLabel: `Periode_${toDateKey(startDateObj)}_${toDateKey(endDateObj)}`,
    };
  }

  const now = getJakartaDate(referenceDate);
  let startDateObj = new Date(now);
  let endDateObj = new Date(now);
  let label;
  let fileLabel;

  switch (normalizedPeriod) {
    case "all_time": {
      startDateObj = new Date(2000, 0, 1);
      endDateObj = new Date(now);
      label = `Semua periode data hingga ${formatDayDate(endDateObj)}`;
      fileLabel = `Semua_Periode_${toDateKey(startDateObj)}_${toDateKey(endDateObj)}`;
      break;
    }
    case "yesterday": {
      startDateObj.setDate(now.getDate() - 1);
      endDateObj = new Date(startDateObj);
      label = `Hari, Tanggal: ${formatDayDate(startDateObj)}`;
      fileLabel = `Tanggal_${toDateKey(startDateObj)}`;
      break;
    }
    case "this_week": {
      const day = now.getDay();
      const diffToMonday = (day + 6) % 7;
      startDateObj.setDate(now.getDate() - diffToMonday);
      endDateObj = new Date(startDateObj);
      endDateObj.setDate(startDateObj.getDate() + 6);
      const weekNumber = getIsoWeekNumber(startDateObj);
      const rangeText = formatDateRangeText(startDateObj, endDateObj);
      label = `Minggu ke-${weekNumber} (${rangeText})`;
      fileLabel = `Minggu_${weekNumber}_${toDateKey(startDateObj)}_${toDateKey(endDateObj)}`;
      break;
    }
    case "last_week": {
      const day = now.getDay();
      const diffToMonday = (day + 6) % 7;
      const thisWeekMonday = new Date(now);
      thisWeekMonday.setDate(now.getDate() - diffToMonday);
      startDateObj = new Date(thisWeekMonday);
      startDateObj.setDate(thisWeekMonday.getDate() - 7);
      endDateObj = new Date(startDateObj);
      endDateObj.setDate(startDateObj.getDate() + 6);
      const weekNumber = getIsoWeekNumber(startDateObj);
      const rangeText = formatDateRangeText(startDateObj, endDateObj);
      label = `Minggu ke-${weekNumber} (${rangeText})`;
      fileLabel = `Minggu_${weekNumber}_${toDateKey(startDateObj)}_${toDateKey(endDateObj)}`;
      break;
    }
    case "this_month": {
      startDateObj = new Date(now.getFullYear(), now.getMonth(), 1);
      endDateObj = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const monthLabel = startDateObj.toLocaleDateString("id-ID", {
        month: "long",
        year: "numeric",
      });
      label = `Bulan: ${monthLabel}`;
      fileLabel = `Bulan_${startDateObj.getFullYear()}-${String(
        startDateObj.getMonth() + 1
      ).padStart(2, "0")}`;
      break;
    }
    case "last_month": {
      startDateObj = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDateObj = new Date(now.getFullYear(), now.getMonth(), 0);
      const monthLabel = startDateObj.toLocaleDateString("id-ID", {
        month: "long",
        year: "numeric",
      });
      label = `Bulan: ${monthLabel}`;
      fileLabel = `Bulan_${startDateObj.getFullYear()}-${String(
        startDateObj.getMonth() + 1
      ).padStart(2, "0")}`;
      break;
    }
    case "today":
    default: {
      label = `Hari, Tanggal: ${formatDayDate(startDateObj)}`;
      fileLabel = `Tanggal_${toDateKey(startDateObj)}`;
      break;
    }
  }

  return {
    period: normalizedPeriod,
    startDate: toDateKey(startDateObj),
    endDate: toDateKey(endDateObj),
    label,
    description: PERIOD_DESCRIPTIONS[normalizedPeriod],
    fileLabel,
  };
}

function sanitizeFilename(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function extractUsernamesFromComments(comments) {
  return extractUsernamesFromCommentTree(comments).map((username) =>
    normalizeUsername(username)
  );
}

function computeCommentSummary(users = [], commentSets = [], totalKonten = 0) {
  const sets = Array.isArray(commentSets) ? commentSets : [];
  const userStats = (users || []).map((user) => {
    if (!user || typeof user !== "object") {
      return user;
    }

    const base = { ...user, count: 0 };

    if (user.exception === true) {
      return { ...base, status: "lengkap" };
    }

    const username = normalizeUsername(user.tiktok);
    if (!username) {
      return { ...base, status: "noUsername" };
    }

    let count = 0;
    sets.forEach((set) => {
      if (set && typeof set.has === "function" && set.has(username)) {
        count += 1;
      }
    });

    let status = "belum";
    if (totalKonten > 0) {
      if (count >= totalKonten) status = "lengkap";
      else if (count > 0) status = "kurang";
    }

    return { ...base, count, status };
  });

  const summary = userStats.reduce(
    (acc, user) => {
      if (!user || typeof user !== "object") {
        return acc;
      }

      acc.total += 1;
      switch (user.status) {
        case "lengkap":
          acc.lengkap += 1;
          break;
        case "kurang":
          acc.kurang += 1;
          break;
        case "noUsername":
          acc.noUsername += 1;
          break;
        default:
          acc.belum += 1;
          break;
      }
      return acc;
    },
    { total: 0, lengkap: 0, kurang: 0, belum: 0, noUsername: 0 }
  );

  return { summary, userStats };
}

async function getClientInfoCached(cache, clientId) {
  const key = String(clientId || "").toLowerCase();
  if (!cache.has(key)) {
    cache.set(key, await findClientById(key));
  }
  return cache.get(key);
}

export async function collectEngagementRanking(
  clientId,
  roleFlag = null,
  options = {}
) {
  const clientIdStr = String(clientId || "").trim();
  if (!clientIdStr) {
    throw new Error("Client tidak ditemukan.");
  }

  const normalizedClientId = clientIdStr.toLowerCase();
  const client = await findClientById(normalizedClientId);
  if (!client) {
    throw new Error("Client tidak ditemukan.");
  }
  if (client.client_type?.toLowerCase() !== "direktorat") {
    throw new Error("Menu ini hanya tersedia untuk direktorat.");
  }

  const roleName = (roleFlag || normalizedClientId).toLowerCase();
  const { polresIds, usersByClient } = await groupUsersByClientDivision(roleName);

  const periodInfo = resolvePeriodRange(options.period, options);

  const allIds = new Set(
    [
      ...polresIds.map((id) => String(id || "").toUpperCase()),
      normalizedClientId.toUpperCase(),
      ...Object.keys(usersByClient || {}),
    ].filter(Boolean)
  );

  const shortcodes = await getShortcodesByDateRange(
    roleName,
    periodInfo.startDate,
    periodInfo.endDate
  );
  const likesSets = shortcodes.length ? await getLikesSets(shortcodes) : [];
  const totalIgPosts = shortcodes.length;

  const tiktokPosts = await getPostsByClientAndDateRange(
    roleName,
    periodInfo.startDate,
    periodInfo.endDate
  );
  const commentSets = [];
  for (const post of tiktokPosts) {
    try {
      const { comments } = await getCommentsByVideoId(post.video_id);
      commentSets.push(new Set(extractUsernamesFromComments(comments)));
    } catch (error) {
      console.error(
        "Gagal mengambil komentar TikTok untuk",
        post.video_id,
        error
      );
      commentSets.push(new Set());
    }
  }
  const totalTtPosts = tiktokPosts.length;

  const clientCache = new Map();
  const entries = [];
  const totals = {
    totalPersonil: 0,
    igSudah: 0,
    igBelum: 0,
    igKosong: 0,
    ttSudah: 0,
    ttBelum: 0,
    ttKosong: 0,
  };

  for (const cidRaw of allIds) {
    const cidUpper = String(cidRaw || "").toUpperCase();
    const users = usersByClient?.[cidUpper] || [];

    const { summary: igSummary, userStats: igUserStats } = computeDitbinmasLikesStats(
      users,
      likesSets,
      totalIgPosts
    );
    const { summary: ttSummary, userStats: ttUserStats } = computeCommentSummary(
      users,
      commentSets,
      totalTtPosts
    );

    const totalPersonil = users.length;
    const igSudah = (igSummary.lengkap || 0) + (igSummary.kurang || 0);
    const igBelum = igSummary.belum || 0;
    const igKosong = igSummary.noUsername || 0;
    const ttSudah = (ttSummary.lengkap || 0) + (ttSummary.kurang || 0);
    const ttBelum = ttSummary.belum || 0;
    const ttKosong = ttSummary.noUsername || 0;

    const igLikeCount = (igUserStats || []).reduce((acc, user) => {
      if (!user || typeof user !== "object") {
        return acc;
      }
      return acc + (Number.isFinite(user.count) ? user.count : 0);
    }, 0);

    const ttCommentCount = (ttUserStats || []).reduce((acc, user) => {
      if (!user || typeof user !== "object") {
        return acc;
      }
      return acc + (Number.isFinite(user.count) ? user.count : 0);
    }, 0);

    const info = await getClientInfoCached(clientCache, cidUpper);
    const name = (info?.nama || cidUpper).toUpperCase();

    const igPct = totalPersonil ? igSudah / totalPersonil : 0;
    const ttPct = totalPersonil ? ttSudah / totalPersonil : 0;
    const score = totalPersonil ? (igPct + ttPct) / 2 : 0;
    const engagementTotal = igLikeCount + ttCommentCount;

    entries.push({
      cid: cidUpper.toLowerCase(),
      name,
      totalPersonil,
      igSudah,
      igBelum,
      igKosong,
      ttSudah,
      ttBelum,
      ttKosong,
      igPct,
      ttPct,
      score,
      igLikeCount,
      ttCommentCount,
      engagementTotal,
    });

    totals.totalPersonil += totalPersonil;
    totals.igSudah += igSudah;
    totals.igBelum += igBelum;
    totals.igKosong += igKosong;
    totals.ttSudah += ttSudah;
    totals.ttBelum += ttBelum;
    totals.ttKosong += ttKosong;
  }

  if (!entries.length) {
    throw new Error("Tidak ada data engagement untuk direkap.");
  }

  const primaryCid = normalizedClientId;
  entries.sort((a, b) => {
    if (a.cid === primaryCid && b.cid !== primaryCid) return -1;
    if (b.cid === primaryCid && a.cid !== primaryCid) return 1;
    if (b.engagementTotal !== a.engagementTotal)
      return b.engagementTotal - a.engagementTotal;
    if (b.igLikeCount !== a.igLikeCount)
      return b.igLikeCount - a.igLikeCount;
    if (b.ttCommentCount !== a.ttCommentCount)
      return b.ttCommentCount - a.ttCommentCount;
    if (b.score !== a.score) return b.score - a.score;
    if (b.igPct !== a.igPct) return b.igPct - a.igPct;
    if (b.ttPct !== a.ttPct) return b.ttPct - a.ttPct;
    if (b.totalPersonil !== a.totalPersonil) {
      return b.totalPersonil - a.totalPersonil;
    }
    return a.name.localeCompare(b.name, "id-ID", { sensitivity: "base" });
  });

  return {
    clientId: normalizedClientId,
    clientName: client.nama || clientIdStr,
    roleName,
    entries,
    totals,
    igPostsCount: totalIgPosts,
    ttPostsCount: totalTtPosts,
    periodInfo,
  };
}

export async function saveEngagementRankingExcel({
  clientId,
  roleFlag = null,
  period = "today",
  startDate: customStart,
  endDate: customEnd,
} = {}) {
  const {
    clientName,
    entries,
    totals,
    igPostsCount,
    ttPostsCount,
    periodInfo,
  } = await collectEngagementRanking(clientId, roleFlag, {
    period,
    startDate: customStart,
    endDate: customEnd,
  });

  const now = new Date();
  const hari = hariIndo[now.getDay()] || now.toLocaleDateString("id-ID", { weekday: "long" });
  const tanggal = now.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const jam = String(now.getHours()).padStart(2, "0");
  const menit = String(now.getMinutes()).padStart(2, "0");
  const waktuPengambilan = `${jam}.${menit}`;

  const aoa = [
    [`Rekap Ranking Engagement ${(clientName || "").toUpperCase()}`],
    [periodInfo.label || `Hari, Tanggal: ${hari}, ${tanggal}`],
    [`Jam Pengambilan Data: ${waktuPengambilan}`],
    [`Jumlah Post Instagram: ${igPostsCount}`],
    [`Jumlah Post TikTok: ${ttPostsCount}`],
    [],
    [
      "NAMA SATKER",
      "JUMLAH PERSONIL",
      "INSTAGRAM",
      null,
      null,
      "TIKTOK",
      null,
      null,
    ],
    [
      null,
      null,
      "SUDAH",
      "BELUM",
      "USERNAME KOSONG",
      "SUDAH",
      "BELUM",
      "USERNAME KOSONG",
    ],
  ];

  entries.forEach((entry, idx) => {
    aoa.push([
      `${idx + 1}. ${entry.name}`,
      entry.totalPersonil,
      entry.igSudah,
      entry.igBelum,
      entry.igKosong,
      entry.ttSudah,
      entry.ttBelum,
      entry.ttKosong,
    ]);
  });

  aoa.push([
    "TOTAL",
    totals.totalPersonil,
    totals.igSudah,
    totals.igBelum,
    totals.igKosong,
    totals.ttSudah,
    totals.ttBelum,
    totals.ttKosong,
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 7 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 7 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 7 } },
    { s: { r: 6, c: 0 }, e: { r: 7, c: 0 } },
    { s: { r: 6, c: 1 }, e: { r: 7, c: 1 } },
    { s: { r: 6, c: 2 }, e: { r: 6, c: 4 } },
    { s: { r: 6, c: 5 }, e: { r: 6, c: 7 } },
  ];
  worksheet["!freeze"] = { xSplit: 0, ySplit: 8 };

  const columnCount = 8;
  const tableHeaderRows = [6, 7];
  const dataStartRow = 8;
  const totalRow = dataStartRow + entries.length;
  const tableEndRow = totalRow;

  function columnToLetters(col) {
    let dividend = col + 1;
    let columnName = "";
    while (dividend > 0) {
      const modulo = (dividend - 1) % 26;
      columnName = String.fromCharCode(65 + modulo) + columnName;
      dividend = Math.floor((dividend - modulo) / 26);
    }
    return columnName;
  }

  function cellAddress(row, col) {
    return `${columnToLetters(col)}${row + 1}`;
  }

  function ensureCell(sheet, row, col) {
    const address = cellAddress(row, col);
    if (!sheet[address]) {
      sheet[address] = { t: "s", v: "" };
    }
    return sheet[address];
  }

  const mediumBorder = { style: "medium", color: { rgb: "000000" } };
  const thinBorder = { style: "thin", color: { rgb: "000000" } };
  const headerFill = { patternType: "solid", fgColor: { rgb: "D9D9D9" } };
  const zebraFill = { patternType: "solid", fgColor: { rgb: "F5F5F5" } };

  const headerBottomRow = tableHeaderRows[tableHeaderRows.length - 1];

  for (let row = 0; row <= 4; row += 1) {
    const cell = ensureCell(worksheet, row, 0);
    const style = { ...(cell.s || {}) };
    style.font = { ...(style.font || {}), bold: true };
    style.alignment = {
      ...(style.alignment || {}),
      horizontal: "center",
      vertical: "center",
      wrapText: true,
    };
    cell.s = style;
  }

  for (let row = 6; row <= tableEndRow; row += 1) {
    for (let col = 0; col < columnCount; col += 1) {
      const cell = ensureCell(worksheet, row, col);
      const style = { ...(cell.s || {}) };
      style.border = {
        top: mediumBorder,
        bottom: mediumBorder,
        left: mediumBorder,
        right: mediumBorder,
      };

      if (tableHeaderRows.includes(row)) {
        style.font = { ...(style.font || {}), bold: true };
        style.alignment = {
          horizontal: "center",
          vertical: "center",
          wrapText: true,
        };
        style.fill = headerFill;
      } else if (row >= dataStartRow && row < totalRow && (row - dataStartRow) % 2 === 1) {
        style.fill = zebraFill;
      }

      cell.s = style;
    }
  }

  const columnWidths = Array.from({ length: columnCount }, () => 10);
  aoa.forEach((row) => {
    row.forEach((value, colIdx) => {
      if (colIdx >= columnCount) return;
      let cellText = "";
      if (value === null || typeof value === "undefined") {
        cellText = "";
      } else if (typeof value === "object") {
        if (value && typeof value.v !== "undefined") {
          cellText = String(value.v ?? "");
        } else if (value && typeof value.f !== "undefined") {
          cellText = String(value.f ?? "");
        } else if (value && typeof value.w !== "undefined") {
          cellText = String(value.w ?? "");
        }
      } else {
        cellText = String(value);
      }
      columnWidths[colIdx] = Math.max(columnWidths[colIdx], cellText.length + 2);
    });
  });
  worksheet["!cols"] = columnWidths.map((width) => ({ wch: Math.min(Math.max(width, 12), 40) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Ranking Engagement");

  await mkdir(EXPORT_DIR, { recursive: true });
  const dateLabel = now.toISOString().slice(0, 10);
  const timeLabel = `${jam}${menit}`;
  const clientSlug = sanitizeFilename(clientName || clientId || "Direktorat");
  const periodSlug = sanitizeFilename(
    periodInfo.fileLabel || periodInfo.description || periodInfo.period
  );
  const fileName = `${clientSlug}_Rekap_Ranking_Engagement_${periodSlug}_${dateLabel}_${timeLabel}.xlsx`;
  const filePath = path.join(EXPORT_DIR, fileName);

  XLSX.writeFile(workbook, filePath, { cellStyles: true });
  return { filePath, fileName };
}

export default saveEngagementRankingExcel;
