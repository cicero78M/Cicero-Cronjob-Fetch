import { mkdir, readFile, unlink } from "fs/promises";
import path, { basename } from "path";
import XLSX from "xlsx";
import { getRekapKomentarByClient } from "../model/tiktokCommentModel.js";
import { getUsersByClient } from "../model/userModel.js";
import { formatNama } from "../utils/utilsHelper.js";
import { sendWAFile } from "../utils/waHelper.js";
import { matchesKasatBinmasJabatan } from "./kasatkerAttendanceService.js";
import { describeKasatBinmasTiktokCommentPeriod } from "./kasatBinmasTiktokCommentRecapService.js";
import { 
  getPositionIndex, 
  getRankIndex 
} from "../utils/sortingHelper.js";

const DITBINMAS_CLIENT_ID = "DITBINMAS";
const TARGET_ROLE = "ditbinmas";
const EXPORT_DIR = path.resolve("export_data/dirrequest");
const EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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
  return `Rekap_Komentar_TikTok_Kasat_Binmas_${safeLabel}_${stamp}.xlsx`;
}

function sortByComments(entries) {
  return entries.slice().sort((a, b) => {
    const commentDiff = (b.totalComments || 0) - (a.totalComments || 0);
    if (commentDiff !== 0) return commentDiff;
    
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
  const header = ["Polres", "Pangkat dan Nama", "Total Komentar"];
  const sorted = sortByComments(entries);
  const dataRows = sorted.map((entry) => [
    entry.polres,
    entry.displayName,
    entry.totalComments,
  ]);

  const aoa = [
    ["Rekap Komentar TikTok Kasat Binmas (Excel)"],
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

export async function generateKasatBinmasTiktokCommentRecapExcel({
  period = "daily",
  referenceDate,
} = {}) {
  const periodInfo = describeKasatBinmasTiktokCommentPeriod(period, referenceDate);
  const users = await getUsersByClient(DITBINMAS_CLIENT_ID, TARGET_ROLE);
  const kasatUsers = (users || []).filter((user) => matchesKasatBinmasJabatan(user?.jabatan));

  if (!kasatUsers.length) {
    const totalUsers = users?.length || 0;
    throw new Error(
      `Dari ${totalUsers} user aktif ${DITBINMAS_CLIENT_ID} (${TARGET_ROLE}), tidak ditemukan data Kasat Binmas.`
    );
  }

  const recapRows = await getRekapKomentarByClient(
    DITBINMAS_CLIENT_ID,
    periodInfo.periode,
    periodInfo.tanggal,
    periodInfo.startDate,
    periodInfo.endDate,
    TARGET_ROLE
  );

  const commentMap = new Map();
  const totalKonten = Number(recapRows?.[0]?.total_konten ?? 0);
  (recapRows || []).forEach((row) => {
    if (!row) return;
    commentMap.set(row.user_id, Number(row.jumlah_komentar) || 0);
  });

  const entries = kasatUsers.map((user) => {
    const displayName = formatNama(user) || "(Tanpa Nama)";
    const polres = user?.client_name || user?.client_id || "-";
    return {
      polres,
      displayName,
      title: user?.title,
      jabatan: user?.jabatan,
      totalComments: commentMap.get(user.user_id) || 0,
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = buildWorksheetRows(entries, periodInfo.label);
  XLSX.utils.book_append_sheet(wb, ws, "Rekap");

  await mkdir(EXPORT_DIR, { recursive: true });
  const filePath = path.join(EXPORT_DIR, buildFilename(periodInfo.label));
  XLSX.writeFile(wb, filePath);

  return { filePath, periodLabel: periodInfo.label, totalKonten };
}

export async function sendKasatBinmasTiktokCommentRecapExcel({
  period = "daily",
  referenceDate,
  chatId,
  waClient,
} = {}) {
  let filePath;
  const { filePath: generatedPath, periodLabel } =
    await generateKasatBinmasTiktokCommentRecapExcel({ period, referenceDate });
  filePath = generatedPath;

  try {
    const buffer = await readFile(filePath);
    await sendWAFile(
      waClient,
      buffer,
      basename(filePath),
      chatId,
      EXCEL_MIME
    );
    await waClient.sendMessage(
      chatId,
      `✅ File rekap komentar TikTok Kasat Binmas (${periodLabel}) dikirim.`
    );
    return { periodLabel };
  } finally {
    if (filePath) {
      try {
        await unlink(filePath);
      } catch (err) {
        console.error("Gagal menghapus file sementara rekap komentar TikTok Kasat Binmas:", err);
      }
    }
  }
}

export default {
  generateKasatBinmasTiktokCommentRecapExcel,
  sendKasatBinmasTiktokCommentRecapExcel,
};
