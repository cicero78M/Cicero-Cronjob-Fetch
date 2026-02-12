# WhatsApp Task Notification System

## Overview

Sistem notifikasi tugas WhatsApp yang secara otomatis mengirimkan pesan ke grup WhatsApp client ketika terjadi penambahan, pengurangan, atau perubahan link pada konten sosial media (Instagram dan TikTok).

## Fitur

### 1. Deteksi Perubahan Otomatis

Sistem mendeteksi perubahan berikut:
- **Penambahan konten Instagram**: Post baru yang perlu di-like dan diberi komentar
- **Penambahan konten TikTok**: Video baru yang perlu diberi komentar
- **Pengurangan konten**: Konten yang dihapus dari daftar tugas
- **Perubahan link amplifikasi**: Link baru atau update link (Instagram, Facebook, Twitter/X, TikTok, YouTube)

### 2. Format Pesan

Pesan dikirim dalam format Indonesia dengan markdown WhatsApp:
- Header dengan emoji yang sesuai (📸 Instagram, 🎵 TikTok, 🔗 Link, 🗑️ Pengurangan)
- Nama client
- Daftar konten dengan detail (shortcode/video_id, caption/deskripsi, link)
- Instruksi tindak lanjut

**Contoh pesan penambahan Instagram:**
```
📸 *Tugas Instagram Baru - POLDA JATIM*

Terdapat *3* konten Instagram baru yang perlu dikerjakan:

1. *Post ABC123*
   Caption: _Kegiatan patroli di wilayah..._
   Link: https://www.instagram.com/p/ABC123/

2. *Post DEF456*
   Caption: _Sosialisasi Kamtibmas..._
   Link: https://www.instagram.com/p/DEF456/

_Silakan like dan beri komentar pada konten di atas._
```

**Contoh pesan perubahan link:**
```
🔗 *Perubahan Link Tugas - POLDA JATIM*

Terdapat *2* perubahan link amplifikasi:

1. *IPTU John Doe*
   Post: ABC123
   Link: IG: https://instagram.com/..., FB: https://facebook.com/...

_Link amplifikasi telah diperbarui._
```

### 3. Konfigurasi Grup WhatsApp

Grup penerima notifikasi dikonfigurasi melalui field `client_group` pada tabel `clients`:

```sql
-- Contoh: Satu grup
client_group = '123456789-1234567890@g.us'

-- Contoh: Multiple grup (pisahkan dengan koma atau semicolon)
client_group = '123456789-1234567890@g.us,098765432-0987654321@g.us'
```

Format group ID WhatsApp harus:
- Berakhiran `@g.us` untuk grup
- Atau berformat `@c.us` untuk individual chat

## Implementasi Teknis

### File-file Baru

1. **src/service/tugasNotificationService.js**
   - Memformat pesan notifikasi
   - Mengirim pesan ke grup WhatsApp
   - Mendukung multiple grup per client

2. **src/service/tugasChangeDetector.js**
   - Mendeteksi perubahan jumlah post
   - Mengambil data post baru (24 jam terakhir)
   - Mengambil perubahan link report
   - Menentukan apakah ada perubahan yang perlu dinotifikasikan

3. **src/cron/cronDirRequestFetchSosmed.js** (Modified)
   - Integrasi dengan sistem deteksi perubahan
   - Pengiriman notifikasi setelah fetch selesai
   - Logging status notifikasi
   - Memuat state scheduler dari PostgreSQL sebelum proses client
   - Menyimpan state terbaru (`last_ig_count`, `last_tiktok_count`, `last_notified_at`) secara atomik setelah proses client

4. **src/model/waNotificationReminderStateModel.js** (Extended)
   - Menyediakan akses state scheduler WA (`wa_notification_scheduler_state`)
   - Fungsi bulk-read state per `client_id`
   - Fungsi upsert state scheduler pasca proses client

### Dependencies Baru

- `whatsapp-web.js@1.34.6` - Library WhatsApp Web API
- `qrcode-terminal@0.12.0` - Untuk menampilkan QR code autentikasi

## Cara Kerja

