import { query } from "../../../db/index.js";
import {
  getUsersByClient,
  getUsersByDirektorat,
  getClientsByRole,
} from "../../../model/userModel.js";
import { getPostsTodayByClient } from "../../../model/tiktokPostModel.js";
import { getCommentsByVideoId } from "../../../model/tiktokCommentModel.js";
import { hariIndo } from "../../../utils/constants.js";
import {
  groupByDivision,
  sortDivisionKeys,
  formatNama,
  groupUsersByDivisionStatus,
} from "../../../utils/utilsHelper.js";
import { sendDebug } from "../../../middleware/debugHandler.js";
import { sortUsersByPositionRankAndName } from "../../../utils/sortingHelper.js";

const JAKARTA_TIMEZONE = "Asia/Jakarta";

function toJakartaDateInput(referenceDate) {
  if (!referenceDate) return undefined;
  const baseDate = new Date(referenceDate);
  if (Number.isNaN(baseDate.getTime())) return undefined;
  return baseDate.toLocaleDateString("en-CA", { timeZone: JAKARTA_TIMEZONE });
}

// Dapatkan nama dan username tiktok client
async function getClientInfo(client_id) {
  const res = await query(
    "SELECT nama, client_tiktok, client_type FROM clients WHERE LOWER(client_id) = LOWER($1) LIMIT 1",
    [client_id]
  );
  return {
    nama: res.rows[0]?.nama || client_id,
    tiktok: (res.rows[0]?.client_tiktok || "").replace(/^@/, "") || "username",
    clientType: res.rows[0]?.client_type || null,
  };
}

// Helper ekstrak username dari komentar
export function extractUsernamesFromComments(comments) {
  return (comments || [])
    .map((x) => {
      let uname = "";
      if (typeof x === "string") {
        uname = x;
      } else if (x && typeof x.username === "string") {
        uname = x.username;
      } else if (x && x.user && typeof x.user.unique_id === "string") {
        uname = x.user.unique_id;
      }
      return uname.toLowerCase().replace(/^@/, "");
    })
    .filter(Boolean);
}

