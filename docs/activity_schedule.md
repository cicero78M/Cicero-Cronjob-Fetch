# System Activity Schedule
*Last updated: 2026-02-13*

This document summarizes the automated jobs ("activity") that run inside Cicero_V2. All jobs use `node-cron`, are registered from `src/cron/*.js` during `app.js` boot, and execute in the **Asia/Jakarta** timezone unless stated otherwise. Untuk service `Cicero-Cronjob-Fetch`, entrypoint `app.js` wajib mengimpor `src/cron/cronDirRequestFetchSosmed.js` **dan** `src/cron/cronWaOutboxWorker.js` agar worker pengiriman WhatsApp ikut terdaftar saat boot. Base jobs still come from the manifest in `src/cron/cronManifest.js`, while Ditbinmas (dirRequest) jobs are grouped in `src/cron/dirRequest/index.js` so they can be toggled together when needed.【F:src/cron/dirRequest/index.js†L1-L108】

## Runtime safeguards & configuration sync

Every cron file calls `scheduleCronJob`, which delegates to `src/utils/cronScheduler.js`. Before executing a handler, the scheduler fetches the matching record in `cron_job_config`; the job runs only when `is_active=true` so operations can toggle tasks safely without redeploying. The scheduler retries the lookup once, then follows `CRON_STATUS_LOOKUP_STRATEGY` (default `fail_open`) when status checks still fail: `fail_open` keeps running the handler, while `fail_closed` skips execution and emits an alert log. This lets operations choose availability-first behavior for development or strict safety for production. The dirRequest group adds a higher-level toggle through `ENABLE_DIRREQUEST_GROUP` to pause all Ditbinmas schedules at once.【F:src/utils/cronScheduler.js†L1-L104】【F:src/cron/dirRequest/index.js†L1-L92】

The configuration data lives in the migration `sql/migrations/20251022_create_cron_job_config.sql` and is surfaced in the cron configuration menu, keeping this schedule synchronized with the controls that ops staff use to enable or pause jobs.【F:sql/migrations/20251022_create_cron_job_config.sql†L1-L34】



### Cron status lookup strategy

Set `CRON_STATUS_LOOKUP_STRATEGY` to control behavior when `cron_job_config` cannot be read after retries:

- `fail_open` (default): run the handler anyway after lookup errors to preserve schedule continuity.
- `fail_closed`: skip handler execution and log `[CRON] ALERT: ...` so operators can investigate DB/config outages before jobs resume.

Use `fail_closed` in stricter production environments where accidental execution is riskier than missed runs.

dirRequest cron registration happens immediately at boot (subject to `ENABLE_DIRREQUEST_GROUP`). Every dirRequest job key is single-flight: if a previous run is still in-flight, the next scheduled run logs a skip message and exits early to prevent overlap.【F:src/cron/dirRequest/index.js†L1-L108】

## Cron Jobs

Use the helper script below to regenerate the manifest-driven table so that schedules stay aligned with the manifest and source files:

```bash
node docs/scripts/renderCronSchedule.js > /tmp/cron-jobs.md
```

Then paste the output into this section. The table is sourced from `src/cron/cronManifest.js` and each module's `scheduleCronJob` call.

### Core cron jobs (manifest-driven)

