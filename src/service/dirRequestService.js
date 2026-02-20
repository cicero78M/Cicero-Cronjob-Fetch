import { getUsersSocialByClient, getClientsByRole } from "../model/userModel.js";
import {
  absensiLikes,
  lapharDitbinmas,
  absensiLikesDitbinmasReport,
  collectLikesRecap,
  absensiLikesDitbinmasSimple as absensiLikesDitbinmasSimpleReport,
} from "../handler/fetchabsensi/insta/absensiLikesInsta.js";
import {
  lapharTiktokDitbinmas,
  collectKomentarRecap,
  absensiKomentarDitbinmasReport,
  absensiKomentar,
  absensiKomentarDitbinmasSimple as absensiKomentarDitbinmasSimpleReport,
} from "../handler/fetchabsensi/tiktok/absensiKomentarTiktok.js";
import { absensiRegistrasiDashboardDirektorat } from "../handler/fetchabsensi/dashboard/absensiRegistrasiDashboardDirektorat.js";
import { findClientById } from "./clientService.js";
import { getGreeting, sortDivisionKeys, formatNama } from "../utils/utilsHelper.js";
import { sendWAFile, safeSendMessage, sendWithClientFallback } from "../utils/waHelper.js";
import { writeFile, mkdir, readFile, unlink, stat } from "fs/promises";
import { join, basename } from "path";
import {
  saveLikesRecapExcel,
  saveLikesRecapPerContentExcel,
} from "./likesRecapExcelService.js";
import {
  saveCommentRecapExcel,
  saveCommentRecapPerContentExcel,
} from "./commentRecapExcelService.js";
import { saveWeeklyLikesRecapExcel } from "./weeklyLikesRecapExcelService.js";
import { saveWeeklyCommentRecapExcel } from "./weeklyCommentRecapExcelService.js";
import { generateWeeklyInstagramHighLowReport } from "./weeklyInstagramHighLowService.js";
import { generateWeeklyTiktokHighLowReport } from "./weeklyTiktokHighLowService.js";
import { saveMonthlyLikesRecapExcel } from "./monthlyLikesRecapExcelService.js";
import { saveSatkerUpdateMatrixExcel } from "./satkerUpdateMatrixService.js";
import { saveEngagementRankingExcel } from "./engagementRankingExcelService.js";
import { generateKasatkerReport } from "./kasatkerReportService.js";
import { generateKasatkerAttendanceSummary } from "./kasatkerAttendanceService.js";
import { generateKasatBinmasLikesRecap } from "./kasatBinmasLikesRecapService.js";
import { sendKasatBinmasLikesRecapExcel } from "./kasatBinmasLikesRecapExcelService.js";
import { sendKasatBinmasTiktokCommentRecapExcel } from "./kasatBinmasTiktokCommentRecapExcelService.js";
import {
  generateKasatBinmasTiktokCommentRecap,
  resolveBaseDate,
} from "./kasatBinmasTiktokCommentRecapService.js";
import { hariIndo } from "../utils/constants.js";
import { fetchInstagramInfo } from "./instaRapidService.js";
import {
  buildSatbinmasOfficialInstagramRecap,
  buildSatbinmasOfficialTiktokRecap,
  buildSatbinmasOfficialInstagramDbRecap,
  buildSatbinmasOfficialTiktokDbRecap,
} from "./satbinmasOfficialReportService.js";
import { syncSatbinmasOfficialTiktokSecUidForOrgClients } from "./satbinmasOfficialTiktokService.js";
import { generateInstagramAllDataRecap } from "./instagramAllDataRecapService.js";
import { generateTiktokAllDataRecap } from "./tiktokAllDataRecapService.js";

const DITBINMAS_CLIENT_ID = "DITBINMAS";
const dirRequestGroup = "120363419830216549@g.us";

const isGroupChatId = (value) => String(value || "").trim().endsWith("@g.us");