export function normalizeUsername(username) {
  return (username || "")
    .toString()
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

// Use the comprehensive sorting function from sortingHelper
const sortUsersByRankAndName = sortUsersByPositionRankAndName;

export async function collectKomentarRecap(clientId, opts = {}) {
  const { selfOnly, clientFilter, referenceDate } = opts;
  const posts = await getPostsTodayByClient(
    clientId,
    toJakartaDateInput(referenceDate)
  );
  const videoIds = posts.map((p) => p.video_id);
  const commentSets = [];
  const failedVideoIds = [];
  for (const vid of videoIds) {
    try {
      const { comments } = await getCommentsByVideoId(vid);
      commentSets.push(new Set(extractUsernamesFromComments(comments)));
    } catch (error) {
      failedVideoIds.push(vid);
      commentSets.push(new Set());
      sendDebug({
        tag: "ABSEN TTK",
        msg: {
          event: "comment_fetch_failed",
          videoId: vid,
          error: error?.message || error,
        },
        client_id: clientId,
      });
    }
  }
  if (failedVideoIds.length) {
    sendDebug({
      tag: "ABSEN TTK",
      msg: `Komentar gagal diambil untuk konten: ${failedVideoIds.join(", ")}`,
      client_id: clientId,
    });
  }
  const roleName = String(clientId || "").toLowerCase();
  let polresIds;
  if (selfOnly) {
    polresIds = [String(clientId).toUpperCase()];
  } else {
    polresIds = (await getClientsByRole(roleName, clientFilter)).map((c) => c.toUpperCase());
  }
  const filterForUsers = selfOnly ? polresIds : clientFilter || polresIds;
  const allUsers = polresIds.length
    ? (await getUsersByDirektorat(roleName, filterForUsers)).filter(
        (u) => u.status === true
      )
    : [];
  const usersByClient = {};
  allUsers.forEach((u) => {
    const cid = u.client_id?.toUpperCase() || "";
    if (!usersByClient[cid]) usersByClient[cid] = [];
    usersByClient[cid].push(u);
  });
  const recap = {};
  for (const cid of polresIds) {
    const { nama: clientName } = await getClientInfo(cid);
    const users = usersByClient[cid] || [];
    const byDiv = groupByDivision(users);
    const sortedDiv = sortDivisionKeys(Object.keys(byDiv));
    const rows = [];
    sortedDiv.forEach((div) => {
      byDiv[div].forEach((u) => {
        const row = {
          pangkat: u.title || "",
          nama: u.nama || "",
          satfung: div,
        };
        videoIds.forEach((vid, idx) => {
          const uname = normalizeUsername(u.tiktok);
          row[vid] = uname && commentSets[idx].has(uname) ? 1 : 0;
        });
        rows.push(row);
      });
    });
    recap[clientName] = rows;
  }
  return { videoIds, recap, failedVideoIds };
}

// === AKUMULASI (min 50%) ===
export async function absensiKomentar(client_id, opts = {}) {
  const { clientFilter } = opts;
  const roleFlag = opts.roleFlag;
  const normalizedRole = (roleFlag || "").toLowerCase();
  const isOperatorRole = normalizedRole === "operator";
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });

  const clientInfo = await getClientInfo(client_id);
  const clientNama = clientInfo.nama;
  const tiktokUsername = clientInfo.tiktok;
  const allowedRoles = ["ditbinmas", "ditlantas", "bidhumas"];
  let users;
  if (roleFlag && allowedRoles.includes(roleFlag.toLowerCase())) {
    users = (
      await getUsersByDirektorat(roleFlag.toLowerCase())
    ).filter((u) => u.status === true);
  } else {
    users = await getUsersByClient(clientFilter || client_id, roleFlag);
  }
  const posts = await getPostsTodayByClient(client_id);

  sendDebug({
    tag: "ABSEN TTK",
    msg: `Start absensi komentar. Posts=${posts.length} users=${users.length}`,
    client_id,
  });


  if (!posts.length)
    return `Tidak ada konten pada akun Official Tiktok *${clientNama}* hari ini.`;

  const userStats = {};
  users.forEach((u) => {
    userStats[u.user_id] = { ...u, count: 0 };
  });

  const failedVideoIds = [];
  const commentSets = await Promise.all(
    posts.map(async (post) => {
      try {
        const { comments } = await getCommentsByVideoId(post.video_id);
        const commentSet = new Set(extractUsernamesFromComments(comments));
        sendDebug({
          tag: "ABSEN TTK",
          msg: `Post ${post.video_id} comments=${commentSet.size}`,
          client_id,
        });
        return commentSet;
      } catch (error) {
        failedVideoIds.push(post.video_id);
        sendDebug({
          tag: "ABSEN TTK",
          msg: {
            event: "comment_fetch_failed",
            videoId: post.video_id,
            error: error?.message || error,
          },
          client_id,
        });
        return new Set();
      }
    })
  );
  if (failedVideoIds.length) {
    sendDebug({
      tag: "ABSEN TTK",
      msg: `Komentar gagal diambil untuk konten: ${failedVideoIds.join(", ")}`,
      client_id,
    });
  }

  commentSets.forEach((commentSet) => {
    users.forEach((u) => {
      if (
        u.tiktok &&
        u.tiktok.trim() !== "" &&
        commentSet.has(u.tiktok.replace(/^@/, "").toLowerCase())
      ) {
        userStats[u.user_id].count += 1;
      }
    });
  });

  const totalKonten = posts.length;

  if (isOperatorRole) {
    const { divisions: statusByDivision, summary } = groupUsersByDivisionStatus(
      Object.values(userStats),
      {
        totalTarget: totalKonten,
        getCount: (u) => u.count || 0,
        hasUsername: (u) => !!(u.tiktok && u.tiktok.trim() !== ""),
      }
    );

    const kontenLinks = posts.map(
      (p) => `https://www.tiktok.com/@${tiktokUsername}/video/${p.video_id}`
    );
    const mode = (opts && opts.mode) ? String(opts.mode).toLowerCase() : "all";
    const divisionKeys = sortDivisionKeys(Object.keys(statusByDivision));
    const formatUserLine = (u) => {
      const handle = u.tiktok ? u.tiktok : "belum mengisi data tiktok";
      const progress = `(${u.count || 0}/${totalKonten} konten)`;
      return `- ${u.title ? u.title + " " : ""}${u.nama} : ${handle} ${progress}`.trim();
    };

    let msg =
      `Mohon ijin Komandan,\n\n` +
      `📋 *Rekap Akumulasi Komentar TikTok*\n` +
      `*${clientNama}*\n${hari}, ${tanggal}\nJam: ${jam}\n\n` +
      `*Jumlah Konten:* ${totalKonten}\n` +
      `*Daftar Link Konten:*\n${kontenLinks.length ? kontenLinks.join("\n") : "-"}\n\n` +
      `*Jumlah user:* ${summary.total} user\n` +
      `✅ *Melaksanakan lengkap* : *${summary.lengkap} user*\n` +
      `⚠️ *Melaksanakan kurang lengkap* : *${summary.kurang} user*\n` +
      `❌ *Belum melaksanakan* : *${summary.belum} user*\n\n`;

    if (mode === "all" || mode === "sudah") {
      msg += `✅ *Melaksanakan lengkap* (${summary.lengkap} user)\n`;
      msg += `⚠️ *Melaksanakan kurang lengkap* (${summary.kurang} user)\n`;
    }
    if (mode === "all" || mode === "belum") {
      msg += `❌ *Belum melaksanakan* (${summary.belum} user)\n`;
    }
    msg += "\n";

    if (!divisionKeys.length) {
      msg += "-\n";
    } else {
      divisionKeys.forEach((div, idx, arr) => {
        const data = statusByDivision[div];
        const totalDiv =
          data.lengkap.length + data.kurang.length + data.belum.length;
        msg += `*${div}* (${totalDiv} user):\n`;

        if (mode === "all" || mode === "sudah") {
          msg += `✅ Lengkap (${data.lengkap.length} user):\n`;
          const lengkapUsers = sortUsersByRankAndName(data.lengkap);
          const kurangUsers = sortUsersByRankAndName(data.kurang);
          msg += data.lengkap.length
            ? lengkapUsers.map(formatUserLine).join("\n") + "\n"
            : "-\n";
          msg += `⚠️ Kurang (${data.kurang.length} user):\n`;
          msg += data.kurang.length
            ? kurangUsers.map(formatUserLine).join("\n") + "\n"
            : "-\n";
        }

        if (mode === "all" || mode === "belum") {
          const belumUsers = sortUsersByRankAndName(data.belum);
          msg += `❌ Belum (${data.belum.length} user):\n`;
          msg += data.belum.length
            ? belumUsers.map(formatUserLine).join("\n") + "\n"
            : "-\n";
        }

        if (idx < arr.length - 1) msg += "\n";
      });
    }

    if (failedVideoIds.length) {
      msg += `\n\n⚠️ Data komentar gagal diambil untuk konten: ${failedVideoIds.join(", ")}`;
    }

    msg += `\n\nTerimakasih.`;
    return msg.trim();
  }

  if (client_id.toUpperCase() === "DITBINMAS") {
    const groups = {};
    Object.values(userStats).forEach((u) => {
      const cid = u.client_id?.toUpperCase() || "";
      if (!groups[cid])
        groups[cid] = {
          total: 0,
          sudah: 0,
          kurang: 0,
          belum: 0,
          noUsername: 0,
        };
      const g = groups[cid];
      g.total++;
      if (!u.tiktok || u.tiktok.trim() === "") {
        g.noUsername++;
      } else if (u.count >= Math.ceil(totalKonten / 2)) {
        g.sudah++;
      } else if (u.count > 0) {
        g.kurang++;
      } else {
        g.belum++;
      }
    });
    const kontenLinks = posts.map(
      (p) => `https://www.tiktok.com/@${tiktokUsername}/video/${p.video_id}`
    );
    const sortedCids = Object.keys(groups).sort((a, b) => {
      if (a === "DITBINMAS") return -1;
      if (b === "DITBINMAS") return 1;
      const ga = groups[a];
      const gb = groups[b];
      const aEligible = ga.total >= 100;
      const bEligible = gb.total >= 100;
      if (aEligible && bEligible) {
        const pa = ga.sudah / ga.total;
        const pb = gb.sudah / gb.total;
        if (pb !== pa) return pb - pa;
      } else if (aEligible) {
        return -1;
      } else if (bEligible) {
        return 1;
      }
      return gb.sudah - ga.sudah;
    });
    const reports = await Promise.all(
      sortedCids.map(async (cid, index) => {
        const { nama } = await getClientInfo(cid);
        const g = groups[cid];
        const lines = [
          `*${index + 1}. ${nama}*`,
          `*Jumlah user:* ${g.total}`,
          `*Sudah Melaksanakan* : *${g.sudah+g.kurang} user*`,
          `- Melaksanakan Lengkap : ${g.sudah} user`,
        ];
        if (g.kurang > 0) {
          lines.push(`- Melaksanakan Kurang Lengkap : ${g.kurang} user`);
        }
        if (g.belum > 0) {
          lines.push(`*Belum Melaksanakan* : *${g.belum} user*`);
        }
        if (g.noUsername > 0) {
          lines.push(`*Belum Input Username Tiktok* : *${g.noUsername} user*`);
        }
        return lines.join("\n");
      })
    );

    const totals = Object.values(groups).reduce(
      (acc, g) => {
        acc.total += g.total;
        acc.sudah += g.sudah;
        acc.kurang += g.kurang;
        acc.belum += g.belum;
        acc.noUsername += g.noUsername;
        return acc;
      },
      { total: 0, sudah: 0, kurang: 0, belum: 0, noUsername: 0 }
    );

    let msg =
      `Mohon ijin Komandan,\n\n` +
      `📋 *Rekap Akumulasi Komentar TikTok*\n*Direktorat*: *${clientNama}*\n${hari}, ${tanggal}\nJam: ${jam}\n\n` +
      `*Jumlah Konten:* ${totalKonten}\n` +
      `*Daftar Link Konten:*\n${kontenLinks.length ? kontenLinks.join("\n") : "-"}` +
      `\n\n*Total Personel:* ${totals.total}\n` +
      `✅ *Sudah Melaksanakan* : *${totals.sudah+totals.kurang} user*\n` +
      `- ✅ Melaksanakan Lengkap : ${totals.sudah} user\n` +
      `- ⚠️ Melaksanakan Kurang Lengkap : ${totals.kurang} user\n` +
      `❌ *Belum Melaksanakan* : *${totals.belum} user*\n` +
      `⚠️❌ *Belum Input Username Tiktok* : *${totals.noUsername} user*\n\n` +

      reports.join("\n\n");

    if (failedVideoIds.length) {
      msg += `\n\n⚠️ Data komentar gagal diambil untuk konten: ${failedVideoIds.join(", ")}`;
    }

    msg += `\n\nTerimakasih.`;
    return msg.trim();
  }

  let sudah = [], belum = [];

  Object.values(userStats).forEach((u) => {
    if (
      u.tiktok &&
      u.tiktok.trim() !== "" &&
      u.count >= Math.ceil(totalKonten / 2)
    ) {
      sudah.push(u);
    } else {
      belum.push(u);
    }
  });

  sendDebug({
    tag: "ABSEN TTK",
    msg: `UserStats: ${JSON.stringify(userStats)}`,
    client_id,
  });

  // *** PATCH: Gunakan username client untuk membangun link ***
  const kontenLinks = posts.map(
    (p) => `https://www.tiktok.com/@${tiktokUsername}/video/${p.video_id}`
  );

  const mode = (opts && opts.mode) ? String(opts.mode).toLowerCase() : "all";

  const fmtNumber = (value) => value.toLocaleString("id-ID");
  const fmtPercent = (value) =>
    value.toLocaleString("id-ID", {
      minimumFractionDigits: value > 0 && value < 1 ? 1 : 0,
      maximumFractionDigits: 1,
    });

  const usersWithUsername = users.filter(
    (u) => u.tiktok && u.tiktok.trim() !== ""
  );
  const targetPerUser = Math.ceil(totalKonten / 2) || 0;
  const totalEligible = usersWithUsername.length;
  const totalInteractions = Object.values(userStats).reduce(
    (acc, u) => acc + (u.count || 0),
    0
  );
  const targetInteractions = totalEligible * targetPerUser;
  const achievementPct = totalEligible
    ? (sudah.length / totalEligible) * 100
    : 0;
  const interactionPct = targetInteractions
    ? (totalInteractions / targetInteractions) * 100
    : 0;
  const backlogUsername = users.length - totalEligible;
  const belumTarget = usersWithUsername.filter(
    (u) => u.count < targetPerUser
  ).length;

  const uniqueParticipants = new Set();
  commentSets.forEach((set) => {
    set.forEach((uname) => uniqueParticipants.add(uname));
  });

  const contentStats = posts.map((post, idx) => ({
    videoId: post.video_id,
    link: kontenLinks[idx],
    caption: post.caption || "",
    commenters: commentSets[idx]?.size || 0,
  }));
  const sortedContent = [...contentStats].sort(
    (a, b) => b.commenters - a.commenters || a.videoId.localeCompare(b.videoId)
  );
  const bestContent = sortedContent[0];
  const worstContent = sortedContent[sortedContent.length - 1];
  const formatContentHighlight = (stat) => {
    if (!stat) return "-";
    const snippet = stat.caption
      ? stat.caption.length > 60
        ? `${stat.caption.slice(0, 57)}…`
        : stat.caption
      : stat.videoId;
    return `${snippet} – ${fmtNumber(stat.commenters)} akun (${stat.link})`;
  };

  const contributorCandidates = usersWithUsername
    .map((u) => ({ ...u, count: userStats[u.user_id]?.count || 0 }))
    .sort((a, b) => b.count - a.count || formatNama(a).localeCompare(formatNama(b)));
  const topContributors = contributorCandidates.slice(0, 3);
  const topContributorLines = topContributors.length
    ? topContributors
        .map(
          (u, idx) =>
            `${idx + 1}. ${formatNama(u)} – ${u.count}/${totalKonten} konten`
        )
        .join("\n")
    : "-";

  let msg =
    `Mohon ijin Komandan,\n\n` +
    `📊 *Rekap Analitik Komentar TikTok*\n` +
    `*${clientNama}* | ${hari}, ${tanggal} | Jam ${jam} WIB\n\n` +
    `*Ringkasan Capaian*\n` +
    `• Konten dipantau : ${totalKonten}\n` +
    `• Target minimal per personel : ${targetPerUser} konten\n` +
    `• Personel mencapai target : ${fmtNumber(sudah.length)}/${fmtNumber(totalEligible)} (${fmtPercent(achievementPct)}%)\n` +
    `• Interaksi aktual : ${fmtNumber(totalInteractions)}/${fmtNumber(targetInteractions || 0)} (${fmtPercent(interactionPct)}%)\n` +
    `• Partisipan unik : ${fmtNumber(uniqueParticipants.size)} akun\n\n` +
    `*Sorotan Konten*\n` +
    `• Performa tertinggi : ${formatContentHighlight(bestContent)}\n` +
    `• Performa terendah : ${formatContentHighlight(sortedContent.length > 1 ? worstContent : bestContent)}\n\n` +
    `*Kontributor Utama*\n${topContributorLines}\n\n` +
    `*Catatan personel:* ${fmtNumber(users.length)} tercatat (${fmtNumber(totalEligible)} memiliki username, ${fmtNumber(backlogUsername)} belum). ${fmtNumber(belumTarget)} belum mencapai target minimal.\n\n` +
    `*Daftar Link Konten:*\n${kontenLinks.length ? kontenLinks.join("\n") : "-"}`;

  const lampiranSections = [];

  if (mode === "all" || mode === "sudah") {
    const sudahDiv = groupByDivision(sudah);
    const lines = [];
    sortDivisionKeys(Object.keys(sudahDiv)).forEach((div, idx, arr) => {
      const list = sortUsersByRankAndName(sudahDiv[div]);
      lines.push(`*${div}* (${list.length} user):`);
      lines.push(
        list
          .map((u) => {
            const ket = u.count
              ? `(${u.count}/${totalKonten} konten)`
              : "";
            return (
              `- ${u.title ? u.title + " " : ""}${u.nama} : ` +
              `${u.tiktok ? u.tiktok : "belum mengisi data tiktok"} ${ket}`
            ).trim();
          })
          .join("\n")
      );
      if (idx < arr.length - 1) lines.push("");
    });
    if (!Object.keys(sudahDiv).length) lines.push("-");
    lampiranSections.push(
      `✅ *Lampiran – Personel mencapai target* (${sudah.length} user)\n${lines.join("\n")}`
    );
  }

  if (mode === "all" || mode === "belum") {
    const belumDiv = groupByDivision(belum);
    const lines = [];
    sortDivisionKeys(Object.keys(belumDiv)).forEach((div, idx, arr) => {
      const list = sortUsersByRankAndName(belumDiv[div]);
      lines.push(`*${div}* (${list.length} user):`);
      lines.push(
        list
          .map((u) => {
            let ket = "";
            if (!u.count || u.count === 0) {
              ket = `(0/${totalKonten} konten)`;
            } else if (u.count > 0 && u.count < targetPerUser) {
              ket = `(${u.count}/${totalKonten} konten)`;
            }
            return (
              `- ${u.title ? u.title + " " : ""}${u.nama} : ` +
              `${u.tiktok ? u.tiktok : "belum mengisi data tiktok"} ${ket}`
            ).trim();
          })
          .join("\n")
      );
      if (idx < arr.length - 1) lines.push("");
    });
    if (!Object.keys(belumDiv).length) lines.push("-");
    lampiranSections.push(
      `❌ *Lampiran – Personel belum mencapai target* (${belum.length} user)\n${lines.join("\n")}`
    );
  }

  if (lampiranSections.length) {
    msg += `\n\n📎 ${lampiranSections.join("\n\n📎 ")}`;
  }

  if (failedVideoIds.length) {
    msg += `\n\n⚠️ Data komentar gagal diambil untuk konten: ${failedVideoIds.join(", ")}`;
  }

  msg += `\n\nTerimakasih.`;
  return msg.trim();
}

