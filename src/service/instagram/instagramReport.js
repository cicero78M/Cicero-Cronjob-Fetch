import { query } from "../../db/index.js";
import { getShortcodesTodayByClient } from "../../model/instaPostModel.js";
import { hariIndo } from "../../utils/constants.js";
import { formatNama } from "../../utils/utilsHelper.js";
import {
  normalizeUsername,
  getLikesSets,
  groupUsersByClientDivision,
} from "../../utils/likesHelper.js";

const clientInfoCache = new Map();

export async function getClientInfo(clientId) {
  const key = String(clientId || "").toLowerCase();
  if (process.env.NODE_ENV !== "test" && clientInfoCache.has(key)) {
    return clientInfoCache.get(key);
  }
  let res = { rows: [] };
  try {
    res = await query(
      "SELECT nama, client_type FROM clients WHERE LOWER(client_id) = LOWER($1) LIMIT 1",
      [clientId]
    );
  } catch (error) {
    if (process.env.NODE_ENV !== "test") throw error;
  }
  const info = {
    nama: res.rows[0]?.nama || clientId,
    clientType: res.rows[0]?.client_type || null,
  };
  if (process.env.NODE_ENV !== "test") {
    clientInfoCache.set(key, info);
  }
  return info;
}

export async function fetchDitbinmasData(clientId = "DITBINMAS") {
  const roleName = String(clientId || "DITBINMAS").toLowerCase();
  const directorateId = roleName.toUpperCase();
  const shortcodes = await getShortcodesTodayByClient(roleName);
  const kontenLinks = shortcodes.map(
    (sc) => `https://www.instagram.com/p/${sc}`
  );
  const likesSets = await getLikesSets(shortcodes);
  const likesCounts = likesSets.map((set) => set.size);
  const { polresIds: allIds, usersByClient } =
    await groupUsersByClientDivision(roleName);
  const polresIds = allIds
    .map((cid) => cid.toUpperCase())
    .filter((cid) => cid !== directorateId);
  const clientIds = [directorateId, ...polresIds];
  const kontenLinkLikes = kontenLinks.map(
    (link, idx) => `${link} : ${likesCounts[idx]}`
  );
  return {
    shortcodes,
    kontenLinks,
    likesSets,
    clientIds,
    usersByClient,
    kontenLinkLikes,
  };
}

