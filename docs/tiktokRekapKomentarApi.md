# TikTok Rekap Komentar API

Endpoint `getTiktokRekapKomentar` mengembalikan rekap komentar TikTok untuk
client tertentu.

## Request

`GET /api/tiktok/rekap-komentar`

## Authentication

Endpoint ini menerima **dua** jenis token:

- **Dashboard token** (login dashboard): tersimpan di Redis dengan prefix `login_token:<token> = dashboard:<dashboard_user_id>`.
  - Token divalidasi lewat flow dashboard dan data user diambil dari tabel dashboard.
  - `req.user.role` mengikuti role dashboard yang sudah disesuaikan (jika hanya satu `client_id` dan client tersebut bertipe direktorat, role diset ke nama direktorat).
  - `req.user.client_id` diisi bila dashboard user hanya memiliki satu `client_id`; daftar lengkap ada di `req.user.client_ids`.
- **Operator/client token** dari `/login`: tersimpan di Redis sebagai `login_token:<token> = <client_id>` (tanpa prefix).
  - JWT diverifikasi dengan `JWT_SECRET`, lalu payload dipakai sebagai `req.user`.
  - `req.user.client_id` dan `req.user.role` mengikuti payload login (role biasanya `client` atau nama direktorat).

Perilaku `role`/`scope` tetap sama dengan logic di controller:
`role` default ke `req.user.role`, dan kombinasi `role=operator` + `scope=org` akan menggunakan `req.user.client_id` sebagai sumber `client_id`.

**Operator allowlist (authRequired):**
- Endpoint ini termasuk allowlist operator dengan path **exact** `/tiktok/rekap-komentar`.
- Pencocokan dilakukan secara exact terhadap `req.path`, sehingga subpath seperti `/tiktok/rekap-komentar/summary` **tidak** otomatis diizinkan.

### Query Parameters

- `client_id` (required)
- `periode` (optional, default: `harian`)
- `tanggal` (optional)
- `start_date` / `end_date` (optional, date range)
- `role` (recommended; dipakai untuk standardisasi scope)
- `scope` (recommended; value: `direktorat` atau `org`)
- `regional_id` (optional; filter hasil hanya untuk client dengan `regional_id` tertentu, mis. `JATIM`)
- `client_id` dibaca secara **case-insensitive** dan mengabaikan spasi di awal/akhir (mis. `JOMBANG ` tetap dianggap `JOMBANG`).

Example:

```
/api/tiktok/rekap-komentar?client_id=DITBINMAS&periode=harian&tanggal=2025-12-22&role=ditbinmas&scope=direktorat
```

## Response

```
{
  "success": true,
  "data": [
    {
      "user_id": "U-01",
      "nama": "Alice",
      "username": "@alice",
      "regional_id": "JATIM",
      "jumlah_komentar": 4,
      "ranking": 1,
      "completionRate": 1,
      "completionPercentage": 100,
      "missingComments": 0,
      "status": "sudah",
      "badges": ["✅ Semua konten pada periode ini sudah dikomentari."]
    },
    {
      "user_id": "U-02",
      "nama": "Bob",
      "username": "@bob",
      "regional_id": "JATIM",
      "jumlah_komentar": 1,
      "ranking": 2,
      "completionRate": 0.25,
      "completionPercentage": 25,
      "missingComments": 3,
      "status": "kurang",
      "badges": ["⚠️ Masih ada konten yang belum dikomentari."]
    }
  ],
  "chartHeight": 320,
  "totalPosts": 4,
  "sudahUsers": ["@alice"],
  "kurangUsers": ["@bob"],
  "belumUsers": ["@charlie"],
  "sudahUsersCount": 1,
  "kurangUsersCount": 1,
  "belumUsersCount": 2,
  "noUsernameUsersCount": 1,
  "usersCount": 4,
  "summary": {
    "totalPosts": 4,
    "totalUsers": 4,
    "totalComments": 5,
    "averageCompletionPercentage": 41.7,
    "participationRatePercentage": 66.7,
    "distribution": {
      "sudah": 1,
      "kurang": 1,
      "belum": 1,
      "noUsername": 1,
      "noPosts": 0
    }
  },
  "chartData": [
    { "label": "Alice", "comments": 4, "missingComments": 0, "completionPercentage": 100 },
    { "label": "Bob", "comments": 1, "missingComments": 3, "completionPercentage": 25 }
  ],
  "insights": [
    "✅ 1 akun sudah mengomentari semua konten yang tersedia.",
    "⚠️ 1 akun masih kekurangan komentar pada sebagian konten.",
    "⏳ 1 akun belum memberikan komentar sama sekali.",
    "❗ 1 akun belum memiliki username TikTok."
  ],
  "statusLegend": [
    { "status": "sudah", "label": "Sudah", "description": "Semua konten pada periode ini telah dikomentari." },
    { "status": "kurang", "label": "Kurang", "description": "Sudah memberikan komentar tetapi masih ada konten yang belum dikomentari." },
    { "status": "belum", "label": "Belum", "description": "Belum memberikan komentar pada periode ini." },
    { "status": "no_username", "label": "No Username", "description": "Belum memiliki username TikTok di sistem." },
    { "status": "no_posts", "label": "No Posts", "description": "Tidak ada konten untuk periode yang dipilih." }
  ],
  "noUsernameUsersDetails": [
    { "userId": "U-04", "name": "Diana", "division": "Bidang", "clientId": "ditbinmas", "regionalId": "JATIM" }
  ],
  "usersWithComments": ["@alice"],
  "usersWithoutComments": ["@diana"],
  "usersWithCommentsCount": 1,
  "usersWithoutCommentsCount": 1
}
```

