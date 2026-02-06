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
  const exportDir = path.resolve('export_data/comment_recap');
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString('id-ID');
  const jam = now.toLocaleTimeString('id-ID', { hour12: false });
  const dateSafe = tanggal.replace(/\//g, '-');
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

export async function saveCommentRecapExcel(data, clientId) {
  const { videoIds = [], recap = {} } = data || {};
  const wb = XLSX.utils.book_new();
  Object.entries(recap).forEach(([polres, users = []]) => {
    const header = ['Pangkat Nama', 'Satfung', ...videoIds];
    const rows = users.map((u = {}) => {
      const row = {
        'Pangkat Nama': `${u.pangkat ? `${u.pangkat} ` : ''}${u.nama || ''}`.trim(),
        Satfung: u.satfung || '',
      };
      videoIds.forEach((vid) => {
        row[vid] = u?.[vid] ?? 0;
      });
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows, { header });
    ws['!cols'] = buildColumnWidths(header, rows);
    XLSX.utils.book_append_sheet(wb, ws, polres);
  });

  const { exportDir, filePath } = buildExportPath(
    'Rekap_Engagement_Tiktok',
    clientId
  );
  await mkdir(exportDir, { recursive: true });

  XLSX.writeFile(wb, filePath);
  return filePath;
}

export async function saveCommentRecapPerContentExcel(data, clientId) {
  const { videoIds = [], recap = {} } = data || {};
  const wb = XLSX.utils.book_new();

  const header = ['Pangkat Nama', 'Satfung', ...videoIds];

  Object.entries(recap).forEach(([polres, users = []]) => {
    const rows = users.map((user = {}) => {
      const row = {
        'Pangkat Nama': `${user.pangkat ? `${user.pangkat} ` : ''}${
          user.nama || ''
        }`.trim(),
        Satfung: user.satfung || '',
      };
      videoIds.forEach((vid) => {
        row[vid] = user?.[vid] ?? 0;
      });
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(rows, { header });
    ws['!cols'] = buildColumnWidths(header, rows);
    XLSX.utils.book_append_sheet(wb, ws, polres);
  });

  const { exportDir, filePath } = buildExportPath(
    'Rekap_Komentar_Per_Konten_Tiktok',
    clientId
  );
  await mkdir(exportDir, { recursive: true });

  XLSX.writeFile(wb, filePath);
  return filePath;
}

export default saveCommentRecapExcel;

