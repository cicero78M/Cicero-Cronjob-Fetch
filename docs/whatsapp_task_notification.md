# WhatsApp Task Notification System

## Overview

Sistem notifikasi tugas WhatsApp yang secara otomatis mengirimkan pesan ke grup WhatsApp client ketika terjadi penambahan, pengurangan, atau perubahan link pada konten sosial media (Instagram dan TikTok).

## Fitur

### 1. Deteksi Perubahan Otomatis

Sistem mendeteksi perubahan berikut:
- **Penambahan konten Instagram**: Post baru yang perlu di-like dan diberi komentar
- **Penambahan konten TikTok**: Video baru yang perlu diberi komentar
- **Pengurangan konten**: Konten yang tidak lagi terdeteksi pada daftar tugas (dengan klasifikasi penyebab perubahan)
- **Perubahan link amplifikasi**: Link baru atau update link (Instagram, Facebook, Twitter/X, TikTok, YouTube)

### 2. Format Pesan

Pesan dikirim dalam format Indonesia dengan markdown WhatsApp:
- Header dengan emoji yang sesuai (📸 Instagram, 🎵 TikTok, 🔗 Link, 🗑️ Pengurangan)
- Nama client
- Daftar konten dengan detail (shortcode/video_id, caption/deskripsi, link)
- Instruksi tindak lanjut


Untuk notifikasi **pengurangan konten**, payload perubahan kini menyertakan metadata investigasi:
- `igDeletedSource` / `tiktokDeletedSource` dengan nilai: `real_missing`, `sync_anomaly`, atau `unknown`
- `igMissingShortcodes` / `tiktokMissingIds` sebagai shortlist ID konten (maksimal 5) untuk validasi manual

Saat penurunan count besar/tidak wajar, sistem akan memakai wording netral seperti **"terdeteksi perubahan sinkronisasi"** (bukan langsung menyimpulkan konten dihapus), lalu menampilkan `source` dan shortlist agar lintas tim lebih mudah verifikasi.

Untuk notifikasi **pengurangan konten**, pesan kini memuat:
- Wording adaptif berbasis `source` (`real_missing` vs `sync_anomaly`)
- Field `source: <nilai>` per platform
- Shortlist manual check (`shortlist_shortcode` / `shortlist_video_id`)
- Daftar link konten yang tidak lagi terdeteksi (jika tersedia di payload perubahan)
- Instruksi validasi manual + koordinasi lintas tim untuk kasus `sync_anomaly`

Setelah notifikasi penghapusan dikirim, sistem juga mengirim **update daftar tugas terbaru** (`📋 Daftar Tugas`) agar penerima langsung mendapatkan snapshot tugas terkini.

Untuk **notifikasi terjadwal daftar tugas**, setiap item konten kini juga memuat metadata engagement:
- `Upload: <hari>, <tanggal> <jam:menit> WIB` (zona waktu Asia/Jakarta)
- `Likes: <angka format id-ID> | Komentar: <angka format id-ID>`
- Nilai null/undefined akan fallback aman (`Upload: -`, `Likes: -` untuk Instagram bila data likes tidak tersedia, dan count lain menjadi `0`).

Daftar tugas Instagram pada notifikasi terjadwal disusun dari dua sumber agar operasional tidak kehilangan tugas:
- konten relasi tugas aktif (`insta_post_clients`) untuk client terkait;
- konten `manual_input` pada `insta_post` walaupun bukan hasil sinkronisasi akun official.

Dengan aturan ini, konten hasil input manual yang valid tetap muncul pada `📋 Daftar Tugas` selama masih aktif di data harian client.

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

**Contoh header daftar tugas terjadwal (WIB):**
```
📋 *Daftar Tugas - POLDA JATIM*
🕒 Pengambilan data: Senin, 17 Februari 2026 08:30 WIB

Status tugas saat ini:
📸 Instagram: *10* konten
🎵 TikTok: *5* konten
```