export async function absensiKomentarDitbinmasSimple(clientId = "DITBINMAS") {
  const targetClientId = String(clientId || "DITBINMAS").trim().toUpperCase();
  const roleName = targetClientId.toLowerCase();
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });

  const { tiktok: mainUsername, nama: clientName } = await getClientInfo(targetClientId);
  const clientNameUpper = String(clientName || targetClientId).toUpperCase();
  const posts = await getPostsTodayByClient(targetClientId);
  if (!posts.length)
    return `Tidak ada konten TikTok pada akun Official ${clientNameUpper} hari ini.`;
  const kontenLinks = posts.map(
    (p) => `https://www.tiktok.com/@${mainUsername}/video/${p.video_id}`
  );

  const failedVideoIds = [];
  const commentSets = await Promise.all(
    posts.map(async (p) => {
      try {
        const { comments } = await getCommentsByVideoId(p.video_id);
        return new Set(extractUsernamesFromComments(comments));
      } catch (error) {
        failedVideoIds.push(p.video_id);
        sendDebug({
          tag: "ABSEN TTK",
          msg: {
            event: "comment_fetch_failed",
            videoId: p.video_id,
            error: error?.message || error,
          },
          client_id: targetClientId,
        });
        return new Set();
      }
    })
  );
  if (failedVideoIds.length) {
    sendDebug({
      tag: "ABSEN TTK",
      msg: `Komentar gagal diambil untuk konten: ${failedVideoIds.join(", ")}`,
      client_id: targetClientId,
    });
  }

  const allUsersRaw = await getUsersByDirektorat(roleName, targetClientId);
  const allUsers = allUsersRaw.filter(
    (u) => u.status === true && (u.client_id || "").toUpperCase() === targetClientId
  );

  const categorizedUsers = {
    lengkap: [],
    kurang: [],
    belum: [],
    tanpaUsername: [],
  };

  allUsers.forEach((u) => {
    if (!u.tiktok || u.tiktok.trim() === "") {
      categorizedUsers.tanpaUsername.push(u);
      return;
    }
    const uname = normalizeUsername(u.tiktok);
    let count = 0;
    commentSets.forEach((set) => {
      if (set.has(uname)) count += 1;
    });
    if (count === posts.length) {
      categorizedUsers.lengkap.push(u);
    } else if (count > 0) {
      categorizedUsers.kurang.push(u);
    } else {
      categorizedUsers.belum.push(u);
    }
  });

  const totals = {
    total: allUsers.length,
    lengkap: categorizedUsers.lengkap.length,
    kurang: categorizedUsers.kurang.length,
    belum: categorizedUsers.belum.length,
    tanpaUsername: categorizedUsers.tanpaUsername.length,
  };

  const detailSections = [
    {
      icon: "✅",
      title: "Melaksanakan Lengkap",
      users: sortUsersByRankAndName(categorizedUsers.lengkap),
    },
    {
      icon: "⚠️",
      title: "Melaksanakan Kurang",
      users: sortUsersByRankAndName(categorizedUsers.kurang),
    },
    {
      icon: "❌",
      title: "Belum Melaksanakan",
      users: sortUsersByRankAndName(categorizedUsers.belum),
    },
    {
      icon: "⚠️❌",
      title: "Belum Input Username TikTok",
      users: sortUsersByRankAndName(categorizedUsers.tanpaUsername),
    },
  ];

  const detailText = detailSections
    .map(({ icon, title, users }) => {
      const header = `${icon} *${title} (${users.length} pers):*`;
      if (!users.length) {
        return `${header}\n-`;
      }
      const list = users.map((u) => `- ${formatNama(u)}`).join("\n");
      return `${header}\n${list}`;
    })
    .join("\n\n");

  let msg =
    `Mohon ijin Komandan,\n\n` +
    `📋 Rekap Komentar TikTok (Simple)\n` +
    `*${clientName.toUpperCase()}*\n` +
    `${hari}, ${tanggal}\nJam: ${jam}\n\n` +
    `*Jumlah Konten:* ${posts.length}\n` +
    `*Daftar Link Konten:*\n${kontenLinks.join("\n")}\n\n` +
    `*Jumlah Total Personil:* ${totals.total} pers\n` +
    `✅ *Melaksanakan Lengkap :* ${totals.lengkap} pers\n` +
    `⚠️ *Melaksanakan Kurang :* ${totals.kurang} pers\n` +
    `❌ *Belum :* ${totals.belum} pers\n` +
    `⚠️❌ *Belum Input Username TikTok :* ${totals.tanpaUsername} pers\n\n` +
    detailText;

  if (failedVideoIds.length) {
    msg += `\n\n⚠️ Data komentar gagal diambil untuk konten: ${failedVideoIds.join(", ")}`;
  }

  return msg.trim();
}

