import { query } from "../../../db/index.js";
import {
  getUsersByClient,
  getUsersByDirektorat,
  getOperatorsByClient,
} from "../../../model/userModel.js";
import { getShortcodesTodayByClient } from "../../../model/instaPostModel.js";
import {
  getReportsTodayByClient,
  getReportsTodayByShortcode,
} from "../../../model/linkReportModel.js";
import { hariIndo } from "../../../utils/constants.js";
import { groupByDivision, sortDivisionKeys, getGreeting } from "../../../utils/utilsHelper.js";

async function getClientInfo(client_id) {
  const res = await query(
    "SELECT nama, client_type FROM clients WHERE client_id = $1 LIMIT 1",
    [client_id]
  );
  return {
    nama: res.rows[0]?.nama || client_id,
    clientType: res.rows[0]?.client_type?.toLowerCase() || null,
  };
}

export async function absensiLink(client_id, opts = {}) {
  const { clientFilter, roleFlag } = opts;
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });

  const { nama: clientNama, clientType } = await getClientInfo(client_id);
  let users;
  let shortcodes;
  if (clientType === "direktorat") {
    const allowedRoles = ["ditbinmas", "ditlantas", "bidhumas"];
    const flag = allowedRoles.includes((roleFlag || "").toLowerCase())
      ? roleFlag.toLowerCase()
      : client_id.toLowerCase();
    shortcodes = await getShortcodesTodayByClient(flag);
    users = (
      await getUsersByDirektorat(flag, clientFilter || null)
    ).filter((u) => u.status === true);
  } else if (clientType === "org") {
    shortcodes = await getShortcodesTodayByClient(client_id);
    users = await getOperatorsByClient(clientFilter || client_id);
  } else {
    shortcodes = await getShortcodesTodayByClient(client_id);
    users = await getUsersByClient(clientFilter || client_id, roleFlag);
  }
  if (!shortcodes.length)
    return `Tidak ada konten IG untuk *${clientNama}* hari ini.`;

  const reports = await getReportsTodayByClient(client_id);
  const userStats = {};
  users.forEach((u) => {
    userStats[u.user_id] = { ...u, tasksDone: 0, linkCount: 0 };
  });
  reports.forEach((r) => {
    const stat = userStats[r.user_id];
    if (stat) {
      stat.tasksDone += 1;
      stat.linkCount +=
        (r.facebook_link ? 1 : 0) +
        (r.instagram_link ? 1 : 0) +
        (r.twitter_link ? 1 : 0) +
        (r.tiktok_link ? 1 : 0) +
        (r.youtube_link ? 1 : 0);
    }
  });
  const totalKonten = shortcodes.length;

  if (clientType === "direktorat") {
    const groups = {};
    Object.values(userStats).forEach((u) => {
      const cid = u.client_id?.toUpperCase() || "";
      if (!groups[cid]) groups[cid] = { total: 0, updated: 0 };
      groups[cid].total++;
      if (u.exception === true || u.tasksDone === totalKonten) {
        groups[cid].updated++;
      }
    });

    const kontenLinks = shortcodes.map(
      (sc) => `https://www.instagram.com/p/${sc}`
    );
    const totalLinks = Object.values(userStats).reduce(
      (acc, u) => acc + u.linkCount,
      0
    );
    const reports = await Promise.all(
      Object.keys(groups).map(async (cid) => {
        const { nama } = await getClientInfo(cid);
        const g = groups[cid];
        return (
          `*Polres*: *${nama}*\n` +
          `*Jumlah personil:* ${g.total}\n` +
          `✅ *Sudah melaksanakan* : *${g.updated} user*\n` +
          `❌ *Belum melaksanakan* : *${g.total - g.updated} user*`
        );
      })
    );
    const salam = getGreeting();
    let msg = `${salam},\n\n`;
    msg += `Mohon ijin melaporkan Pelaksanaan Tugas Amplifikasi *${clientNama}* pada hari:\n\n`;
    msg += `Hari: ${hari}\n\n`;
    msg += `Tanggal: ${tanggal}\n\n`;
    msg += `Pukul: ${jam}\n\n`;
    msg += `Jumlah Konten Resmi Hari ini: ${shortcodes.length}\n\n`;
    msg += kontenLinks.join("\n\n") + "\n\n";
    msg += reports.join("\n\n") + "\n\n";
    msg += `Jumlah Total Link dari 5 Platform Sosial Media: ${totalLinks}\n\n`;
    msg += `Terima kasih.`;
    return msg.trim();
  }

  const totalLinks = Object.values(userStats).reduce(
    (acc, u) => acc + u.linkCount,
    0
  );
  const sudah = [];
  const belumLengkap = [];
  const belum = [];

  Object.values(userStats).forEach((u) => {
    u.tasksPending = Math.max(totalKonten - u.tasksDone, 0);
    if (u.exception === true || u.tasksDone === totalKonten) {
      sudah.push(u);
    } else if (u.tasksDone > 0) {
      belumLengkap.push(u);
    } else {
      belum.push(u);
    }
  });

  sudah.sort((a, b) => b.linkCount - a.linkCount);

  const kontenLinks = shortcodes.map(
    (sc) => `https://www.instagram.com/p/${sc}`
  );

  const salam = getGreeting();
  let msg = `${salam},\n\n`;
  msg += `Mohon ijin melaporkan Pelaksanaan Tugas Amplifikasi *${clientNama}* pada hari:\n\n`;
  msg += `Hari: ${hari}\n\n`;
  msg += `Tanggal: ${tanggal}\n\n`;
  msg += `Pukul: ${jam}\n\n`;
  msg += `Jumlah Konten Resmi Hari ini: ${shortcodes.length}\n\n`;
  msg += kontenLinks.join("\n\n") + "\n\n";
  const totalPersonil = sudah.length + belumLengkap.length;
  msg += `Jumlah Personil yang melaksanakan: ${totalPersonil}\n`;
  msg += `Jumlah Total Link dari 5 Platform Sosial Media: ${totalLinks}\n\n`;

  msg += `✅ Sudah Melaksanakan (${sudah.length} user)\n`;
  msg += `Urut berdasarkan total link terbanyak\n\n`;
  msg += sudah.length
    ? sudah
        .map(
          (u) =>
            `${u.divisi} – ${u.title ? u.title + " " : ""}${u.nama} (Sudah: ${u.tasksDone} Tugas / Belum: ${u.tasksPending} Tugas / Total Link: ${u.linkCount} Link)`
        )
        .join("\n\n") + "\n\n"
    : "-\n\n";

  msg += `⚠️ Belum Lengkap (${belumLengkap.length} user)\n`;
  msg += belumLengkap.length
    ? belumLengkap
        .map(
          (u) =>
            `${u.divisi} – ${u.title ? u.title + " " : ""}${u.nama} (Sudah: ${u.tasksDone} Tugas / Belum: ${u.tasksPending} Tugas / Total Link: ${u.linkCount} Link)`
        )
        .join("\n\n") + "\n\n"
    : "-\n\n";

  msg += `❌ Belum Melaksanakan (${belum.length} user)\n`;
  msg += belum.length
    ? belum
        .map(
          (u) =>
            `${u.divisi} – ${u.title ? u.title + " " : ""}${u.nama} (Sudah: ${u.tasksDone} Tugas / Belum: ${u.tasksPending} Tugas / Total Link: ${u.linkCount} Link)`
        )
        .join("\n\n") + "\n\n"
    : "-\n\n";

  msg += `Terima kasih.`;
  return msg.trim();
}

