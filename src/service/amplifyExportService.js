import * as XLSX from 'xlsx';

export function generateExcelBuffer(rows) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return buffer;
}

export function generateLinkReportExcelBuffer(rows) {
  const header = [
    'Date',
    'Pangkat Nama',
    'NRP',
    'Satfung',
    'Link Instagram',
    'Link Facebook',
    'Link Twitter',
    'Link Tiktok',
    'Link Youtube'
  ];
  const data = rows.map((r) => [
    r.date || '',
    r.pangkat_nama || '',
    r.nrp || '',
    r.satfung || '',
    r.instagram || '',
    r.facebook || '',
    r.twitter || '',
    r.tiktok || '',
    r.youtube || ''
  ]);
  const worksheet = XLSX.utils.aoa_to_sheet([header, ...data]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return buffer;
}
