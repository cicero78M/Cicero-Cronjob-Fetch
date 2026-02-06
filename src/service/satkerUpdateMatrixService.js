import { mkdir } from "fs/promises";
import path from "path";
import XLSX from "xlsx";
import { getUsersSocialByClient, getClientsByRole } from "../model/userModel.js";
import { findClientById } from "./clientService.js";
import { getSatkerDspCount } from "../data/satkerDspMap.js";

const DIRECTORATE_ROLES = ["ditbinmas", "ditlantas", "bidhumas"];

function normalizeClientId(value) {
  return String(value || "").trim().toLowerCase();
}

function buildUserKey(cid, user) {
  const normalizedCid = normalizeClientId(cid);
  const rawUserId = String(user?.user_id ?? "").trim();
  if (rawUserId) {
    return `${normalizedCid}#${rawUserId.toLowerCase()}`;
  }

  const name = String(user?.nama ?? "").trim().toLowerCase();
  const title = String(user?.title ?? "").trim().toLowerCase();
  const division = String(user?.divisi ?? "").trim().toLowerCase();

  if (name || title || division) {
    return `${normalizedCid}#${name}#${title}#${division}`;
  }

  return null;
}

function createEmptyGroup() {
  return {
    users: new Set(),
    instaUsers: new Set(),
    tiktokUsers: new Set(),
    completeUsers: new Set(),
  };
}