- **data** – daftar pengguna dengan metrik tambahan untuk mempermudah pembuatan UI (status, persentase capaian, lencana penjelas).
- **sudahUsers / kurangUsers / belumUsers** – daftar username untuk filter cepat di UI.
- **belumUsersCount** – jumlah akun yang belum memberi komentar **ditambah** akun tanpa username TikTok.
- **noUsernameUsersCount** – jumlah akun tanpa username; detail tambahan ada di `noUsernameUsersDetails`.
- **summary** – ringkasan agregat yang bisa ditampilkan sebagai kartu KPI.
- **chartData** – data siap pakai untuk grafik stacked bar/polar chart (komentar vs kekurangan).
- **insights** – teks rekomendasi yang bisa langsung ditampilkan sebagai highlight.
- **statusLegend** – legenda status supaya warna/ikon di UI konsisten.
- **noUsernameUsersDetails** – daftar akun yang perlu dibantu melengkapi username TikTok.
- **regional_id** – atribut regional dari client yang ditampilkan untuk setiap user.
- **usersWithComments / usersWithoutComments** – field lama yang tetap disediakan untuk kompatibilitas klien.
- **Sumber aktivitas komentar TikTok** – perhitungan `jumlah_komentar` kini memasukkan parent comment dan seluruh reply bertingkat (contoh properti `replies`, `reply_comment`, `reply_comments`) pada pipeline fetch. Username dari seluruh thread dideduplikasi sebelum disimpan, sehingga user yang hanya aktif di reply tetap terhitung pada rekap API dan turunan Excel.

**Catatan operator:** saat endpoint ini dipakai untuk menu *Absensi Komentar TikTok* di WhatsApp, mode akumulasi menampilkan grouping per satfung dengan sub-list **lengkap/kurang/belum**. Urutan personel di dalam list mengikuti prioritas pangkat berikut: AKP (jabatan Kasat didahulukan), IPTU, IPDA, AIPTU, AIPDA, BRIPKA, BRIGADIR, BRIPTU, BRIPDA, PENATA, PENGATUR TINGKAT I, PENGATUR MUDA TINGKAT I, PENGATUR, JURU, PPPK, PHL.

## Scope Handling

Ketika `role` dan `scope` dikirim, filter mengikuti aturan berikut:

### `scope=direktorat`

- **Data tugas (post)** diambil berdasarkan `client_id`.
- **Data personil** direkap berdasarkan **role yang sama** (`role`) lintas client.

### `scope=org`

- Jika `role` adalah direktorat (`ditbinmas`, `ditlantas`, `bidhumas`, `ditsamapta`):
  - **Data tugas** diambil berdasarkan `client_id` direktorat (nilai `role`).
  - **Data personil** mengikuti `client_id` pengguna (token) jika tersedia, fallback ke `client_id` yang diminta, dan dibatasi pada `role` direktorat tersebut.
- Jika `role` adalah `operator`:
  - **Data tugas** diambil berdasarkan `client_id` asli pengguna (token).
  - **Data personil** dibatasi pada role `operator`.
  - Kombinasi `role=operator` + `scope=org` diizinkan; nilai `client_id` pada query diabaikan dan diganti dengan `client_id` dari token.
- Selain kondisi di atas:
  - **Data tugas** dan **personil** mengikuti `client_id` yang diminta.

## Filter Personil (User Source)

Rekap personil berasal dari tabel `"user"` yang digabung dengan `clients`, lalu
disaring dengan aturan yang konsisten dengan dashboard stats:

- **Client direktorat (`client_type = direktorat`)**
  - Personil diambil berdasarkan **role** (`role` query).
  - Jika `role` tidak dikirim, fallback ke `role_name = client_id` agar tetap
    konsisten dengan penandaan role direktorat di dashboard.
- **Client non-direktorat**
  - Personil diambil jika **`user.client_id = client_id`** **atau**
    **punya role `role_name = client_id`** (fallback untuk user lintas client).
  - Jika `role` dikirim dan termasuk allowlist
    (`ditbinmas`, `ditlantas`, `bidhumas`, `ditsamapta`, `operator`), maka role
    tersebut diterapkan **sebagai filter tambahan** di atas klausa dasar.
- **Filter `regional_id`** (jika dikirim) diterapkan **setelah** aturan di atas
  untuk membatasi personil ke client dengan regional tertentu.

## Regional Filter

Jika `regional_id` dikirim, data post dan personil hanya akan dihitung untuk client yang berada pada regional tersebut. Contoh: `regional_id=JATIM` membatasi rekap ke struktur Polda Jatim.