export async function absensiKomentarDitbinmasReport(clientId = "DITBINMAS") {
  const targetClientId = String(clientId || "DITBINMAS").trim().toUpperCase();
  const roleName = targetClientId.toLowerCase();
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });

  const { tiktok: mainUsername, nama: clientName } = await getClientInfo(targetClientId);

  const posts = await getPostsTodayByClient(targetClientId);
  if (!posts.length)
    return `Tidak ada konten TikTok pada akun Official ${clientName.toUpperCase()} hari ini.`;
  const kontenLinks = posts.map(
    (p) => `https://www.tiktok.com/@${mainUsername}/video/${p.video_id}`
  );

  const failedVideoIds = [];
  const commentSets = await Promise.all(
    posts.map(async (p) => {
      try {
        const { comments } = await getCommentsByVideoId(p.video_id);
        return new Set(extractUsernamesFromComments(comments));
      } catch (error) {
        failedVideoIds.push(p.video_id);
        sendDebug({
          tag: "ABSEN TTK",
          msg: {
            event: "comment_fetch_failed",
            videoId: p.video_id,
            error: error?.message || error,
          },
          client_id: roleName,
        });
        return new Set();
      }
    })
  );
  if (failedVideoIds.length) {
    sendDebug({
      tag: "ABSEN TTK",
      msg: `Komentar gagal diambil untuk konten: ${failedVideoIds.join(", ")}`,
      client_id: roleName,
    });
  }

  const allUsersRaw = await getUsersByDirektorat(roleName, targetClientId);
  const allUsers = allUsersRaw.filter(
    (u) =>
      u.status === true && (u.client_id || "").toUpperCase() === targetClientId
  );

  const usersByDiv = {};
  allUsers.forEach((u) => {
    const div = u.divisi?.toUpperCase() || "-";
    if (!usersByDiv[div]) usersByDiv[div] = [];
    usersByDiv[div].push(u);
  });

  const totalKonten = posts.length;
  const reportEntries = [];
  const totals = { total: 0, sudah: 0, kurang: 0, belum: 0, noUsername: 0 };

  const divisions = sortDivisionKeys(Object.keys(usersByDiv));

  for (const div of divisions) {
    const users = usersByDiv[div] || [];
    const sudah = [];
    const kurang = [];
    const belum = [];
    const tanpaUsername = [];
    let totalPelaksanaanDivisi = 0;

    users.forEach((u) => {
      const baseData = { user: u, commentCount: 0 };
      if (!u.tiktok || u.tiktok.trim() === "") {
        tanpaUsername.push(baseData);
        return;
      }
      const uname = normalizeUsername(u.tiktok);
      let count = 0;
      commentSets.forEach((set) => {
        if (set.has(uname)) count += 1;
      });
      totalPelaksanaanDivisi += count;
      const payload = { user: u, commentCount: count };
      const percentage = totalKonten ? (count / totalKonten) * 100 : 0;
      if (percentage >= 50) sudah.push(payload);
      else if (percentage > 0) kurang.push(payload);
      else belum.push(payload);
    });

    const belumCount = belum.length + tanpaUsername.length;
    totals.total += users.length;
    totals.sudah += sudah.length;
    totals.kurang += kurang.length;
    totals.belum += belumCount;
    totals.noUsername += tanpaUsername.length;

    reportEntries.push({
      clientName: div,
      usersCount: users.length,
      sudahCount: sudah.length,
      kurangCount: kurang.length,
      belumCount,
      noUsernameCount: tanpaUsername.length,
      totalPelaksanaanDivisi,
      sudahList: sudah.map(
        ({ user, commentCount }) =>
          `- ${formatNama(user)}, Pelaksanaan: ${commentCount}/${totalKonten}`
      ),
      kurangList: kurang.map(
        ({ user, commentCount }) =>
          `- ${formatNama(user)}, Pelaksanaan: ${commentCount}/${totalKonten}`
      ),
      belumList: belum.map(
        ({ user, commentCount }) =>
          `- ${formatNama(user)}, Pelaksanaan: ${commentCount}/${totalKonten}`
      ),
      noUsernameList: tanpaUsername.map(
        ({ user, commentCount }) =>
          `- ${formatNama(user)}, Pelaksanaan: ${commentCount}/${totalKonten}`
      ),
    });
  }

  reportEntries.sort((a, b) => {
    if (a.totalPelaksanaanDivisi !== b.totalPelaksanaanDivisi) {
      return b.totalPelaksanaanDivisi - a.totalPelaksanaanDivisi;
    }
    const aPct = a.usersCount ? a.sudahCount / a.usersCount : 0;
    const bPct = b.usersCount ? b.sudahCount / b.usersCount : 0;
    if (aPct !== bPct) return bPct - aPct;
    if (a.usersCount !== b.usersCount) return b.usersCount - a.usersCount;
    return a.clientName.localeCompare(b.clientName);
  });

  const reports = reportEntries.map((r, idx) => {
    const sudahList = r.sudahList.length ? r.sudahList.join("\n") : "-";
    const kurangList = r.kurangList.length ? r.kurangList.join("\n") : "-";
    const belumList = r.belumList.length ? r.belumList.join("\n") : "-";
    const noUsernameList = r.noUsernameList.length
      ? r.noUsernameList.join("\n")
      : "-";

    const totalTarget = r.usersCount * totalKonten;
    let entry =
      `*${idx + 1}. ${r.clientName}*\n` +
      `*Jumlah Personil* : ${r.usersCount} pers\n` +
      `*Akumulasi Pelaksanaan* : ${r.totalPelaksanaanDivisi}/${totalTarget}\n` +
      `✅ Melaksanakan Lengkap (${r.sudahCount} pers):\n${sudahList}`;

    if (r.kurangCount > 0) {
      entry += `\n⚠️ Melaksanakan Kurang Lengkap (${r.kurangCount} pers):\n${kurangList}`;
    }

    if (r.belumList.length > 0) {
      entry += `\n❌ Belum melaksanakan (${r.belumList.length} pers):\n${belumList}`;
    }

    if (r.noUsernameCount > 0) {
      entry += `\n⚠️ Belum Update Username TikTok (${r.noUsernameCount} pers):\n${noUsernameList}`;
    }

    return entry;
  });

    let msg =
      `Mohon ijin Komandan,\n\n` +
      `📋 *Rekap Akumulasi Komentar TikTok*\n` +
      `*Polres*: *${clientName}*\n${hari}, ${tanggal}\nJam: ${jam}\n\n` +
    `*Jumlah Konten:* ${totalKonten}\n` +
    `*Daftar Link Konten:*\n${kontenLinks.length ? kontenLinks.join("\n") : "-"}\n\n` +
    `*Jumlah Total Personil:* ${totals.total} pers\n` +
    `✅ *Sudah Melaksanakan* : *${totals.sudah+totals.kurang} pers*\n` +
    `- ✅ *Melaksanakan Lengkap* : *${totals.sudah} pers*\n` +
    `- ⚠️ *Melaksanakan kurang lengkap* : *${totals.kurang} pers*\n` +
    `❌ *Belum melaksanakan* : *${totals.belum} pers*\n` +
    `⚠️❌ *Belum Update Username TikTok* : *${totals.noUsername} pers*\n\n` +
    reports.join("\n\n");

  if (failedVideoIds.length) {
    msg += `\n\n⚠️ Data komentar gagal diambil untuk konten: ${failedVideoIds.join(", ")}`;
  }

  msg += "\n\nTerimakasih.";

  return msg.trim();
}