Timestamp pada daftar tugas selalu diformat dengan locale Indonesia (`id-ID`) dan timezone `Asia/Jakarta` agar konsisten di semua jalur notifikasi yang memakai format daftar tugas.

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
- ID individual (`@s.whatsapp.net` / `@c.us`) dianggap tidak valid untuk notifikasi grup

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
   - Enqueue notifikasi ke outbox setelah fetch selesai (bukan kirim langsung)
   - Logging status enqueue notifikasi
   - Memuat state scheduler dari PostgreSQL sebelum proses client
   - Menyimpan state terbaru (`last_ig_count`, `last_tiktok_count`, `last_notified_at`) secara atomik setelah proses client

4. **src/model/waNotificationOutboxModel.js** (New)
   - Insert event outbox dengan deduplikasi `idempotency_key`
   - Claim batch `pending/retrying` secara transactional (`FOR UPDATE SKIP LOCKED`)
   - Update status kirim (`sent`, `retrying`, `dead_letter`) + metadata percobaan

5. **src/service/waOutboxWorkerService.js** (New)
   - Proses pengiriman WA terpisah dari detector perubahan
   - Retry exponential backoff + dead-letter policy

6. **src/cron/cronWaOutboxWorker.js** (New)
   - Menjalankan worker outbox setiap menit

7. **app.js** (Updated)
   - Wajib mengimpor `src/cron/cronWaOutboxWorker.js` supaya worker outbox ter-register saat service start
   - Tanpa import ini, event perubahan tugas tetap masuk outbox tetapi tidak pernah terkirim karena WA gateway tidak ikut inisialisasi

8. **src/model/waNotificationReminderStateModel.js** (Extended)
   - Menyediakan akses state scheduler WA (`wa_notification_scheduler_state`)
   - Fungsi bulk-read state per `client_id`
   - Fungsi upsert state scheduler pasca proses client

### Dependencies Baru

- `whatsapp-web.js@1.34.6` - Library WhatsApp Web API
- `qrcode-terminal@0.12.0` - Untuk menampilkan QR code autentikasi

## Cara Kerja

1. **Cron job berjalan sesuai jadwal aktual**:
   - Post fetch + engagement refresh: `5,30 6-16 * * *` + `5 17 * * *`
   - Engagement-only: `30 17-21 * * *` + `0 18-22 * * *`
2. **Fetch konten sosial media** untuk setiap client aktif (hanya pada jadwal post-fetch; engagement-only tidak fetch post baru)
3. **Hitung perubahan**:
   - Bandingkan jumlah post sebelum dan sesudah fetch
   - Jika ada penambahan, ambil detail post baru dari database
   - Jika ada pengurangan, hitung selisihnya
   - Ambil link report yang diupdate dalam 24 jam terakhir
4. **Enqueue notifikasi ke outbox**:
   - Trigger saat ada perubahan signifikan **atau** slot hourly Jakarta baru
   - Slot hourly dihitung lewat `buildJakartaHourlySlotKey()` dengan format `YYYY-MM-DD-HH@05`
   - Jika menit runtime `< 05`, slot dibulatkan ke jam sebelumnya agar stabil
   - Saat trigger hourly aktif, enqueue memakai `forceScheduled=true`
   - Simpan event ke `wa_notification_outbox` dengan status `pending` dan `idempotency_key`
   - Deduplikasi otomatis saat insert (`ON CONFLICT idempotency_key DO NOTHING`)
5. **Worker kirim WhatsApp**:
   - Worker aktif hanya bila `app.js` memuat `src/cron/cronWaOutboxWorker.js` saat boot
   - Sebelum claim batch, worker hanya me-release row `processing` yang stale ke `retrying` menggunakan cutoff `COALESCE(last_attempt_at, updated_at, created_at) < NOW() - interval`.
   - Nilai stale timeout dapat diatur melalui env `WA_OUTBOX_PROCESSING_STALE_SECONDS` (default `300` detik).
   - Cron worker cepat membaca outbox status `pending`/`retrying`
   - Saat diproses, status diubah ke `processing` dan `attempt_count` bertambah
   - Jika sukses: status `sent` + isi `sent_at`
   - Jika gagal: retry exponential backoff sampai `max_attempts`, lalu `dead_letter`