const sendMenuMessage = async (waClient, chatId, message, options = {}) => {
  const {
    fallbackClients,
    fallbackContext,
    reportClient,
    ...sendOptions
  } = options || {};
  if (Array.isArray(fallbackClients) && fallbackClients.length) {
    return sendWithClientFallback({
      chatId,
      message,
      clients: fallbackClients,
      sendOptions,
      reportClient: reportClient || waClient,
      reportContext: fallbackContext,
    });
  }
  if (isGroupChatId(chatId)) {
    return safeSendMessage(waClient, chatId, message, sendOptions);
  }
  if (!sendOptions || Object.keys(sendOptions).length === 0) {
    return waClient.sendMessage(chatId, message);
  }
  return waClient.sendMessage(chatId, message, sendOptions);
};

const isDitbinmas = (value) =>
  String(value || "")
    .trim()
    .toUpperCase() === DITBINMAS_CLIENT_ID;

const pangkatOrder = [
  "KOMISARIS BESAR POLISI",
  "AKBP",
  "KOMPOL",
  "AKP",
  "IPTU",
  "IPDA",
  "AIPTU",
  "AIPDA",
  "BRIPKA",
  "BRIGADIR",
  "BRIPTU",
  "BRIPDA",
];

const rankIdx = (t) => {
  const i = pangkatOrder.indexOf((t || "").toUpperCase());
  return i === -1 ? pangkatOrder.length : i;
};

