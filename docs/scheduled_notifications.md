# Scheduled WhatsApp Notifications
*Last updated: 2026-02-14*

Dokumen ini menyelaraskan behavior notifikasi dengan implementasi aktual di `src/cron/cronDirRequestFetchSosmed.js`.

## Ringkasan Implementasi Aktual

- Notifikasi tugas berjalan stateful per slot jam, dengan slot wajib fetch+scheduled notification pada 17:05 WIB.
- Implementasi memakai kombinasi:
  1. **Change-based trigger** (`hasNotableChanges`) dan
  2. **Hourly trigger berbasis state** (`shouldSendHourlyNotification`) selama periode post-fetch.
- Hourly trigger kini berbasis **slot global Jakarta** (`currentSlotKey`, anchor menit `05`) yang dibandingkan dengan `lastNotifiedSlot` per client.
- Slot disimpan hanya setelah enqueue sukses agar slot tidak terkunci saat pengiriman gagal.

## Jadwal Cron Aktual

### 1) Post Fetch + Engagement Refresh
- Cron gabungan: `5,30 6-16 * * *` + `5 17 * * *`
- Jam jalan: 06:05, 06:30, 07:05, 07:30, ... , 16:05, 16:30, 17:05 WIB
- Menjalankan:
  - fetch post Instagram
  - fetch post TikTok
  - refresh likes Instagram
  - refresh komentar TikTok

### 2) Engagement-Only
- Cron: `30 17-21 * * *` dan `0 18-22 * * *`
- Jam jalan: 17:30, 18:00, 18:30, ... , 21:30, 22:00 WIB
- Menjalankan:
  - refresh likes Instagram
  - refresh komentar TikTok
- Tidak ada fetch post baru.

## Logika Pengiriman Notifikasi

Notifikasi dikirim jika:
- ada perubahan signifikan, **atau**
- `lastNotifiedSlot` berbeda dengan slot run saat ini (`currentSlotKey`) dan masih di window post-fetch (06:00-17:59 WIB, termasuk run wajib 17:05).

Pada slot wajib 17:05, enqueue dijalankan dengan `forceScheduled=true` saat slot tersebut belum pernah dinotifikasi untuk client terkait, sehingga tiap client aktif tetap menerima maksimal 1 notifikasi scheduled pada slot jam yang sama.

Jika state storage gagal (load/upsert state), sistem masuk mode konservatif: notifikasi hanya dikirim saat ada perubahan.

## Catatan Backward Compatibility

`telegramService` digunakan sebagai wrapper untuk kanal WA logging/error demi menjaga kompatibilitas modul lama. Nama service dipertahankan agar referensi lama tidak rusak.

## Checklist Wajib Saat Ubah Fungsi/Modul

Setiap perubahan fungsi/module yang berdampak ke notifikasi harus:
- memperbarui dokumen ini,
- memperbarui `docs/notification_schedule_source_of_truth.md`, dan
- memperbarui dokumen terkait lain (`README.md`, `docs/business_process.md`, `docs/wa_*.md` yang terdampak).


## Timeline Harian (Outbox: Enqueue vs Send)

1. Cron `runCron` dieksekusi sesuai jadwal (`5,30 6-16`, `0 17`, dan engagement-only schedules).
2. Per client, sistem mengevaluasi perubahan (`hasNotableChanges`) dan slot hourly (`buildJakartaHourlySlotKey`).
3. Jika lolos syarat, sistem memanggil `enqueueTugasNotification` (enqueue saja, belum kirim WA).
4. Event masuk `wa_notification_outbox` status `pending` dengan `idempotency_key`.
5. `cronWaOutboxWorker` claim event `pending/retrying`, mengirim WA, lalu update status `sent/retrying/dead_letter`.

Dengan pola ini, fetch cron tetap cepat karena delivery WA dipindah ke worker terpisah.
