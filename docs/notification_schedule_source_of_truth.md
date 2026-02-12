# Source of Truth: Jadwal Cron & Flow Notifikasi Sosmed
*Last updated: 2026-02-12*

Dokumen ini adalah referensi utama untuk jadwal cron dan alur notifikasi pada modul fetch sosmed.
Jika ada perbedaan dengan dokumen lain, **ikuti dokumen ini + implementasi di `src/cron/cronDirRequestFetchSosmed.js`**.

## 1) Jadwal Eksekusi (Asia/Jakarta)

Sumber implementasi:
- `POST_FETCH_SCHEDULE = "5,30 6-16 * * *"`
- `ENGAGEMENT_ONLY_SCHEDULES = ["30 17-21 * * *", "0 18-22 * * *"]`

### A. Post Fetch + Engagement Refresh
- Cron: `5,30 6-16 * * *`
- Jam jalan: **06:05, 06:30, 07:05, 07:30, ... , 16:05, 16:30**
- Aksi:
  - Fetch post Instagram
  - Fetch post TikTok
  - Refresh likes Instagram
  - Refresh komentar TikTok

### B. Engagement-Only
- Cron: `30 17-21 * * *` dan `0 18-22 * * *`
- Jam jalan gabungan: **17:30, 18:00, 18:30, 19:00, 19:30, 20:00, 20:30, 21:00, 21:30, 22:00**
- Aksi:
  - Refresh likes Instagram
  - Refresh komentar TikTok
  - **Tidak fetch post baru**

## 2) Flow Notifikasi WA

### Trigger notifikasi
Notifikasi tugas dikirim jika salah satu kondisi benar:
1. Ada perubahan signifikan (`hasNotableChanges(changes)`), atau
2. Slot hourly aktif berdasarkan state (`shouldSendHourlyNotification`) selama jam post-fetch (06:00–16:59 WIB).

### Behavior stateful
- Interval hourly: **1 jam** (`NOTIFICATION_INTERVAL_MS`).
- State per client disimpan di tabel state reminder:
  - `lastIgCount`
  - `lastTiktokCount`
  - `lastNotifiedAt`
- Jika storage state gagal, sistem masuk mode konservatif: notifikasi hanya dikirim saat ada perubahan.

### Bentuk pesan
- `forceScheduled=true`: kirim ringkasan tugas terjadwal (tetap kirim walau tidak ada perubahan).
- `forceScheduled=false`: kirim saat ada perubahan.

## 3) Catatan Penting Kompatibilitas

- `src/service/telegramService.js` saat ini dipakai sebagai **wrapper WhatsApp logging/alert** untuk backward compatibility.
- Nama `telegramService` dipertahankan agar modul lama tidak perlu refactor besar, tetapi kanal aktual yang dipakai operasional adalah WhatsApp admin/gateway.

## 4) Checklist Wajib Saat Ubah Fungsi/Modul

Gunakan checklist ini setiap PR yang menyentuh fungsi/modul:

- [ ] Cek dampak perubahan ke cron schedule, trigger notifikasi, dan format pesan.
- [ ] Update dokumen yang relevan minimal:
  - [ ] `README.md`
  - [ ] `docs/business_process.md`
  - [ ] `docs/scheduled_notifications.md`
  - [ ] Dokumen `docs/wa_*.md` yang terdampak
  - [ ] Halaman ini (`docs/notification_schedule_source_of_truth.md`) jika jadwal/flow berubah
- [ ] Sertakan referensi file + line penting di deskripsi PR.
- [ ] Validasi ulang bahwa docs konsisten dengan implementasi aktual (`src/cron/cronDirRequestFetchSosmed.js`).

