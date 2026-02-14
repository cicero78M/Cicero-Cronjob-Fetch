# Ringkasan Implementasi: Scheduled WhatsApp Task Notifications

## Tujuan
Dokumen ini merangkum perilaku notifikasi tugas yang **sesuai kode aktual** di:
- `src/cron/cronDirRequestFetchSosmed.js`
- `src/service/tugasNotificationService.js`

Fokus implementasi saat ini adalah notifikasi berbasis:
1. perubahan data tugas (`hasNotableChanges`), dan
2. slot hourly Jakarta (`buildJakartaHourlySlotKey`) selama periode post-fetch.

---

## Jadwal Cron Aktual (Asia/Jakarta)

### 1) Post Fetch + Engagement Refresh
- `5,30 6-16 * * *`
- `0 17 * * *` (run wajib 17:00)

Eksekusi gabungan: `06:05, 06:30, 07:05, 07:30, ... , 16:05, 16:30, 17:00`.

Pada jadwal ini sistem menjalankan:
- fetch post Instagram,
- fetch post TikTok,
- refresh likes Instagram,
- refresh komentar TikTok.

### 2) Engagement-Only
- `30 17-21 * * *`
- `0 18-22 * * *`

Eksekusi gabungan: `17:30, 18:00, 18:30, 19:00, 19:30, 20:00, 20:30, 21:00, 21:30, 22:00`.

Pada mode ini sistem **tidak fetch post baru**; hanya refresh engagement.

---

## Aturan Slot Key (`buildJakartaHourlySlotKey`)

Slot hourly diturunkan dari waktu Jakarta dengan format:
- `YYYY-MM-DD-HH@05`

Aturan utama:
- Anchor menit ada di `05`.
- Bila cron berjalan pada menit `< 05`, slot dianggap jam sebelumnya.
- Semua run di jam yang sama setelah anchor (mis. `06:05` dan `06:30`) memakai slot key yang sama.

Contoh:
- `06:05` → `YYYY-MM-DD-06@05`
- `06:30` → `YYYY-MM-DD-06@05`
- `06:03` → `YYYY-MM-DD-05@05`

Notifikasi hourly hanya terkirim jika:
- masih dalam window notifikasi (06:00–17:59), dan
- `lastNotifiedSlot !== currentSlotKey`.

---

## Aturan `forceScheduled`

`forceScheduled` ditentukan dari evaluasi hourly slot pada proses client:
- `forceScheduled=true` saat run berada di slot hourly baru (`shouldSendHourly=true`), termasuk slot wajib 17:00.
- `forceScheduled=false` saat notifikasi dipicu murni karena perubahan.

Dampaknya di `tugasNotificationService`:
- `forceScheduled=true` → payload berisi **format daftar tugas terjadwal** (`formatScheduledTaskList`) dan idempotency berbasis jam (`...|scheduled|<hourKey>|...`).
- `forceScheduled=false` → payload berisi pesan perubahan (add/delete/link changes) dengan idempotency mode perubahan (`...|change|...`).

---

## Timeline Harian (Enqueue vs Send by Worker)

1. **Cron fetch berjalan** sesuai jadwal di atas.
2. Untuk tiap client, sistem menghitung perubahan + evaluasi slot hourly.
3. Jika memenuhi syarat, sistem memanggil `enqueueTugasNotification(...)`.
4. Event masuk ke `wa_notification_outbox` status `pending` (atau dianggap duplikat bila `idempotency_key` sudah ada).
5. **Worker outbox** (`cronWaOutboxWorker`) berjalan terpisah, claim batch `pending/retrying`, lalu kirim WA.
6. Setelah kirim, worker update status (`sent` / `retrying` / `dead_letter`).

Intinya: cron fetch bertugas **enqueue**, sedangkan pengiriman WA aktual dilakukan **asinkron oleh worker**.

---

## Catatan Konsistensi Dokumentasi

Jika ada perubahan pada fungsi/modul notifikasi, dokumen yang wajib ikut diperbarui:
- `docs/scheduled_notifications.md`
- `docs/notification_schedule_source_of_truth.md`
- dokumen WhatsApp notification terkait (`docs/whatsapp_task_notification.md`, dll.)
