import { query } from "../../../db/index.js";
import { getUsersByClient } from "../../../model/userModel.js";
import { getShortcodesTodayByClient } from "../../../model/instaPostModel.js";
import { hariIndo } from "../../../utils/constants.js";
import {
  groupByDivision,
  sortDivisionKeys,
  formatNama,
  groupUsersByDivisionStatus,
} from "../../../utils/utilsHelper.js";
import { findClientById } from "../../../service/clientService.js";
import {
  normalizeUsername,
  getLikesSets,
  groupUsersByClientDivision,
} from "../../../utils/likesHelper.js";
import { getClientInfo } from "../../../service/instagram/instagramReport.js";
import { computeDitbinmasLikesStats } from "./ditbinmasLikesUtils.js";
import { sortUsersByPositionRankAndName } from "../../../utils/sortingHelper.js";

// Use the comprehensive sorting function from sortingHelper
const sortUsersByRankAndName = sortUsersByPositionRankAndName;

export async function collectLikesRecap(clientId, opts = {}) {
  const roleName = String(clientId || "").toLowerCase();
  let shortcodes;
  try {
    shortcodes = await getShortcodesTodayByClient(clientId);
  } catch (error) {
    console.error(error);
    return "Maaf, gagal mengambil data konten Instagram.";
  }

  let likesSets;
  try {
    likesSets = await getLikesSets(shortcodes);
  } catch (error) {
    console.error(error);
    return "Maaf, gagal mengambil data likes Instagram.";
  }

  let polresIds, usersByClient;
  try {
    ({ polresIds, usersByClient } = await groupUsersByClientDivision(
      roleName,
      { selfOnly: opts.selfOnly }
    ));
  } catch (error) {
    console.error(error);
    return "Maaf, gagal mengelompokkan pengguna.";
  }
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
        shortcodes.forEach((sc, idx) => {
          const uname = normalizeUsername(u.insta);
          row[sc] = uname && likesSets[idx].has(uname) ? 1 : 0;
        });
        rows.push(row);
      });
    });
    recap[clientName] = rows;
  }
  return { shortcodes, recap };
}

