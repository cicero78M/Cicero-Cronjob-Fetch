import { query } from "../../../db/index.js";
import { getShortcodesTodayByClient } from "../../../model/instaPostModel.js";
import { getReportsTodayByClient } from "../../../model/linkReportModel.js";
import { hariIndo } from "../../../utils/constants.js";
import { getGreeting } from "../../../utils/utilsHelper.js";

async function getClientName(clientId) {
  const { rows } = await query(
    "SELECT nama FROM clients WHERE client_id=$1 LIMIT 1",
    [clientId]
  );
  return rows[0]?.nama || clientId;
}

export async function rekapLink(clientId) {
  const reports = await getReportsTodayByClient(clientId);
  if (!reports || reports.length === 0) {
    return `Tidak ada laporan link hari ini untuk client *${clientId}*.`;
  }
  const shortcodes = await getShortcodesTodayByClient(clientId);
  const list = { facebook: [], instagram: [], twitter: [], tiktok: [], youtube: [] };
  const users = new Set();
  reports.forEach((r) => {
    users.add(r.user_id);
    if (r.facebook_link) list.facebook.push(r.facebook_link);
    if (r.instagram_link) list.instagram.push(r.instagram_link);
    if (r.twitter_link) list.twitter.push(r.twitter_link);
    if (r.tiktok_link) list.tiktok.push(r.tiktok_link);
    if (r.youtube_link) list.youtube.push(r.youtube_link);
  });
  const totalLinks =
    list.facebook.length +
    list.instagram.length +
    list.twitter.length +
    list.tiktok.length +
    list.youtube.length;
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });
  const salam = getGreeting();
  const clientName = await getClientName(clientId);
  const kontenLinks = shortcodes.map((sc) => `https://www.instagram.com/p/${sc}`);
  let msg = `${salam}\n\n`;
  msg += `Mohon Ijin Melaporkan Pelaksanaan Tugas Amplifikasi *${clientName}* pada hari :\n`;
  msg += `Hari : ${hari}\n`;
  msg += `Tanggal : ${tanggal}\n`;
  msg += `Pukul : ${jam}\n\n`;
  msg += `Jumlah Konten Resmi Hari ini : ${shortcodes.length}\n`;
  msg += kontenLinks.length ? `${kontenLinks.join("\n")}\n\n` : "-\n\n";
  msg += `Jumlah Personil yang melaksnakan : ${users.size}\n`;
  msg += `Jumlah Total Link dari 5 Platform Sosial Media : ${totalLinks}\n\n`;
  msg += `Link Sebagai Berikut :\n`;
  msg += `Facebook (${list.facebook.length}):\n${list.facebook.join("\n") || "-"}`;
  msg += `\n\nInstagram (${list.instagram.length}):\n${list.instagram.join("\n") || "-"}`;
  msg += `\n\nTwitter (${list.twitter.length}):\n${list.twitter.join("\n") || "-"}`;
  msg += `\n\nTikTok (${list.tiktok.length}):\n${list.tiktok.join("\n") || "-"}`;
  msg += `\n\nYoutube (${list.youtube.length}):\n${list.youtube.join("\n") || "-"}`;
  return msg.trim();
}
