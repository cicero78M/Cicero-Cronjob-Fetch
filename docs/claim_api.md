# Claim API

Dokumen ini merangkum endpoint klaim data berbasis OTP yang digunakan frontend untuk memvalidasi email dan memperbarui profil pengguna.

## Validasi Email
- **Endpoint:** `POST /api/claim/validate-email`
- **Body:** `{ "email": "nama@contoh.com" }`
- **Tujuan:** Memastikan alamat email memiliki format yang benar, domain email masih aktif (memiliki MX record), dan tidak dalam status non-aktif sebelum pengguna meminta OTP atau memperbarui data.
- **Catatan format:** Validasi format menggunakan `validator.js` (`validator.isEmail`) dengan opsi `allow_utf8_local_part: false` dan `allow_ip_domain: false`, sehingga hanya alamat dengan karakter ASCII pada local-part serta domain non-IP yang diterima. Email selalu dinormalisasi menjadi huruf kecil sebelum pengecekan domain dan database. Contoh yang diterima: `user.name+alias@contoh.com`, `simple-user@sub.domain.id`. Contoh yang ditolak: `nama..ganda@contoh.com` (titik ganda), `pelanggan@127.0.0.1` (IP domain), `pelanggan@domän.com` (karakter non-ASCII di domain), atau `nama@contoh` (tanpa TLD).
- **Respons berhasil (200):**
  ```json
  { "success": true, "data": { "message": "Email valid dan bisa digunakan" } }
  ```
- **Respons error yang mudah dipahami:**
  - 400 jika email kosong atau format salah dengan pesan jelas, misalnya "Email wajib diisi" atau "Format email tidak valid. Pastikan menulis alamat lengkap seperti nama@contoh.com".
  - 400 jika domain email tidak aktif atau tidak menerima email dengan pesan "Email tidak dapat digunakan. Domain email tidak aktif atau tidak menerima email.".
  - 403 jika email ditemukan tetapi status akun terkait tidak aktif dengan pesan "Email tidak aktif. Hubungi admin untuk mengaktifkan kembali.".
  - 503 jika koneksi database bermasalah dengan pesan "Database tidak tersedia" atau layanan DNS untuk validasi email tidak tersedia dengan pesan "Layanan validasi email tidak tersedia. Coba beberapa saat lagi.".

## Permintaan OTP
- **Endpoint:** `POST /api/claim/request-otp`
- **Body:** `{ "nrp": "12345678", "email": "nama@contoh.com" }`
- **Catatan:**
  - Endpoint menolak permintaan jika email sudah dipakai akun lain atau tidak cocok dengan data pengguna.
  - Jika pencarian user_id gagal tetapi email sudah tercatat pada user_id yang sama, OTP tetap dikirim untuk mencegah false
    positive "email sudah terdaftar".

## Verifikasi OTP
- **Endpoint:** `POST /api/claim/verify-otp`
- **Body:** `{ "nrp": "12345678", "email": "nama@contoh.com", "otp": "123456" }`

## Ambil Data Pengguna
- **Endpoint:** `POST /api/claim/user-data`
- **Body:** `{ "nrp": "12345678", "email": "nama@contoh.com" }`
- **Catatan:** Hanya dapat digunakan setelah OTP diverifikasi.

## Perbarui Data Pengguna
- **Endpoint:** `PUT /api/claim/update`
- **Body:** `{ "nrp": "12345678", "email": "nama@contoh.com", ... }`
- **Catatan:** Menggunakan OTP yang sudah diverifikasi atau menyertakan OTP di payload.