export async function absensiLinkPerPost(client_id, opts = {}) {
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });

  const { nama: clientNama, clientType } = await getClientInfo(client_id);
  const users =
    clientType === "direktorat"
      ? (
          await getUsersByDirektorat(client_id.toLowerCase(), client_id)
        ).filter((u) => u.status === true)
      : await getUsersByClient(client_id);
  const shortcodes = await getShortcodesTodayByClient(client_id);
  if (!shortcodes.length)
    return `Tidak ada konten IG untuk *${clientNama}* hari ini.`;

  const mode = opts && opts.mode ? String(opts.mode).toLowerCase() : "all";
  const salam = getGreeting();
  let msg = `${salam}\n\n`;
  msg += `Mohon Ijin Melaporkan Pelaksanaan Tugas Amplifikasi *${clientNama}* pada hari :\n`;
  msg += `Hari : ${hari}\n`;
  msg += `Tanggal : ${tanggal}\n`;
  msg += `Pukul : ${jam}\n\n`;
  msg += `*Jumlah Konten:* ${shortcodes.length}\n`;

  for (const sc of shortcodes) {
    const reports = await getReportsTodayByShortcode(client_id, sc);
    const userSudah = [];
    const userBelum = [];
    const reportUsers = new Set(reports.map((r) => r.user_id));
    users.forEach((u) => {
      if (u.exception === true) {
        userSudah.push(u);
      } else if (reportUsers.has(u.user_id)) {
        userSudah.push(u);
      } else {
        userBelum.push(u);
      }
    });
    const totalLinks = reports.reduce((acc, r) => {
      return (
        acc +
        (r.facebook_link ? 1 : 0) +
        (r.instagram_link ? 1 : 0) +
        (r.twitter_link ? 1 : 0) +
        (r.tiktok_link ? 1 : 0) +
        (r.youtube_link ? 1 : 0)
      );
    }, 0);
    msg += `\nLink Post: https://www.instagram.com/p/${sc}\n`;
    msg += `Jumlah Personil yang melaksnakan : ${userSudah.length}\n`;
    msg += `Jumlah Total Link dari 5 Platform Sosial Media : ${totalLinks}\n`;

    const format = (arr, label) => {
      msg += `${label} (${arr.length} user):\n`;
      const byDiv = groupByDivision(arr);
      sortDivisionKeys(Object.keys(byDiv)).forEach((div, idx, arrKeys) => {
        const list = byDiv[div];
        msg += list.length
          ? `*${div}* (${list.length} user):\n` +
            list
              .map((u) => `- ${u.title ? u.title + " " : ""}${u.nama}`)
              .join("\n") +
            "\n"
          : `*${div}* (0 user):\n-\n`;
        if (idx < arrKeys.length - 1) msg += "\n";
      });
      if (Object.keys(byDiv).length === 0) msg += "-\n";
      msg += "\n";
    };

    if (mode === "all" || mode === "sudah") format(userSudah, "✅ *Sudah melaksanakan*");
    if (mode === "all" || mode === "belum") format(userBelum, "❌ *Belum melaksanakan*");
  }

  msg += `Terimakasih.`;
  return msg.trim();
}