| File | Schedule (Asia/Jakarta) | Description |
|------|-------------------------|-------------|
| `cronDbBackup.js` | `0 4 * * *` | Backup database dump to Google Drive using service account credentials. |
| `cronRekapLink.js` | `5 15,18,21 * * *` | Distribute amplification link recaps to all active amplification clients. |
| `cronAmplifyLinkMonthly.js` | `0 23 28-31 * *` | Generate and deliver monthly amplification spreadsheets on the last day of the month. |
| `cronDirRequestRekapUpdate.js` | `0 8-18/4 * * *` | Send Ditbinmas executive summaries and rekap updates to admins and broadcast groups. |
| `cronDirRequestRekapBelumLengkapDitsamapta.js` | `15 7-21 * * *` | Send Ditsamapta incomplete Instagram/TikTok data recaps to admin recipients only. |
| `cronDirRequestFetchSosmed.js` | `5,30 6-16 * * *<br>0 17 * * *<br>30 17-21 * * *<br>0 18-22 * * *` | Menjalankan fetch Instagram/TikTok + refresh engagement pada periode post-fetch, lalu lanjut engagement-only sampai 22:00. Job ini menulis event notifikasi ke `wa_notification_outbox` (status `pending`) dengan deduplikasi `idempotency_key`; trigger hourly memakai slot global Jakarta (`buildJakartaHourlySlotKey` → `YYYY-MM-DD-HH@05`) dan state per client (`last_ig_count`, `last_tiktok_count`, `last_notified_at`, `last_notified_slot`) hanya diupdate saat enqueue sukses. |
| `cronOprRequestAbsensiUpdateDataUsername.js` | `45 8-15 * * *` | Send oprrequest absensi update data username recaps to active org clients with Instagram + TikTok enabled, delivered to each WhatsApp group. |
| `cronOprRequestAbsensiEngagement.js` | `5 15,18,20 * * *` | Send oprrequest engagement absensi Instagram (likes) and TikTok (comments) recaps with the "all" mode to each org WhatsApp group plus operator and super admin recipients. |
| `cronOprRequestAmplifyRoutineUpdate.js` | `0,30 8-21 * * *` | Refresh oprrequest tugas rutin amplification content for active org clients with amplification enabled. |
| `cronDashboardSubscriptionExpiry.js` | `*/30 * * * *` | Mark overdue dashboard subscriptions as expired and send WhatsApp reminders when a destination number is available. |
| `cronPremiumExpiry.js` | `0 0 * * *` | Expire mobile premium users when `premium_end_date` is in the past. |
| `cronDashboardPremiumRequestExpiry.js` | `0 * * * *` | Expire pending/confirmed dashboard premium requests after their `expired_at` deadline and send requester/admin WhatsApp notifications. |
| `cronWaOutboxWorker.js` | `*/1 * * * *` | Worker cepat untuk mengirim pesan WhatsApp dari `wa_notification_outbox` (`pending`/`retrying`) dengan retry exponential backoff, `attempt_count`, `sent_at`, `error_message`, dan status akhir `dead_letter` saat melewati `max_attempts`. |

### Ditbinmas dirRequest group (registered via `registerDirRequestCrons`)

The schedules below are bundled inside `src/cron/dirRequest/index.js` and register immediately during boot. Set `ENABLE_DIRREQUEST_GROUP=false` in the environment to pause all of them together without editing each job record. The table order mirrors the serialized registration chain, and the cron expressions are staggered to avoid overlapping WhatsApp sends in the Asia/Jakarta timezone.【F:src/cron/dirRequest/index.js†L1-L108】

| File | Schedule (Asia/Jakarta) | Description |
|------|-------------------------|-------------|
| `cronWaNotificationReminder.js` | `10 16 * * *<br>40 16 * * *<br>10 17 * * *<br>40 17 * * *` | Send WhatsApp task reminders to Ditbinmas and BIDHUMAS users who opted in, spacing each WhatsApp delivery by 3 seconds and persisting each recipient's last stage/completion in `wa_notification_reminder_state` so completed users are skipped on reruns while pending users continue their follow-up stage. |
| `cronDirRequestSatbinmasOfficialMedia.js` | `5 23 * * *` | Share Satbinmas official media updates with Ditbinmas recipients. |
| `cronDirRequestDitbinmasGroupRecap.js` | `10 15 * * *<br>14 18 * * *` | Send Ditbinmas group-only recap by running dirRequest menus 21 and 22 with the "hari ini" engagement period. |
| `cronDirRequestDitbinmasSuperAdminDaily.js` | `10 18 * * *` | Send Ditbinmas super admin-only recaps by running dirRequest menus 6, 9, 34, and 35 with the "hari ini" engagement period. |
| `cronDirRequestDitbinmasOperatorDaily.js` | `12 18 * * *` | Send Ditbinmas operator-only reports by running dirRequest menu 30 with the "hari ini" period. |
| `cronDirRequestBidhumasEvening.js` | `30 20 * * *<br>0 22 * * *` | Send dirRequest menus 6, 9, 28, and 29 exclusively to the BIDHUMAS group and its super admin recipients at exactly 22:00 WIB (no fetch post/engagement step). |

#### Ditbinmas WA reminder persistence

- `cronWaNotificationReminder` writes the per-date, per-`chat_id` + `client_id` reminder state into the `wa_notification_reminder_state` table (primary key: `date_key`, `chat_id`, `client_id`) only after a successful WhatsApp delivery, so the worker can recover after restarts without re-sending completed users while failed deliveries are retried on the next run. Columns include `last_stage` (`initial`, `followup1`, `followup2`, `completed`) and `is_complete` to gate follow-up sends per recipient.
- On each run the job reads the stored state to pick the correct stage, skips rows where `is_complete=true`, and only advances the stage for recipients whose previously stored stage is behind the current run. This keeps once-per-day delivery guarantees for completions while still pushing pending recipients forward to their next follow-up slot.

Each job collects data from the database, interacts with RapidAPI or WhatsApp services, and updates the system accordingly. Refer to [docs/naming_conventions.md](naming_conventions.md) for code style guidelines.
