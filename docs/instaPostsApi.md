# Instagram Posts API

## GET /api/insta/posts

Mengembalikan daftar post Instagram untuk client pada **hari ini** (timezone Asia/Jakarta) agar payload tidak terlalu besar.

### Query Params
- `client_id` (wajib): ID client. Contoh: `KEDIRI`.

### Contoh Request
```
GET /api/insta/posts?client_id=KEDIRI
```

### Catatan Perilaku
- Data yang dikembalikan hanya post dengan `created_at` pada tanggal hari ini berbasis **WIB (Asia/Jakarta)**, menggunakan evaluasi SQL: `(created_at AT TIME ZONE 'Asia/Jakarta')::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date`.
- Response mengikuti format `sendSuccess` (lihat `src/utils/response.js`).
- Sinkronisasi cron fetch post akan menghapus konten hari ini yang tidak lagi ada di hasil fetch, termasuk membersihkan data terkait (likes, komentar, dan audit like) agar tidak terkena kendala foreign key saat post dihapus.
- Seluruh proses sinkronisasi “hari ini” pada modul fetch (pengambilan shortcode hari ini, delete kandidat hari ini, dan summary harian) juga memakai basis tanggal **WIB (Asia/Jakarta)** yang sama.
- Setiap post di `insta_post` kini memiliki `source_type` untuk menandai asal data: `cron_fetch` (hasil sinkronisasi cron/WA fetch reguler) atau `manual_input` (hasil input manual `fetchSinglePostKhusus`).
- Perbedaan timestamp Instagram post:
  - `created_at` = timestamp internal saat data masuk ke sistem (cron fetch atau input manual). Seluruh scope sinkronisasi/fetch **hari ini** tetap memakai kolom ini.
  - `original_created_at` = timestamp asli platform Instagram (`taken_at`) yang disimpan sebagai metadata untuk kebutuhan laporan berbasis tanggal posting asli platform.
  - Untuk `source_type=manual_input` dari `fetchSinglePostKhusus`, `created_at` diisi waktu input saat request diproses (bukan `taken_at`), sehingga post manual yang diinput hari ini tetap masuk scope “hari ini” meskipun konten aslinya diposting kemarin.
- Penghapusan otomatis hanya berlaku untuk konten dari **username akun resmi** yang tersimpan di tabel `clients` (`client_insta` untuk Instagram, `client_tiktok`/`tiktok_secuid` untuk TikTok) **dan** `source_type = cron_fetch`. Konten `manual_input` tidak akan menjadi kandidat auto-delete.
- Modul fetch IG menyimpan metadata fetch terstruktur pada log (`IG FETCH META`/`IG SAFE DELETE`) yang mencakup jumlah item mentah, status API, durasi fetch, kode error, jumlah duplikat, dan indikator inkonsistensi.
- Alur sinkronisasi Instagram harian (ringkas):
  1. Ambil shortcode hari ini dari DB (`insta_post` + `insta_post_clients`) berbasis WIB.
  2. Fetch data terbaru dari RapidAPI, lalu upsert post hari ini dengan `source_type=cron_fetch`.
  3. Hitung kandidat hapus (`DB hari ini` dikurangi `hasil fetch hari ini`).
  4. Filter kandidat agar hanya shortcode dari akun resmi dan `source_type=cron_fetch`.
  5. Jalankan safe-delete guard (partial response + threshold), lalu hapus data yang lolos filter (likes/komentar/audit + post/junction).
- Aturan **safe delete** pada sinkronisasi fetch IG:
  - Delete otomatis di-skip bila ada indikasi response parsial (flag partial error, item mentah turun drastis dibanding run sebelumnya, shortcode duplikat, atau item tidak konsisten).
  - Delete otomatis ditunda bila kandidat hapus melebihi ambang aman client (`IG_SAFE_DELETE_THRESHOLD_PERCENT`, default 40%, dapat dioverride per client via `IG_SAFE_DELETE_THRESHOLD_BY_CLIENT`).
  - Setiap keputusan delete (dijalankan/ditunda/di-skip) ditulis ke audit trail log terstruktur agar alasan keputusan bisa ditelusuri.

## GET /api/instagram/posts

Endpoint baru untuk mengambil daftar post Instagram dengan rentang tanggal dan opsi filter `role`, `scope`, serta `regional_id`.

### Query Params
- `client_id` (wajib): ID client atau direktorat. Contoh: `DITBINMAS`.
- `periode` (opsional): `harian` (default), `mingguan`, `bulanan`, atau `semua`.
- `tanggal` (opsional): Tanggal referensi (format `YYYY-MM-DD` atau `YYYY-MM` untuk bulanan).
- `start_date` dan `end_date` (opsional): Rentang tanggal (`YYYY-MM-DD`). Jika dua-duanya diisi, `periode` diabaikan.
- `role` (opsional, wajib jika `scope` diisi): Role yang digunakan untuk filter direktorat. Contoh: `ditbinmas`.
- `scope` (opsional): `org` (default) atau `direktorat`. Jika `direktorat`, maka pencarian memakai `role`.
- `regional_id` (opsional): Filter berdasarkan wilayah client (huruf besar), contoh `JATIM`.

### Contoh Request
```
GET /api/instagram/posts?client_id=DITBINMAS&start_date=2025-10-01&end_date=2025-10-31&scope=DIREKTORAT&role=ditbinmas&regional_id=JATIM
```

### Catatan Perilaku
- Jika `scope=direktorat` dan `role` diisi, pencarian memakai filter role pada relasi `insta_post_roles`. Jika tidak ada hasil, sistem fallback ke pencarian berdasarkan `client_id` untuk direktorat terkait.
- Jika `scope=org` dengan `role=operator`, maka `client_id` dari token pengguna dipakai agar sesuai hak akses.
- Hanya post yang sesuai periode atau rentang tanggal yang dikembalikan. Response memakai format `sendSuccess`.
