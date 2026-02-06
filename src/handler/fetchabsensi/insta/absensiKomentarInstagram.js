import { query } from "../../../db/index.js";
import { getUsersByClient, getUsersByDirektorat } from "../../../model/userModel.js";
import { getShortcodesTodayByClient } from "../../../model/instaPostModel.js";
import { hariIndo } from "../../../utils/constants.js";
import { groupByDivision, sortDivisionKeys } from "../../../utils/utilsHelper.js";

function normalizeUsername(username) {
  return (username || "")
    .toString()
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

async function getClientNama(client_id) {
  const res = await query(
    "SELECT nama FROM clients WHERE client_id = $1 LIMIT 1",
    [client_id]
  );
  return res.rows[0]?.nama || client_id;
}

async function getCommentsUsernamesByShortcode(shortcode) {
  const res = await query(
    `SELECT DISTINCT iu.username
     FROM ig_post_comments ic
     LEFT JOIN instagram_user iu ON ic.user_id = iu.user_id
     WHERE ic.post_id = $1`,
    [shortcode]
  );
  return res.rows.map((r) => normalizeUsername(r.username));
}

export async function absensiKomentarInstagram(client_id, opts = {}) {
  const { clientFilter } = opts;
  const roleFlag = opts.roleFlag;
  const targetClient = clientFilter || client_id;

  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });

  const clientNama = await getClientNama(targetClient);
  const allowedRoles = ["ditbinmas", "ditlantas", "bidhumas"];
  let users;
  if (roleFlag && allowedRoles.includes(roleFlag.toLowerCase())) {
    users = (await getUsersByDirektorat(roleFlag.toLowerCase())).filter(
      (u) => u.status === true
    );
  } else {
    users = await getUsersByClient(targetClient, roleFlag);
  }
  const shortcodes = await getShortcodesTodayByClient(targetClient);
  if (!shortcodes.length)
    return `Tidak ada konten IG untuk *${clientNama}* hari ini.`;

  const userStats = {};
  users.forEach((u) => {
    userStats[u.user_id] = { ...u, count: 0 };
  });

  for (const sc of shortcodes) {
    const usernames = await getCommentsUsernamesByShortcode(sc);
    const set = new Set(usernames);
    users.forEach((u) => {
      if (
        u.insta &&
        u.insta.trim() !== "" &&
        set.has(normalizeUsername(u.insta))
      ) {
        userStats[u.user_id].count += 1;
      }
    });
  }

  const totalKonten = shortcodes.length;
  const threshold = Math.ceil(totalKonten * 0.5);
  let sudah = [], belum = [];
  Object.values(userStats).forEach((u) => {
    if (u.exception === true) {
      sudah.push(u);
    } else if (
      u.insta &&
      u.insta.trim() !== "" &&
      u.count >= threshold
    ) {
      sudah.push(u);
    } else {
      belum.push(u);
    }
  });
  belum = belum.filter((u) => !u.exception);

  const kontenLinks = shortcodes.map(
    (sc) => `https://www.instagram.com/p/${sc}`
  );

  const mode = opts && opts.mode ? String(opts.mode).toLowerCase() : "all";

  let msg =
    `Mohon ijin Komandan,\\n\\n` +
    `📋 *Rekap Akumulasi Komentar Instagram*\\n*Polres*: *${clientNama}*\\n${hari}, ${tanggal}\\nJam: ${jam}\\n\\n` +
    `*Jumlah Konten:* ${totalKonten}\\n` +
    `*Daftar Link Konten:*\\n${kontenLinks.length ? kontenLinks.join("\\n") : "-"}\\n\\n` +
    `*Jumlah user:* ${users.length}\\n` +
    `✅ *Sudah melaksanakan* : *${sudah.length} user*\\n` +
    `❌ *Belum melaksanakan* : *${belum.length} user*\\n\\n`;

  if (mode === "all" || mode === "sudah") {
    msg += `✅ *Sudah melaksanakan* (${sudah.length} user):\\n`;
    const sudahDiv = groupByDivision(sudah);
    sortDivisionKeys(Object.keys(sudahDiv)).forEach((div, idx, arr) => {
      const list = sudahDiv[div];
      msg += `*${div}* (${list.length} user):\\n`;
      msg +=
        list
          .map((u) => {
            let ket = "";
            if (u.count) ket = `(${u.count}/${totalKonten} konten)`;
            return (
              `- ${u.title ? u.title + " " : ""}${u.nama} : ` +
              (u.insta ? `@${u.insta.replace(/^@/, "")}` : "-") +
              ` ${ket}`
            );
          })
          .join("\\n") + "\\n";
      if (idx < arr.length - 1) msg += "\\n";
    });
    if (Object.keys(sudahDiv).length === 0) msg += "-\\n";
    msg += "\\n";
  }

  if (mode === "all" || mode === "belum") {
    msg += `❌ *Belum melaksanakan* (${belum.length} user):\\n`;
    const belumDiv = groupByDivision(belum);
    sortDivisionKeys(Object.keys(belumDiv)).forEach((div, idx, arr) => {
      const list = belumDiv[div];
      msg += `*${div}* (${list.length} user):\\n`;
      msg +=
        list
          .map((u) => {
            let ket = "";
            if (!u.count || u.count === 0) {
              ket = `(0/${totalKonten} konten)`;
            } else if (u.count > 0 && u.count < threshold) {
              ket = `(${u.count}/${totalKonten} konten)`;
            }
            return (
              `- ${u.title ? u.title + " " : ""}${u.nama} : ` +
              (u.insta ? `@${u.insta.replace(/^@/, "")}` : "-") +
              ` ${ket}`
            );
          })
          .join("\\n") + "\\n";
      if (idx < arr.length - 1) msg += "\\n";
    });
    if (Object.keys(belumDiv).length === 0) msg += "-\\n";
    msg += "\\n";
  }

  msg += `Terimakasih.`;
  return msg.trim();
}

export default absensiKomentarInstagram;

