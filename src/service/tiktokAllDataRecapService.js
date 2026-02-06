import { mkdir } from 'fs/promises';
import path from 'path';
import XLSX from 'xlsx';
import { getRekapKomentarByClient } from '../model/tiktokCommentModel.js';

const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export function buildMonthRange(now = new Date()) {
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const startYear = currentMonth < 8 ? currentYear - 1 : currentYear;
  const startMonth = 8; // September (0-based)

  const cursor = new Date(startYear, startMonth, 1);
  const end = new Date(currentYear, currentMonth, 1);
  const months = [];

  while (cursor <= end) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    months.push({
      key: `${year}-${String(month + 1).padStart(2, '0')}`,
      label: `${MONTH_NAMES_ID[month]} ${year}`,
    });
    cursor.setMonth(month + 1);
  }

  return months;
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function computeColumnWidths(tableRows) {
  const columnCount = tableRows.reduce(
    (max, row) => Math.max(max, row.length),
    0
  );
  const widths = Array(columnCount).fill(0);

  tableRows.forEach((row) => {
    row.forEach((cell, idx) => {
      const display =
        typeof cell === 'number'
          ? cell.toLocaleString('id-ID')
          : cell?.toString() || '';
      widths[idx] = Math.max(widths[idx], display.length);
    });
  });

  return widths.map((length) => ({ wch: Math.min(Math.max(length + 2, 10), 60) }));
}

function applyNumberFormat(sheet, startRow, startCol, endRow, endCol) {
  const format = '#,##0';
  for (let r = startRow; r <= endRow; r += 1) {
    for (let c = startCol; c <= endCol; c += 1) {
      const cellAddress = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[cellAddress];
      if (cell && typeof cell.v === 'number') {
        cell.z = format;
      }
    }
  }
}

function formatClientLabel(clientName, clientId) {
  return (clientName || clientId || 'CLIENT')
    .toString()
    .trim()
    .replace(/\s+/g, '_');
}

export async function generateTiktokAllDataRecap({
  clientId,
  roleFlag,
  clientName,
  regionalId,
} = {}) {
  if (!clientId) {
    throw new Error('Client ID wajib diisi untuk membuat rekap TikTok all data.');
  }

  const months = buildMonthRange();
  const polresMap = new Map();
  const monthlyTotals = Array(months.length).fill(0);

  for (let i = 0; i < months.length; i += 1) {
    const monthKey = months[i].key;
    // eslint-disable-next-line no-await-in-loop
    const rows = await getRekapKomentarByClient(
      clientId,
      'bulanan',
      monthKey,
      null,
      null,
      roleFlag,
      { regionalId }
    );

    const monthRows = Array.isArray(rows) ? rows : [];
    monthRows.forEach((row) => {
      const polresName = row?.client_name || 'Tidak diketahui';
      const commentCount = toNumber(row?.jumlah_komentar);
      if (!polresMap.has(polresName)) {
        polresMap.set(polresName, {
          polres: polresName,
          monthly: Array(months.length).fill(0),
          total: 0,
        });
      }
      const current = polresMap.get(polresName);
      current.monthly[i] += commentCount;
      current.total += commentCount;
      monthlyTotals[i] += commentCount;
    });
  }

  const polresRows = Array.from(polresMap.values()).sort((a, b) => {
    if (a.total !== b.total) {
      return b.total - a.total;
    }
    return a.polres.localeCompare(b.polres, 'id');
  });
  const hasData = polresRows.some(
    (row) => row.total > 0 || row.monthly.some((value) => value > 0)
  );

  if (!hasData) {
    throw new Error('Tidak ada data komentar TikTok untuk rentang bulan yang dipilih.');
  }

  const grandTotal = monthlyTotals.reduce((sum, value) => sum + value, 0);
  const header = ['Polres', ...months.map((m) => m.label), 'Total'];
  const aoa = [
    [`Rekap TikTok All Data – ${clientName || clientId}`],
    [
      `Periode: ${months[0].label} - ${months[months.length - 1].label}`,
    ],
    header,
    ...polresRows.map((row) => [
      row.polres,
      ...row.monthly,
      row.total,
    ]),
    ['TOTAL', ...monthlyTotals, grandTotal],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const lastCol = header.length - 1;
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
  ];
  ws['!freeze'] = { xSplit: 1, ySplit: 3 };
  ws['!cols'] = computeColumnWidths(aoa);
  applyNumberFormat(ws, 3, 1, aoa.length - 1, lastCol);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'TikTok All Data');

  const now = new Date();
  const exportDir = path.resolve('export_data/dirrequest');
  await mkdir(exportDir, { recursive: true });
  const tanggal = now.toLocaleDateString('id-ID');
  const jam = now.toLocaleTimeString('id-ID', { hour12: false });
  const dateSafe = tanggal.replace(/\//g, '-');
  const timeSafe = jam.replace(/[:.]/g, '-');
  const clientLabel = formatClientLabel(clientName, clientId);
  const filePath = path.join(
    exportDir,
    `${clientLabel}_Rekap_TikTok_All_Data_${dateSafe}_${timeSafe}.xlsx`
  );
  XLSX.writeFile(wb, filePath, { cellStyles: true });

  return { filePath, months: months.map((m) => m.key) };
}

export default generateTiktokAllDataRecap;
