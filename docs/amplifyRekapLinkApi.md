# Amplify Rekap Link API

The `getAmplifyRekap` endpoint returns link report recaps for amplification tasks.

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
      "user_id": "U-01",
      "nama": "Alice",
      "username": "alice",
      "jumlah_link": 3
    }
  ],
  "chartHeight": 300
}
```

## Scope Handling

When `role` and `scope` are provided, the endpoint follows these rules:

### `scope=direktorat`

- **Data tugas (post)** diambil berdasarkan `client_id`.
- **Data personil** direkap berdasarkan **role yang sama** (`role`), lintas client.

### `scope=org`

- Jika `role` adalah direktorat (`ditbinmas`, `ditlantas`, `bidhumas`, `ditsamapta`):
  - **Data tugas** diambil berdasarkan `client_id` direktorat (nilai `role`).
  - **Data personil** mengikuti `client_id` pengguna yang sedang login (token) dan dibatasi pada role direktorat yang sama.
- Jika `role` adalah `operator`:
  - **Data tugas** diambil berdasarkan `client_id` asli pengguna (token).
  - **Data personil** dibatasi pada role `operator`.
- Selain kondisi di atas:
  - **Data tugas** dan **personil** mengikuti `client_id` yang diminta.

## Regional Filter

Jika `regional_id` dikirim, data post dan personil hanya akan dihitung untuk client yang berada pada regional tersebut.