// === AKUMULASI ===
export async function absensiLikes(client_id, opts = {}) {
  const { clientFilter } = opts;
  const roleFlag = opts.roleFlag;
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });

  const { nama: clientNama, clientType } = await getClientInfo(client_id);
  const allowedRoles = ["ditbinmas", "ditlantas", "bidhumas"];
  const normalizedRole = (roleFlag || "").toLowerCase();
  const normalizedClient = (client_id || "").toLowerCase();
  const isDirektoratContext =
    clientType === "direktorat" ||
    (allowedRoles.includes(normalizedRole) && normalizedRole === normalizedClient);

  if (isDirektoratContext) {
    const roleName = allowedRoles.includes(normalizedRole)
      ? normalizedRole
      : normalizedClient;
    let shortcodes;
    try {
      shortcodes = await getShortcodesTodayByClient(roleName);
    } catch (error) {
      console.error(error);
      return "Maaf, gagal mengambil data konten Instagram.";
    }
    if (!shortcodes.length)
      return `Tidak ada konten pada akun Official Instagram *${clientNama}* hari ini.`;

    const kontenLinks = shortcodes.map(
      (sc) => `https://www.instagram.com/p/${sc}`
    );
    let likesSets;
    try {
      likesSets = await getLikesSets(shortcodes);
    } catch (error) {
      console.error(error);
      return "Maaf, gagal mengambil data likes Instagram.";
    }
    let polresIds, usersByClient;
    try {
      ({ polresIds, usersByClient } = await groupUsersByClientDivision(
        roleName,
        { clientFilter }
      ));
    } catch (error) {
      console.error(error);
      return "Maaf, gagal mengelompokkan pengguna.";
    }


    const totalKonten = shortcodes.length;
    const reportEntries = [];
    const totals = { total: 0, sudah: 0, kurang: 0, belum: 0, noUsername: 0 };
    for (let i = 0; i < polresIds.length; i++) {
      const cid = polresIds[i];
      const users = usersByClient[cid] || [];
      const { nama: clientName } = await getClientInfo(cid);
      const sudah = [];
      const kurang = [];
      const belum = [];
      const tanpaUsername = [];
      users.forEach((u) => {
        if (!u.insta || u.insta.trim() === "") {
          tanpaUsername.push(u);
          return;
        }
        const uname = normalizeUsername(u.insta);
        let count = 0;
        likesSets.forEach((set) => {
          if (set.has(uname)) count += 1;
        });
        const percentage = totalKonten ? (count / totalKonten) * 100 : 0;
        if (percentage >= 50) sudah.push(u);
        else if (percentage > 0) kurang.push(u);
        else belum.push(u);
      });
      const belumCount = belum.length + tanpaUsername.length;
      totals.total += users.length;
      totals.sudah += sudah.length;
      totals.kurang += kurang.length;
      totals.belum += belumCount;
      totals.noUsername += tanpaUsername.length;
      reportEntries.push({
        clientName,
        usersCount: users.length,
        sudahCount: sudah.length,
        kurangCount: kurang.length,
        belumCount,
        noUsernameCount: tanpaUsername.length,
      });
    }

    reportEntries.sort((a, b) => {
      const aBinmas = a.clientName.toUpperCase() === "DIREKTORAT BINMAS";
      const bBinmas = b.clientName.toUpperCase() === "DIREKTORAT BINMAS";
      if (aBinmas && !bBinmas) return -1;
      if (bBinmas && !aBinmas) return 1;
      if (a.sudahCount !== b.sudahCount) return b.sudahCount - a.sudahCount;
      if (a.usersCount !== b.usersCount) return b.usersCount - a.usersCount;
      return a.clientName.localeCompare(b.clientName);
    });

    const reports = reportEntries.map(
      (r, idx) =>
        `${idx + 1}. ${r.clientName}\n` +
        `*Jumlah Personil :* ${r.usersCount} pers\n` +
        `*Sudah Melaksanakan :* ${r.sudahCount+r.kurangCount} pers\n` +
        `- Melaksanakan lengkap : ${r.sudahCount} pers\n` +
        `- Melaksanakan kurang lengkap : ${r.kurangCount} pers\n` +
        `*Belum melaksanakan :* ${r.belumCount} pers\n` +
        `*Belum Update Username Instagram :* ${r.noUsernameCount} pers\n`
    );

    let msg =
      `Mohon ijin Komandan,\n\n` +
      `📋 Rekap Akumulasi Likes Instagram\n` +
      `*${clientNama}\n${hari}*, ${tanggal}\nJam: ${jam}\n\n` +
      `*Jumlah Konten :* ${totalKonten}\n` +
      `*Daftar Link Konten :*\n${kontenLinks.length ? kontenLinks.join("\n") : "-"}\n\n` +
      `*Jumlah Total Personil :* ${totals.total} pers\n` +
      `✅ *Sudah melaksanakan :* ${totals.sudah+totals.kurang} pers\n` +
      `- ✅ Melaksanakan lengkap : ${totals.sudah} pers\n` +
      `- ⚠️ Melaksanakan kurang lengkap : ${totals.kurang} pers\n` +
      `❌ *Belum melaksanakan :* ${totals.belum} pers\n` +
      `⚠️❌ *Belum Update Username Instagram :* ${totals.noUsername} pers\n\n` +
      reports.join("\n");
    return msg.trim();
  }

  const users = await getUsersByClient(clientFilter || client_id, roleFlag);
  const targetClient = clientFilter || client_id;
  let shortcodes;
  try {
    shortcodes = await getShortcodesTodayByClient(targetClient);
  } catch (error) {
    console.error(error);
    return "Maaf, gagal mengambil data konten Instagram.";
  }

  if (!shortcodes.length)
    return `Tidak ada konten pada akun Official Instagram  *${clientNama}* hari ini.`;

  const userStats = {};
  users.forEach((u) => {
    userStats[u.user_id] = { ...u, count: 0 };
  });
  let likesSets;
  try {
    likesSets = await getLikesSets(shortcodes);
  } catch (error) {
    console.error(error);
    return "Maaf, gagal mengambil data likes Instagram.";
  }
  likesSets.forEach((likesSet) => {
    users.forEach((u) => {
      if (
        u.insta &&
        u.insta.trim() !== "" &&
        likesSet.has(normalizeUsername(u.insta))
      ) {
        userStats[u.user_id].count += 1;
      }
    });
  });

  const totalKonten = shortcodes.length;
  const { divisions: statusByDivision, summary } = groupUsersByDivisionStatus(
    Object.values(userStats),
    {
      totalTarget: totalKonten,
      getCount: (u) => u.count || 0,
      hasUsername: (u) => !!(u.insta && u.insta.trim() !== ""),
    }
  );

  const kontenLinks = shortcodes.map(
    (sc) => `https://www.instagram.com/p/${sc}`
  );

  // --- PATCH: Mode support ---
  const mode = (opts && opts.mode) ? String(opts.mode).toLowerCase() : "all";

  // Header: tampilkan jumlah sudah & belum SELALU
  let msg =
    `Mohon ijin Komandan,\n\n` +
    `📋 *Rekap Akumulasi Likes Instagram*\n*Polres*: *${clientNama}*\n${hari}, ${tanggal}\nJam: ${jam}\n\n` +
    `*Jumlah Konten:* ${totalKonten}\n` +
    `*Daftar Link Konten:*\n${kontenLinks.length ? kontenLinks.join("\n") : "-"}\n\n` +
    `*Jumlah user:* ${summary.total} user\n` +
    `✅ *Melaksanakan lengkap* : *${summary.lengkap} user*\n` +
    `⚠️ *Melaksanakan kurang lengkap* : *${summary.kurang} user*\n` +
    `❌ *Belum melaksanakan* : *${summary.belum} user*\n\n`;

  const divisionKeys = sortDivisionKeys(Object.keys(statusByDivision));
  const formatUserLine = (u) => {
    const handle = u.insta ? `@${u.insta.replace(/^@/, "")}` : "-";
    const progress = `(${u.count || 0}/${totalKonten} konten)`;
    return `- ${u.title ? u.title + " " : ""}${u.nama} : ${handle} ${progress}`.trim();
  };

  if (mode === "all" || mode === "sudah") {
    msg += `✅ *Melaksanakan lengkap* (${summary.lengkap} user)\n`;
  }
  if (mode === "all" || mode === "sudah") {
    msg += `⚠️ *Melaksanakan kurang lengkap* (${summary.kurang} user)\n`;
  }
  if (mode === "all" || mode === "belum") {
    msg += `❌ *Belum melaksanakan* (${summary.belum} user)\n`;
  }
  msg += "\n";

  if (!divisionKeys.length) {
    msg += "-\n\n";
  } else {
    divisionKeys.forEach((div, idx, arr) => {
      const data = statusByDivision[div];
      const totalDiv =
        data.lengkap.length + data.kurang.length + data.belum.length;
      msg += `*${div}* (${totalDiv} user):\n`;

      if (mode === "all" || mode === "sudah") {
        const lengkapUsers = sortUsersByRankAndName(data.lengkap);
        const kurangUsers = sortUsersByRankAndName(data.kurang);
        msg += `✅ Lengkap (${data.lengkap.length} user):\n`;
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
    msg += "\n";
  }

  msg += `Terimakasih.`;
  return msg.trim();
}

// === PER KONTEN ===
export async function absensiLikesPerKonten(client_id, opts = {}) {
  const { clientFilter } = opts;
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });

  const { nama: clientNama } = await getClientInfo(client_id);
  const users = await getUsersByClient(client_id);
  const targetClient = clientFilter || client_id;
  let shortcodes;
  try {
    shortcodes = await getShortcodesTodayByClient(targetClient);
  } catch (error) {
    console.error(error);
    return "Maaf, gagal mengambil data konten Instagram.";
  }

  if (!shortcodes.length)
    return `Tidak ada konten IG untuk *Polres*: *${clientNama}* hari ini.`;

  const mode = (opts && opts.mode) ? String(opts.mode).toLowerCase() : "all";
  let msg =
    `Mohon ijin Komandan,\n\n` +
    `📋 *Rekap Per Konten Likes Instagram*\n *${clientNama}*\n${hari}, ${tanggal}\nJam: ${jam}\n\n` +
    `*Jumlah Konten:* ${shortcodes.length}\n`;
  let likesSets;
  try {
    likesSets = await getLikesSets(shortcodes);
  } catch (error) {
    console.error(error);
    return "Maaf, gagal mengambil data likes Instagram.";
  }

  shortcodes.forEach((sc, idx) => {
    const likesSet = likesSets[idx];
    let userSudah = [];
    let userBelum = [];
    users.forEach((u) => {
      if (
        u.insta &&
        u.insta.trim() !== "" &&
        likesSet.has(normalizeUsername(u.insta))
      ) {
        userSudah.push(u);
      } else {
        userBelum.push(u);
      }
    });

    // Header per konten
    msg += `\nKonten: https://www.instagram.com/p/${sc}\n`;
    msg += `✅ *Sudah melaksanakan* : *${userSudah.length} user*\n`;
    msg += `❌ *Belum melaksanakan* : *${userBelum.length} user*\n`;

    if (mode === "all" || mode === "sudah") {
      msg += `✅ *Sudah melaksanakan* (${userSudah.length} user):\n`;
      const sudahDiv = groupByDivision(userSudah);
      sortDivisionKeys(Object.keys(sudahDiv)).forEach((div, idx, arr) => {
        const list = sudahDiv[div];
        msg += `*${div}* (${list.length} user):\n`;
        msg += list.length
          ? list.map(u =>
              `- ${u.title ? u.title + " " : ""}${u.nama} : ${u.insta ? `@${u.insta.replace(/^@/, "")}` : "-"}`
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
              `- ${u.title ? u.title + " " : ""}${u.nama} : ${u.insta ? `@${u.insta.replace(/^@/, "")}` : "-"}`
            ).join("\n") + "\n"
          : "-\n";
        if (idx < arr.length - 1) msg += "\n";
      });
      if (Object.keys(belumDiv).length === 0) msg += "-\n";
      msg += "\n";
    }
  });
  msg += `Terimakasih.`;
  return msg.trim();
}