export async function lapharTiktokDitbinmas(clientId = "DITBINMAS") {
  const roleName = String(clientId || "DITBINMAS").toLowerCase();
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const dateKey = now.toDateString();
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });
  const dateSafe = tanggal.replace(/\//g, "-");
  const timeSafe = jam.replace(/[:.]/g, "-");
  const filename = `Absensi_All_Engagement_Tiktok_${hari}_${dateSafe}_${timeSafe}.txt`;
  const filenameBelum = `Absensi_Belum_Engagement_Tiktok_${hari}_${dateSafe}_${timeSafe}.txt`;

  const { tiktok: mainUsername, nama: clientName } = await getClientInfo(clientId);
  const clientNameUpper = String(clientName || clientId || roleName).toUpperCase();

  const posts = await getPostsTodayByClient(roleName);
  if (!posts.length)
    return { filename, text: `Tidak ada konten TikTok untuk ${clientNameUpper} hari ini.` };
  const kontenLinks = [];
  const commentSets = [];
  const commentCounts = [];
  const failedVideoIds = [];
  for (const p of posts) {
    const link = `https://www.tiktok.com/@${mainUsername}/video/${p.video_id}`;
    kontenLinks.push(link);
    try {
      const { comments } = await getCommentsByVideoId(p.video_id);
      const cSet = new Set(extractUsernamesFromComments(comments));
      commentSets.push(cSet);
      commentCounts.push(cSet.size);
    } catch (error) {
      failedVideoIds.push(p.video_id);
      commentSets.push(new Set());
      commentCounts.push(0);
      sendDebug({
        tag: "ABSEN TTK",
        msg: {
          event: "comment_fetch_failed",
          videoId: p.video_id,
          error: error?.message || error,
        },
        client_id: roleName,
      });
    }
  }

  if (failedVideoIds.length) {
    sendDebug({
      tag: "ABSEN TTK",
      msg: `Komentar gagal diambil untuk konten: ${failedVideoIds.join(", ")}`,
      client_id: roleName,
    });
  }

  const { getClientsByRole } = await import("../../../model/userModel.js");
  const polresIds = (
    await getClientsByRole(roleName)
  )
    .map((c) => c.toUpperCase())
    .filter((cid) => cid !== clientNameUpper);
  const clientIds = [clientNameUpper, ...polresIds];
  const allUsers = (
    await getUsersByDirektorat(roleName, clientIds)
  ).filter((u) => u.status === true);

  const usersByClient = {};
  clientIds.forEach((cid) => (usersByClient[cid] = []));
  allUsers.forEach((u) => {
    const cid = (u.client_id || "").toUpperCase();
    if (!usersByClient[cid]) usersByClient[cid] = [];
    usersByClient[cid].push(u);
  });

  commentSets.forEach((set, idx) => {
    commentCounts[idx] = set.size;
  });
  const failedVideoSet = new Set(failedVideoIds);

  const pangkatOrder = [
    "AKP",
    "IPTU",
    "IPDA",
    "AIPTU",
    "AIPDA",
    "BRIPKA",
    "BRIGADIR",
    "BRIPTU",
    "BRIPDA",
    "PENATA",
    "PENGATUR TINGKAT I",
    "PENGATUR MUDA TINGKAT I",
    "PENGATUR",
    "JURU",
    "PPPK",
    "PHL",
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
      if (!u.insta || u.insta.trim() === "") {
        noUname.push(u);
      }
      if (!u.tiktok || u.tiktok.trim() === "") {
        noTiktok++;
        return;
      }
      const uname = normalizeUsername(u.tiktok);
      let count = 0;
      commentSets.forEach((set) => {
        if (set.has(uname)) count += 1;
      });
      if (count === posts.length) already.push({ ...u, count });
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

    const commentSum =
      already.reduce((acc, u) => acc + (u.count || 0), 0) +
      partial.reduce((acc, u) => acc + (u.count || 0), 0);

    const blockLines = [
      `*${clientName.toUpperCase()}* : ${users.length} / ${already.length} / ${partial.length} / ${
        none.length + noUname.length
      } / ${noUname.length} / ${noTiktok}`,
      `Komentar lengkap : ${already.length}`,
      ...already.map((u) => `- ${formatNama(u)}, ${u.count}`),
    ];

    blockLines.push("");
    blockLines.push(`Komentar Kurang : ${partial.length}`);
    if (partial.length) {
      blockLines.push(...partial.map((u) => `- ${formatNama(u)}, ${u.count}`));
    }

    blockLines.push("");
    blockLines.push(`Belum Komentar : ${none.length}`);
    if (none.length) {
      blockLines.push("");
      blockLines.push(...none.map((u) => `- ${formatNama(u)}, ${u.tiktok || "-"}`));
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
      comments: commentSum,
      block: blockLines.join("\n"),
      igPercent,
      tiktokPercent,
      noUsername: noUname.length,
      noTiktok,
      totalUsers: users.length,
      alreadyCount: already.length,
      partialCount: partial.length,
      noneCount: none.length,
      eligibleUsers: users.length - noTiktok,
      activeCount: already.length + partial.length,
    });

    if (none.length || noUname.length) {
      const belumLines = [`*${clientName.toUpperCase()}*`];
      if (none.length) {
        belumLines.push(`Belum Komentar : ${none.length}`);
        belumLines.push(
          ...none.map((u) => `- ${formatNama(u)}, ${u.tiktok || "-"}`)
        );
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
    if (a.cid === clientNameUpper) return -1;
    if (b.cid === clientNameUpper) return 1;
    if (a.comments !== b.comments) return b.comments - a.comments;
    return a.name.localeCompare(b.name);
  });

  const perClientBlocks = perClientStats.map((p) => p.block);
  const satkerStats = perClientStats.filter((p) => p.cid !== clientNameUpper);
  const fmtNum = (n) => n.toLocaleString("id-ID");

  const contentStats = kontenLinks.map((link, idx) => {
    const videoId = posts[idx]?.video_id;
    const caption = posts[idx]?.caption || "";
    const commenters = commentCounts[idx] || 0;
    const failed = failedVideoSet.has(videoId);
    return { link, videoId, caption, commenters, failed };
  });
  const komentarDistribusi = contentStats.length
    ? contentStats
        .map((item, idx) =>
          item.failed
            ? `${idx + 1}. ${item.link} — data komentar gagal diambil`
            : `${idx + 1}. ${item.link} — ${fmtNum(item.commenters)} akun`
        )
        .join("\n")
    : "-";

  let text =
    `Mohon ijin Komandan,\n\n` +
      `📋 Rekap Akumulasi Komentar TikTok\n` +
    `*${clientNameUpper}*\n` +
    `${hari}, ${tanggal}\n` +
    `Jam: ${jam}\n\n` +
    `Jumlah Konten: ${posts.length}\n` +
    `Daftar Link Konten Tiktok:\n${kontenLinks.map((l) => `- ${l}`).join("\n")}\n\n` +
    `Jumlah Total Personil : ${totals.total} pers\n` +
    `Sudah Melaksanakan : ${totals.sudah+totals.kurang} pers\n` +
    `- Melaksanakan lengkap : ${totals.sudah} pers\n` +
    `- Melaksanakan kurang lengkap : ${totals.kurang} pers\n` +
    `Belum melaksanakan : ${totals.belum} pers\n` +
    `Belum Update Username Tiktok : ${totals.noTiktok} pers\n\n` +
    `_Kesatuan  :  Jumlah user / Sudah komentar / Komentar kurang/ Belum komentar/ Belum input TikTok_\n` +
    `${perClientBlocks.join("\n\n")}` +
    `\n\nDistribusi komentar per konten:\n${komentarDistribusi}`;

  const satkerRank = [...satkerStats].sort(
    (a, b) => b.comments - a.comments || a.name.localeCompare(b.name)
  );
  const topFiveSatker = satkerRank.slice(0, 5);
  const bottomFiveSatker = [...satkerRank].reverse().slice(0, 5);
  const formatSatkerList = (arr) =>
    arr.length
      ? arr
          .map((p, idx) => `${idx + 1}. ${p.name} – ${fmtNum(p.comments)} komentar`)
          .join("\n")
      : "-";

  let narrative =
    `Mohon Ijin Komandan, rekap singkat komentar TikTok hari ${hari}, ${tanggal} pukul ${jam} WIB.\n\n` +
    `🎵 TikTok (${clientNameUpper})\n` +
    `Top 5 Komentar:\n${formatSatkerList(topFiveSatker)}\n\n` +
    `Bottom 5 Komentar:\n${formatSatkerList(bottomFiveSatker)}`;

  const rankingData = {
    generatedDate: tanggal,
    generatedDateKey: dateKey,
    metricLabel: "komentar",
    top: topFiveSatker.map((satker) => ({
      name: satker.name,
      score: satker.comments,
    })),
    bottom: bottomFiveSatker.map((satker) => ({
      name: satker.name,
      score: satker.comments,
    })),
  };

  let textBelum =
    `Belum melaksanakan Komentar atau belum input username IG/Tiktok\n` +
    `Polres: ${clientNameUpper}\n` +
    `${hari}, ${tanggal}\n` +
    `Jam: ${jam}\n\n` +
    `${perClientBelumBlocks.join("\n\n")}`;

  if (failedVideoIds.length) {
    const failureNote = `⚠️ Data komentar gagal diambil untuk konten: ${failedVideoIds.join(", ")}`;
    text += `\n\n${failureNote}`;
    narrative += `\n\n${failureNote}`;
    textBelum += `\n\n${failureNote}`;
  }

  return {
    filename,
    text: text.trim(),
    narrative,
    rankingData,
    filenameBelum,
    textBelum: textBelum.trim(),
  };
}

