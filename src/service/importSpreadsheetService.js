import fs from 'fs';
import path from 'path';
import { query } from '../db/index.js';
import csv from 'csv-parser'; // npm install csv-parser

export async function importUsersFromSpreadsheet(filePath, clientId) {
  return new Promise((resolve, reject) => {
    const results = [];
    const users = [];

    fs.createReadStream(filePath)
      .pipe(csv()) // Header otomatis, urutan BEBAS
      .on('data', (row) => {
        // Cek agar header tidak dianggap data
        if (
          row.user_id && row.user_id.toLowerCase() !== 'user_id' &&
          row.nama && row.nama.toLowerCase() !== 'nama'
        ) {
          let id = row.user_id.toString().padStart(8, '0');
          users.push({
            user_id: id,
            nama: row.nama || null,
            title: row.title || null,
            divisi: row.divisi || null,
            jabatan: row.jabatan || null,
            status: true,
            whatsapp: null,
            insta: null,
            tiktok: null,
            exception: false,
            client_id: clientId
          });
        }
      })
      .on('end', async () => {
        for (const user of users) {
          try {
            const columns = Object.keys(user);
            const values = columns.map((col) => user[col]);
            const index = columns.map((col, i) => `$${i + 1}`).join(',');
            const update = columns.map(col => `${col}=EXCLUDED.${col}`).join(',');

            await query(
              `INSERT INTO "user" (${columns.join(',')}) VALUES (${index})
                ON CONFLICT (user_id) DO UPDATE SET ${update};`,
              values
            );
            results.push({ user_id: user.user_id, status: '✅ Sukses' });
          } catch (err) {
            results.push({ user_id: user.user_id, status: '❌ Gagal', error: err.message });
          }
        }
        resolve(results);
      })
      .on('error', reject);
  });
}
