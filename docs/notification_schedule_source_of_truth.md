# Source of Truth: Jadwal Cron & Flow Notifikasi Sosmed
*Last updated: 2026-02-18*

Dokumen ini adalah referensi utama untuk jadwal cron dan alur notifikasi pada modul fetch sosmed.
Jika ada perbedaan dengan dokumen lain, **ikuti dokumen ini + implementasi di `src/cron/cronDirRequestFetchSosmed.js`**.

## 1) Jadwal Eksekusi (Asia/Jakarta)

Sumber implementasi:
- `UNIFIED_FETCH_SCHEDULES = ["0,30 6-21 * * *", "58 20-21 * * *"]`

### A. Unified Fetch + Engagement Refresh
- Cron gabungan: `0,30 6-21 * * *` + final `58 20-21 * * *`
- Jam jalan: **06:00, 06:30, ... , 20:00, 20:30, 20:58, 21:00, 21:30, 21:58**
- Aksi tiap run:
  - Refresh likes Instagram
  - Refresh komentar TikTok
  - Fetch post Instagram/TikTok hanya bila lolos gating slot per segmen client

### B. Segment Runtime Gating untuk Fetch Post
- **Segmen A** (`org` atau `ditbinmas`): fetch post hanya pada `06:00-20:30` + final `20:58`.
- **Segmen B** (`direktorat` selain `ditbinmas`): fetch post hanya pada `06:00-21:30` + final `21:58`.
- Di luar slot valid segmen: `skipPostFetch=true` (engagement refresh tetap dieksekusi).

## 2) Flow Notifikasi WA

### Trigger notifikasi
Notifikasi tugas dikirim jika salah satu kondisi benar:
1. Ada perubahan signifikan (`hasNotableChanges(changes)`), atau
2. Slot hourly aktif berdasarkan state (`shouldSendHourlyNotification`) selama window notifikasi hourly (06:00–22:59 WIB).

### Behavior stateful
- Hourly slot: berbasis **slot global Jakarta** dengan key format `YYYY-MM-DD-HH@05`.
- Slot dihitung dari waktu run Jakarta (`currentSlotKey`) dan dikirim jika berbeda dari state `lastNotifiedSlot` per client.
- Untuk run sebelum menit 05, slot dibulatkan ke jam sebelumnya agar tetap konsisten dengan anchor schedule.
- State per client disimpan di tabel state reminder:
  - `lastIgCount`
  - `lastTiktokCount`
  - `lastNotifiedAt`
  - `lastNotifiedSlot`
- `lastNotifiedSlot` hanya diupdate saat enqueue WA sukses supaya kegagalan kirim tidak mengunci slot hourly berikutnya.
- Jika storage state gagal, sistem masuk mode konservatif: notifikasi hanya dikirim saat ada perubahan.

### Bentuk pesan
- `forceScheduled=true`: kirim ringkasan tugas terjadwal (tetap kirim walau tidak ada perubahan) saat slot hourly baru belum pernah dinotifikasi di hari/jam tersebut.
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