// === PER KONTEN ===
export async function absensiKomentarTiktokPerKonten(client_id, opts = {}) {
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });

  const clientInfo = await getClientInfo(client_id);
  const clientNama = clientInfo.nama;
  const tiktokUsername = clientInfo.tiktok;
  const clientLabel =
    clientInfo.clientType && clientInfo.clientType.toLowerCase() === "direktorat"
      ? "Direktorat"
      : "Polres";
  const users = await getUsersByClient(client_id);
  const posts = await getPostsTodayByClient(client_id);
  sendDebug({
    tag: "ABSEN TTK",
    msg: `Start per-konten absensi. Posts=${posts.length} users=${users.length}`,
    client_id,
  });

  if (!posts.length)
    return `Tidak ada konten TikTok untuk *${clientLabel}*: *${clientNama}* hari ini.`;

  const mode = (opts && opts.mode) ? String(opts.mode).toLowerCase() : "all";
  let msg =
    `Mohon ijin Komandan,\n\n` +
    `📋 *Rekap Per Konten Komentar TikTok*\n*${clientLabel}*: *${clientNama}*\n${hari}, ${tanggal}\nJam: ${jam}\n\n` +
    `*Jumlah Konten:* ${posts.length}\n`;

  const failedVideoIds = [];
  for (const p of posts) {
    let commentSet = new Set();
    let fetchFailed = false;
    try {
      const { comments } = await getCommentsByVideoId(p.video_id);
      commentSet = new Set(extractUsernamesFromComments(comments));
      sendDebug({
        tag: "ABSEN TTK",
        msg: `Per konten ${p.video_id} comments=${commentSet.size}`,
        client_id,
      });
    } catch (error) {
      fetchFailed = true;
      failedVideoIds.push(p.video_id);
      sendDebug({
        tag: "ABSEN TTK",
        msg: {
          event: "comment_fetch_failed",
          videoId: p.video_id,
          error: error?.message || error,
        },
        client_id,
      });
    }
    let userSudah = [];
    let userBelum = [];
    users.forEach((u) => {
      if (u.exception === true) {
        userSudah.push(u);
      } else if (
        u.tiktok &&
        u.tiktok.trim() !== "" &&
        commentSet.has(u.tiktok.replace(/^@/, "").toLowerCase())
      ) {
        userSudah.push(u);
      } else {
        userBelum.push(u);
      }
    });
    userBelum = userBelum.filter(u => !u.exception);

    // *** PATCH: Gunakan username client untuk membangun link ***
    msg += `\nKonten: https://www.tiktok.com/@${tiktokUsername}/video/${p.video_id}\n`;
    msg += `✅ *Sudah melaksanakan* : *${userSudah.length} user*\n`;
    msg += `❌ *Belum melaksanakan* : *${userBelum.length} user*\n`;

    if (fetchFailed) {
      msg += `⚠️ Data komentar gagal diambil untuk konten ini.\n`;
    }

    if (mode === "all" || mode === "sudah") {
      msg += `✅ *Sudah melaksanakan* (${userSudah.length} user):\n`;
      const sudahDiv = groupByDivision(userSudah);
      sortDivisionKeys(Object.keys(sudahDiv)).forEach((div, idx, arr) => {
        const list = sudahDiv[div];
        msg += `*${div}* (${list.length} user):\n`;
        msg += list.length
          ? list.map(u =>
              `- ${u.title ? u.title + " " : ""}${u.nama} : ${u.tiktok || "-"}`
            ).join("\n") + "\n"
          : "-\n";
        if (idx < arr.length - 1) msg += "\n";
      });
      if (Object.keys(sudahDiv).length === 0) msg += "-\n";
      msg += "\n";
    }

    if (mode === "all" || mode === "belum") {
      msg += `❌ *Belum melaksanakan* (${userBelum.length} user):\n`;
      const belumDiv = groupByDivision(userBelum);
      sortDivisionKeys(Object.keys(belumDiv)).forEach((div, idx, arr) => {
        const list = belumDiv[div];
        msg += list.length
          ? `*${div}* (${list.length} user):\n` +
            list.map(u =>
              `- ${u.title ? u.title + " " : ""}${u.nama} : ${u.tiktok || "-"}`
            ).join("\n") + "\n"
          : "-\n";
        if (idx < arr.length - 1) msg += "\n";
      });
      if (Object.keys(belumDiv).length === 0) msg += "-\n";
      msg += "\n";
    }
  }
  if (failedVideoIds.length) {
    sendDebug({
      tag: "ABSEN TTK",
      msg: `Komentar gagal diambil untuk konten: ${failedVideoIds.join(", ")}`,
      client_id,
    });
    msg += `\n⚠️ Data komentar gagal diambil untuk konten: ${failedVideoIds.join(", ")}.\n`;
  }
  msg += `Terimakasih.`;
  return msg.trim();
}