export async function formatRekapUserData(clientId, roleFlag = null) {
  const directorateRoles = ["ditbinmas", "ditlantas", "bidhumas"];
  const client = await findClientById(clientId);
  const normalizedRoleFlag = roleFlag?.toLowerCase();
  const clientType = client?.client_type?.toLowerCase();
  const normalizedClientId = clientId?.toLowerCase();
  const isDirectorateClient =
    clientType === "direktorat" || directorateRoles.includes(normalizedClientId);

  const filterRole = isDirectorateClient
    ? normalizedClientId
    : directorateRoles.includes(normalizedRoleFlag)
    ? normalizedRoleFlag
    : null;
  const users = await getUsersSocialByClient(clientId, filterRole);
  const salam = getGreeting();
  const now = new Date();
  const hari = now.toLocaleDateString("id-ID", { weekday: "long" });
  const tanggal = now.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const jam = now.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const isDirektoratView =
    clientType === "direktorat" ||
    directorateRoles.includes(normalizedClientId) ||
    directorateRoles.includes(roleFlag?.toLowerCase());
  if (isDirektoratView) {
    const groups = {};
    users.forEach((u) => {
      const cid = (u.client_id || "").toLowerCase();
      if (!groups[cid]) groups[cid] = { total: 0, insta: 0, tiktok: 0, complete: 0 };
      groups[cid].total++;
      if (u.insta) groups[cid].insta++;
      if (u.tiktok) groups[cid].tiktok++;
      if (u.insta && u.tiktok) groups[cid].complete++;
    });

    const roleName = (filterRole || clientId).toLowerCase();
    const polresIds = (await getClientsByRole(roleName)) || [];
    const polresIdSet = new Set(polresIds.map((id) => id.toLowerCase()));
    const clientIdLower = clientId.toLowerCase();

    // Collect unique IDs (client ID + polres IDs + group IDs)
    const seen = new Set();
    const allIds = [];
    
    const addId = (id) => {
      const lower = (id || '').toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        allIds.push(lower);
      }
    };

    addId(clientIdLower);
    polresIds.forEach((id) => addId(id));
    Object.keys(groups).forEach((id) => addId(id));

    const entries = await Promise.all(
      allIds.map(async (cid) => {
        const stat =
          groups[cid] || { total: 0, insta: 0, tiktok: 0, complete: 0 };
        const c = await findClientById(cid);
        const name = (c?.nama || cid).toUpperCase();
        const type = c?.client_type?.toLowerCase() || null;
        return { cid, name, stat, type };
      })
    );

    const filteredEntries = entries.filter((entry) => {
      if (entry.type === "direktorat") {
        return entry.cid === clientIdLower;
      }
      if (entry.type === "org") {
        return polresIdSet.has(entry.cid);
      }
      return false;
    });

    const withData = filteredEntries.filter(
      (e) => e.cid === clientIdLower || e.stat.total > 0
    );
    const noData = filteredEntries.filter(
      (e) => e.stat.total === 0 && e.cid !== clientIdLower
    );

    const compareEntries = (a, b) => {
      if (a.cid === clientIdLower) return -1;
      if (b.cid === clientIdLower) return 1;

      const aOrg = a.type === "org";
      const bOrg = b.type === "org";
      if (aOrg !== bOrg) return aOrg ? -1 : 1;

      if (a.stat.complete !== b.stat.complete)
        return b.stat.complete - a.stat.complete;
      if (a.stat.total !== b.stat.total) return b.stat.total - a.stat.total;
      return a.name.localeCompare(b.name);
    };

    const compareNoData = (a, b) => {
      if (a.cid === clientIdLower) return -1;
      if (b.cid === clientIdLower) return 1;

      const aOrg = a.type === "org";
      const bOrg = b.type === "org";
      if (aOrg !== bOrg) return aOrg ? -1 : 1;
      return a.name.localeCompare(b.name);
    };

    withData.sort(compareEntries);
    noData.sort(compareNoData);

    const withDataLines = withData.map(
      (e, idx) =>
        `${idx + 1}. ${e.name}\n\n` +
        `Jumlah Total Personil : ${e.stat.total}\n` +
        `Jumlah Total Personil Sudah Mengisi Instagram : ${e.stat.insta}\n` +
        `Jumlah Total Personil Sudah Mengisi Tiktok : ${e.stat.tiktok}\n` +
        `Jumlah Total Personil Belum Mengisi Instagram : ${e.stat.total - e.stat.insta}\n` +
        `Jumlah Total Personil Belum Mengisi Tiktok : ${e.stat.total - e.stat.tiktok}`
    );
    const noDataLines = noData.map((e, idx) => `${idx + 1}. ${e.name}`);

    const totals = filteredEntries.reduce(
      (acc, e) => {
        acc.total += e.stat.total;
        acc.insta += e.stat.insta;
        acc.tiktok += e.stat.tiktok;
        acc.complete += e.stat.complete;
        return acc;
      },
      { total: 0, insta: 0, tiktok: 0, complete: 0 }
    );

    const header =
      `${salam},\n\n` +
      `Mohon ijin Komandan, melaporkan absensi update data personil ${
        (client?.nama || clientId).toUpperCase()
      } pada hari ${hari}, ${tanggal}, pukul ${jam} WIB, sebagai berikut:`;

    const sections = [
      `Jumlah Total Personil : ${totals.total}\n` +
        `Jumlah Total Personil Sudah Mengisi Instagram : ${totals.insta}\n` +
        `Jumlah Total Personil Sudah Mengisi Tiktok : ${totals.tiktok}\n` +
        `Jumlah Total Personil Belum Mengisi Instagram : ${totals.total - totals.insta}\n` +
        `Jumlah Total Personil Belum Mengisi Tiktok : ${totals.total - totals.tiktok}`,
    ];
    if (withDataLines.length)
      sections.push(`Sudah Input Data:\n\n${withDataLines.join("\n\n")}`);
    if (noDataLines.length)
      sections.push(`Client Belum Input Data:\n${noDataLines.join("\n")}`);
    const body = `\n\n${sections.join("\n\n")}`;

    return `${header}${body}`.trim();
  }

  const complete = {};
  const incomplete = {};
  users.forEach((u) => {
    const div = u.divisi || "-";
    if (u.insta && u.tiktok) {
      if (!complete[div]) complete[div] = [];
      complete[div].push(u);
    } else {
      const missing = [];
      if (!u.insta) missing.push("Instagram kosong");
      if (!u.tiktok) missing.push("TikTok kosong");
      if (!incomplete[div]) incomplete[div] = [];
      incomplete[div].push({ ...u, missing: missing.join(", ") });
    }
  });

  if (clientType === "org") {
    const completeLines = sortDivisionKeys(Object.keys(complete)).map((d) => {
      const list = complete[d]
        .sort((a, b) => rankIdx(a.title) - rankIdx(b.title) || formatNama(a).localeCompare(formatNama(b)))
        .map((u) => formatNama(u))
        .join("\n\n");
      return `${d.toUpperCase()} (${complete[d].length})\n\n${list}`;
    });
    const incompleteLines = sortDivisionKeys(Object.keys(incomplete)).map((d) => {
      const list = incomplete[d]
        .sort((a, b) => rankIdx(a.title) - rankIdx(b.title) || formatNama(a).localeCompare(formatNama(b)))
        .map((u) => `${formatNama(u)}, ${u.missing}`)
        .join("\n\n");
      return `${d.toUpperCase()} (${incomplete[d].length})\n\n${list}`;
    });
    const sections = [];
    if (completeLines.length) sections.push(`Sudah Lengkap :\n\n${completeLines.join("\n\n")}`);
    if (incompleteLines.length) sections.push(`Belum Lengkap:\n\n${incompleteLines.join("\n\n")}`);
    const body = sections.join("\n\n");
    return (
      `${salam},\n\n` +
      `Mohon ijin Komandan, melaporkan absensi update data personil ${
        (client?.nama || clientId).toUpperCase()
      } pada hari ${hari}, ${tanggal}, pukul ${jam} WIB, sebagai berikut:\n\n` +
      body
    ).trim();
  }

  const completeLines = sortDivisionKeys(Object.keys(complete)).map((d) => {
    const list = complete[d]
      .sort((a, b) => rankIdx(a.title) - rankIdx(b.title) || formatNama(a).localeCompare(formatNama(b)))
      .map((u) => formatNama(u))
      .join("\n\n");
    return `${d}, Sudah lengkap: (${complete[d].length})\n\n${list}`;
  });
  const incompleteLines = sortDivisionKeys(Object.keys(incomplete)).map((d) => {
    const list = incomplete[d]
      .sort((a, b) => rankIdx(a.title) - rankIdx(b.title) || formatNama(a).localeCompare(formatNama(b)))
      .map((u) => `${formatNama(u)}, ${u.missing}`)
      .join("\n\n");
    return `${d}, Belum lengkap: (${incomplete[d].length})\n\n${list}`;
  });

  const body = [...completeLines, ...incompleteLines].filter(Boolean).join("\n\n");

  return (
    `${salam},\n\n` +
    `Mohon ijin Komandan, melaporkan absensi update data personil ${
      (client?.nama || clientId).toUpperCase()
    } pada hari ${hari}, ${tanggal}, pukul ${jam} WIB, sebagai berikut:\n\n` +
    body
  ).trim();
}

