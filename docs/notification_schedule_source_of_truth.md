# Source of Truth: Jadwal Cron & Flow Notifikasi Sosmed
*Last updated: 2026-02-19*

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
Notifikasi tugas hanya dikirim jika ada perubahan signifikan (`hasNotableChanges(changes)`).

### Behavior stateful
- State scheduler tetap menyimpan baseline count per client:
  - `lastIgCount`
  - `lastTiktokCount`
- State `lastNotifiedAt` dan `lastNotifiedSlot` tidak lagi dipakai untuk keputusan notifikasi hourly.
- Trigger notifikasi murni berbasis objek perubahan aktual hasil `detectChanges`.

### Bentuk pesan
- Tidak ada lagi mode `forceScheduled`.
- Pesan dibangun hanya dari perubahan aktual: `igAdded`, `tiktokAdded`, `igDeleted`, `tiktokDeleted`, dan `linkChanges`.

## 3) Catatan Penting Kompatibilitas

- **Migration ops (penghapusan blast per jam):** monitoring yang sebelumnya mengandalkan ritme pesan hourly harus dialihkan ke indikator perubahan data (`hasNotableChanges`) dan metrik outbox (`pending/sent/dead_letter`). Ketiadaan pesan pada slot tertentu kini normal bila tidak ada perubahan post/link.
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
