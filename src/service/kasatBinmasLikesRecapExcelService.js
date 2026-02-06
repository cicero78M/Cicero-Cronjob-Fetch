import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path, { basename } from "path";
import XLSX from "xlsx";
import { getRekapLikesByClient } from "../model/instaLikeModel.js";
import { getUsersByClient } from "../model/userModel.js";
import { formatNama } from "../utils/utilsHelper.js";
import { sendWAFile, safeSendMessage } from "../utils/waHelper.js";
import { matchesKasatBinmasJabatan } from "./kasatkerAttendanceService.js";
import {
  describeKasatBinmasLikesPeriod,
} from "./kasatBinmasLikesRecapService.js";
import { 
  getPositionIndex, 
  getRankIndex 
} from "../utils/sortingHelper.js";

const DITBINMAS_CLIENT_ID = "DITBINMAS";
const TARGET_ROLE = "ditbinmas";
const EXPORT_DIR = path.resolve("export_data/dirrequest");
const EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_KASAT_USERS = 500;

function sanitizeLabel(label) {
  return String(label || "").replace(/\s+/g, "_").replace(/[^\w\-]+/g, "-");
}

function buildFilename(periodLabel) {
  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace(/T/, "_")
    .slice(0, 19);
  const safeLabel = sanitizeLabel(periodLabel);
  return `Rekap_Likes_Kasat_Binmas_${safeLabel}_${stamp}.xlsx`;
}

function sortByLikes(entries) {
  return entries.slice().sort((a, b) => {
    const likeDiff = (b.totalLikes || 0) - (a.totalLikes || 0);
    if (likeDiff !== 0) return likeDiff;
    
    // Sort by position (jabatan) first
    const positionDiff = getPositionIndex(a.jabatan) - getPositionIndex(b.jabatan);
    if (positionDiff !== 0) return positionDiff;
    
    // Then sort by rank (pangkat)
    const rankDiff = getRankIndex(a.title) - getRankIndex(b.title);
    if (rankDiff !== 0) return rankDiff;
    
    // Finally sort by name
    const nameA = a.displayName || "";
    const nameB = b.displayName || "";
    return nameA.localeCompare(nameB, "id-ID", { sensitivity: "base" });
  });
}

function buildWorksheetRows(entries, periodLabel) {
  const header = ["Polres", "Pangkat dan Nama", "Total Likes"];
  const sorted = sortByLikes(entries);
  const dataRows = sorted.map((entry) => [
    entry.polres,
    entry.displayName,
    entry.totalLikes,
  ]);

  const aoa = [
    ["Rekap Likes Instagram Kasat Binmas (Excel)"],
    [`Periode: ${periodLabel}`],
    [],
    header,
    ...dataRows,
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = header.map((_, idx) => {
    const colValues = dataRows.map((row) => String(row[idx] ?? ""));
    const maxLength = Math.max(colValues.reduce((m, v) => Math.max(m, v.length), 0), header[idx].length);
    return { wch: maxLength + 2 };
  });

  return ws;
}

export async function generateKasatBinmasLikesRecapExcel({
  period = "daily",
  referenceDate,
} = {}) {
  const periodInfo = describeKasatBinmasLikesPeriod(period, referenceDate);
  const users = await getUsersByClient(DITBINMAS_CLIENT_ID, TARGET_ROLE);
  const kasatUsers = (users || []).filter((user) => matchesKasatBinmasJabatan(user?.jabatan));

  if (!kasatUsers.length) {
    return {
      filePath: null,
      periodLabel: periodInfo.label,
      totalKonten: 0,
      message: `Belum ada data Kasat Binmas untuk periode ${periodInfo.label}.`,
    };
  }
  if (kasatUsers.length > MAX_KASAT_USERS) {
    return {
      filePath: null,
      periodLabel: periodInfo.label,
      totalKonten: 0,
      message: `Data Kasat Binmas terlalu besar untuk dikirim (maksimal ${MAX_KASAT_USERS} baris). Silakan persempit periode atau filter data.`,
    };
  }

  const { rows, totalKonten } = await getRekapLikesByClient(
    DITBINMAS_CLIENT_ID,
    periodInfo.type,
    periodInfo.tanggal,
    periodInfo.startDate,
    periodInfo.endDate,
    TARGET_ROLE
  );

  if (!Number(totalKonten)) {
    return {
      filePath: null,
      periodLabel: periodInfo.label,
      totalKonten: 0,
      message: `Belum ada konten Instagram Kasat Binmas untuk periode ${periodInfo.label}.`,
    };
  }

  const likeMap = new Map();
  (rows || []).forEach((row) => {
    if (!row) return;
    likeMap.set(row.user_id, Number(row.jumlah_like) || 0);
  });

  const entries = kasatUsers.map((user) => {
    const displayName = formatNama(user) || "(Tanpa Nama)";
    const polres = user?.client_name || user?.client_id || "-";
    return {
      polres,
      displayName,
      title: user?.title,
      jabatan: user?.jabatan,
      totalLikes: likeMap.get(user.user_id) || 0,
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = buildWorksheetRows(entries, periodInfo.label);
  XLSX.utils.book_append_sheet(wb, ws, "Rekap");

  await mkdir(EXPORT_DIR, { recursive: true });
  const filePath = path.join(EXPORT_DIR, buildFilename(periodInfo.label));
  const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
  await writeFile(filePath, buffer);

  return { filePath, periodLabel: periodInfo.label, totalKonten: Number(totalKonten) || 0 };
}

export async function sendKasatBinmasLikesRecapExcel({
  period = "daily",
  referenceDate,
  chatId,
  waClient,
} = {}) {
  let filePath;
  let periodLabel;

  try {
    const {
      filePath: generatedPath,
      periodLabel: generatedLabel,
      message,
    } = await generateKasatBinmasLikesRecapExcel({ period, referenceDate });
    filePath = generatedPath;
    periodLabel = generatedLabel;
    if (!filePath) {
      await safeSendMessage(
        waClient,
        chatId,
        message || "Belum ada konten Instagram Kasat Binmas untuk periode yang dipilih."
      );
      return { success: true, empty: true, periodLabel };
    }
    const buffer = await readFile(filePath);
    await sendWAFile(
      waClient,
      buffer,
      basename(filePath),
      chatId,
      EXCEL_MIME
    );
    await safeSendMessage(
      waClient,
      chatId,
      `✅ File rekap likes Kasat Binmas (${periodLabel}) dikirim.`
    );
    return { success: true, periodLabel };
  } catch (error) {
    console.error(
      "[submenu 44] Gagal mengirim rekap Likes Kasat Binmas (Excel):",
      error
    );
    const msg =
      error?.message &&
      (error.message.includes("direktorat") ||
        error.message.includes("Client tidak ditemukan") ||
        error.message.includes("Tidak ada data"))
        ? error.message
        : "❌ Gagal mengirim rekap Likes Kasat Binmas (Excel). Silakan coba lagi.";
    try {
      await safeSendMessage(waClient, chatId, msg);
    } catch (sendError) {
      console.error(
        "[submenu 44] Gagal mengirim pesan error rekap Likes Kasat Binmas (Excel):",
        sendError
      );
    }
    return { success: false, error };
  } finally {
    if (filePath) {
      try {
        await unlink(filePath);
      } catch (err) {
        console.error("Gagal menghapus file sementara rekap likes Kasat Binmas:", err);
      }
    }
  }
}

export default {
  generateKasatBinmasLikesRecapExcel,
  sendKasatBinmasLikesRecapExcel,
};
