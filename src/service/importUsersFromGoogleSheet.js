import fs from 'fs/promises';
import fetch from 'node-fetch';
import path from 'path';
import { importUsersFromSpreadsheet } from './importSpreadsheetService.js';

export async function importUsersFromGoogleSheet(sheetUrl, clientId) {
  // Perbaikan regex di sini:
  const match = sheetUrl.match(/spreadsheets\/d\/([\w-]+)/);
  if (!match) throw new Error('Link Google Sheet tidak valid!');
  const sheetId = match[1];

  // Cek gid (default 0)
  let gid = '0';
  const gidMatch = sheetUrl.match(/[?&]gid=(\d+)/);
  if (gidMatch) gid = gidMatch[1];

  // Buat link download CSV
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

  // Download ke file sementara
  const tempDir = path.resolve('import_data');
  await fs.mkdir(tempDir, { recursive: true });
  const tempFile = path.join(tempDir, `temp_import_${clientId}_${Date.now()}.csv`);
  const res = await fetch(csvUrl);
  if (!res.ok) throw new Error(`Gagal download sheet: ${res.statusText}`);
  const buffer = await res.buffer();
  await fs.writeFile(tempFile, buffer);

  // Import ke DB pakai logic CSV yang sudah ada
  const results = await importUsersFromSpreadsheet(tempFile, clientId);

  // Hapus file temp
  await fs.unlink(tempFile);

  return results;
}
