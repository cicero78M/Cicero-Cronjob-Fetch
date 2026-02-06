# Instagram Rapid API

Dokumen ini menjelaskan endpoint Instagram berbasis RapidAPI yang membutuhkan autentikasi dan pembatasan role.

## Konfigurasi Environment

- `RAPIDAPI_KEY` **wajib diisi**. Jika kosong, service akan mengembalikan error konfigurasi (HTTP 500) sebelum mencoba request ke RapidAPI.
- `RAPIDAPI_FALLBACK_KEY` dan `RAPIDAPI_FALLBACK_HOST` bersifat opsional. Jika tersedia, service akan otomatis mencoba host cadangan ketika host utama mengembalikan HTTP 401/403 (mis. key utama invalid atau rate limit).

## Autentikasi & Role

Semua endpoint Rapid Instagram berada di bawah prefix `/api/insta` sehingga memerlukan token JWT (`Authorization: Bearer <token>` atau cookie `token`).

Aturan akses:
- **Admin/superadmin**: akses penuh ke seluruh endpoint Rapid Instagram.
- **Operator**: hanya boleh mengakses endpoint yang berada pada allowlist middleware (`src/middleware/authMiddleware.js`). Saat ini, `/api/insta/rapid-profile` sudah di-allowlist sehingga operator bisa menggunakannya. Endpoint Rapid Instagram lain akan ditolak dengan HTTP 403 untuk role operator.

## GET /api/insta/rapid-profile

Mengambil profil Instagram via RapidAPI berdasarkan username dan menyimpan cache serta metrik profil ke database.

### Query Params
- `username` (wajib): username Instagram yang akan diambil. Input akan dinormalisasi (trim spasi, menghapus awalan `@`). Format yang diterima: `username`, `@username`, atau URL profil Instagram.

### Contoh Request
```
GET /api/insta/rapid-profile?username=polri
```

### Response
- Sukses: format `sendSuccess` (lihat `src/utils/response.js`) dengan payload profil dari RapidAPI.
- Gagal:
  - `400` jika `username` kosong.
  - `401` jika token tidak valid.
  - `403` jika role operator mencoba mengakses endpoint Rapid Instagram yang tidak di-allowlist.

### Catatan Perilaku
- Jika cache tersedia, data diambil dari cache; jika tidak, sistem akan memanggil RapidAPI lalu menyimpan cache.
- Saat data profil valid, sistem melakukan `upsert` ke tabel profil dan metrik pengguna Instagram.