function sanitizeFilename(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toPercent(numerator, denominator) {
  if (!denominator) {
    return 0;
  }
  return Number(((numerator / denominator) * 100).toFixed(2));
}

export async function collectSatkerUpdateMatrix(clientId, roleFlag = null) {
  const clientIdStr = String(clientId || "").trim();
  if (!clientIdStr) {
    throw new Error("Client tidak ditemukan.");
  }

  const normalizedClientId = normalizeClientId(clientIdStr);
  const client = await findClientById(normalizedClientId);
  if (!client) {
    throw new Error("Client tidak ditemukan.");
  }

  const filterRole = DIRECTORATE_ROLES.includes(roleFlag?.toLowerCase())
    ? roleFlag
    : null;

  const clientType = client.client_type?.toLowerCase();
  const isDirektoratView =
    clientType === "direktorat" ||
    DIRECTORATE_ROLES.includes(normalizedClientId) ||
    (filterRole && DIRECTORATE_ROLES.includes(filterRole.toLowerCase()));

  if (!isDirektoratView) {
    throw new Error("Menu ini hanya tersedia untuk direktorat.");
  }

  const users = await getUsersSocialByClient(clientIdStr, filterRole);
  const groups = new Map();

  users.forEach((user) => {
    const cid = normalizeClientId(user.client_id);
    if (!cid) return;

    const userKey = buildUserKey(cid, user);
    if (!userKey) return;

    if (!groups.has(cid)) {
      groups.set(cid, createEmptyGroup());
    }

    const stat = groups.get(cid);
    stat.users.add(userKey);
    if (user.insta) stat.instaUsers.add(userKey);
    if (user.tiktok) stat.tiktokUsers.add(userKey);
    if (stat.instaUsers.has(userKey) && stat.tiktokUsers.has(userKey)) {
      stat.completeUsers.add(userKey);
    }
  });

  const roleName = (filterRole || clientIdStr).toLowerCase();
  const clientIdsFromRole = (await getClientsByRole(roleName)) || [];
  const normalizedRoleClientIds = clientIdsFromRole
    .map((id) => normalizeClientId(id))
    .filter(Boolean);
  const allIds = new Set([
    normalizedClientId,
    ...normalizedRoleClientIds,
    ...groups.keys(),
  ]);

  const stats = await Promise.all(
    [...allIds].map(async (cid) => {
      const normalizedCid = normalizeClientId(cid);
      const statSets = groups.get(normalizedCid) || createEmptyGroup();
      const clientInfo = await findClientById(normalizedCid);
      const displayName = (clientInfo?.nama || normalizedCid || "-").toUpperCase();
      const jumlahDsp = getSatkerDspCount(clientInfo?.nama, normalizedCid);
      const total = statSets.users.size;
      const instaFilled = statSets.instaUsers.size;
      const tiktokFilled = statSets.tiktokUsers.size;
      const completeFilled = statSets.completeUsers.size;
      const instaEmpty = Math.max(total - instaFilled, 0);
      const tiktokEmpty = Math.max(total - tiktokFilled, 0);
      return {
        cid: normalizedCid,
        name: displayName,
        jumlahDsp,
        total,
        instaFilled,
        instaEmpty,
        instaPercent: toPercent(instaFilled, total),
        tiktokFilled,
        tiktokEmpty,
        tiktokPercent: toPercent(tiktokFilled, total),
        completeFilled,
        completeEmpty: Math.max(total - completeFilled, 0),
        completePercent: toPercent(completeFilled, total),
      };
    })
  );

  const primary = stats.find((s) => s.cid === normalizedClientId);
  const others = stats
    .filter((s) => s.cid !== normalizedClientId)
    .sort((a, b) => {
      if (b.instaPercent !== a.instaPercent) return b.instaPercent - a.instaPercent;
      if (b.tiktokPercent !== a.tiktokPercent) return b.tiktokPercent - a.tiktokPercent;
      if (b.total !== a.total) return b.total - a.total;
      return a.name.localeCompare(b.name, "id-ID", { sensitivity: "base" });
    });

  const orderedStats = primary ? [primary, ...others] : others;

  const totals = orderedStats.reduce(
    (acc, item) => {
      acc.total += item.total;
      acc.instaFilled += item.instaFilled;
      acc.instaEmpty += item.instaEmpty;
      acc.tiktokFilled += item.tiktokFilled;
      acc.tiktokEmpty += item.tiktokEmpty;
      acc.completeFilled += item.completeFilled;
      acc.completeEmpty += item.completeEmpty;
      return acc;
    },
    {
      total: 0,
      instaFilled: 0,
      instaEmpty: 0,
      tiktokFilled: 0,
      tiktokEmpty: 0,
      completeFilled: 0,
      completeEmpty: 0,
    }
  );

  const totalsWithPercentages = {
    ...totals,
    instaPercent: toPercent(totals.instaFilled, totals.total),
    tiktokPercent: toPercent(totals.tiktokFilled, totals.total),
    completePercent: toPercent(totals.completeFilled, totals.total),
    platforms: {
      instagram: {
        filled: totals.instaFilled,
        empty: totals.instaEmpty,
        percent: toPercent(totals.instaFilled, totals.total),
      },
      tiktok: {
        filled: totals.tiktokFilled,
        empty: totals.tiktokEmpty,
        percent: toPercent(totals.tiktokFilled, totals.total),
      },
      complete: {
        filled: totals.completeFilled,
        empty: totals.completeEmpty,
        percent: toPercent(totals.completeFilled, totals.total),
      },
    },
  };

  return {
    clientName: client.nama || clientIdStr.toUpperCase(),
    clientId: normalizedClientId,
    stats: orderedStats,
    totals: totalsWithPercentages,
  };
}

const MIN_COL_WIDTH = 10;
const MAX_COL_WIDTH = 60;
const COLUMN_PADDING = 2;

function createRowWithSpan(text, columnCount) {
  return [text, ...Array(Math.max(columnCount - 1, 0)).fill(null)];
}

function calculateColumnWidths(matrix) {
  const maxLengths = new Array(matrix[0]?.length || 0).fill(0);
  matrix.forEach((row) => {
    row.forEach((value, columnIndex) => {
      const cellValue = value == null ? "" : String(value);
      maxLengths[columnIndex] = Math.max(maxLengths[columnIndex], cellValue.length);
    });
  });
  return maxLengths.map((length) => ({
    wch: Math.min(
      Math.max(length + COLUMN_PADDING, MIN_COL_WIDTH),
      MAX_COL_WIDTH
    ),
  }));
}

export async function saveSatkerUpdateMatrixExcel({
  clientId,
  roleFlag = null,
  username = "",
} = {}) {
  const { stats, clientName } = await collectSatkerUpdateMatrix(clientId, roleFlag);
  if (!stats.length) {
    throw new Error("Tidak ada data satker untuk direkap.");
  }

  const now = new Date();
  const formatter = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "full",
    timeStyle: "medium",
    timeZone: "Asia/Jakarta",
  });
  const formattedPeriod = formatter.format(now);
  const trimmedUsername = String(username || "").trim();

  const headerRow1 = [
    "Satker",
    "Jumlah DSP",
    "Jumlah Personil",
    "Data Update Instagram",
    null,
    "Data Update Tiktok",
    null,
  ];
  const headerRow2 = [
    null,
    null,
    null,
    "Sudah",
    "Belum",
    "Sudah",
    "Belum",
  ];

  const rows = stats.map((item) => [
    item.name,
    item.jumlahDsp ?? null,
    item.total,
    item.instaFilled,
    item.instaEmpty,
    item.tiktokFilled,
    item.tiktokEmpty,
  ]);

  const columnCount = headerRow1.length;
  const narrativeRows = [
    createRowWithSpan(
      `Rekap Matriks Update Satker ${String(clientName || clientId).toUpperCase()}`,
      columnCount
    ),
    createRowWithSpan(`Periode: ${formattedPeriod}`, columnCount),
  ];

  if (trimmedUsername) {
    narrativeRows.push(
      createRowWithSpan(`Disusun oleh: ${trimmedUsername}`, columnCount)
    );
  }

  const blankRow = Array(columnCount).fill(null);
  const matrix = [...narrativeRows, blankRow, headerRow1, headerRow2, ...rows];

  const worksheet = XLSX.utils.aoa_to_sheet(matrix);
  const headerOffset = narrativeRows.length + 1;
  const merges = narrativeRows.map((_, index) => ({
    s: { r: index, c: 0 },
    e: { r: index, c: columnCount - 1 },
  }));

  merges.push(
    { s: { r: headerOffset, c: 0 }, e: { r: headerOffset + 1, c: 0 } },
    { s: { r: headerOffset, c: 1 }, e: { r: headerOffset + 1, c: 1 } },
    { s: { r: headerOffset, c: 2 }, e: { r: headerOffset + 1, c: 2 } },
    { s: { r: headerOffset, c: 3 }, e: { r: headerOffset, c: 4 } },
    { s: { r: headerOffset, c: 5 }, e: { r: headerOffset, c: 6 } }
  );

  worksheet["!merges"] = merges;
  worksheet["!cols"] = calculateColumnWidths(matrix);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap");

  const exportDir = path.resolve("export_data/satker_update_matrix");
  await mkdir(exportDir, { recursive: true });

  const dateLabel = now.toISOString().slice(0, 10);
  const safeUsername = sanitizeFilename(trimmedUsername);
  const fileName = `Ditbinmas_Satker_Update_Rank_${dateLabel}${
    safeUsername ? `_${safeUsername}` : ""
  }.xlsx`;
  const filePath = path.join(exportDir, fileName);

  XLSX.writeFile(workbook, filePath);
  return { filePath, fileName };
}

export default saveSatkerUpdateMatrixExcel;