export async function getActiveClientsIG() {
  const res = await query(
    `SELECT client_id, client_insta, client_insta_status
     FROM clients
     WHERE client_status = true
       AND client_insta_status = true
       AND client_insta IS NOT NULL
       AND client_type = 'ORG'`
  );
  return res.rows;
}

export async function rekapLikesIG(client_id) {
  const client = await findClientById(client_id);
  const polresNama = client?.nama || client_id;

  let shortcodes;
  try {
    shortcodes = await getShortcodesTodayByClient(client_id);
  } catch (error) {
    console.error(error);
    return "Maaf, gagal mengambil data konten Instagram.";
  }
  if (!shortcodes.length) return null;
  let likesSets;
  try {
    likesSets = await getLikesSets(shortcodes);
  } catch (error) {
    console.error(error);
    return "Maaf, gagal mengambil data likes Instagram.";
  }
  let totalLikes = 0;
  const detailLikes = likesSets.map((set, idx) => {
    const jumlahLikes = set.size;
    totalLikes += jumlahLikes;
    const sc = shortcodes[idx];
    return {
      shortcode: sc,
      link: `https://www.instagram.com/p/${sc}`,
      jumlahLikes,
    };
  });

  let msg =
    "Mohon Ijin Komandan, Senior, Rekan Operator dan Personil pelaksana Tugas Likes dan komentar Sosial Media Ditbinmas.\n\n" +
    "Tugas Likes dan Komentar Konten Instagram dari akun official Instagram Ditbinmas\n" +
    `${polresNama.toUpperCase()}\n` +
    `*Jumlah konten hari ini:* ${shortcodes.length}\n` +
    `*Total likes semua konten:* ${totalLikes}\n\n` +
    "Rincian:\n";

  detailLikes.forEach((d) => {
    msg += `- ${d.link} : ${d.jumlahLikes} like\n`;
  });

  msg += "\nSilahkan Melaksanakan Likes, Komentar dan Share.";

  return msg.trim();
}

