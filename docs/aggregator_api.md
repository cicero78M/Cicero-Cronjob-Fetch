# Aggregator API

Endpoint: `GET /aggregator`

## Purpose
Mengambil gabungan profil dan daftar posting akun Instagram dan TikTok yang terhubung ke klien tertentu.

## Parameters
- **client_id** (query) atau **x-client-id** (header). Bila token autentikasi hanya memiliki satu `client_id`, parameter ini boleh dikosongkan karena nilai akan diambil otomatis dari token tersebut. Jika token memiliki lebih dari satu `client_id`, salah satu di antaranya harus dikirim sebagai parameter. Untuk permintaan yang diautentikasi memakai `client_id` bertipe **direktorat**, backend akan memilih `client_id` default bertipe **direktorat** berdasarkan peran pengguna (misal login direktorat dengan peran `bidhumas` akan diarahkan ke klien direktorat `bidhumas`). Untuk permintaan yang diautentikasi memakai `client_id` bertipe **ORG**, backend akan mengganti `client_id` dengan klien bertipe **direktorat** yang memiliki nama peran sama dengan `client_id` login (misal login ORG dengan peran `ditlantas` akan diarahkan ke klien direktorat `ditlantas`). Permintaan khusus dengan kombinasi `client_id` **DITSAMAPTA** dan peran **BIDHUMAS** akan dipaksa menggunakan klien ORG **BIDHUMAS** sebelum aturan pemetaan lainnya diterapkan. Untuk role **operator**, `client_id` wajib termasuk dalam daftar `client_ids` di token (pemeriksaan dilakukan tanpa memedulikan huruf besar/kecil); jika tidak, server akan menolak permintaan dengan `403`.
- **regional_id** (query) — opsional, membatasi hasil ke regional tertentu (mis. `JATIM`). Jika token pengguna memiliki scope **Polda Jatim**, backend otomatis membatasi ke `regional_id = JATIM` dan hanya menerima klien yang parent-nya masih berada pada struktur regional tersebut.
- **limit** (query) — opsional, jumlah maksimum posting yang dikembalikan per platform. Nilai non-numerik akan diganti menjadi `10`. Default: `10`.
- **periode** (query) — opsional, `harian` untuk hanya mengambil posting hari ini, selain itu akan mengambil seluruh riwayat yang tersedia.

## Response
- **igProfile**: Profil Instagram (bisa `null` bila tidak ada akun Instagram).
- **igPosts**: Array posting Instagram yang sudah dibatasi oleh `limit`.
- **tiktokProfile**: Profil TikTok (bisa `null` bila tidak ada akun TikTok atau gagal diambil).
- **tiktokPosts**: Array posting TikTok yang sudah dibatasi oleh `limit`.

## Error Cases
- `400 Bad Request` bila `client_id` atau header `x-client-id` tidak dikirim dan token tidak memiliki tepat satu `client_id`.
- `403 Forbidden` bila role **operator** mengirim `client_id` di luar daftar `client_ids` pada token (case-insensitive).
- `404 Not Found` bila klien tidak ditemukan.
- `500 Internal Server Error` untuk kegagalan tak terduga lainnya.

---

## Refresh Aggregator (POST `/aggregator/refresh`)

Endpoint ini memicu pengambilan ulang profil dan konten untuk klien bertipe **direktorat** yang memenuhi kriteria berikut:

- `client_status = true`
- `client_insta_status = true`
- `client_tiktok_status = true`

Backend menggunakan filter awal `findAllActiveDirektoratWithSosmed` sehingga hanya klien dengan status sosial media aktif yang akan diproses.

### Parameters

