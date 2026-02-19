# Scheduled WhatsApp Notifications
*Last updated: 2026-02-18*

Dokumen ini menyelaraskan behavior notifikasi dengan implementasi aktual di `src/cron/cronDirRequestFetchSosmed.js`.

## Ringkasan Implementasi Aktual

- Notifikasi tugas berjalan stateful per slot jam berbasis slot global Jakarta (anchor `@05`).
- Implementasi memakai kombinasi:
  1. **Change-based trigger** (`hasNotableChanges`) dan
  2. **Hourly trigger berbasis state** (`shouldSendHourlyNotification`) selama window notifikasi aktif.
- Hourly trigger kini berbasis **slot global Jakarta** (`currentSlotKey`, anchor menit `05`) yang dibandingkan dengan `lastNotifiedSlot` per client.
- Slot disimpan hanya setelah enqueue sukses agar slot tidak terkunci saat pengiriman gagal.

## Jadwal Cron Aktual

### 1) Post Fetch + Engagement Refresh
- Cron global: `0,30 6-21 * * *` + slot final `58 20-21 * * *`
- Jam jalan: 06:00, 06:30, 07:00, 07:30, ... , 20:00, 20:30, 20:58, 21:00, 21:30, 21:58 WIB
- Menjalankan (bergantung status akun client):
  - fetch post Instagram (hanya jika `client_insta_status !== false`)
  - fetch post TikTok (hanya jika `client_tiktok_status !== false`)
  - refresh likes Instagram (hanya jika `client_insta_status !== false`)
  - refresh komentar TikTok (hanya jika `client_tiktok_status !== false`)

### 2) Gating Fetch Post per Segmen Client
- **Segmen A**: `client_type === "org"` atau `client_id === "ditbinmas"`
  - Slot fetch post valid: `06:00-20:30` + final `20:58` WIB
- **Segmen B**: `client_type === "direktorat"` dan `client_id !== "ditbinmas"`
  - Slot fetch post valid: `06:00-21:30` + final `21:58` WIB
- Di luar slot segmen, cron tetap menjalankan refresh engagement, tetapi post fetch diskip (`skipPostFetch=true`).

## Logika Pengiriman Notifikasi

Notifikasi dikirim jika:
- ada perubahan signifikan, **atau**
- `lastNotifiedSlot` berbeda dengan slot run saat ini (`currentSlotKey`) dan masih di window notifikasi hourly (06:00-22:59 WIB) sesuai evaluasi slot global Jakarta.

Jika state storage gagal (load/upsert state), sistem masuk mode konservatif: notifikasi hanya dikirim saat ada perubahan.


## Format Pesan Scheduled Notification

Untuk `forceScheduled=true` (slot hourly baru), payload pesan tetap mengikuti kontrak berikut:
- Header: `📋 *Daftar Tugas - {nama client}*`
- Timestamp pengambilan data: `🕒 Pengambilan data: {hari}, {tanggal} {bulan} {tahun} {jam}.{menit} WIB`
- Timestamp dihasilkan helper `formatJakartaHumanTimestamp(value = new Date())` yang memformat waktu dengan `jakartaHumanDateTimeFormatter` dan menambahkan suffix `WIB`.
- Jika nilai tanggal tidak valid, helper mengembalikan `-` agar pembentukan payload tidak melempar runtime error.

## Catatan Backward Compatibility

`telegramService` digunakan sebagai wrapper untuk kanal WA logging/error demi menjaga kompatibilitas modul lama. Nama service dipertahankan agar referensi lama tidak rusak.

## Checklist Wajib Saat Ubah Fungsi/Modul

Setiap perubahan fungsi/module yang berdampak ke notifikasi harus:
- memperbarui dokumen ini,
- memperbarui `docs/notification_schedule_source_of_truth.md`, dan
- memperbarui dokumen terkait lain (`README.md`, `docs/business_process.md`, `docs/wa_*.md` yang terdampak).


## Timeline Harian (Outbox: Enqueue vs Send)

1. Cron `runCron` dieksekusi sesuai jadwal global (`0,30 6-21` + final `58 20-21`).
2. Per client, sistem mengevaluasi perubahan (`hasNotableChanges`) dan slot hourly (`buildJakartaHourlySlotKey`).
3. Jika lolos syarat, sistem memanggil `enqueueTugasNotification` (enqueue saja, belum kirim WA).
4. Event masuk `wa_notification_outbox` status `pending` dengan `idempotency_key`.
5. `cronWaOutboxWorker` claim event `pending/retrying`, mengirim WA, lalu update status `sent/retrying/dead_letter`.

Dengan pola ini, fetch cron tetap cepat karena delivery WA dipindah ke worker terpisah.
