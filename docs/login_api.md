# Login API Guide

*Last updated: 2025-02-18*

This document explains how clients, regular users and dashboard operators authenticate with the backend. Available endpoints:
- `/api/auth/login` for client operators,
- `/api/auth/user-login` and `/api/auth/user-register` for regular users,
- `/api/auth/dashboard-register` and `/api/auth/dashboard-login` for the web dashboard,
- `/api/auth/dashboard-password-reset/request` and `/api/auth/dashboard-password-reset/confirm` for dashboard password recovery (aliases available at `/api/auth/password-reset/request`, `/api/auth/password-reset/confirm`, and the unauthenticated `/api/password-reset/request` plus `/api/password-reset/confirm`).

All return a JSON Web Token (JWT) that must be included in subsequent requests unless noted otherwise.

## 1. Payload Format

### Client Login
`POST /api/auth/login`
```json
{
  "client_id": "demo_client",
  "client_operator": "628123456789"
}
```

### User Login
`POST /api/auth/user-login`
```json
{
  "nrp": "123456",
  "whatsapp": "628123456789"
}
```

> **Note:** For legacy Android clients, the `password` field may be used instead of `whatsapp`. Both are treated equivalently.
> The backend normalizes WhatsApp input to digits only with the `62` prefix (minimum 8 digits) and never stores the `@c.us` suffix.

### User Registration
`POST /api/auth/user-register`
```json
{
  "nrp": "123456",
  "nama": "Budi",
  "client_id": "demo_client",
  "whatsapp": "628123456789"
}
```

The `whatsapp` value is normalized and stored as digits only with the `62` prefix (minimum 8 digits, e.g. `628123456789`) and never stores the `@c.us` suffix.

### Dashboard Registration
`POST /api/auth/dashboard-register`
```json
{
  "username": "admin",
  "password": "secret",
  "whatsapp": "628123456789",
  "client_id": "demo_client",
  "role": "operator"
}
```

The `whatsapp` field should contain digits only; any non-numeric characters will be removed before storage and the number is normalized to a `62` prefix (minimum 8 digits). The `@c.us` suffix is not stored.

### Dashboard Login
`POST /api/auth/dashboard-login`
```json
{
  "username": "admin",
  "password": "secret"
}
```

Every new dashboard account is created with `status` set to `false` and an approval request containing the username, ID, role, WhatsApp number, and client ID is sent to the WhatsApp administrators. They can approve using `approvedash#<username>` or reject with `denydash#<username>`.

Successful dashboard login responses now include premium metadata when available:

```json
{
  "success": true,
  "token": "<JWT>",
  "user": {
    "dashboard_user_id": "du-123",
    "role": "operator",
    "client_ids": ["CLIENT_A"],
    "premium_status": true,
    "premium_tier": "gold",
    "premium_expires_at": "2025-01-01T00:00:00.000Z"
  }
}
```

The same `client_ids` and `role` from the dashboard token gate both the User Directory and the Anev/Polres dashboards. Operators who manage multiple clients must pass an explicit `client_id` when hitting `/api/dashboard/anev`; the backend will then pull active users via the shared User Directory helper, applying the same `scope` (`org`/`direktorat`) logic and optional `regional_id` filter so every dashboard view reads from a single source of truth.

When operator hanya memiliki satu `client_id` bertipe direktorat, JWT `role` dan field `user.role` akan dinormalisasi ke `client_id` tersebut dalam lowercase (mis. `DITSAMAPTA` → `ditsamapta`) agar downstream handler menggunakan konteks direktorat yang tepat.

### Dashboard Password Reset Request
`POST /api/auth/dashboard-password-reset/request`
*(aliases: `/api/auth/password-reset/request`, `/api/password-reset/request` — the last one requires no token)*
```json
{
  "username": "admin",
  "contact": "08123456789"
}
```

The backend normalises the contact number to start with `62` and validates that it matches the stored WhatsApp number for the specified username. When valid, a reset token that expires after 15 minutes is created and the operator receives a WhatsApp message containing the reset instructions.