1. **Cron job berjalan** (setiap 30 menit, 06:00-22:00 WIB)
2. **Fetch konten sosial media** untuk setiap client aktif
3. **Hitung perubahan**:
   - Bandingkan jumlah post sebelum dan sesudah fetch
   - Jika ada penambahan, ambil detail post baru dari database
   - Jika ada pengurangan, hitung selisihnya
   - Ambil link report yang diupdate dalam 24 jam terakhir
4. **Kirim notifikasi**:
   - Jika ada perubahan yang perlu dinotifikasikan
   - Format pesan sesuai jenis perubahan
   - Kirim ke semua grup yang dikonfigurasi di `client_group`
   - Log status pengiriman

## Logging

Sistem mencatat setiap langkah dengan format:
```
[CRON DIRFETCH SOSMED][CLIENT_ID][waNotification][action=sendNotification][result=completed] | IG 5→8 | TikTok 3→4 | WA notification sent: +3 IG posts, +1 TikTok posts, ~2 link changes
```

## Keamanan

- Notifikasi hanya dikirim ke grup yang terdaftar di database
- Validasi format WhatsApp ID sebelum pengiriman
- Error handling untuk mencegah crash jika WA client tidak tersedia
- Fallback mechanism: waGatewayClient → waClient → waUserClient

## Limitasi

- Link report diambil dari 24 jam terakhir
- Post baru dibatasi berdasarkan selisih hitungan
- Pesan dibatasi panjang caption/deskripsi (80 karakter)
- Memerlukan WhatsApp client yang sudah terautentikasi

## Testing

Untuk menguji sistem:

1. **Set environment variables**:
```bash
USER_WA_CLIENT_ID=wa-userrequest-prod
GATEWAY_WA_CLIENT_ID=wa-gateway-prod
```

2. **Konfigurasi client group**:
```sql
UPDATE clients 
SET client_group = 'YOUR_GROUP_ID@g.us' 
WHERE client_id = 'YOUR_CLIENT_ID';
```

3. **Jalankan cron manual** (untuk testing):
```javascript
import { runCron } from './src/cron/cronDirRequestFetchSosmed.js';
await runCron();
```

4. **Monitor logs** untuk melihat status notifikasi

## Troubleshooting

### Notifikasi tidak terkirim

1. **Check WhatsApp client status**:
   - Pastikan WhatsApp client sudah ready
   - Check log: "WhatsApp client not available"

2. **Check client_group configuration**:
   - Pastikan `client_group` tidak kosong
   - Format harus benar: `XXXXX@g.us`

3. **Check for changes**:
   - Log akan menunjukkan "No notable changes detected" jika tidak ada perubahan

### Format pesan tidak sesuai

- Periksa data di database (caption, description)
- Pastikan encoding UTF-8 untuk karakter Indonesia
- Check field yang null atau empty

## Maintenance

- Monitor log secara berkala untuk error
- Update `client_group` jika grup diganti
- Pastikan database terindeks dengan baik untuk query perubahan


## Persistensi State Scheduler

State `lastStateByClient` dan `lastNotificationByClient` tidak lagi disimpan in-memory.
State sekarang dipersistenkan ke tabel PostgreSQL `wa_notification_scheduler_state` dengan kolom:

- `client_id`
- `last_ig_count`
- `last_tiktok_count`
- `last_notified_at`

### Alur state pada `runCron`

1. Saat run dimulai, worker memuat state semua `client_id` aktif dari database.
2. Worker tetap menjalankan fetch post + refresh engagement seperti biasa.
3. Setelah fetch selesai, perubahan dihitung dari state tersimpan vs hitungan terbaru.
4. Jika notifikasi berhasil terkirim, `last_notified_at` diupdate ke timestamp saat ini.
5. State terbaru di-upsert per client (satu query `INSERT ... ON CONFLICT ... DO UPDATE`) sehingga update bersifat atomik di level row.

### Fallback saat storage state down

Jika query state gagal (misalnya database sementara down):

- Cron **tetap memproses fetch** konten/engagement semua client.
- Perhitungan delta memakai baseline konservatif (`counts_before = counts_after`) agar tidak memicu blast notifikasi berkala tanpa state valid.
- Mode hourly-only notification dinonaktifkan sementara (hanya kirim jika benar-benar terdeteksi perubahan signifikan dari data yang tersedia).
- Error state storage dilaporkan ke Telegram untuk observability.
