# Panduan Lengkap Penggunaan Cicero_V2
*Last updated: 2026-01-23*

Dokumen ini menjelaskan alur fungsi utama dan langkah penggunaan aplikasi **Cicero_V2**. Backend ini berjalan bersama dashboard Next.js (lihat repository `Cicero_Web`).

## 1. Persiapan Lingkungan

1. Install Node.js 20 dan PostgreSQL.
2. Jalankan `npm install` untuk mengunduh dependensi (butuh koneksi internet).
3. Salin file `.env.example` menjadi `.env` dan sesuaikan variabel berikut:
   - `PORT`, `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`, `REDIS_URL`, dll.
4. Import skema database dari `sql/schema.sql` ke PostgreSQL.
5. Pastikan Redis dan RabbitMQ (opsional) sudah aktif.

## 2. Menjalankan Aplikasi

```bash
npm start        # menjalankan server produksi
npm run dev      # menjalankan dengan nodemon (hot reload untuk kode saja)
```
Server Express akan aktif di port yang ditentukan dan memuat semua route API serta jadwal cron.
Hot reload hanya memantau kode (`app.js` dan folder `src`). Folder data seperti `laphar/`, `logs/`, dan file `*.txt`/`*.csv` diabaikan agar tidak memicu restart saat proses impor data berjalan.

## 3. Alur Pekerjaan Backend

1. **Autentikasi** – Endpoint `/api/auth/login` memberikan JWT. Token dipakai pada seluruh request berikutnya.
2. **Pengambilan Data** – Cron harian di `src/cron` mengambil postingan Instagram/TikTok, menyimpan like & komentar, lalu menganalisis hashtag.
3. **Penyimpanan** – Data tersimpan di tabel PostgreSQL seperti `insta_post`, `insta_like`, `tiktok_post`, dll. Struktur lengkap ada di `docs/database_structure.md`.
4. **Notifikasi** – Modul `waService.js` mengirim laporan harian dan pengingat via WhatsApp sesuai jadwal pada `docs/activity_schedule.md`.
5. **Antrian (opsional)** – Tugas berat dapat dikirim ke RabbitMQ melalui `publishToQueue` di `src/service/rabbitMQService.js`.

## 4. Fitur WhatsApp Bot

Bot WhatsApp menyediakan beberapa perintah untuk operator dan pengguna:
- `oprrequest` → mengelola data user, rekap link harian, serta **Menu Manajemen Engagement** untuk absensi Likes Instagram/Komentar TikTok sesuai status aktif akun client. Laporan absensi engagement pada mode akumulasi kini dikelompokkan per satfung dengan sub-list **lengkap/kurang/belum**. Operator/Super Admin client dapat masuk langsung, sedangkan Admin WhatsApp wajib memilih client bertipe **org** sebelum masuk menu operator. Submenu **Absensi registrasi user** dan **Absensi update data username** berada di *Kelola User* dan seluruh submenu menampilkan instruksi **ketik back** untuk kembali. Detail pada `docs/wa_operator_request.md`.
- `userrequest` → registrasi dan pengelolaan data user. Lihat `docs/wa_user_registration.md`.
- *Bulk Penghapusan Status User* menggunakan format pesan
  `Permohonan Penghapusan Data Personil – <SATKER>` yang berisi daftar ber-
  nomor `Nama – NRP/NIP – Alasan`. Bot menonaktifkan status, mengosongkan
  WhatsApp, dan mengirim ringkasan sukses/gagal. Header dengan penebalan
  (mis. `📄 **Permohonan ...**`) kini juga dikenali sebagai ringkasan balasan
  bot sehingga tidak diproses ulang jika pesan tersebut dikirim kembali. Jika
  format kosong, header tidak sesuai, atau daftar personel tidak ditemukan, bot
  mengirim pesan penjelasan lalu menutup sesi agar pengguna kembali ke menu
  utama.
- Normalisasi pesan (lowercase dan trim) dilakukan di awal fungsi `processMessage`
  agar seluruh percabangan—termasuk perintah `batal` di menu interaktif—selalu
  menggunakan teks yang sudah stabil tanpa memicu `ReferenceError`.

Sistem menjalankan *dua* nomor WhatsApp:
1. **Nomor utama** menangani seluruh perintah bot seperti `oprrequest`, `dashrequest`, dan lainnya.
2. **Nomor kedua** khusus untuk perintah `userrequest` (registrasi dan pemutakhiran data user).