Successful response:
```json
{
  "success": true,
  "message": "Instruksi reset password telah dikirim melalui WhatsApp."
}
```

If WhatsApp delivery fails, administrators are alerted and the API responds with a message instructing the operator to contact the admin for manual assistance.

### Dashboard Password Reset Confirmation
`POST /api/auth/dashboard-password-reset/confirm`
*(aliases: `/api/auth/password-reset/confirm`, `/api/password-reset/confirm` — the last one requires no token)*
```json
{
  "token": "63e80f9a-3e63-4ad4-8a69-7c7f4d92721e",
  "password": "Newpass123",
  "confirmPassword": "Newpass123"
}
```

The backend checks that the token exists, has not expired, and has not been used. On success the dashboard password hash is replaced, the token is marked as used, and all existing dashboard login sessions in Redis are cleared so the operator must log in again.

Successful response:
```json
{
  "success": true,
  "message": "Password berhasil diperbarui. Silakan login kembali."
}
```

Example error (expired token or mismatched confirmation):
```json
{
  "success": false,
  "message": "token reset tidak valid atau sudah kedaluwarsa"
}
```

### Password Reset Aliasing via `/api/password-reset/*`
`POST /api/password-reset/request`

`POST /api/password-reset/confirm`

These endpoints forward to the same dashboard password reset handlers described above but live under a dedicated `/api/password-reset/*` path for routing aliases. The payloads and success responses are identical to the dashboard flows:

**Request payload**
```json
{
  "username": "admin",
  "contact": "08123456789"
}
```

**Request success response**
```json
{
  "success": true,
  "message": "Instruksi reset password telah dikirim melalui WhatsApp."
}
```

**Confirm payload**
```json
{
  "token": "63e80f9a-3e63-4ad4-8a69-7c7f4d92721e",
  "password": "Newpass123",
  "confirmPassword": "Newpass123"
}
```

**Confirm success response**
```json
{
  "success": true,
  "message": "Password berhasil diperbarui. Silakan login kembali."
}
```