export async function formatRekapBelumLengkapDirektorat(clientId) {
  const targetClientId = String(clientId || DITBINMAS_CLIENT_ID).toUpperCase();
  const [client, users] = await Promise.all([
    findClientById(targetClientId),
    getUsersSocialByClient(targetClientId, targetClientId.toLowerCase()),
  ]);

  const clientName = client?.nama || targetClientId;
  const clientType = client?.client_type?.toLowerCase();

  if (clientType && clientType !== "direktorat") {
    return (
      "❌ Rekap data belum lengkap hanya tersedia untuk client bertipe " +
      `Direktorat. (${clientName})`
    );
  }

  const targetUsers =
    clientType === "direktorat"
      ? users
      : users.filter((u) => (u.client_id || "").toUpperCase() === targetClientId);

  const salam = getGreeting();
  const now = new Date();
  const hari = now.toLocaleDateString("id-ID", { weekday: "long" });
  const tanggal = now.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const jam = now.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const incomplete = {};
  targetUsers.forEach((u) => {
    if (u.insta && u.tiktok) return;
    const div = u.divisi || "-";
    const missing = [];
    if (!u.insta) missing.push("Instagram kosong");
    if (!u.tiktok) missing.push("TikTok kosong");
    if (!incomplete[div]) incomplete[div] = [];
    incomplete[div].push({ ...u, missing: missing.join(", ") });
  });
  const lines = sortDivisionKeys(Object.keys(incomplete)).map((d) => {
    const list = incomplete[d]
      .sort(
        (a, b) =>
          rankIdx(a.title) - rankIdx(b.title) ||
          formatNama(a).localeCompare(formatNama(b))
      )
      .map((u) => `${formatNama(u)}, ${u.missing}`)
      .join("\n\n");
    return `*${d.toUpperCase()}* (${incomplete[d].length})\n\n${list}`;
  });
  if (!lines.length) {
    return null;
  }
  const body = lines.join("\n\n");
  return (
    `${salam},\n\n` +
    `Mohon ijin Komandan, melaporkan personil ${clientName.toUpperCase()} yang belum melengkapi data Instagram/TikTok pada hari ${hari}, ${tanggal}, pukul ${jam} WIB, sebagai berikut:\n\n` +
    body
  ).trim();
}

