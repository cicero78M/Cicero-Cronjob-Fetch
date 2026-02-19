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
- Penghapusan otomatis hanya berlaku untuk konten dari **username akun resmi** yang tersimpan di tabel `clients` (`client_insta` untuk Instagram, `client_tiktok`/`tiktok_secuid` untuk TikTok). Konten hasil input manual/non-resmi tidak dihapus otomatis oleh proses sinkronisasi.
- Modul fetch IG menyimpan metadata fetch terstruktur pada log (`IG FETCH META`/`IG SAFE DELETE`) yang mencakup jumlah item mentah, status API, durasi fetch, kode error, jumlah duplikat, dan indikator inkonsistensi.
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