## 2. Example `curl`

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"client_id":"demo_client","client_operator":"628123456789"}'
```

A successful response looks like:
```json
{
  "success": true,
  "token": "<JWT>",
  "client": { "client_id": "demo_client", "nama": "Demo", "role": "client" }
}
```
The token is also delivered as an HTTP-only cookie named `token`.

## 3. Token Flow

1. The client or user submits credentials to the appropriate endpoint.
2. The backend verifies the data and generates a JWT valid for two hours.
3. The token is stored in Redis and returned in the response as well as the cookie.
4. For later API calls, include the token in the `Authorization: Bearer` header or let the cookie be sent automatically.
5. Every successful login event is reported to the WhatsApp administrators.
6. When the token expires or is removed from Redis, a new login is required.
7. Dashboard password resets invalidate existing dashboard login sessions before returning a success response.
8. Each authenticated dashboard request reloads the dashboard user profile from the database to refresh `client_ids` (and derive `client_id` when only one is available). Requests are rejected when the dashboard user is missing, inactive, or no longer mapped to any clients so the scope always mirrors `dashboard_user_clients`.

### Dashboard session refresh

The `verifyDashboardToken` middleware revalidates dashboard JWTs against Redis and the `dashboard_user` table on every request. It rebuilds `req.dashboardUser`/`req.user` from the latest row, ensuring:
- Deactivated or deleted dashboard accounts cannot reuse old tokens.
- `client_ids` always match the current `dashboard_user_clients` mapping.
- When exactly one client is allowed, `client_id` is derived from the refreshed list; otherwise the field is omitted to prevent stale single-client scopes.

Jika dashboard login atau request mengembalikan `403` dengan pesan **Operator belum memiliki klien yang diizinkan**, pastikan relasi `dashboard_user_clients` sudah terisi. Gunakan script berikut untuk memeriksa dan menambahkan `client_ids` yang sesuai (mis. `JOMBANG`) ke akun dashboard yang sedang login:

```bash
node scripts/updateDashboardUserClients.js --username <username> --client-ids JOMBANG
```

Script ini akan:
- Memuat data dashboard user berdasarkan `--dashboard-user-id`, `--username`, atau `--whatsapp`.
- Memverifikasi `client_id` di tabel `clients`.
- Menambahkan relasi baru ke `dashboard_user_clients` dan menampilkan daftar terbaru `client_ids`.

## 4. Operator Access Allowlist

Role `operator` hanya diperbolehkan mengakses endpoint tertentu di bawah `/api`. Permintaan ke endpoint lain akan tetap diblokir dengan status `403` untuk menjaga keamanan.

Allowlist saat ini:
- `/api/clients/profile`
- `/api/aggregator` (termasuk sub-path seperti `/api/aggregator/refresh`)
- `/api/amplify/rekap`
- `/api/dashboard/stats`
- `/api/dashboard/login-web/recap`
- `/api/dashboard/social-media/instagram/analysis`

Jika operator membutuhkan endpoint lain, pastikan endpoint tersebut ditambahkan ke allowlist agar tidak terblokir.

Untuk endpoint yang menerima parameter `client_id` (terutama `/api/clients/profile` dan `/api/aggregator`), role **operator** hanya boleh menggunakan `client_id` yang ada di daftar `client_ids` pada token (pemeriksaan case-insensitive). Permintaan di luar daftar akan ditolak dengan status `403`.

`/api/clients/profile` sekarang menerima parameter `role`, `scope`, dan `regional_id` untuk memastikan profil yang diambil sesuai dengan konteks akses. Jika salah satu parameter tersebut dikirim, backend akan:
- Mewajibkan `role` dan memvalidasi `scope` (`org` atau `direktorat`).
- Menolak role direktorat yang tidak dikenal untuk `scope=direktorat`.
- Memastikan `regional_id` (dari query atau token) cocok dengan `regional_id` client yang dikembalikan.

Respons profil menyertakan alias tier untuk kebutuhan AuthContext front-end:
- `level` – alias dari `client_level` untuk menjaga kompatibilitas.
- `tier` – label tier yang dinormalisasi lowercase dari `client_level` atau snapshot premium.
- `premium_tier` – sinonim `tier` agar downstream yang memakai kolom premium tetap berjalan.

Contoh ringkas:
```json
{
  "success": true,
  "client": {
    "client_id": "LEVEL1",
    "client_level": "Premium_1",
    "level": "Premium_1",
    "tier": "premium_1",
    "premium_tier": "premium_1"
  }
}
```

Dokumentasi lengkap untuk `/api/amplify/rekap` (termasuk parameter `client_id`, `periode`, `tanggal`, `start_date`/`end_date`, `role`, `scope`, dan `regional_id`) tersedia di `docs/amplifyRekapApi.md`.

## 5. Dashboard Stats (`/api/dashboard/stats`)

Endpoint ini sekarang mengikuti aturan `role`/`scope`/`regional_id` yang sama dengan endpoint rekap Instagram/TikTok, sehingga jumlah post menyesuaikan konteks akses pengguna. **Hitungan TikTok memakai filter `scope`/`role`/`regional_id` yang sama dengan recap komentar TikTok**, sehingga dashboard tidak menampilkan jumlah yang lebih luas dibandingkan narasi recap. Jumlah `users` mengikuti filter yang sama; khusus `scope=org` dengan `role=operator`, backend hanya menghitung user ber-role operator pada `client_id` efektif. Parameter query yang tersedia:
- `client_id` (wajib jika token tidak berisi `client_id`; diabaikan ketika scope/role memaksa konteks tertentu)
- `periode` (`harian` default)
- `tanggal`
- `start_date`/`tanggal_mulai`
- `end_date`/`tanggal_selesai`
- `role` (opsional; default dari token, **wajib** jika `scope` dikirim)
- `scope` (`org` atau `direktorat`—default `org` bila dikirim tanpa nilai)
- `regional_id` (opsional; default dari token, disamakan ke huruf besar)

Resolusi konteks:
- Jika `scope`/`role` dikirim, backend akan mewajibkan `role` dan memvalidasi `scope` (`org`/`direktorat`).
- `scope=org` dengan `role=operator` selalu memakai `client_id` dari token (bukan dari query/header). Untuk `igPosts`, penghitungan **selalu** dikunci ke `client_id` token tersebut meski ada penyesuaian konteks direktorat lainnya.
- `scope=org` dengan role direktorat (`ditbinmas`, `ditlantas`, `bidhumas`, `ditsamapta`) menghitung post berdasarkan role tersebut sebagai `client_id` efektif.
- `scope=direktorat` memakai `role` dan `regional_id` sebagai filter tambahan pada data post.
- Jika `role`/`scope` tidak dikirim, perilaku lama dipertahankan (mis. fallback `client_id=ditbinmas` bila token ber-role `ditbinmas`), tetapi perhitungan post tetap membawa `regional_id` dari token jika ada.
- Untuk hitungan Instagram, `scope=direktorat` akan memakai `role` sebagai filter `insta_post_roles` terlebih dahulu. Jika hasilnya kosong dan `client_id` yang diminta adalah client bertipe direktorat, backend otomatis fallback ke filter `client_id` langsung (mirroring TikTok). Parameter `regional_id` membatasi hitungan hanya pada klien dengan `regional_id` yang cocok sehingga dashboard bisa meminta agregasi per-wilayah tanpa mencampur regional lain.
- Cache post count memakai Redis dengan TTL default 60 detik. Jika payload memuat `tanggal`, TTL cache dipersingkat (10 detik) untuk menjaga data lebih segar; khusus endpoint dashboard stats, permintaan dengan `tanggal` menonaktifkan cache agar konsisten dengan rekap likes real-time.

Contoh response:
```json
{
  "success": true,
  "data": {
    "client_id": "DITBINMAS",
    "role": "ditbinmas",
    "scope": "org",
    "regional_id": "JATIM",
    "clients": 12,
    "users": 150,
    "igPosts": 5,
    "ttPosts": 7
  }
}
```

## 6. Dashboard Anev (`/api/dashboard/anev`)

Endpoint ini berada di belakang middleware `verifyDashboardToken`, sehingga wajib mengirim bearer token dashboard (`Authorization: Bearer <token>`). Middleware `dashboardPremiumGuard` mengecek snapshot premium dan:
- Mengembalikan **403** jika langganan premium tidak aktif atau sudah kedaluwarsa (ikut menyertakan `premium_tier` dan `premium_expires_at` bila ada).
- Mengembalikan **403** jika tier tidak ada di daftar diizinkan. Daftar ini dibaca dari `DASHBOARD_PREMIUM_ALLOWED_TIERS` (default: `tier1,tier2,premium_1`).
- Meneruskan permintaan hanya ketika token valid, premium aktif, dan tier sesuai.

Parameter query:
- `client_id` (wajib jika token tidak membawa `client_id`; harus termasuk dalam `dashboard_user.client_ids`). Dapat dikirim sebagai query atau header `X-Client-Id`.
- `role` dan `scope` (default dari token; `scope` hanya menerima `org` atau `direktorat`; `role` **wajib** dan ditolak 400 bila kosong)
- `regional_id` (opsional; di-normalisasi ke huruf besar)
- `time_range` (`today`, `7d` *(default)*, `30d`, `90d`, `custom`, `all`)
- `start_date` dan `end_date` (wajib bila `time_range=custom`; format tanggal mengikuti zona waktu Asia/Jakarta)

Validasi penting:
- `client_id` harus cocok dengan daftar izin user dashboard; jika dikirim tetapi tidak cocok, backend membalas **403** `client_id tidak diizinkan`.
- `scope` selain `org`/`direktorat` dibalas **400** `scope tidak valid`.
- `role` kosong dibalas **400** `role wajib diisi`.

Respons merangkum metadata filter dan agregat engagement:
- `user_directory` menyalin daftar user aktif dari helper User Directory agar frontend tidak perlu menggabungkan data lain.
- `instagram_engagement` dan `tiktok_engagement` masing-masing memuat total post, total likes/komentar, serta `per_user` yang sudah memetakan username ke `user_id` (username tak terpetakan tetap muncul dengan `unmapped=true`).
- `filters.permitted_time_ranges` menegaskan daftar rentang waktu yang diterima.
- `filters.start_date`/`end_date` sudah dihitung ke batas awal/akhir hari Asia/Jakarta.
- `aggregates.total_users` menghitung user aktif (`status=true`) pada client/regional yang sesuai.
- `aggregates.total_likes` dan `aggregates.total_comments` dijumlahkan dari tabel likes/komentar dengan filter `client_id`, `role`/`scope`, dan `regional_id`.
- `aggregates.instagram_posts` dan `aggregates.tiktok_posts` ikut memakai filter `role` (bila dikirim) serta `scope`/`regional_id` yang sama sehingga seluruh agregat berada pada ruang filter identik.
- `aggregates.compliance_per_pelaksana` menampilkan likes, komentar, total aksi, serta `completion_rate` per pelaksana terhadap total konten dalam rentang yang sama.

Contoh request:
```bash
curl -X GET "https://api.example.com/api/dashboard/anev?time_range=90d&role=ditbinmas&scope=org" \
  -H "Authorization: Bearer <dashboard-jwt>" \
  -H "X-Client-Id: DITBINMAS"
