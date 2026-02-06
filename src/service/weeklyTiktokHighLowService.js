import { getRekapKomentarByClient } from '../model/tiktokCommentModel.js';
import { countPostsByClient } from '../model/tiktokPostModel.js';
import { hariIndo } from '../utils/constants.js';
import { formatNama } from '../utils/utilsHelper.js';

const RANK_ORDER = [
  'KOMISARIS BESAR POLISI',
  'AKBP',
  'KOMPOL',
  'AKP',
  'IPTU',
  'IPDA',
  'AIPTU',
  'AIPDA',
  'BRIPKA',
  'BRIGPOL',
  'BRIGADIR',
  'BRIGADIR POLISI',
  'BRIPTU',
  'BRIPDA',
];

const JAKARTA_TZ = 'Asia/Jakarta';
const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const isoFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: JAKARTA_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const displayFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: JAKARTA_TZ,
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: JAKARTA_TZ,
  weekday: 'short',
});

const numberFormatter = new Intl.NumberFormat('id-ID');

function normalizeIdentifier(value) {
  return String(value || '').trim().toUpperCase();
}

function isDitbinmas(value) {
  return normalizeIdentifier(value) === 'DITBINMAS';
}

function rankWeight(rank) {
  const idx = RANK_ORDER.indexOf(String(rank || '').toUpperCase());
  return idx === -1 ? RANK_ORDER.length : idx;
}

function getWeekBoundaries(referenceDate = new Date()) {
  const isoToday = isoFormatter.format(referenceDate);
  const todayJakarta = new Date(`${isoToday}T00:00:00Z`);
  const weekdayIdx = WEEKDAY_ABBR.indexOf(weekdayFormatter.format(referenceDate));
  const dayOfWeek = weekdayIdx === -1 ? referenceDate.getUTCDay() : weekdayIdx;

  const weekEnd = new Date(todayJakarta);
  if (dayOfWeek !== 0) {
    weekEnd.setUTCDate(weekEnd.getUTCDate() - dayOfWeek);
  }
  const weekStart = new Date(weekEnd);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);

  return { weekStart, weekEnd };
}

function formatRange({ weekStart, weekEnd }) {
  const startDay = hariIndo[weekStart.getUTCDay()] || '';
  const endDay = hariIndo[weekEnd.getUTCDay()] || '';
  const startDisplay = displayFormatter.format(weekStart);
  const endDisplay = displayFormatter.format(weekEnd);
  return {
    rangeText: `${startDay}, ${startDisplay} s.d. ${endDay}, ${endDisplay}`,
    startIso: isoFormatter.format(weekStart),
    endIso: isoFormatter.format(weekEnd),
  };
}

function normalizeRows(rows = []) {
  const unique = new Map();
  rows.forEach((row) => {
    const key = row.user_id || `${row.client_id}|${row.nama}|${row.title}`;
    if (!unique.has(key)) {
      unique.set(key, {
        ...row,
        jumlah_komentar: Number(row.jumlah_komentar) || 0,
      });
    }
  });
  return Array.from(unique.values());
}

function sortDescending(a, b) {
  if (b.jumlah_komentar !== a.jumlah_komentar) {
    return b.jumlah_komentar - a.jumlah_komentar;
  }
  const rankDiff = rankWeight(a.title) - rankWeight(b.title);
  if (rankDiff !== 0) {
    return rankDiff;
  }
  const nameA = formatNama({ title: a.title, nama: a.nama }) || '';
  const nameB = formatNama({ title: b.title, nama: b.nama }) || '';
  const nameCompare = nameA.localeCompare(nameB, 'id-ID', { sensitivity: 'base' });
  if (nameCompare !== 0) {
    return nameCompare;
  }
  const satkerA = (a.client_name || a.client_id || '').toString();
  const satkerB = (b.client_name || b.client_id || '').toString();
  if (satkerA || satkerB) {
    const satkerCompare = satkerA.localeCompare(satkerB, 'id-ID', {
      sensitivity: 'base',
    });
    if (satkerCompare !== 0) {
      return satkerCompare;
    }
  }
  return (a.user_id || '').toString().localeCompare((b.user_id || '').toString());
}

function sortAscending(a, b) {
  return -sortDescending(a, b);
}

function formatEntry(row, index) {
  const name = formatNama({ title: row.title, nama: row.nama }) || 'Tanpa Nama';
  const detailParts = [];
  if (row.divisi) detailParts.push(row.divisi);
  if (row.client_name) {
    detailParts.push(row.client_name);
  } else if (row.client_id) {
    detailParts.push(String(row.client_id).toUpperCase());
  }
  const detail = detailParts.length ? ` (${detailParts.join(' • ')})` : '';
  const countText = `${numberFormatter.format(row.jumlah_komentar)} tugas`;
  return `${index}. ${name}${detail} — ${countText}`;
}

function buildListSection(title, emoji, rows) {
  if (!rows.length) {
    return `${emoji} *${title}*\nTidak ada data.`;
  }
  const lines = rows.map((row, idx) => formatEntry(row, idx + 1));
  return [`${emoji} *${title}*`, ...lines].join('\n');
}

export async function generateWeeklyTiktokHighLowReport(
  clientId,
  { roleFlag } = {}
) {
  if (!clientId) {
    throw new Error('clientId wajib diisi untuk membuat laporan mingguan.');
  }

  const bounds = getWeekBoundaries();
  const { rangeText, startIso, endIso } = formatRange(bounds);

  const [rows, totalTasks] = await Promise.all([
    getRekapKomentarByClient(
      clientId,
      'harian',
      undefined,
      startIso,
      endIso,
      roleFlag
    ),
    countPostsByClient(clientId, 'harian', undefined, startIso, endIso, roleFlag),
  ]);

  const restrictToDitbinmas = isDitbinmas(clientId) && isDitbinmas(roleFlag);
  const filteredRows = restrictToDitbinmas
    ? rows.filter((row) => isDitbinmas(row.client_id))
    : rows;

  const participants = normalizeRows(filteredRows);
  const sortedDesc = participants.slice().sort(sortDescending);
  const sortedAsc = participants.slice().sort(sortAscending);

  const topFive = sortedDesc.slice(0, 5);
  const bottomFive = sortedAsc.slice(0, 5);

  const headerLines = [
    '📊 *Laporan TikTok Top and Bottom*',
    `Periode: ${rangeText}`,
    `Total tugas TikTok: ${numberFormatter.format(totalTasks || 0)}`,
  ];

  if (!participants.length) {
    headerLines.push('', 'Tidak ada data pelaksanaan komentar TikTok pada periode tersebut.');
    return headerLines.join('\n');
  }

  const sections = [
    buildListSection('5 Pelaksana Tertinggi', '🔥', topFive),
    buildListSection('5 Pelaksana Terendah', '❄️', bottomFive),
  ];

  return [...headerLines, '', ...sections].join('\n\n');
}

export default generateWeeklyTiktokHighLowReport;
