import { getRekapLikesByClient } from "../model/instaLikeModel.js";
import { getUsersByClient } from "../model/userModel.js";
import { formatNama } from "../utils/utilsHelper.js";
import { matchesKasatBinmasJabatan } from "./kasatkerAttendanceService.js";
import { 
  getPositionIndex, 
  getRankIndex 
} from "../utils/sortingHelper.js";

const DITBINMAS_CLIENT_ID = "DITBINMAS";
const TARGET_ROLE = "ditbinmas";

const STATUS_SECTIONS = [
  { key: "lengkap", icon: "✅", label: "Melaksanakan Lengkap" },
  { key: "kurang", icon: "⚠️", label: "Melaksanakan Sebagian" },
  { key: "belum", icon: "❌", label: "Belum Melaksanakan" },
  { key: "noUsername", icon: "⚠️❌", label: "Belum Update Username Instagram" },
];

function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLong(date) {
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatDayLabel(date) {
  const weekday = date.toLocaleDateString("id-ID", { weekday: "long" });
  return `${weekday}, ${formatDateLong(date)}`;
}

function resolveWeeklyRange(baseDate = new Date()) {
  const date = new Date(baseDate.getTime());
  const day = date.getDay(); // 0=Sunday
  const mondayDiff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date.getTime());
  monday.setDate(date.getDate() + mondayDiff);
  const sunday = new Date(monday.getTime());
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday,
    end: sunday,
    label: `${formatDayLabel(monday)} s.d. ${formatDayLabel(sunday)}`,
  };
}

export function describeKasatBinmasLikesPeriod(period = "daily", referenceDate) {
  const baseDate = referenceDate ? new Date(referenceDate) : new Date();
  const today = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate;
  if (period === "weekly") {
    const { start, end, label } = resolveWeeklyRange(today);
    return {
      type: "harian",
      label,
      startDate: toDateInput(start),
      endDate: toDateInput(end),
      title: "Mingguan",
    };
  }
  if (period === "monthly") {
    const label = today.toLocaleDateString("id-ID", {
      month: "long",
      year: "numeric",
    });
    return {
      type: "bulanan",
      label: `Bulan ${label}`,
      tanggal: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
        2,
        "0"
      )}`,
      title: "Bulanan",
    };
  }
  return {
    type: "harian",
    label: formatDayLabel(today),
    tanggal: toDateInput(today),
    title: "Harian",
  };
}

function formatUserEntry(user, count, totalKonten) {
  const name = formatNama(user) || "(Tanpa Nama)";
  const polres = (user?.client_name || user?.client_id || "-").toUpperCase();
  if (!user?.insta) {
    return `${name} (${polres}) — Username IG belum tersedia`;
  }
  if (totalKonten === 0) {
    return `${name} (${polres}) — Belum ada konten untuk di-like`;
  }
  return `${name} (${polres}) — ${count}/${totalKonten} konten`;
}

function groupKasatByStatus(kasatList, likeCounts, totalKonten) {
  const totals = { total: kasatList.length, lengkap: 0, kurang: 0, belum: 0, noUsername: 0 };
  const grouped = { lengkap: [], kurang: [], belum: [], noUsername: [] };

  kasatList.forEach((user) => {
    let status = "noUsername";
    let count = 0;
    if (user?.insta) {
      const userCount = Number(likeCounts.get(user.user_id)) || 0;
      count = userCount;
      if (totalKonten > 0) {
        if (userCount >= totalKonten) status = "lengkap";
        else if (userCount > 0) status = "kurang";
        else status = "belum";
      } else {
        status = "belum";
      }
    }

    totals[status] += 1;
    grouped[status].push({ user, count });
  });

  return { totals, grouped };
}

function sortKasatList(entries) {
  return entries.slice().sort((a, b) => {
    const countDiff = (b.count || 0) - (a.count || 0);
    if (countDiff !== 0) return countDiff;
    
    // Sort by position (jabatan) first
    const positionDiff = getPositionIndex(a.user?.jabatan) - getPositionIndex(b.user?.jabatan);
    if (positionDiff !== 0) return positionDiff;
    
    // Then sort by rank (pangkat)
    const rankDiff = getRankIndex(a.user?.title) - getRankIndex(b.user?.title);
    if (rankDiff !== 0) return rankDiff;
    
    // Finally sort by name
    const nameA = formatNama(a.user) || "";
    const nameB = formatNama(b.user) || "";
    return nameA.localeCompare(nameB, "id-ID", { sensitivity: "base" });
  });
}

export async function generateKasatBinmasLikesRecap({
  period = "daily",
  referenceDate,
} = {}) {
  const periodInfo = describeKasatBinmasLikesPeriod(period, referenceDate);

  const users = await getUsersByClient(DITBINMAS_CLIENT_ID, TARGET_ROLE);
  const kasatUsers = (users || []).filter((user) =>
    matchesKasatBinmasJabatan(user?.jabatan)
  );

  if (!kasatUsers.length) {
    const totalUsers = users?.length || 0;
    return `Dari ${totalUsers} user aktif ${DITBINMAS_CLIENT_ID} (${TARGET_ROLE}), tidak ditemukan data Kasat Binmas.`;
  }

  const { rows, totalKonten: totalKontenRaw } = await getRekapLikesByClient(
    DITBINMAS_CLIENT_ID,
    periodInfo.type,
    periodInfo.tanggal,
    periodInfo.startDate,
    periodInfo.endDate,
    TARGET_ROLE
  );
  const totalKonten = Number(totalKontenRaw) || 0;
  const likeCounts = new Map();
  (rows || []).forEach((row) => {
    if (!row) return;
    likeCounts.set(row.user_id, Number(row.jumlah_like) || 0);
  });

  if (totalKonten === 0) {
    return [
      "📋 *Absensi Likes Kasat Binmas*",
      `Periode: ${periodInfo.label}`,
      "",
      "Belum ada konten Instagram Ditbinmas pada periode ini untuk diabsen.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const { totals, grouped } = groupKasatByStatus(kasatUsers, likeCounts, totalKonten);

  const sectionsText = STATUS_SECTIONS.map(({ key, icon, label }) => {
    const entries = sortKasatList(grouped[key] || []);
    const header = `${icon} *${label} (${entries.length} pers)*`;
    if (!entries.length) {
      return `${header}\n  - Tidak ada data`;
    }
    const list = entries
      .map(
        (entry, idx) =>
          `  ${idx + 1}. ${formatUserEntry(entry.user, entry.count, totalKonten)}`
      )
      .join("\n");
    return `${header}\n${list}`;
  }).join("\n\n");

  const summaryLines = [
    "📋 *Absensi Likes Kasat Binmas*",
    "",
    `🗓️ Periode: ${periodInfo.label}`,
    `📈 Total konten periode ini: ${totalKonten}`,
    `👥 Total Kasat Binmas: ${totals.total} pers`,
    "",
    "📊 Distribusi Status:",
    `  ✅ Lengkap: ${totals.lengkap} pers`,
    `  ⚠️ Sebagian: ${totals.kurang} pers`,
    `  ❌ Belum: ${totals.belum} pers`,
    `  ⚠️❌ Belum update username IG: ${totals.noUsername} pers`,
    "",
    sectionsText,
  ];

  return summaryLines.filter(Boolean).join("\n");
}

export default { generateKasatBinmasLikesRecap };
