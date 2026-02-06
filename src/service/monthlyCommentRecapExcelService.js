import { mkdir } from 'fs/promises';
import path from 'path';
import XLSX from 'xlsx';
import { hariIndo } from '../utils/constants.js';
import { getNamaPriorityIndex } from '../utils/sqlPriority.js';
import { getRekapKomentarByClient } from '../model/tiktokCommentModel.js';
import { countPostsByClient } from '../model/tiktokPostModel.js';
import { generateSheetName } from '../utils/excelHelper.js';

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

function rankWeight(rank) {
  const idx = RANK_ORDER.indexOf(String(rank || '').toUpperCase());
  return idx === -1 ? RANK_ORDER.length : idx;
}

export async function saveMonthlyCommentRecapExcel(clientId, { regionalId } = {}) {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = new Date(now);

  const formatIso = (d) => d.toISOString().slice(0, 10);
  const formatDisplay = (d) =>
    new Date(d).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

  const dateList = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    dateList.push(formatIso(d));
  }

  const grouped = {};
  const dailyPosts = {};
  const normalizedClientId =
    typeof clientId === 'string' ? clientId.toLowerCase() : '';
  const roleFilter = normalizedClientId === 'ditbinmas' ? 'ditbinmas' : undefined;

  for (const dateStr of dateList) {
    const [rows, totalPosts] = await Promise.all([
      getRekapKomentarByClient(
        clientId,
        'harian',
        dateStr,
        undefined,
        undefined,
        roleFilter,
        { regionalId }
      ),
      countPostsByClient(
        clientId,
        'harian',
        dateStr,
        undefined,
        undefined,
        roleFilter,
        regionalId
      ),
    ]);
    dailyPosts[dateStr] = totalPosts;
    for (const u of rows) {
      const satker = u.client_name || u.client_id || 'Tanpa Nama';
      if (!grouped[satker]) grouped[satker] = {};
      const key = `${u.title || ''}|${u.nama || ''}`;
      if (!grouped[satker][key]) {
        grouped[satker][key] = {
          pangkat: u.title || '',
          nama: u.nama || '',
          satfung: u.divisi || '',
          perDate: {},
          totalKomentar: 0,
        };
      }
      grouped[satker][key].perDate[dateStr] = {
        komentar: u.jumlah_komentar || 0,
      };
      grouped[satker][key].totalKomentar += u.jumlah_komentar || 0;
    }
  }

  if (Object.keys(grouped).length === 0) {
    return null;
  }

  const wb = XLSX.utils.book_new();
  const usedSheetNames = new Set();
  Object.entries(grouped).forEach(([satker, usersMap]) => {
    const users = Object.values(usersMap);
    users.sort((a, b) => {
      const priorityDiff =
        getNamaPriorityIndex(a?.nama) - getNamaPriorityIndex(b?.nama);
      if (priorityDiff !== 0) return priorityDiff;
      if (b.totalKomentar !== a.totalKomentar)
        return b.totalKomentar - a.totalKomentar;
      const rankA = rankWeight(a.pangkat);
      const rankB = rankWeight(b.pangkat);
      if (rankA !== rankB) return rankA - rankB;
      return a.nama.localeCompare(b.nama);
    });

    const aoa = [];
    const colCount = 4 + dateList.length * 3;
    const title = `${satker} – Rekap Engagement Tiktok`;
    const periodStr = `${formatDisplay(startDate)} - ${formatDisplay(endDate)}`;
    const subtitle = `Rekap Komentar Tiktok Periode ${periodStr}`;
    aoa.push([title]);
    aoa.push([subtitle]);

    const headerDates = ['No', 'Pangkat', 'Nama', 'Divisi / Satfung'];
    const subHeader = ['', '', '', ''];
    dateList.forEach((d) => {
      const disp = formatDisplay(d);
      headerDates.push(disp, '', '');
      subHeader.push('Jumlah Post', 'Sudah Komentar', 'Belum Komentar');
    });
    aoa.push(headerDates);
    aoa.push(subHeader);

    users.forEach((u, idx) => {
      const row = [idx + 1, u.pangkat || '', u.nama || '', u.satfung || ''];
      dateList.forEach((d) => {
        const komentar = u.perDate[d]?.komentar || 0;
        const posts = dailyPosts[d] || 0;
        row.push(posts, komentar, Math.max(posts - komentar, 0));
      });
      aoa.push(row);
    });

    const summaryRow = ['TOTAL', '', '', ''];
    const startRow = 5;
    const endRow = 4 + users.length;
    dateList.forEach((_, i) => {
      const postsCol = XLSX.utils.encode_col(4 + i * 3);
      const sudahCol = XLSX.utils.encode_col(4 + i * 3 + 1);
      const belumCol = XLSX.utils.encode_col(4 + i * 3 + 2);
      summaryRow.push(
        { f: `SUM(${postsCol}${startRow}:${postsCol}${endRow})` },
        { f: `SUM(${sudahCol}${startRow}:${sudahCol}${endRow})` },
        { f: `SUM(${belumCol}${startRow}:${belumCol}${endRow})` }
      );
    });
    aoa.push(summaryRow);

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    const merges = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
    ];
    dateList.forEach((_, i) => {
      merges.push({
        s: { r: 2, c: 4 + i * 3 },
        e: { r: 2, c: 4 + i * 3 + 2 },
      });
    });
    ws['!merges'] = merges;

    ws['!freeze'] = { xSplit: 4, ySplit: 4 };

    const lastDataRow = 4 + users.length;
    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range({ r: 3, c: 0 }, { r: lastDataRow - 1, c: colCount - 1 }),
    };

    const green = { patternType: 'solid', fgColor: { rgb: 'C6EFCE' } };
    const red = { patternType: 'solid', fgColor: { rgb: 'F8CBAD' } };
    for (let r = 4; r <= lastDataRow; r++) {
      dateList.forEach((_, i) => {
        const sudahCell = XLSX.utils.encode_cell({ r, c: 4 + i * 3 + 1 });
        const belumCell = XLSX.utils.encode_cell({ r, c: 4 + i * 3 + 2 });
        if (ws[sudahCell]) ws[sudahCell].s = { fill: green };
        if (ws[belumCell]) ws[belumCell].s = { fill: red };
      });
    }

    const sheetName = generateSheetName(satker, usedSheetNames);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  const exportDir = path.resolve('export_data/monthly_comment');
  await mkdir(exportDir, { recursive: true });

  const hari = hariIndo[endDate.getDay()];
  const tanggal = endDate.toLocaleDateString('id-ID');
  const jam = now.toLocaleTimeString('id-ID', { hour12: false });
  const dateSafe = tanggal.replace(/\//g, '-');
  const timeSafe = jam.replace(/[:.]/g, '-');
  const formattedClient = (clientId || '')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
  const filePath = path.join(
    exportDir,
    `Rekap_Bulanan_Tiktok_${formattedClient}_${hari}_${dateSafe}_${timeSafe}.xlsx`
  );
  XLSX.writeFile(wb, filePath, { cellStyles: true });
  return filePath;
}

export default saveMonthlyCommentRecapExcel;
