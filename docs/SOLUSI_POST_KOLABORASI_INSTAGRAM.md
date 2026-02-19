# Solusi: Dukungan Post Kolaborasi Instagram (Multi-Client Shortcode)

## Permasalahan

Post kolaborasi Instagram menggunakan satu shortcode yang dibagikan oleh beberapa akun. Sebelumnya, tabel `insta_post` menggunakan `shortcode` sebagai PRIMARY KEY dengan satu `client_id`, sehingga mencegah beberapa client menggunakan shortcode yang sama. Hal ini menyebabkan:

- Satu client menimpa client lainnya ketika keduanya mengambil post kolaborasi yang sama
- Tugas dan link reports hanya bekerja untuk client terakhir yang mengambil post tersebut
- Dashboard yang berbeda tidak dapat menampilkan post kolaborasi yang sama dengan benar

## Solusi

Solusi yang diterapkan adalah membuat tabel junction `insta_post_clients` yang memungkinkan hubungan many-to-many antara posts dan clients.

### Arsitektur

```
┌─────────────┐          ┌──────────────────────┐          ┌──────────┐
│ insta_post  │          │ insta_post_clients   │          │ clients  │
├─────────────┤          ├──────────────────────┤          ├──────────┤
│ shortcode PK│◄─────────┤ shortcode FK         │          │client_id │
│ client_id   │          │ client_id FK         ├─────────►│          │
│ caption     │          │ created_at           │          │          │
│ ...         │          └──────────────────────┘          └──────────┘
└─────────────┘          PK: (shortcode, client_id)
```

### Cara Kerja

1. **Saat Fetch Post Instagram**
   - Post disimpan ke tabel `insta_post` dengan `client_id` pertama yang mengambilnya
   - Setiap client yang mengambil post tersebut ditambahkan ke tabel `insta_post_clients`
   - Jika post sudah ada (ON CONFLICT), metadata post diperbarui tetapi `client_id` di `insta_post` tetap (preservasi client pertama)

2. **Query Posts Berdasarkan Client**
   - Semua query sekarang menggunakan JOIN dengan `insta_post_clients`
   - Contoh:
   ```sql
   SELECT p.*
   FROM insta_post p
   JOIN insta_post_clients pc ON pc.shortcode = p.shortcode
   WHERE pc.client_id = 'client1'
   ```

3. **Penghapusan Posts**
   - Saat client tidak lagi mengambil post tertentu, hanya asosiasi di `insta_post_clients` yang dihapus
   - Post di `insta_post` hanya dihapus jika tidak ada client yang tersisa (orphaned post)
   - Hal ini memastikan post kolaborasi tetap ada selama masih ada minimal satu client yang menggunakannya

## Perubahan File

### Database & Models
1. `sql/migrations/20260219_create_insta_post_clients.sql` - Migrasi database untuk tabel junction
2. `sql/schema.sql` - Ditambahkan definisi tabel `insta_post_clients`
3. `src/model/instaPostClientsModel.js` - Model baru untuk operasi tabel junction

### Handler Fetch
4. `src/handler/fetchpost/instaFetchPost.js` - Fetch handler yang diperbarui:
   - Tidak lagi mengupdate `client_id` saat conflict
   - Memanggil `addClientToPost()` setelah setiap upsert
   - `getShortcodesToday()` menggunakan junction table
   - `deleteShortcodes()` hanya menghapus post yang tidak memiliki client tersisa
   - `filterOfficialInstagramShortcodes()` menggunakan junction table

5. `src/handler/fetchengagement/fetchLikesInstagram.js` - Handler likes diperbarui untuk JOIN dengan junction table

### Model Data
6. `src/model/instaPostModel.js` - Semua query diperbarui untuk JOIN dengan junction table
7. `src/model/linkReportModel.js` - Semua query diperbarui untuk JOIN dengan junction table
8. `src/model/instaLikeModel.js` - Semua query diperbarui untuk JOIN dengan junction table

### Dokumentasi
9. `docs/database_structure.md` - Ditambahkan dokumentasi tabel `insta_post_clients`

## Contoh Penggunaan

### Skenario: Post Kolaborasi

1. **Client A** dan **Client B** berkolaborasi dalam satu post Instagram dengan shortcode `ABC123`
2. Kedua client menjalankan fetch post:
   ```javascript
   // Client A fetch
   await fetchAndStoreInstaContent(keys, null, null, 'clientA');
   // Client B fetch  
   await fetchAndStoreInstaContent(keys, null, null, 'clientB');
   ```

3. **Hasil di Database:**
   ```sql
   -- insta_post table
   shortcode | client_id | caption
   ABC123    | clientA   | "Post kolaborasi..."
   
   -- insta_post_clients table
   shortcode | client_id | created_at
   ABC123    | clientA   | 2026-02-19 10:00:00
   ABC123    | clientB   | 2026-02-19 10:05:00
   ```

4. **Query Dashboard Client A:**
   ```sql
   SELECT p.* 
   FROM insta_post p
   JOIN insta_post_clients pc ON pc.shortcode = p.shortcode
   WHERE pc.client_id = 'clientA'
   -- Mengembalikan ABC123
   ```

5. **Query Dashboard Client B:**
   ```sql
   SELECT p.* 
   FROM insta_post p
   JOIN insta_post_clients pc ON pc.shortcode = p.shortcode
   WHERE pc.client_id = 'clientB'
   -- Juga mengembalikan ABC123
   ```

## Backward Compatibility

Solusi ini **sepenuhnya backward compatible**:

- Post yang sudah ada dengan satu client akan dimigrasi ke junction table saat migrasi dijalankan
- Query yang menggunakan `client_id` tetap berfungsi melalui junction table
- Tidak ada perubahan yang diperlukan di frontend atau repository lainnya
- Semua fitur existing (tasks, link reports, likes, dll) tetap berfungsi normal

## Testing

Test baru dibuat di `tests/instaPostClients.test.js` untuk memvalidasi:
- Penambahan client ke post
- Pengambilan clients berdasarkan shortcode
- Pengambilan shortcodes berdasarkan client
- Penghapusan asosiasi client-post
- Skenario post kolaborasi dengan multiple clients

## Migrasi Database

Untuk menerapkan perubahan ini, jalankan migrasi:

```bash
psql -U <dbuser> -d <dbname> -f sql/migrations/20260219_create_insta_post_clients.sql
```

Migrasi ini akan:
1. Membuat tabel `insta_post_clients` dengan constraints yang sesuai
2. Membuat index untuk performa query
3. Memigrasikan data existing dari `insta_post.client_id` ke junction table
4. Menambahkan comment pada tabel dan kolom

## Kesimpulan

Dengan implementasi ini, sistem sekarang mendukung post kolaborasi Instagram dimana satu shortcode dapat digunakan oleh beberapa client sekaligus, tanpa memerlukan perubahan di frontend atau repository lainnya. Semua perubahan terisolasi di repository ini dan backward compatible dengan sistem yang sudah ada.
