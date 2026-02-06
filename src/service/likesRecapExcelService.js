import { mkdir } from 'fs/promises';
import path from 'path';
import XLSX from 'xlsx';
import { hariIndo } from '../utils/constants.js';

function formatClientName(clientId = '') {
  return clientId
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}

function buildColumnWidths(headers, rows) {
  return headers.map((headerKey) => {
    const columnValues = rows.map((row) => {
      const value = row?.[headerKey];
      if (value === null || value === undefined) {
        return '';
      }
      return String(value);
    });

    const maxContentLength = columnValues.reduce(
      (maxLength, value) => Math.max(maxLength, value.length),
      String(headerKey).length
    );

    return { wch: maxContentLength + 2 };
  });
}

function buildExportPath(prefix, clientId) {
  const exportDir = path.resolve('export_data/likes_recap');
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggalStr = now.toLocaleDateString('id-ID');
  const jam = now.toLocaleTimeString('id-ID', { hour12: false });
  const dateSafe = tanggalStr.replace(/\//g, '-');
  const timeSafe = jam.replace(/[:.]/g, '-');
  const formattedClient = formatClientName(clientId);

  return {
    exportDir,
    filePath: path.join(
      exportDir,
      `${prefix}_${formattedClient}_${hari}_${dateSafe}_${timeSafe}.xlsx`
    ),
  };
}

export async function saveLikesRecapExcel(data, clientId) {
  const { shortcodes = [], recap = {} } = data || {};
  const wb = XLSX.utils.book_new();
  const recapDate = new Date().toLocaleDateString('id-ID');

  Object.entries(recap).forEach(([polres, users]) => {
    const header = [
      'Pangkat Nama',
      'Divisi / Satfung',
      `${recapDate} Jumlah Post`,
      `${recapDate} Sudah Likes`,
      `${recapDate} Belum Likes`,
    ];

    const rows = (users || []).map((u) => {
      const totalPost = shortcodes.length;
      const likedCount = shortcodes.reduce(
        (sum, sc) => sum + (u?.[sc] ?? 0),
        0
      );
      return {
        'Pangkat Nama': `${u?.pangkat ? `${u.pangkat} ` : ''}${u?.nama || ''}`.trim(),
        'Divisi / Satfung': u?.satfung || '',
        [`${recapDate} Jumlah Post`]: totalPost,
        [`${recapDate} Sudah Likes`]: likedCount,
        [`${recapDate} Belum Likes`]: totalPost - likedCount,
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows, { header });
    XLSX.utils.book_append_sheet(wb, ws, polres);
  });

  const { exportDir, filePath } = buildExportPath(
    'Rekap_Engagement_Instagram',
    clientId
  );
  await mkdir(exportDir, { recursive: true });

  XLSX.writeFile(wb, filePath);
  return filePath;
}

export async function saveLikesRecapPerContentExcel(data, clientId) {
  const { shortcodes = [], recap = {} } = data || {};
  const wb = XLSX.utils.book_new();

  const header = ['Pangkat Nama', 'Satfung', ...shortcodes];

  Object.entries(recap).forEach(([polres, users]) => {
    const rows = (users || []).map((user) => {
      const row = {
        'Pangkat Nama': `${user?.pangkat ? `${user.pangkat} ` : ''}${
          user?.nama || ''
        }`.trim(),
        Satfung: user?.satfung || '',
      };
      shortcodes.forEach((sc) => {
        row[sc] = user?.[sc] ?? 0;
      });
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(rows, { header });
    ws['!cols'] = buildColumnWidths(header, rows);
    XLSX.utils.book_append_sheet(wb, ws, polres);
  });

  const { exportDir, filePath } = buildExportPath(
    'Rekap_Likes_Per_Konten_Instagram',
    clientId
  );
  await mkdir(exportDir, { recursive: true });

  XLSX.writeFile(wb, filePath);
  return filePath;
}