### Kontrak API `sendTugasNotification`

Signature saat ini:

```js
sendTugasNotification(waClient, clientId, changes, options)
```

`options` hanya menerima properti berikut:
- `forceScheduled` (`boolean`, default `false`)

Catatan: opsi count seperti `igCount` dan `tiktokCount` tidak lagi menjadi input API; total konten pada pesan scheduled dihitung langsung dari hasil fetch post harian.

### Ringkasan `forceScheduled` pada payload

- `forceScheduled=true`
  - Dipakai untuk notifikasi hourly/scheduled (termasuk slot wajib 17:05).
  - Pesan yang dibentuk adalah daftar tugas terjadwal (`formatScheduledTaskList`).
  - Idempotency key menyertakan `scheduled` + `hourKey` agar maksimal satu event per jam per grup untuk payload yang sama.
- `forceScheduled=false`
  - Dipakai untuk notifikasi berbasis perubahan (`igAdded`, `tiktokAdded`, `igDeleted`, `tiktokDeleted`, `linkChanges`).
  - Idempotency key memakai mode `change`.

### Contoh timeline harian (enqueue vs send)

1. `06:05` cron post-fetch berjalan, slot `...-06@05` dievaluasi.
2. Bila syarat terpenuhi, sistem **enqueue** event ke `wa_notification_outbox` (belum mengirim WA langsung).
3. `cronWaOutboxWorker` (tiap menit) claim event `pending/retrying`, kirim ke WA gateway, lalu update status `sent/retrying/dead_letter`.
4. `06:30` tetap berada di slot `...-06@05`; bila `last_notified_slot` sudah sama dan tidak ada perubahan baru, tidak enqueue scheduled ulang.
5. `17:05` run wajib post-fetch tetap dievaluasi sebagai slot hourly; saat slot baru, `forceScheduled=true` memastikan pesan daftar tugas tetap terbuat walau tanpa perubahan data.

## Troubleshooting

### Error `SyntaxError: Unexpected token "<<"` saat service start

Gejala ini biasanya muncul ketika file JavaScript masih menyisakan *merge conflict marker* (`<<<<<<<`, `=======`, `>>>>>>>`).

Perbaikan pada modul notifikasi tugas (`src/service/tugasNotificationService.js`) sudah memastikan formatter Instagram daftar tugas terjadwal bersih dari conflict marker dan mempertahankan output metadata engagement berikut:
- `Upload: <hari>, <tanggal> <jam:menit> WIB`
- `Likes: <angka format id-ID atau -> | Komentar: <angka format id-ID>`

Jika error serupa muncul lagi, jalankan pengecekan cepat berikut di root project:

```bash
rg -n "^<<<<<<<|^=======|^>>>>>>>" src
```

## Logging

Sistem mencatat setiap langkah enqueue dan delivery dengan format seperti:
```
[CRON DIRFETCH SOSMED][CLIENT_ID][waNotification][action=enqueueNotification][result=completed] | IG 5→8 | TikTok 3→4 | Outbox notification queued: Changes detected: ig_added=3; tiktok_added=1; ig_deleted=6(source=sync_anomaly,shortlist=ABC123|DEF456|GHI789)
[WA_OUTBOX_WORKER] processed claimed=10 sent=8 retried=1 dead_letter=1
```

Format ringkasan perubahan (`buildChangeSummary`) kini disejajarkan dengan gaya key-value logger cron agar investigasi lintas tim lebih mudah (contoh: `ig_deleted=...`, `source=...`, `shortlist=...`).

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
- `last_notified_slot`

### Alur state pada `runCron`

1. Saat run dimulai, worker memuat state semua `client_id` aktif dari database.
2. Worker tetap menjalankan fetch post + refresh engagement seperti biasa.
3. Setelah fetch selesai, perubahan dihitung dari state tersimpan vs hitungan terbaru.
4. Worker membentuk `currentSlotKey` berbasis waktu Jakarta (`YYYY-MM-DD-HH@05`) dan membandingkannya dengan `last_notified_slot`.
5. Jika notifikasi berhasil di-enqueue, `last_notified_at` dan `last_notified_slot` diupdate. Jika enqueue gagal/tidak terkirim, slot tidak diubah agar tidak terkunci.
6. State terbaru di-upsert per client (satu query `INSERT ... ON CONFLICT ... DO UPDATE`) sehingga update bersifat atomik di level row.


