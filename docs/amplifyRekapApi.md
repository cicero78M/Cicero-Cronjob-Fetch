# Amplify Rekap API

The `getAmplifyRekap` endpoint returns recap data for user link submissions (Amplify).

## Request

`GET /api/amplify/rekap`

### Query Parameters

- `client_id` (required)
- `periode` (optional, default: `harian`)
- `tanggal` (optional)
- `start_date` / `end_date` (optional, date range)
- `role` (recommended; used for standardized scope handling)
- `scope` (recommended; values: `direktorat` or `org`)
- `regional_id` (optional; filter hasil hanya untuk client dengan `regional_id` tertentu, mis. `JATIM`)

Example:

```
/api/amplify/rekap?client_id=DITBINMAS&periode=harian&tanggal=2025-12-22&role=ditbinmas&scope=direktorat
```

## Response

```
{
  "success": true,
  "data": [
    {
      "client_id": "DITBINMAS",
      "user_id": "U-01",
      "title": "AKP",
      "nama": "Alice",
      "username": "alice_insta",
      "divisi": "Bagops",
      "exception": false,
      "jumlah_link": 8,
      "display_nama": "AKP Alice",
      "sudahMelaksanakan": true
    },
    {
      "client_id": "DITBINMAS",
      "user_id": "U-02",
      "title": null,
      "nama": "Bob",
      "username": "bob_insta",
      "divisi": "Bagbin",
      "exception": false,
      "jumlah_link": 0,
      "display_nama": "Bob",
      "sudahMelaksanakan": false
    }
  ],
  "chartHeight": 300
}
```

- **jumlah_link** – total link (instagram/facebook/twitter/tiktok/youtube) yang dilaporkan user pada periode terpilih.
- **sudahMelaksanakan** – `true` jika user sudah melaporkan minimal satu link.
- **display_nama** – gabungan `title` + `nama` (atau `nama` saja jika tidak ada title).

## Scope Handling

When `role` and `scope` are provided, the endpoint follows these rules:

### `scope=direktorat`

- **Data post** tetap mengikuti `client_id` yang diminta.
- **Data personil** direkap lintas client, tetapi dibatasi pada **role yang sama** (`role`).

### `scope=org`

- Jika `role` adalah `operator`:
  - **Data post** mengikuti `client_id` pada token user.
  - **Data personil** dibatasi pada role `operator`.
- Jika `role` adalah salah satu direktorat (`ditbinmas`, `ditlantas`, `bidhumas`, `ditsamapta`):
  - **Data post** menggunakan `client_id` sesuai nilai `role` (post direktorat).
  - **Data personil** mengikuti `client_id` pada token user (fallback ke `client_id` request).
  - **Perhitungan link** tidak memaksa kecocokan client_id pada link (agar data post direktorat tetap dihitung).
- Selain kondisi di atas:
  - **Data post** dan **personil** mengikuti `client_id` yang diminta.

Catatan: filter role pada personil hanya mempengaruhi daftar user yang direkap. Perhitungan jumlah post (dasar `maxLink`) tetap mengikuti filter data post (client_id/role post/regional/tanggal).

### Default (tanpa `role`/`scope`)

- Menggunakan `client_id` yang diminta.
- Jika role pengguna adalah `ditbinmas`, `client_id` otomatis diset ke `ditbinmas`.

## Regional Filter

Jika `regional_id` dikirim, data post dan personil hanya akan dihitung untuk client yang berada pada regional tersebut. Contoh: `regional_id=JATIM` membatasi rekap ke struktur Polda Jatim.