export async function formatExecutiveSummary(clientId, roleFlag = null) {
  const users = await getUsersSocialByClient(clientId, roleFlag);
  const groups = {};
  users.forEach((u) => {
    const cid = String(u.client_id || "").trim().toLowerCase();
    if (!cid) return;
    if (!groups[cid]) groups[cid] = { total: 0, insta: 0, tiktok: 0 };
    groups[cid].total++;
    if (u.insta) groups[cid].insta++;
    if (u.tiktok) groups[cid].tiktok++;
  });
  const stats = await Promise.all(
    Object.entries(groups).map(async ([cid, stat]) => {
      const normalizedCid = String(cid || "").trim().toLowerCase();
      const client = await findClientById(normalizedCid);
      const name = (client?.nama || normalizedCid).toUpperCase();
      const igPct = stat.total ? (stat.insta / stat.total) * 100 : 0;
      const ttPct = stat.total ? (stat.tiktok / stat.total) * 100 : 0;
      return { cid: normalizedCid, name, ...stat, igPct, ttPct };
    })
  );
  const totals = stats.reduce(
    (acc, s) => {
      acc.total += s.total;
      acc.insta += s.insta;
      acc.tiktok += s.tiktok;
      return acc;
    },
    { total: 0, insta: 0, tiktok: 0 }
  );
  const toPercent = (num, den) => (den ? ((num / den) * 100).toFixed(1) : "0.0");
  const arrAvg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const arrMedian = (arr) => {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  };
  const igArr = stats.map((s) => s.igPct);
  const ttArr = stats.map((s) => s.ttPct);
  const avgIg = arrAvg(igArr);
  const avgTt = arrAvg(ttArr);
  const medIg = arrMedian(igArr);
  const medTt = arrMedian(ttArr);
  const lowSatkers = stats.filter((s) => s.igPct < 10 && s.ttPct < 10).length;
  const topSatkers = stats
    .filter((s) => s.igPct >= 90 && s.ttPct >= 90)
    .map((s) => s.name);
  const strongSatkers = stats
    .filter((s) => s.igPct >= 80 && s.ttPct >= 80 && !(s.igPct >= 90 && s.ttPct >= 90))
    .map((s) => `${s.name} (${s.igPct.toFixed(1)}% / ${s.ttPct.toFixed(1)}%)`);
  const sortedAvg = [...stats].sort((a, b) => b.igPct + b.ttPct - (a.igPct + a.ttPct));
  const topPerformers = sortedAvg
    .slice(0, 5)
    .map((s, i) => `${i + 1}) ${s.name} ${s.igPct.toFixed(1)} / ${s.ttPct.toFixed(1)}`);
  const bottomPerformers = sortedAvg
    .slice(-5)
    .map((s) => `${s.name} ${s.igPct.toFixed(1)}% / ${s.ttPct.toFixed(1)}%`);
  const anomalies = stats
    .filter((s) => Math.abs(s.igPct - s.ttPct) >= 15)
    .map((s) => {
      const diff = (s.igPct - s.ttPct).toFixed(1);
      if (s.igPct > s.ttPct)
        return `${s.name} IG ${s.igPct.toFixed(1)}% vs TT ${s.ttPct.toFixed(1)}% (+${diff} poin ke IG)`;
      return `${s.name} IG ${s.igPct.toFixed(1)}% vs TT ${s.ttPct.toFixed(1)}% (${diff} ke IG)`;
    });
  const backlogIg = stats
    .map((s) => ({ name: s.name, count: s.total - s.insta }))
    .sort((a, b) => b.count - a.count);
  const backlogTt = stats
    .map((s) => ({ name: s.name, count: s.total - s.tiktok }))
    .sort((a, b) => b.count - a.count);
  const top10Ig = backlogIg.slice(0, 10);
  const top10Tt = backlogTt.slice(0, 10);
  const top10IgCount = top10Ig.reduce((a, b) => a + b.count, 0);
  const top10TtCount = top10Tt.reduce((a, b) => a + b.count, 0);
  const missingIg = totals.total - totals.insta;
  const missingTt = totals.total - totals.tiktok;
  const percentTopIg = missingIg ? ((top10IgCount / missingIg) * 100).toFixed(1) : "0.0";
  const percentTopTt = missingTt ? ((top10TtCount / missingTt) * 100).toFixed(1) : "0.0";
  const projectedIg = ((totals.insta + 0.7 * top10IgCount) / totals.total) * 100;
  const projectedTt = ((totals.tiktok + 0.7 * top10TtCount) / totals.total) * 100;
  const now = new Date();
  const dateStr = now.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const lines = [
    "Mohon Ijin Komandan,",
    "",
    `*Rekap User Insight ${dateStr} ${timeStr} WIB*`,
    `*Personil Saat ini:* ${totals.total.toLocaleString("id-ID")} personil`,
    "",
    `*Cakupan keseluruhan:* IG ${toPercent(totals.insta, totals.total)}% (${totals.insta}/${totals.total}), TT ${toPercent(totals.tiktok, totals.total)}% (${totals.tiktok}/${totals.total}).`,
    "",
    `*Rata-rata satker:* IG ${avgIg.toFixed(1)}% (median ${medIg.toFixed(1)}%), TT ${avgTt.toFixed(1)}% (median ${medTt.toFixed(1)}%)${
      lowSatkers ? " → *penyebaran masih lebar, banyak satker di bawah 10%.*" : ""
    }`,
  ];
  if (topSatkers.length)
    lines.push("", `*Satker dengan capaian terbaik (≥90% IG & TT):* ${topSatkers.join(", ")}.`);
  if (strongSatkers.length)
    lines.push("", `*Tambahan kuat (≥80% IG & TT):* ${strongSatkers.join(", ")}.`);
  if (topPerformers.length || bottomPerformers.length)
    lines.push("", "*Highlight Pencapaian & Masalah*");
  if (topPerformers.length)
    lines.push("", `*Top performer* (rata-rata IG/TT): ${topPerformers.join(", ")}.`);
  if (bottomPerformers.length)
    lines.push(
      "",
      `*Bottom performer* (rata-rata IG/TT, sangat rendah di kedua platform): ${bottomPerformers.join(" • ")}`
    );
  if (anomalies.length)
    lines.push("", "*Anomali :*", anomalies.map((a) => `*${a}*`).join("\n"));
  lines.push("", "*Konsentrasi Backlog (prioritas penanganan)*", "");
  lines.push(
    `Top-10 penyumbang backlog menyerap >50% backlog masing-masing platform.`
  );
  if (missingIg)
    lines.push(
      "",
      `*IG Belum Diisi (${missingIg}) – 10 terbesar (≈${percentTopIg}%):*`,
      top10Ig.map((s) => `${s.name} (${s.count})`).join(", ")
    );
  if (missingTt)
    lines.push(
      "",
      `*TikTok Belum Diisi (${missingTt}) – 10 terbesar (≈${percentTopTt}%):*`,
      top10Tt.map((s) => `${s.name} (${s.count})`).join(", ")
    );
  lines.push(
    "",
    `*Proyeksi dampak cepat:* Menutup 70% backlog di Top-10 → proyeksi capaian naik ke IG ≈ ${projectedIg.toFixed(
      1
    )}% dan TT ≈ ${projectedTt.toFixed(1)}%.`
  );
  const backlogNames = top10Ig.slice(0, 6).map((s) => s.name);
  const ttBetter = stats
    .filter((s) => s.ttPct - s.igPct >= 10)
    .map((s) => s.name);
  const roleModel = topSatkers;
  if (backlogNames.length || anomalies.length || ttBetter.length || roleModel.length)
    lines.push("", "*Catatan per Satker*");
  if (backlogNames.length)
    lines.push("", `*Backlog terbesar:* ${backlogNames.join(", ")}.`);
  if (ttBetter.length)
    lines.push("", `*TT unggul:* ${ttBetter.join(", ")} (pertahankan).`);
  if (roleModel.length)
    lines.push(
      "",
      `*Role model:* ${roleModel.join(", ")} — didorong menjadi mentor lintas satker.`
    );
  lines.push(
    "",
    "_Catatan kaki:_ IG = Instagram; TT = TikTok; backlog = pekerjaan tertunda / User Belum Update data;"
  );
  return lines.join("\n").trim();
}

