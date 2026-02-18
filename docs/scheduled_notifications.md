# Scheduled WhatsApp Notifications
*Last updated: 2026-02-19*

Dokumen ini menyelaraskan behavior notifikasi dengan implementasi aktual di `src/cron/cronDirRequestFetchSosmed.js`.

## Ringkasan Implementasi Aktual

- Notifikasi tugas **hanya** dipicu oleh perubahan signifikan (`hasNotableChanges`).
- Tidak ada lagi trigger hourly berbasis slot Jakarta (`currentSlotKey`) dan tidak ada mode `forceScheduled`.
- State scheduler dipertahankan untuk baseline count (`lastIgCount`, `lastTiktokCount`) agar deteksi perubahan tetap akurat antar run.

## Jadwal Cron Aktual

### 1) Post Fetch + Engagement Refresh
- Cron global: `0,30 6-21 * * *` + slot final `58 20-21 * * *`.
- Jam jalan: 06:00, 06:30, 07:00, ... , 20:30, 20:58, 21:00, 21:30, 21:58 WIB.

### 2) Gating Fetch Post per Segmen Client
- **Segmen A**: `client_type === "org"` atau `client_id === "ditbinmas"` → valid sampai `20:58`.
- **Segmen B**: `client_type === "direktorat"` selain ditbinmas → valid sampai `21:58`.
- Di luar slot valid, cron tetap refresh engagement, post fetch diskip.

## Logika Pengiriman Notifikasi

Notifikasi WA dikirim saat terdapat perubahan aktual pada salah satu komponen berikut:
- `igAdded`
- `tiktokAdded`
- `igDeleted`
- `tiktokDeleted`
- `linkChanges`

Jika perubahan kosong, outbox tidak di-enqueue.

## Timeline Outbox

1. Cron `runCron` menghitung perubahan per client.
2. Bila ada perubahan, sistem memanggil `enqueueTugasNotification`.
3. Event masuk `wa_notification_outbox` status `pending` dengan `idempotency_key` dedup mode `change`.
4. `cronWaOutboxWorker` memproses queue dan mengirim WA.
