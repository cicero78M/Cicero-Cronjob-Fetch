// src/service/oprReportService.js

import { query } from '../repository/db.js';
import { hariIndo } from '../utils/constants.js';
import { getGreeting } from '../utils/utilsHelper.js';

/**
 * Get operator user IDs for a client
 */
async function getOperatorUserIds(clientId) {
  const result = await query(
    `SELECT u.user_id 
     FROM "user" u
     JOIN user_roles ur ON u.user_id = ur.user_id
     JOIN roles r ON ur.role_id = r.role_id
     WHERE r.role_name = 'operator' 
       AND u.client_id = $1 
       AND u.status = true`,
    [clientId]
  );
  return new Set(result.rows.map((row) => row.user_id));
}

/**
 * Generate daily amplification report (Rekap link harian - today)
 * @param {string} clientId - Client ID
 * @returns {Promise<string|null>} Report message or null if no data
 */
export async function generateDailyAmplificationReport(clientId) {
  const { getReportsTodayByClient } = await import('../model/linkReportModel.js');
  const { getShortcodesTodayByClient } = await import('../model/instaPostModel.js');
  
  const reports = await getReportsTodayByClient(clientId);
  const operatorIds = await getOperatorUserIds(clientId);
  
  if (!operatorIds.size) {
    return null;
  }
  
  const filteredReports = reports.filter((report) => operatorIds.has(report.user_id));
  
  if (!filteredReports || filteredReports.length === 0) {
    return null;
  }
  
  const shortcodes = await getShortcodesTodayByClient(clientId);
  const list = {
    facebook: [],
    instagram: [],
    twitter: [],
    tiktok: [],
    youtube: []
  };
  const users = new Set();
  
  filteredReports.forEach((r) => {
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
  const tanggal = now.toLocaleDateString('id-ID');
  const jam = now.toLocaleTimeString('id-ID', { hour12: false });
  const salam = getGreeting();
  
  const { rows: nameRows } = await query(
    'SELECT nama FROM clients WHERE client_id=$1 LIMIT 1',
    [clientId]
  );
  const clientName = nameRows[0]?.nama || clientId;
  
  const kontenLinks = shortcodes.map(
    (sc) => `https://www.instagram.com/p/${sc}`
  );
  
  let msg = `${salam}\n\n`;
  msg += `Mohon Ijin Melaporkan Pelaksanaan Tugas Amplifikasi *${clientName}* pada hari :\n`;
  msg += `Hari : ${hari}\n`;
  msg += `Tanggal : ${tanggal}\n`;
  msg += `Pukul : ${jam}\n\n`;
  
  msg += `Jumlah Konten Resmi Hari ini : ${shortcodes.length}\n`;
  if (kontenLinks.length > 0) {
    msg += `${kontenLinks.join('\n')}\n\n`;
  } else {
    msg += '-\n\n';
  }
  
  msg += `Jumlah Personil yang melaksanakan : ${users.size}\n`;
  msg += `Jumlah Total Link dari 5 Platform Sosial Media : ${totalLinks}\n\n`;
  
  msg += `Link Sebagai Berikut :\n`;
  msg += `Facebook (${list.facebook.length}):\n${list.facebook.length > 0 ? list.facebook.join('\n') : '-'}`;
  msg += `\n\nInstagram (${list.instagram.length}):\n${list.instagram.length > 0 ? list.instagram.join('\n') : '-'}`;
  msg += `\n\nTwitter (${list.twitter.length}):\n${list.twitter.length > 0 ? list.twitter.join('\n') : '-'}`;
  msg += `\n\nTikTok (${list.tiktok.length}):\n${list.tiktok.length > 0 ? list.tiktok.join('\n') : '-'}`;
  msg += `\n\nYoutube (${list.youtube.length}):\n${list.youtube.length > 0 ? list.youtube.join('\n') : '-'}`;
  
  return msg.trim();
}

/**
 * Generate routine task report no 2 (Rekap link harian kemarin - yesterday)
 * @param {string} clientId - Client ID
 * @returns {Promise<string|null>} Report message or null if no data
 */
export async function generateYesterdayAmplificationReport(clientId) {
  const { getReportsYesterdayByClient } = await import('../model/linkReportModel.js');
  const { getShortcodesYesterdayByClient } = await import('../model/instaPostModel.js');
  
  const reports = await getReportsYesterdayByClient(clientId);
  const operatorIds = await getOperatorUserIds(clientId);
  
  if (!operatorIds.size) {
    return null;
  }
  
  const filteredReports = reports.filter((report) => operatorIds.has(report.user_id));
  
  if (!filteredReports || filteredReports.length === 0) {
    return null;
  }
  
  const shortcodes = await getShortcodesYesterdayByClient(clientId);
  const list = {
    facebook: [],
    instagram: [],
    twitter: [],
    tiktok: [],
    youtube: []
  };
  const users = new Set();
  
  filteredReports.forEach((r) => {
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
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  const hari = hariIndo[yesterday.getDay()];
  const tanggal = yesterday.toLocaleDateString('id-ID');
  const jam = now.toLocaleTimeString('id-ID', { hour12: false });
  const salam = getGreeting();
  
  const { rows: nameRows } = await query(
    'SELECT nama FROM clients WHERE client_id=$1 LIMIT 1',
    [clientId]
  );
  const clientName = nameRows[0]?.nama || clientId;
  
  const kontenLinks = shortcodes.map(
    (sc) => `https://www.instagram.com/p/${sc}`
  );
  
  let msg = `${salam}\n\n`;
  msg += `Mohon Ijin Melaporkan Pelaksanaan Tugas Amplifikasi *${clientName}* pada hari :\n`;
  msg += `Hari : ${hari}\n`;
  msg += `Tanggal : ${tanggal}\n`;
  msg += `Pukul : ${jam}\n\n`;
  
  msg += `Jumlah Konten Resmi Kemarin : ${shortcodes.length}\n`;
  if (kontenLinks.length > 0) {
    msg += `${kontenLinks.join('\n')}\n\n`;
  } else {
    msg += '-\n\n';
  }
  
  msg += `Jumlah Personil yang melaksanakan : ${users.size}\n`;
  msg += `Jumlah Total Link dari 5 Platform Sosial Media : ${totalLinks}\n\n`;
  
  msg += `Link Sebagai Berikut :\n`;
  msg += `Facebook (${list.facebook.length}):\n${list.facebook.length > 0 ? list.facebook.join('\n') : '-'}`;
  msg += `\n\nInstagram (${list.instagram.length}):\n${list.instagram.length > 0 ? list.instagram.join('\n') : '-'}`;
  msg += `\n\nTwitter (${list.twitter.length}):\n${list.twitter.length > 0 ? list.twitter.join('\n') : '-'}`;
  msg += `\n\nTikTok (${list.tiktok.length}):\n${list.tiktok.length > 0 ? list.tiktok.join('\n') : '-'}`;
  msg += `\n\nYoutube (${list.youtube.length}):\n${list.youtube.length > 0 ? list.youtube.join('\n') : '-'}`;
  
  return msg.trim();
}