### Konfigurasi Environment
Tambahkan variabel berikut pada `.env` untuk mengatur sesi WhatsApp:

```
# ID sesi untuk nomor utama (opsional, default `wa-admin`)
APP_SESSION_NAME=wa-admin

# ID sesi untuk nomor kedua (`userrequest`)
USER_WA_CLIENT_ID=wa-userrequest-prod

# ID sesi untuk nomor gateway (harus beda dari USER_WA_CLIENT_ID)
GATEWAY_WA_CLIENT_ID=wa-gateway-prod

# Lokasi folder sesi LocalAuth (opsional, harus writable oleh runtime user; jika tidak writable, adapter akan log error lalu fallback ke path default yang dibuat otomatis)
WA_AUTH_DATA_PATH=/var/lib/cicero/wa-sessions

# Hapus sesi sebelum re-init ketika auth gagal/logged out (opsional)
WA_AUTH_CLEAR_SESSION_ON_REINIT=false

# URL cache versi WhatsApp Web (opsional, kosongkan jika ingin menonaktifkan fetch remote)
WA_WEB_VERSION_CACHE_URL=https://raw.githubusercontent.com/wppconnect-team/wa-version/main/versions.json

# Pin versi WhatsApp Web untuk menghindari error cache remote (opsional, format: \d+\.\d+(\.\d+)?)
WA_WEB_VERSION=

# Versi rekomendasi WhatsApp Web (dipakai jika WA_WEB_VERSION kosong, opsional)
WA_WEB_VERSION_RECOMMENDED=

# Timeout DevTools Protocol Puppeteer untuk whatsapp-web.js (opsional, ms)
WA_WWEBJS_PROTOCOL_TIMEOUT_MS=120000
# Override timeout per client (opsional, tersedia alias role + suffix client ID uppercase dengan non-alfanumerik jadi "_")
WA_WWEBJS_PROTOCOL_TIMEOUT_MS_USER=120000
WA_WWEBJS_PROTOCOL_TIMEOUT_MS_GATEWAY=180000
# Batas maksimum kenaikan timeout saat init (opsional)
WA_WWEBJS_PROTOCOL_TIMEOUT_MAX_MS=300000
# Multiplier kenaikan timeout saat init (opsional)
WA_WWEBJS_PROTOCOL_TIMEOUT_BACKOFF_MULTIPLIER=1.5
```
Jika `WA_WEB_VERSION_CACHE_URL`, `WA_WEB_VERSION`, dan `WA_WEB_VERSION_RECOMMENDED` sama-sama kosong, adapter akan menonaktifkan local web cache untuk mencegah error `LocalWebCache.persist`. Biarkan salah satu dari variabel tersebut terisi untuk mengaktifkan kembali mekanisme cache versi, dan kosongkan semuanya hanya jika memang ingin menonaktifkan caching.
`WA_WWEBJS_PROTOCOL_TIMEOUT_MS` memperbesar ambang `Runtime.callFunctionOn` pada Puppeteer; naikkan ke 180000ms jika koneksi ke WhatsApp Web sering lambat atau time out. Override per client bisa di-set lewat alias role berbasis prefix (client ID `wa-gateway*` → `WA_WWEBJS_PROTOCOL_TIMEOUT_MS_GATEWAY`, `wa-user*` → `WA_WWEBJS_PROTOCOL_TIMEOUT_MS_USER`) atau suffix client ID uppercase. Contoh untuk `wa-gateway-prod`: alias `WA_WWEBJS_PROTOCOL_TIMEOUT_MS_GATEWAY=180000` atau suffix eksplisit `WA_WWEBJS_PROTOCOL_TIMEOUT_MS_WA_GATEWAY_PROD=180000`. Dengan begitu, admin tetap pakai default sementara client tertentu bisa diperpanjang.
Untuk penanganan otomatis saat init sering timeout, adapter dapat menaikkan nilai timeout secara bertahap. Atur batas maksimum lewat `WA_WWEBJS_PROTOCOL_TIMEOUT_MAX_MS` (default 300000ms) dan multiplier kenaikan lewat `WA_WWEBJS_PROTOCOL_TIMEOUT_BACKOFF_MULTIPLIER` (default 1.5). Pastikan batas maksimum lebih tinggi dari timeout dasar agar eskalasi berjalan.
Fallback readiness akan melakukan reinit ketika `getState` tetap `unknown` setelah batas retry. Untuk client `WA-GATEWAY` dan `WA-USER`, **clear session hanya dilakukan** jika ada indikasi logout/auth failure (misalnya `LOGGED_OUT/UNPAIRED/CONFLICT/UNPAIRED_IDLE` atau event `auth_failure`) dan folder `session-<clientId>` masih ada. Jika tidak ada indikasi tersebut, sistem tetap reinit tanpa clear session agar sesi valid tidak terhapus, dan log PM2 tetap menandai alasan fallback. Simpan backup folder session sebelum pembersihan manual agar autentikasi bisa dipulihkan.