export async function absensiLikesDitbinmasSimple(clientId = "DITBINMAS") {
  const targetClientId = String(clientId || "DITBINMAS").trim().toUpperCase();
  const roleName = targetClientId.toLowerCase();
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });

  let shortcodes;
  try {
    shortcodes = await getShortcodesTodayByClient(targetClientId);
  } catch (error) {
    console.error(error);
    return "Maaf, gagal mengambil data konten Instagram.";
  }
  const { nama: clientName } = await getClientInfo(targetClientId);

  if (!shortcodes.length)
    return `*Belum ada konten Instagram terbaru pada akun official ${clientName.toUpperCase()} pada hari ini.*`;

  const kontenLinks = shortcodes.map((sc) => `https://www.instagram.com/p/${sc}`);
  let likesSets;
  try {
    likesSets = await getLikesSets(shortcodes);
  } catch (error) {
    console.error(error);
    return "Maaf, gagal mengambil data likes Instagram.";
  }
  let usersByClient;
  try {
    ({ usersByClient } = await groupUsersByClientDivision(roleName, {
      clientFilter: targetClientId,
    }));
  } catch (error) {
    console.error(error);
    return "Maaf, gagal mengelompokkan pengguna.";
  }
  const allUsers = usersByClient[targetClientId] || [];
  const { summary, userStats } = computeDitbinmasLikesStats(
    allUsers,
    likesSets,
    shortcodes.length
  );
  const totals = {
    total: summary.total,
    lengkap: summary.lengkap,
    kurang: summary.kurang,
    belum: summary.belum,
    noUsername: summary.noUsername,
  };

  const lengkapUsers = sortUsersByRankAndName(
    userStats.filter((u) => u?.status === "lengkap")
  );
  const kurangUsers = sortUsersByRankAndName(
    userStats.filter((u) => u?.status === "kurang")
  );
  const belumUsers = sortUsersByRankAndName(
    userStats.filter((u) => u?.status === "belum")
  );
  const noUsernameUsers = sortUsersByRankAndName(
    userStats.filter((u) => u?.status === "noUsername")
  );

  const detailSections = [
    {
      icon: "✅",
      title: "Melaksanakan Lengkap",
      users: lengkapUsers,
    },
    {
      icon: "⚠️",
      title: "Melaksanakan Kurang",
      users: kurangUsers,
    },
    {
      icon: "❌",
      title: "Belum Melaksanakan",
      users: belumUsers,
    },
    {
      icon: "⚠️❌",
      title: "Belum Update Username Instagram",
      users: noUsernameUsers,
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
    `📋 Rekap Akumulasi Likes Instagram (Simple)\n` +
    `*${clientName.toUpperCase()}*\n` +
    `${hari}, ${tanggal}\n` +
    `Jam: ${jam}\n\n` +
    `*Jumlah Konten:* ${shortcodes.length}\n` +
    `*Daftar Link Konten:*\n${kontenLinks.join("\n")}\n\n` +
    `*Jumlah Total Personil:* ${totals.total} pers\n` +
    `✅ *Melaksanakan Lengkap :* ${totals.lengkap} pers\n` +
    `⚠️ *Melaksanakan Kurang :* ${totals.kurang} pers\n` +
    `❌ *Belum Melaksanakan :* ${totals.belum} pers\n` +
    `⚠️❌ *Belum Update Username Instagram :* ${totals.noUsername} pers\n\n` +
    detailText;

  return msg.trim();
}

export async function absensiLikesDitbinmasReport(clientId = "DITBINMAS") {
  const targetClientId = String(clientId || "DITBINMAS").trim().toUpperCase();
  const roleName = targetClientId.toLowerCase();
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });
  const { nama: clientName } = await getClientInfo(targetClientId);

  let shortcodes;
  try {
    shortcodes = await getShortcodesTodayByClient(targetClientId);
  } catch (error) {
    console.error(error);
    return "Maaf, gagal mengambil data konten Instagram.";
  }
  if (!shortcodes.length)
    return `*Belum ada konten Instagram terbaru pada akun official ${clientName.toUpperCase()} pada hari ini.*`;

  const kontenLinks = shortcodes.map(
    (sc) => `https://www.instagram.com/p/${sc}`
  );
  let likesSets;
  try {
    likesSets = await getLikesSets(shortcodes);
  } catch (error) {
    console.error(error);
    return "Maaf, gagal mengambil data likes Instagram.";
  }
  let usersByClient;
  try {
    ({ usersByClient } = await groupUsersByClientDivision(roleName, {
      clientFilter: targetClientId,
    }));
  } catch (error) {
    console.error(error);
    return "Maaf, gagal mengelompokkan pengguna.";
  }
  const allUsers = usersByClient[targetClientId] || [];
  const { summary: summaryTotals, userStats } = computeDitbinmasLikesStats(
    allUsers,
    likesSets,
    shortcodes.length
  );

  const totals = {
    total: summaryTotals.total,
    sudah: summaryTotals.lengkap,
    kurang: summaryTotals.kurang,
    belum: summaryTotals.belum + summaryTotals.noUsername,
    noUsername: summaryTotals.noUsername,
  };

  const usersByDiv = groupByDivision(userStats);
  const divisions = sortDivisionKeys(Object.keys(usersByDiv));

  const reportEntries = [];

  divisions.forEach((div) => {
    const users = usersByDiv[div] || [];
    const sudah = [];
    const kurang = [];
    const belum = [];
    const tanpaUsername = [];

    users.forEach((u) => {
      switch (u.status) {
        case "lengkap":
          sudah.push(u);
          break;
        case "kurang":
          kurang.push(u);
          break;
        case "noUsername":
          tanpaUsername.push(u);
          break;
        default:
          belum.push(u);
          break;
      }
    });

    const belumCount = belum.length + tanpaUsername.length;
    const totalPelaksanaanDivisi = users.reduce(
      (total, user) => total + (user.count || 0),
      0
    );

    reportEntries.push({
      clientName: div,
      usersCount: users.length,
      sudahCount: sudah.length,
      kurangCount: kurang.length,
      belumCount,
      noUsernameCount: tanpaUsername.length,
      totalPelaksanaanDivisi,
      sudahList: sudah.map(
        (u) =>
          `- ${formatNama(u)}, Pelaksanaan: ${u.count || 0}/${shortcodes.length}`
      ),
      kurangList: kurang.map(
        (u) =>
          `- ${formatNama(u)}, Pelaksanaan: ${u.count || 0}/${shortcodes.length}`
      ),
      belumList: belum.map(
        (u) =>
          `- ${formatNama(u)}, Pelaksanaan: ${u.count || 0}/${shortcodes.length}`
      ),
      noUsernameList: tanpaUsername.map(
        (u) =>
          `- ${formatNama(u)}, Pelaksanaan: ${u.count || 0}/${
            shortcodes.length
          } (IG Kosong${!u.tiktok ? ", Tiktok Kosong" : ""})`
      ),
    });
  });

  reportEntries.sort((a, b) => {
    if (a.totalPelaksanaanDivisi !== b.totalPelaksanaanDivisi) {
      return b.totalPelaksanaanDivisi - a.totalPelaksanaanDivisi;
    }
    const aPct = a.usersCount
      ? (a.sudahCount + a.kurangCount) / a.usersCount
      : 0;
    const bPct = b.usersCount
      ? (b.sudahCount + b.kurangCount) / b.usersCount
      : 0;
    if (aPct !== bPct) return bPct - aPct;
    if (a.usersCount !== b.usersCount) return b.usersCount - a.usersCount;
    return a.clientName.localeCompare(b.clientName);
  });

  const reports = reportEntries.map((r) => {
    const sudahList = r.sudahList.length ? r.sudahList.join("\n") : "-";
    const kurangList = r.kurangList.length
      ? r.kurangList.join("\n")
      : "-";
    const belumList = r.belumList.length ? r.belumList.join("\n") : "-";
    const noUsernameList = r.noUsernameList.length
      ? r.noUsernameList.join("\n")
      : "-";

    let entry =
      `*${r.clientName}*\n` +
      `Akumulasi Pelaksanaan: ${r.totalPelaksanaanDivisi} (dari ${shortcodes.length} konten)\n` +
      `Jumlah Personil: ${r.usersCount} pers\n\n` +
      `✅ Melaksanakan Lengkap (${r.sudahCount} pers):\n${sudahList}`;

    if (r.kurangCount > 0) {
      entry += `\n⚠️ Melaksanakan Kurang Lengkap (${r.kurangCount} pers):\n${kurangList}`;
    }

    if (r.belumList.length > 0) {
      entry += `\n❌ Belum melaksanakan (${r.belumList.length} pers):\n${belumList}`;
    }

    if (r.noUsernameCount > 0) {
      entry += `\n⚠️ Belum Update Username Instagram (${r.noUsernameCount} pers):\n${noUsernameList}`;
    }

    return entry;
  });

  let msg =
    `Mohon ijin Komandan,\n\n` +
    `📋 Rekap Akumulasi Likes Instagram\n` +
    `*${clientName.toUpperCase()}*\n` +
    `${hari}, ${tanggal}\n` +
    `Jam: ${jam}\n\n` +
    `*Jumlah Konten:* ${shortcodes.length}\n` +
    `*Daftar Link Konten:*\n${kontenLinks.join("\n")}\n\n` +
    `*Jumlah Total Personil :* ${totals.total} pers\n` +
    `✅ *Sudah Melaksanakan :* ${totals.sudah + totals.kurang} pers\n` +
    `- ✅ *Melaksanakan Lengkap :* ${totals.sudah} pers\n` +
    `- ⚠️ *Melaksanakan kurang lengkap :* ${totals.kurang} pers\n` +
    `❌ *Belum melaksanakan :* ${totals.belum} pers\n` +
    `⚠️❌ *Belum Update Username Instagram :* ${totals.noUsername} pers\n\n` +
    reports.join("\n\n") +
    "\n\nTerimakasih.";

  return msg.trim();
}

export { lapharDitbinmas } from "../../../service/instagram/instagramReport.js";