## Pengaturan Concurrency & Deadline `runCron`

`runCron` pada `src/cron/cronDirRequestFetchSosmed.js` sekarang memakai pola berikut:

- Proses per client dipisah ke fungsi `processClient(client, options)`.
- Intake client dibatasi dengan `p-limit` (default `clientConcurrency = 4`) supaya throughput stabil tanpa membebani API eksternal secara berlebihan.
- Ditambahkan guard `maxRunDurationMs` (default 28 menit) + buffer intake (`DEADLINE_INTAKE_BUFFER_MS`) agar worker berhenti menerima client baru saat runtime mendekati batas.
- Metrik baru pada log:
  - `processed_count`
  - `skipped_due_to_deadline`
  - `client_duration` per client
- Jika durasi aktual sering mendekati `maxRunDurationMs` (>= 80%), sistem menulis warning baseline agar interval cron bisa dievaluasi (mis. dinaikkan dari 30 menit, atau workload per run dikurangi).
- Guard lokal `isFetchInFlight` berada di dalam blok `try/finally` setelah lock terdistribusi berhasil diambil. Artinya, ketika run kedua skip karena run pertama masih berjalan, lock run kedua tetap di-`release()` dan log `action=lock_released result=released` tetap muncul untuk audit.

### Tuning yang disarankan

1. Mulai dari concurrency 3-5 (default saat ini 4).
2. Pantau distribusi `client_duration` untuk menemukan bottleneck API eksternal.
3. Bila `skipped_due_to_deadline` sering > 0, pertimbangkan:
   - menaikkan interval cron,
   - menurunkan scope kerja per run, atau
   - menambah worker terdistribusi dengan lock yang tetap aman.

### Fallback saat storage state down

Jika query state gagal (misalnya database sementara down):

- Cron **tetap memproses fetch** konten/engagement semua client.
- Perhitungan delta memakai baseline konservatif (`counts_before = counts_after`) agar tidak memicu blast notifikasi berkala tanpa state valid.
- Mode hourly-only notification dinonaktifkan sementara (hanya kirim jika benar-benar terdeteksi perubahan signifikan dari data yang tersedia).
- Error state storage dilaporkan ke Telegram untuk observability.


## Skema Outbox

Tabel `wa_notification_outbox` menyimpan antrian notifikasi dengan kolom penting:

- `status`: `pending`, `retrying`, `processing`, `sent`, `dead_letter`
- `idempotency_key`: kunci deduplikasi agar pesan tidak terkirim ganda
- `attempt_count` dan `max_attempts`: kontrol retry
- `next_attempt_at`: jadwal percobaan ulang berikutnya; saat status menjadi `dead_letter`, kolom ini diisi timestamp final (`NOW()`) untuk menjaga jejak waktu percobaan terakhir. Saat status berubah ke `sent`, nilai `next_attempt_at` dipertahankan (tidak di-`NULL`-kan) untuk menjaga histori lifecycle outbox.
- Perubahan perilaku (2026-02): helper `markOutboxSent` dan `markOutboxDeadLetter` tidak lagi melakukan reset `next_attempt_at` ke `NULL`. Kebijakan final: `sent` mempertahankan nilai existing `next_attempt_at`, sedangkan `dead_letter` menulis stempel final `NOW()`.
- `sent_at`: timestamp sukses terkirim
- `error_message`: error terakhir saat gagal kirim

Backoff retry memakai exponential policy berbasis `attempt_count` dan dibatasi maksimum 1 jam antar percobaan.

Catatan recovery stale processing: worker akan menulis log threshold `stale_threshold_seconds=<nilai>` saat ada row stale yang direlease kembali ke `retrying`, sehingga tuning env lebih mudah diaudit.
