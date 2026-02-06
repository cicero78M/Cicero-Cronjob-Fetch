import fs from 'fs/promises';
import path from 'path';
import { query } from '../db/index.js';
import { decrypt } from '../utils/crypt.js';

const jsonToDbMap = {
  ID_KEY: 'user_id',
  NAMA: 'nama',
  TITLE: 'title',
  DIVISI: 'divisi',
  JABATAN: 'jabatan',
  STATUS: 'status',
  WHATSAPP: 'whatsapp',
  INSTA: 'insta',
  TIKTOK: 'tiktok',
  EXCEPTION: 'exception'
};

export async function migrateUsersFromFolder(clientId) {
  const userDir = path.resolve('user_data', clientId);
  let results = [];
  try {
    const files = await fs.readdir(userDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const fullPath = path.join(userDir, file);
      const rawContent = await fs.readFile(fullPath, 'utf-8');
      let data;
      try {
        data = JSON.parse(rawContent);

        const user = {};
        for (const key in jsonToDbMap) {
          if (data[key]) {
            let val = decrypt(data[key]);
            // Padding user_id ke 8 karakter
            if (jsonToDbMap[key] === 'user_id') {
              if (val && val.length < 8) val = val.padStart(8, '0');
            }
            // KOREKSI: boolean TRUE/FALSE
            if (['status', 'exception'].includes(jsonToDbMap[key])) {
              if (typeof val === "string") {
                if (val.trim().toLowerCase() === 'true') val = true;
                else if (val.trim().toLowerCase() === 'false') val = false;
                else val = false; // default, selain 'true', 'false'
              } else if (val === true) {
                val = true;
              } else {
                val = false;
              }
            }
            user[jsonToDbMap[key]] = val;
          } else {
            // Field tidak ada, isi false
            if (['status', 'exception'].includes(jsonToDbMap[key])) {
              user[jsonToDbMap[key]] = false;
            }
          }
        }
        user.client_id = clientId;

        const columns = Object.keys(user);
        const values = columns.map(col => user[col]);
        const index = columns.map((col, i) => `$${i + 1}`).join(',');
        const update = columns.map(col => `${col}=EXCLUDED.${col}`).join(',');

        await query(
          `INSERT INTO "user" (${columns.join(',')}) VALUES (${index})
           ON CONFLICT (user_id) DO UPDATE SET ${update};`,
          values
        );
        results.push({ file, status: '✅ Sukses' });
      } catch (err) {
        results.push({ file, status: '❌ Gagal', error: err.message });
      }
    }
    return results;
  } catch (err) {
    throw new Error('Gagal membaca folder/folder tidak ditemukan: ' + err.message);
  }
}