- **client_id** (query/body) — opsional, bila kosong semua direktorat aktif akan diproses. Nilai harus cocok dengan daftar hasil `findAllActiveDirektoratWithSosmed`.
- **regional_id** (query/body) — opsional, membatasi refresh hanya untuk klien dengan `regional_id` yang sama. Jika scope pengguna adalah **Polda Jatim**, backend otomatis membatasi `regional_id` ke `JATIM` dan memastikan `parent_client_id` masih dalam struktur regional tersebut.
- **periode** (query/body) — `harian` untuk mengambil konten hari ini saja, atau nilai lain (mis. `riwayat`) untuk mengambil seluruh data yang tersedia.
- **limit** (query/body) — opsional, jumlah maksimum post yang dikembalikan per platform. Default: `10`.
- **skipPostRefresh** (query/body) — opsional, `true` untuk melewati pemanggilan ulang pipeline posting IG/TikTok dan hanya memuat posting yang sudah tersimpan. Berguna untuk pemanggilan internal seperti menu WhatsApp *Client Request*.
- **x-client-id** (header) — opsional, alternatif input `client_id` bila ingin diambil dari header. Bila token hanya memiliki satu `client_id`, nilai dari token juga akan digunakan ketika parameter dan header kosong.

### Behaviour

- Profil Instagram diambil dari sumber upstream (RapidAPI) dan disimpan via `instaProfileService.upsertProfile`.
- Postingan Instagram dan TikTok diambil ulang menggunakan pipeline `fetchAndStoreInstaContent` serta `fetchAndStoreTiktokContent`. Hasil respon akan memuat data dari `instaPostService`/`instaPostModel` dan `tiktokPostService`/`tiktokPostModel` sesuai `periode`.
- Profil TikTok terbaru diambil melalui `tiktokRapidService.fetchTiktokProfile`.
- Semua operasi dibatasi ke `client_id` yang sesuai dengan logika resolusi direktorat pada endpoint GET.
- Untuk pemanggilan internal tertentu (mis. menu WhatsApp *Client Request*), backend bisa mengaktifkan opsi `skipPostRefresh` agar tidak memicu ulang pengambilan posting IG/TikTok dari upstream namun tetap mengembalikan data posting yang sudah tersimpan.

### TikTok RapidAPI fallback

- Pipeline TikTok terlebih dahulu memanggil host utama RapidAPI (`tiktok-api23.p.rapidapi.com/api/user/posts`). Jika permintaan ini gagal atau mengembalikan daftar kosong, backend otomatis mencoba host cadangan `RAPIDAPI_FALLBACK_HOST` (mis. `tiktok-api6.p.rapidapi.com/user/videos`) menggunakan kunci `RAPIDAPI_FALLBACK_KEY`.
- Endpoint cadangan diharapkan mengembalikan array pada `videos` atau `result.videos` berisi objek dengan pengenal (`video_id` atau `id`) serta stempel waktu (`create_time`, `createTime`, atau `timestamp`). Nilai statistik seperti `digg_count`/`comment_count` akan dinormalisasi menjadi `stats.diggCount` dan `stats.commentCount` sebelum disimpan.
- Normalisasi `created_at` TikTok kini menggunakan parser terpusat (`parseCreatedAt`) agar unix timestamp bertipe number maupun string tetap terbaca konsisten (termasuk variasi field `timestamp`) tanpa mengubah basis filter harian Asia/Jakarta.
- Tambahkan variabel lingkungan `RAPIDAPI_FALLBACK_HOST` dan `RAPIDAPI_FALLBACK_KEY` ketika operator ingin memastikan konten TikTok tetap terambil saat host utama bermasalah.

### Response

```
{
  "success": true,
  "data": {
    "message": "Aggregator refreshed",
    "results": [
      {
        "client_id": "DITA",
        "igProfile": { ... },
        "igPosts": [...],
        "tiktokProfile": { ... },
        "tiktokPosts": [...]
      }
    ]
  }
}
```

### Client Request Menu

Menu WhatsApp *Client Request* menyediakan opsi **Refresh Aggregator Direktorat** baik di *Operasional Media Sosial* (opsi 7️⃣) maupun di *Manajemen Client & User* (opsi 6️⃣). Keduanya memanggil endpoint ini dengan mode `skipPostRefresh` aktif. Operator dapat memilih satu direktorat (atau semua) serta periode (`harian` atau riwayat lengkap). Menu ini hanya menyegarkan profil dan mengembalikan posting yang sudah ada tanpa memicu fetch posting baru dari Instagram/TikTok. Ringkasan jumlah post IG/TikTok per klien akan dikirim setelah refresh selesai.
