import fetch from 'node-fetch';

/**
 * Cek status akses Google Sheet CSV, kembalikan pesan error jika tidak bisa diakses publik.
 * @param {string} sheetUrl - Link Google Sheet (bisa format edit atau export csv)
 * @returns {Promise<{ok: boolean, reason: string, status: number}>}
 */
export async function checkGoogleSheetCsvStatus(sheetUrl) {
  // Ekstrak sheetId dan gid dari url
  const match = sheetUrl.match(/spreadsheets\/d\/([\w-]+)/);
  if (!match) {
    return { ok: false, reason: 'Link Google Sheet tidak valid.', status: 400 };
  }
  const sheetId = match[1];

  // Cek gid (default 0)
  let gid = '0';
  const gidMatch = sheetUrl.match(/[?&]gid=(\d+)/);
  if (gidMatch) gid = gidMatch[1];

  // Buat link download CSV
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

  try {
    const res = await fetch(csvUrl, { method: 'HEAD' }); // HEAD saja cukup untuk cek status
    if (res.status === 200) {
      return { ok: true, reason: 'OK', status: 200 };
    }
    if (res.status === 403 || res.status === 401) {
      return {
        ok: false,
        reason: 'Sheet tidak public. Ubah akses menjadi “Anyone with the link can view”.',
        status: res.status
      };
    }
    if (res.status === 404) {
      return {
        ok: false,
        reason: 'Sheet tidak ditemukan. Periksa link dan pastikan ID Sheet benar.',
        status: res.status
      };
    }
    return {
      ok: false,
      reason: `Google Sheet gagal diakses. Status: ${res.status}`,
      status: res.status
    };
  } catch (err) {
    return { ok: false, reason: `Network error: ${err.message}`, status: 0 };
  }
}