### Langkah Login
1. Jalankan `npm run dev` atau `npm start`.
2. Terminal menampilkan QR `[WA]` untuk nomor utama; pindai dengan akun WhatsApp utama.
3. Terminal juga menampilkan QR `[WA-USER]` untuk nomor kedua; pindai dengan nomor khusus `userrequest`.
4. Setelah dipindai, sesi tersimpan di folder `~/.cicero/wwebjs_auth/` (atau `WA_AUTH_DATA_PATH` jika di-set). Pastikan folder tersebut writable oleh runtime user; jika `WA_AUTH_DATA_PATH` tidak bisa diakses, adapter akan log error lalu fallback ke path rekomendasi selama folder fallback bisa dibuat dan ditulis.
5. Saat terjadi `auth_failure` atau `LOGGED_OUT`, adapter akan melakukan `destroy()` + `initialize()` dengan log yang menyertakan `clientId` untuk membantu troubleshooting.
6. Jika modul web WhatsApp belum siap (`pupPage` tidak tersedia atau evaluasi gagal), sistem mencatat warning dengan `clientId` namun tetap melanjutkan status ready agar alur tidak menggantung.
7. Adapter memvalidasi payload `WA_WEB_VERSION_CACHE_URL` sebelum dipakai. Payload harus berisi string versi sesuai pola `\d+\.\d+(\.\d+)?`, baik sebagai string langsung maupun pada field `version`, `webVersion`, `wa_version`, atau `waVersion`. Jika payload tidak berisi string versi yang diharapkan atau endpoint 404, sistem akan men-disable `webVersionCache` agar whatsapp-web.js kembali ke default. Log seperti `Web version cache fetch failed (404)` menandakan URL cache perlu diperbaiki. Saat endpoint remote tidak tersedia, kosongkan `WA_WEB_VERSION_CACHE_URL` untuk menonaktifkan fetch cache, lalu set `WA_WEB_VERSION` (format `\d+\.\d+(\.\d+)?`) atau `WA_WEB_VERSION_RECOMMENDED` untuk pin versi yang stabil. Jika semua variabel kosong, cache lokal otomatis dimatikan untuk mencegah error `LocalWebCache.persist`.

   Contoh payload cache yang valid:
   ```json
   {
     "version": "2.3000.1019311536",
     "platform": "web",
     "releaseDate": "2024-04-01"
   }
   ```
   Perbarui pin jika WhatsApp Web merilis update besar dan log `initialize`/`load` mulai gagal (misalnya blank page, `LocalWebCache.persist`, atau `Cannot read properties of null`). Gunakan versi terbaru dari payload cache yang tervalidasi.

Pengguna cukup menyimpan nomor bot yang sesuai, mengirim perintah `userrequest`, lalu mengikuti instruksi balasan.

## 5. Akses Dashboard

Dashboard Next.js (`Cicero_Web`) menggunakan variabel `NEXT_PUBLIC_API_URL` untuk terhubung ke backend. Fitur utama di dashboard:
1. Login dengan nomor WhatsApp dan `client_id`.
2. Melihat statistik Instagram/TikTok pada halaman analytics.
3. Mengelola data client dan user melalui antarmuka atau endpoint REST.

Catatan: untuk role **operator**, endpoint statistik dashboard selalu menggunakan `client_id` dari sesi pengguna. Parameter `client_id` dari query string atau header akan diabaikan, dan permintaan ditolak jika sesi tidak memiliki `client_id`.

## 6. Tips Penggunaan

- Jalankan `npm run lint` dan `npm test` sebelum melakukan commit.
- Monitor cron job pada jam yang tercantum di `docs/activity_schedule.md`.
- Gunakan Redis agar permintaan tidak duplikat (`dedupRequestMiddleware.js`).
- Cadangkan database secara rutin (lihat `docs/pg_backup_gdrive.md`).

Dokumen lain seperti `enterprise_architecture.md`, `business_process.md`, dan `metadata_flow.md` dapat dijadikan referensi untuk memahami detail alur data.