async function absensiLikesDitbinmas(clientId) {
  return await absensiLikesDitbinmasReport(clientId);
}

async function absensiLikesDitbinmasSimple(clientId) {
  return await absensiLikesDitbinmasSimpleReport(clientId);
}

async function absensiKomentarTiktok(clientId, roleFlag) {
  return await absensiKomentar(clientId, { roleFlag });
}

async function absensiKomentarDitbinmasSimple(clientId) {
  return await absensiKomentarDitbinmasSimpleReport(clientId);
}

async function absensiKomentarDitbinmas(clientId) {
  return await absensiKomentarDitbinmasReport(clientId);
}

async function performAction(
  action,
  clientId,
  waClient,
  chatId,
  roleFlag,
  userClientId,
  context = {},
  fallbackOptions = {}
) {
  let msg = "";
  const { fallbackClients, fallbackContext } = fallbackOptions;
  const fallbackPayload = fallbackClients
    ? { fallbackClients, fallbackContext, reportClient: waClient }
    : {};
  const userClient = userClientId ? await findClientById(userClientId) : null;
  const userType = userClient?.client_type?.toLowerCase();
  const attendanceClientId = String(userClientId || clientId || "").toUpperCase();
  const normalizedRoleFlag = (roleFlag || attendanceClientId).toLowerCase();
  switch (action) {
    case "1": {
      msg = await formatRekapUserData(clientId, roleFlag);
      break;
    }
    case "2": {
      msg = await formatExecutiveSummary(clientId, roleFlag);
      break;
    }
    case "3":
      msg = await formatRekapBelumLengkapDirektorat(clientId);
      break;
    case "4": {
      try {
        const { filePath } = await saveSatkerUpdateMatrixExcel({
          clientId,
          roleFlag,
          username: context.username,
        });
        const buffer = await readFile(filePath);
        await sendWAFile(
          waClient,
          buffer,
          basename(filePath),
          chatId,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        await unlink(filePath);
        msg = "✅ File Excel dikirim.";
      } catch (error) {
        console.error("Gagal membuat rekap matriks update satker:", error);
        msg =
          error?.message &&
          (error.message.includes("direktorat") ||
            error.message.includes("Client tidak ditemukan"))
            ? error.message
            : "❌ Gagal membuat rekap matriks update satker.";
      }
      break;
    }
    case "5":
      msg = await absensiLikesDitbinmas(attendanceClientId);
      break;
    case "6":
      msg = await absensiLikesDitbinmasSimple(attendanceClientId);
      break;
    case "7": {
      const opts = { mode: "all", roleFlag: normalizedRoleFlag };
      msg = await absensiLikes(attendanceClientId, opts);
      break;
    }
    case "8":
      msg = await absensiKomentarTiktok(attendanceClientId, normalizedRoleFlag);
      break;
    case "9":
      msg = await absensiKomentarDitbinmasSimple(attendanceClientId);
      break;
    case "10":
      msg = await absensiKomentarDitbinmas(attendanceClientId);
      break;
    case "11": {
      msg = await absensiRegistrasiDashboardDirektorat(clientId);
      break;
    }
    case "12": {
      const { fetchAndStoreInstaContent } = await import("../handler/fetchpost/instaFetchPost.js");
      const { handleFetchLikesInstagram } = await import("../handler/fetchengagement/fetchLikesInstagram.js");
      const { rekapLikesIG } = await import("../handler/fetchabsensi/insta/absensiLikesInsta.js");
      const targetId = (clientId || DITBINMAS_CLIENT_ID).toUpperCase();
      const targetClient = await findClientById(targetId);
      const targetLabel = targetClient?.nama
        ? `${formatNama(targetClient.nama)} (${targetId})`
        : targetId;
      await fetchAndStoreInstaContent([
        "shortcode",
        "caption",
        "like_count",
        "timestamp",
      ], waClient, chatId, targetId);
      await handleFetchLikesInstagram(null, null, targetId);
      const rekapData = await collectLikesRecap(targetId);
      const displayData = await rekapLikesIG(rekapData);
      msg = displayData.message || "Rekap likes Instagram selesai";
      break;
    }
    case "14": {
      const { fetchAndStoreTiktokContent } = await import(
        "../handler/fetchpost/tiktokFetchPost.js"
      );
      const { handleFetchKomentarTiktokBatch } = await import(
        "../handler/fetchengagement/fetchCommentTiktok.js"
      );
      const targetId = (clientId || DITBINMAS_CLIENT_ID).toUpperCase();
      await fetchAndStoreTiktokContent(targetId, waClient, chatId);
      await handleFetchKomentarTiktokBatch(waClient, chatId, targetId);
      msg = await absensiKomentarDitbinmas(targetId);
      break;
    }
    case "16": {
      const { fetchAndStoreTiktokContent } = await import(
        "../handler/fetchpost/tiktokFetchPost.js"
      );
      const targetId = (clientId || DITBINMAS_CLIENT_ID).toUpperCase();
      const targetClient = await findClientById(targetId);
      const targetLabel = targetClient?.nama
        ? `${formatNama(targetClient.nama)} (${targetId})`
        : targetId;
      await fetchAndStoreTiktokContent(targetId, waClient, chatId);
      msg = `✅ Fetch & store TikTok posts untuk ${targetLabel} selesai.`;
      break;
    }
    default:
      msg = "Menu tidak dikenal.";
  }
  const normalizedMsg = typeof msg === "string" ? msg.trim() : "";
  if (!normalizedMsg) {
    return;
  }

  await sendMenuMessage(waClient, chatId, normalizedMsg, fallbackPayload);
  if (action === "12" || action === "14" || action === "16") {
    if (Array.isArray(fallbackClients) && fallbackClients.length) {
      await sendWithClientFallback({
        chatId: dirRequestGroup,
        message: normalizedMsg,
        clients: fallbackClients,
        reportClient: waClient,
        reportContext: fallbackContext,
      });
    } else {
      await safeSendMessage(waClient, dirRequestGroup, normalizedMsg);
    }
  }
}

export async function runDirRequestAction({
  action,
  clientId,
  chatId,
  roleFlag,
  userClientId,
  waClient,
  context,
  fallbackClients,
  fallbackContext,
} = {}) {
  if (!action) {
    throw new Error("Action menu wajib diisi");
  }
  if (!waClient) {
    throw new Error("Instans WA client wajib diisi untuk menjalankan menu");
  }
  if (!chatId) {
    throw new Error("chatId penerima wajib diisi untuk menjalankan menu");
  }

  const normalizedAction = String(action).trim();
  const normalizedClient = (clientId || "").trim();
  const resolvedFallbackContext = fallbackContext || {
    action: normalizedAction,
    clientId: normalizedClient,
    chatId,
  };

  return performAction(
    normalizedAction,
    normalizedClient,
    waClient,
    chatId,
    roleFlag,
    userClientId,
    context,
    {
      fallbackClients,
      fallbackContext: resolvedFallbackContext,
    }
  );
}
