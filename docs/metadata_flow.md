# Cicero Flow Metadata
*Last updated: 2026-02-20*

This document outlines the flow of data and the main database tables used by the Cicero_V2 system. It provides an overview from the initial onboarding steps through to reporting and notifications.

## 1. Initial Flow

1. **Client and User Setup**
   - Administrators log in through the dashboard and register new clients using the `/clients` API.
   - Users for each client are created via the `/users` API, imported from Google Sheets, or self-service through the OTP claim flow (`/api/claim/*`).
2. **Authentication & Claim**
   - Users authenticate by calling `/api/auth/login`, `/api/auth/user-login`, or `/api/auth/dashboard-login` and receive a JWT token.
   - Operators without updated records request OTP codes through `/api/claim/request-otp`. OTPs are emailed instantly and must be verified before profile edits. Jika NRP tidak ditemukan tetapi email sudah dipakai akun lain, API mengembalikan konflik 409 dengan pesan yang menjelaskan agar user memakai email berbeda atau menghubungi admin.
   - The JWT token or HTTP-only cookie is included in subsequent API calls to authorize access.

## 2. Database Overview

Key tables defined in [`sql/schema.sql`](../sql/schema.sql):

| Table              | Purpose                                   |
|--------------------|-------------------------------------------|
| `clients`          | Stores client information and social media identifiers. |
| `user`             | Holds user profiles linked to a client.   |
| `dashboard_user` / `dashboard_user_clients` | Dashboard accounts and their permitted clients. |
| `insta_post` / `insta_post_khusus` | Instagram posts fetched via RapidAPI (regular & khusus). |
| `insta_like` / `insta_comment` | List of likes and comments for each Instagram post. |
| `insta_profile`             | Basic profile info for Instagram accounts. |
| `instagram_user`, `instagram_user_metrics`, `ig_ext_*` | Detailed Instagram profile, metrics, and extended RapidAPI data. |
| `tiktok_post` / `tiktok_post_roles` | TikTok posts associated with a client and role-based visibility. |
| `tiktok_comment`            | Comments for each TikTok post.            |
| `editorial_event`, `press_release_detail`, `approval_request`, `change_log` | Penmas editorial workflow entities. |
| `premium_request`           | Premium subscription applications.        |
| `link_report`, `link_report_khusus` | Amplification links from field agents. |
| `saved_contact`             | Google contact references used for WhatsApp messaging. |

These tables are updated regularly by scheduled jobs and form the basis for analytics and attendance calculations.

## 3. Process Flow

1. **Data Collection**
   - Cron jobs (`cronDirRequestFetchSosmed.js`, etc.) fetch posts, metrics, and rankings once the relevant WhatsApp client becomes ready. Results are saved to PostgreSQL and cached in Redis.
2. **Analytics & Attendance**
   - The backend matches likes or comments with registered users to compute attendance statistics and generates aggregator summaries for dashboards.
   - Editorial submissions persist to `editorial_event` and related tables, awaiting approvals captured through WhatsApp.
3. **Reporting & Messaging**
  - Cron tasks (`cronDirRequestFetchSosmed.js`, `cronRekapLink.js`, `cronAmplifyLinkMonthly.js`, etc.) send recaps to administrators through `waClient` or `waGatewayClient`.
   - OTP emails and complaint confirmations are sent immediately via SMTP to reduce follow-up latency.
4. **Queue Processing (Optional)**
   - Heavy operations can publish tasks to RabbitMQ with `rabbitMQService.js` and are processed asynchronously.

## 4. Final Output

Administrators receive automated WhatsApp reports summarizing daily engagement. The dashboard retrieves analytics via REST endpoints, giving a complete view of social media activity per client.


Refer to [docs/naming_conventions.md](naming_conventions.md) for code style guidelines.

## 5. TikTok Comment Username Mapping

Untuk menjaga konsistensi data absensi komentar TikTok, ekstraksi username komentar kini dipusatkan di `src/utils/tiktokCommentUsernameExtractor.js`. Util ini dipakai ulang oleh handler fetch, model upsert, dan service export ranking agar mapping field tidak tersebar di banyak tempat.

Urutan field yang didukung saat ekstraksi username komentar:

1. `comment.user.unique_id`
2. `comment.user.uniqueId`
3. `comment.user.username`
4. `comment.user.user_name` / `comment.user.userName`
5. `comment.username`
6. `comment.unique_id` / `comment.uniqueId`
7. Alias payload RapidAPI lain yang sering muncul: `author.*`, `owner.*`, `author_user_name`, `author_username`, `user_unique_id`, `userUniqueId`

Semua nilai username dinormalisasi ke format konsisten `@lowercase` menggunakan helper normalisasi handle yang sama seperti modul lain.

Selain komentar level utama, util juga menelusuri balasan bertingkat (`replies`, `reply_comments`, `children`, `sub_comments`, dll.) untuk mencegah kehilangan user yang hanya muncul di nested thread.


## 6. Source Type Precedence (Instagram & TikTok)

Untuk mencegah post manual tertimpa hasil cron fetch, aturan upsert pada `insta_post` dan `tiktok_post` menggunakan precedence berikut di `ON CONFLICT ... DO UPDATE`:

- Jika row existing sudah `source_type = 'manual_input'`, maka nilai `source_type` **tetap manual_input**.
- Jika row existing bukan manual input, maka `source_type` mengikuti nilai `EXCLUDED.source_type` (contoh: `cron_fetch`).

Implementasi SQL menggunakan pola `CASE WHEN <table>.source_type = 'manual_input' THEN <table>.source_type ELSE EXCLUDED.source_type END`.

Dampak ke safe delete filter:
- `filterOfficialInstagramShortcodes` hanya meloloskan kandidat hapus dengan `source_type = 'cron_fetch'`.
- `filterOfficialTiktokVideoIds` menolak kandidat hapus dengan `source_type = 'manual_input'`.

Dengan kombinasi ini, post yang diinput manual tetap terlindungi dari overwrite source type maupun dari kandidat auto-delete cron.