export async function calculateDitbinmasStats(data) {
  const { shortcodes, likesSets, kontenLinks, clientIds, usersByClient } = data;
  const directorateId = clientIds[0] || "DITBINMAS";
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

  const totals = {
    total: 0,
    sudah: 0,
    kurang: 0,
    belum: 0,
    noUsername: 0,
    noTiktok: 0,
  };
  const perClientStats = [];
  const perClientBelumBlocks = [];

  for (const cid of clientIds) {
    const users = usersByClient[cid] || [];
    const already = [];
    const partial = [];
    const none = [];
    const noUname = [];
    let noTiktok = 0;

    users.forEach((u) => {
      if (!u.tiktok) noTiktok++;
      if (!u.insta || u.insta.trim() === "") {
        noUname.push(u);
        return;
      }
      const uname = normalizeUsername(u.insta);
      let count = 0;
      likesSets.forEach((set) => {
        if (set.has(uname)) count += 1;
      });
      if (count === shortcodes.length) already.push({ ...u, count });
      else if (count > 0) partial.push({ ...u, count });
      else none.push({ ...u, count });
    });

    totals.total += users.length;
    totals.sudah += already.length;
    totals.kurang += partial.length;
    totals.belum += none.length + noUname.length;
    totals.noUsername += noUname.length;
    totals.noTiktok += noTiktok;

    const { nama: clientName } = await getClientInfo(cid);

    const sortUsers = (arr) =>
      arr.sort(
        (a, b) =>
          rankIdx(a.title) - rankIdx(b.title) ||
          String(a.user_id).localeCompare(String(b.user_id))
      );

    sortUsers(already);
    sortUsers(partial);
    sortUsers(none);
    sortUsers(noUname);

    const likeSum =
      already.reduce((acc, u) => acc + (u.count || 0), 0) +
      partial.reduce((acc, u) => acc + (u.count || 0), 0);

    const blockLines = [
      `*${clientName.toUpperCase()}* : ${users.length} / ${already.length} / ${partial.length} / ${
        none.length + noUname.length
      } / ${noUname.length} / ${noTiktok}`,
      `Sudah Likes : ${already.length}`,
      ...already.map((u) => `- ${formatNama(u)}, ${u.count}`),
    ];

    blockLines.push("");
    blockLines.push(`Kurang likes : ${partial.length}`);
    if (partial.length) {
      blockLines.push(...partial.map((u) => `- ${formatNama(u)}, ${u.count}`));
    }

    blockLines.push("");
    blockLines.push(`Belum Likes : ${none.length}`);
    if (none.length) {
      blockLines.push("");
      blockLines.push(...none.map((u) => `- ${formatNama(u)}, ${u.insta}`));
    }

    blockLines.push("");
    blockLines.push(`Belum Input Sosial media : ${noUname.length}`);
    if (noUname.length) {
      blockLines.push("");
      blockLines.push(
        ...noUname.map(
          (u) =>
            `- ${formatNama(u)}, IG ${u.insta ? u.insta : "Kosong"}, Tiktok ${
              u.tiktok ? u.tiktok : "Kosong"
            }`
        )
      );
    }

    const igPercent = users.length
      ? ((users.length - noUname.length) / users.length) * 100
      : 0;
    const tiktokPercent = users.length
      ? ((users.length - noTiktok) / users.length) * 100
      : 0;

    perClientStats.push({
      cid,
      name: clientName.toUpperCase(),
      likes: likeSum,
      block: blockLines.join("\n"),
      igPercent,
      tiktokPercent,
      noUsername: noUname.length,
      noTiktok,
      totalUsers: users.length,
    });

    if (none.length || noUname.length) {
      const belumLines = [`*${clientName.toUpperCase()}*`];
      if (none.length) {
        belumLines.push(`Belum Likes : ${none.length}`);
        belumLines.push(...none.map((u) => `- ${formatNama(u)}, ${u.insta}`));
      }
      if (noUname.length) {
        if (none.length) belumLines.push("");
        belumLines.push(`Belum Input Sosial media : ${noUname.length}`);
        belumLines.push(
          ...noUname.map(
            (u) =>
              `- ${formatNama(u)}, IG ${u.insta ? u.insta : "Kosong"}, Tiktok ${
                u.tiktok ? u.tiktok : "Kosong"
              }`
          )
        );
      }
      perClientBelumBlocks.push(belumLines.join("\n"));
    }
  }
  perClientStats.sort((a, b) => {
    if (a.cid === directorateId) return -1;
    if (b.cid === directorateId) return 1;
    if (a.likes !== b.likes) return b.likes - a.likes;
    return a.name.localeCompare(b.name);
  });

  const perClientBlocks = perClientStats.map((p) => p.block);
  const totalLikes = perClientStats.reduce((acc, p) => acc + p.likes, 0);
  const totalPossibleLikes = totals.total * shortcodes.length;
  const likePercent = totalPossibleLikes
    ? (totalLikes / totalPossibleLikes) * 100
    : 0;
  const targetLikes = Math.ceil(totalPossibleLikes * 0.95);
  const deficit = targetLikes - totalLikes;

  const contentStats = shortcodes.map((shortcode, idx) => ({
    shortcode,
    link: kontenLinks?.[idx] || `https://www.instagram.com/p/${shortcode}`,
    likes: likesSets[idx] ? likesSets[idx].size : 0,
  }));
  const avgLikesPerContent = shortcodes.length
    ? totalLikes / shortcodes.length
    : 0;
  const sortedContentStats = [...contentStats].sort((a, b) => b.likes - a.likes);
  const topContent = sortedContentStats[0] || null;
  const bottomContent = sortedContentStats[sortedContentStats.length - 1] || null;
  const contentLikeGap = topContent && bottomContent
    ? topContent.likes - bottomContent.likes
    : 0;

  const topContribArr = [...perClientStats]
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 4);
  const topContrib = topContribArr
    .map((p) => `${p.name} ${p.likes}`)
    .join(", ");
  const topContribPercent = totalLikes
    ? (
        (topContribArr.reduce((acc, p) => acc + p.likes, 0) / totalLikes) *
        100
      ).toFixed(1)
    : "0";

  const satkerStats = perClientStats.filter((p) => p.cid !== directorateId);
  const fmtNum = (n) => n.toLocaleString("id-ID");
  const fmtPct = (n) =>
    n.toLocaleString("id-ID", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  const median = (arr) => {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  const igUpdated = totals.total - totals.noUsername;
  const tiktokUpdated = totals.total - totals.noTiktok;
  const igOverallPercent = totals.total
    ? (igUpdated / totals.total) * 100
    : 0;
  const tiktokOverallPercent = totals.total
    ? (tiktokUpdated / totals.total) * 100
    : 0;
  const avgIg =
    satkerStats.reduce((acc, p) => acc + p.igPercent, 0) /
    (satkerStats.length || 1);
  const avgTiktok =
    satkerStats.reduce((acc, p) => acc + p.tiktokPercent, 0) /
    (satkerStats.length || 1);
  const medianIg = median(satkerStats.map((p) => p.igPercent));
  const medianTiktok = median(satkerStats.map((p) => p.tiktokPercent));
  const lowSatker = satkerStats.filter(
    (p) => p.igPercent < 10 && p.tiktokPercent < 10
  );
  const bestSatkers = satkerStats.filter(
    (p) => p.igPercent >= 90 && p.tiktokPercent >= 90
  );
  const strongSatkers = satkerStats.filter(
    (p) =>
      p.igPercent >= 80 &&
      p.tiktokPercent >= 80 &&
      (p.igPercent < 90 || p.tiktokPercent < 90)
  );
  const topAvgStats = satkerStats
    .map((p) => ({ ...p, avg: (p.igPercent + p.tiktokPercent) / 2 }))
    .sort((a, b) => b.avg - a.avg);
  const topPerformers = topAvgStats.slice(0, 5);
  const topPerformerLines = topPerformers
    .map(
      (p, idx) =>
        `${idx + 1}. ${p.name} ${p.igPercent.toFixed(1)}/${p.tiktokPercent.toFixed(
          1
        )}`
    )
    .join(", ");
  const bottomPerformersArr = [...topAvgStats].reverse().slice(0, 5);
  const bottomPerformerLines = bottomPerformersArr
    .map(
      (p) =>
        `* ${p.name} ${p.igPercent.toFixed(1)}% / ${p.tiktokPercent.toFixed(1)}%`
    )
    .join("\n");
  const extraUnderTen = satkerStats
    .filter(
      (p) =>
        p.igPercent < 10 &&
        p.tiktokPercent < 10 &&
        !bottomPerformersArr.some((b) => b.cid === p.cid)
    )
    .map((p) => p.name);
  const gapThreshold = 10;
  const gapCandidates = perClientStats.filter(
    (p) => Math.abs(p.igPercent - p.tiktokPercent) >= gapThreshold
  );
  const gapLines = gapCandidates.map((p) => {
    const diff = p.igPercent - p.tiktokPercent;
    const sign = diff >= 0 ? "+" : "-";
    const dir = diff >= 0 ? "ke IG" : "ke TT";
    return `* *${p.name}* IG ${p.igPercent.toFixed(1)}% vs TT ${p.tiktokPercent.toFixed(
      1
    )}% (*${sign}${Math.abs(diff).toFixed(1)} poin ${dir}*)`;
  });
  const igBacklog = totals.noUsername;
  const tiktokBacklog = totals.noTiktok;
  const top10Ig = [...satkerStats]
    .filter((p) => p.noUsername > 0)
    .sort((a, b) => b.noUsername - a.noUsername)
    .slice(0, 10);
  const top10IgList = top10Ig
    .map((p) => `${p.name} (${fmtNum(p.noUsername)})`)
    .join(", ");
  const top10IgSum = top10Ig.reduce((acc, p) => acc + p.noUsername, 0);
  const top10IgPercent = igBacklog
    ? (top10IgSum / igBacklog) * 100
    : 0;
  const top10Tiktok = [...satkerStats]
    .filter((p) => p.noTiktok > 0)
    .sort((a, b) => b.noTiktok - a.noTiktok)
    .slice(0, 10);
  const top10TiktokList = top10Tiktok
    .map((p) => `${p.name} (${fmtNum(p.noTiktok)})`)
    .join(", ");
  const top10TiktokSum = top10Tiktok.reduce((acc, p) => acc + p.noTiktok, 0);
  const top10TiktokPercent = tiktokBacklog
    ? (top10TiktokSum / tiktokBacklog) * 100
    : 0;
  const projectedIgPercent = totals.total
    ? ((igUpdated + 0.7 * top10IgSum) / totals.total) * 100
    : 0;
  const projectedTiktokPercent = totals.total
    ? ((tiktokUpdated + 0.7 * top10TiktokSum) / totals.total) * 100
    : 0;
  const backlogBig = top10Ig.slice(0, 6).map((p) => p.name);
  const largestGapPos = gapCandidates
    .filter((p) => p.igPercent > p.tiktokPercent)
    .sort(
      (a, b) => (b.igPercent - b.tiktokPercent) - (a.igPercent - a.tiktokPercent)
    )[0];
  const largestGapNeg = gapCandidates
    .filter((p) => p.tiktokPercent > p.igPercent)
    .sort(
      (a, b) => (b.tiktokPercent - b.igPercent) - (a.tiktokPercent - a.igPercent)
    )[0];
  const mentorList = topPerformers.map((p) => p.name);
  const lowestInput = bottomPerformersArr.map((p) => p.name);
  const bestSatkerNames = bestSatkers.map((p) => p.name);
  const strongSatkerList = strongSatkers.map(
    (p) => `${p.name} (${p.igPercent.toFixed(1)}% / ${p.tiktokPercent.toFixed(1)}%)`
  );
  const notesLines = [];
  if (backlogBig.length)
    notesLines.push(`* *${backlogBig.join(', ')}* → backlog terbesar;`);
  if (lowestInput.length)
    notesLines.push(
      `* *${lowestInput.join(', ')}* → Input Username Ter rendah`
    );
  if (largestGapPos)
    notesLines.push(
      `* *${largestGapPos.name}* → Anomali TT sangat rendah; Menjadi perhatian khusus.`
    );
  if (largestGapNeg)
    notesLines.push(`* *${largestGapNeg.name}* → TT unggul;`);
  if (mentorList.length)
    notesLines.push(
      `* *${mentorList.join('/')}* → pertahankan; mendorong sebagai mentor lintas satker( minta saran masukan).`
    );
  const notesSection = notesLines.join("\n");

  return {
    ...data,
    totals,
    perClientStats,
    perClientBlocks,
    perClientBelumBlocks,
    totalLikes,
    totalPossibleLikes,
    likePercent,
    targetLikes,
    deficit,
    topContrib,
    topContribPercent,
    satkerStats,
    igOverallPercent,
    igUpdated,
    tiktokOverallPercent,
    tiktokUpdated,
    avgIg,
    avgTiktok,
    medianIg,
    medianTiktok,
    lowSatker,
    bestSatkerNames,
    strongSatkerList,
    topPerformerLines,
    bottomPerformerLines,
    extraUnderTen,
    gapLines,
    igBacklog,
    tiktokBacklog,
    top10IgList,
    top10IgPercent,
    top10TiktokList,
    top10TiktokPercent,
    projectedIgPercent,
    projectedTiktokPercent,
    notesSection,
    contentStats,
    avgLikesPerContent,
    topContent,
    bottomContent,
    contentLikeGap,
  };
}

export function formatDitbinmasText(stats) {
  const {
    hari,
    tanggal,
    jam,
    shortcodes,
    kontenLinks,
    totals,
    perClientBlocks,
    perClientBelumBlocks,
    contentStats,
  } = stats;

  const fmtNum = (n) => n.toLocaleString("id-ID");
  const distribusiLikes = (contentStats || []).length
    ? contentStats
        .map(
          (item, idx) =>
            `${idx + 1}. ${item.link} — ${fmtNum(item.likes)} likes`
        )
        .join("\n")
    : "-";

  const text =
    `Mohon ijin Komandan,\n\n` +
    `📋 Rekap Akumulasi Likes Instagram\n` +
    `Polres: DIREKTORAT BINMAS\n` +
    `${hari}, ${tanggal}\n` +
    `Jam: ${jam}\n\n` +
    `Jumlah Konten: ${shortcodes.length}\n` +
    `Daftar Link Konten:\n${kontenLinks.map((l) => `- ${l}`).join("\n")}\n\n` +
    `Jumlah Total Personil : ${totals.total} pers\n` +
    `Total Sudah Melaksanakan Likes : ${totals.sudah + totals.kurang} pers\n` +
    `- Melaksanakan Likes Lengkap : ${totals.sudah} pers\n` +
    `- Melaksanakan Likes Kurang lengkap : ${totals.kurang} pers\n` +
    `Belum Melaksanakan : ${totals.belum} pers\n` +
    `Belum Update Username Instagram : ${totals.noUsername} pers\n` +
    `_Kesatuan  :  Jumlah user / Sudah likes / Likes kurang/ Belum likes/ Belum input IG _\n` +
    `${perClientBlocks.join("\n\n")}` +
    `\n\nDistribusi Likes per Konten:\n${distribusiLikes}`;

  const textBelum =
    `Belum melaksanakan Likes atau belum input username IG/Tiktok\n` +
    `Polres: DIREKTORAT BINMAS\n` +
    `${hari}, ${tanggal}\n` +
    `Jam: ${jam}\n\n` +
    `${perClientBelumBlocks.join("\n\n")}`;

  return { text: text.trim(), textBelum: textBelum.trim() };
}

export function formatDitbinmasNarrative(stats) {
  const {
    hari,
    tanggal,
    jam,
    satkerStats,
  } = stats;

  const fmtNum = (n) => n.toLocaleString("id-ID");
  const sortedSatkers = [...satkerStats].sort(
    (a, b) => b.likes - a.likes || a.name.localeCompare(b.name)
  );
  const topFive = sortedSatkers.slice(0, 5);
  const bottomFive = [...sortedSatkers].reverse().slice(0, 5);
  const formatList = (arr) =>
    arr.length
      ? arr
          .map((p, idx) => `${idx + 1}. ${p.name} – ${fmtNum(p.likes)} likes`)
          .join("\n")
      : "-";

  return (
    `Mohon Ijin Komandan, rekap singkat likes Instagram hari ${hari}, ${tanggal} pukul ${jam} WIB.\n\n` +
    `📸 Instagram\n` +
    `Top 5 Likes:\n${formatList(topFive)}\n\n` +
    `Bottom 5 Likes:\n${formatList(bottomFive)}`
  );
}

export async function lapharDitbinmas(clientId = "DITBINMAS") {
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const dateKey = now.toDateString();
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });
  const dateSafe = tanggal.replace(/\//g, "-");
  const timeSafe = jam.replace(/[:.]/g, "-");
  const filename = `Absensi_All_Engagement_Instagram_${hari}_${dateSafe}_${timeSafe}.txt`;
  const filenameBelum = `Absensi_Belum_Engagement_Instagram_${hari}_${dateSafe}_${timeSafe}.txt`;

  const data = await fetchDitbinmasData(clientId);
  const { nama: clientName } = await getClientInfo(clientId);
  const clientLabel = String(clientName || clientId).toUpperCase();

  if (!data.shortcodes.length)
    return {
      filename,
      text: `Belum ada konten IG pada akun Official ${clientLabel} hari ini`,
    };

  const stats = await calculateDitbinmasStats(data);
  const metaStats = { ...stats, hari, tanggal, jam };
  const { text, textBelum } = formatDitbinmasText(metaStats);
  const narrative = formatDitbinmasNarrative({ ...metaStats, clientLabel });

  const sortedSatkers = [...stats.satkerStats].sort(
    (a, b) => b.likes - a.likes || a.name.localeCompare(b.name)
  );
  const rankingData = {
    generatedDate: tanggal,
    generatedDateKey: dateKey,
    metricLabel: "likes",
    top: sortedSatkers.slice(0, 5).map((satker) => ({
      name: satker.name,
      score: satker.likes,
    })),
    bottom: [...sortedSatkers]
      .reverse()
      .slice(0, 5)
      .map((satker) => ({
        name: satker.name,
        score: satker.likes,
      })),
  };

  return {
    filename,
    text,
    narrative,
    rankingData,
    filenameBelum,
    textBelum,
  };
}