```

Contoh response ringkas:
```json
{
  "success": true,
  "data": {
    "user_directory": [
      {
        "user_id": "u-1",
        "nama": "USER SATKER",
        "divisi": "SUBBID PENMAS",
        "client_id": "DITBINMAS",
        "kontak_sosial": {
          "instagram": "user_ig",
          "tiktok": "user_tt"
        }
      }
    ],
    "instagram_engagement": {
      "total_posts": 12,
      "total_likes": 320,
      "per_user": [
        {
          "user_id": "u-1",
          "nama": "USER SATKER",
          "divisi": "SUBBID PENMAS",
          "client_id": "DITBINMAS",
          "username": "user_ig",
          "kontak_sosial": {
            "instagram": "user_ig",
            "tiktok": "user_tt"
          },
          "likes": 10
        }
      ]
    },
    "tiktok_engagement": {
      "total_posts": 8,
      "total_comments": 110,
      "per_user": [
        {
          "user_id": "u-1",
          "nama": "USER SATKER",
          "divisi": "SUBBID PENMAS",
          "client_id": "DITBINMAS",
          "username": "user_tt",
          "kontak_sosial": {
            "instagram": "user_ig",
            "tiktok": "user_tt"
          },
          "comments": 4
        }
      ]
    },
    "filters": {
      "client_id": "DITBINMAS",
      "role": "ditbinmas",
      "scope": "org",
      "regional_id": "JATIM",
      "time_range": "7d",
      "start_date": "2025-02-01T00:00:00+07:00",
      "end_date": "2025-02-07T23:59:59.999+07:00",
      "permitted_time_ranges": ["today", "7d", "30d", "90d", "custom", "all"]
    },
    "aggregates": {
      "total_users": 45,
      "instagram_posts": 12,
      "tiktok_posts": 8,
      "total_likes": 320,
      "total_comments": 110,
      "expected_actions": 20,
      "compliance_per_pelaksana": [
        {
          "user_id": "u-1",
          "nama": "USER SATKER",
          "likes": 10,
          "comments": 4,
          "total_actions": 14,
          "completion_rate": 0.7
        }
      ]
    }
  }
}
```
