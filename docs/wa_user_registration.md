# Panduan Registrasi User lewat Bot WhatsApp
*Last updated: 2025-09-24*

Panduan ini menjelaskan langkah–langkah bagi pengguna untuk
menghubungkan nomor WhatsApp ke akun di sistem **Cicero_V2**.

## Langkah Registrasi

1. **Simpan nomor bot** di kontak WhatsApp Anda dan kirim pesan apa saja.
2. Bot akan memeriksa apakah nomor tersebut sudah terdaftar.
   - Jika belum terdaftar, bot membalas meminta NRP/NIP Anda.
3. **Kirim NRP/NIP** sesuai yang ada di database (6–18 digit angka).
   - Contoh NRP: `87020990`
   - Contoh NIP 18 digit: `198765432012345678`
4. Bot menampilkan ringkasan data dan meminta konfirmasi.
   - Balas `ya` untuk menghubungkan nomor WhatsApp.
   - Balas `tidak` atau `batal` untuk membatalkan proses.
5. Setelah konfirmasi `ya`, bot memperbarui kolom `whatsapp`
   pada tabel `user` dan menampilkan pemberitahuan berhasil.
   - Nomor dinormalisasi ke format kanonik **digits only** dengan awalan `62`
     (contoh: `628123456789`). Normalisasi ini juga dipakai saat bot mencocokkan
     WhatsApp pengguna di alur `userrequest`.
   - Setelah tersimpan, bot langsung melanjutkan ke pertanyaan
     *"Apakah Anda ingin melakukan perubahan data?"* tanpa melakukan pencarian
     ulang berdasarkan chat ID mentah.
6. Ketik `userrequest` kapan saja untuk menampilkan data Anda
   atau memulai proses registrasi kembali.

Proses di atas memastikan setiap pengguna terhubung dengan satu nomor
WhatsApp yang valid. Jika ingin mengganti nomor,
jalankan perintah `userrequest` kembali dan ikuti instruksi yang
muncul.

## Indikator Koneksi & Readiness

- Saat bot meminta pemindaian QR, operator akan melihat log seperti `[WA-USER] Scan QR dengan WhatsApp Anda!`.
- Setelah sesi terhubung, log readiness akan muncul dari event WWebJS seperti `[WA-USER] READY via ready` atau `[WA-USER] READY via state`.
- Jika koneksi tidak stabil, pastikan sesi WA-USER aktif dan ulangi scan QR. Log `getState error` menandakan koneksi belum siap atau sesi terputus sehingga proses registrasi belum bisa dilanjutkan, sementara log `getState=<status>` hanya bersifat diagnostik dan tidak menandai ready.


## Konsistensi Update Data Profil (Instagram/TikTok)

Untuk mencegah race condition ketika user mengirim dua input cepat berurutan di langkah update nilai (`awaiting_new_value`), alur `userrequest` sekarang memakai aturan berikut:

1. Input yang akan diproses disimpan dulu sebagai `pendingInput`, `pendingInputMessageId`, dan `pendingInputAt`.
2. Validasi uniqueness selalu memakai `pendingInput` terbaru (nilai yang benar-benar akan di-commit), bukan cache nilai lama.
3. Saat commit DB berhasil, respons sukses mengambil nilai dari hasil commit (`RETURNING`), agar pesan konfirmasi selalu sinkron dengan data yang tersimpan.
4. Update profil memakai optimistic lock ringan: `WHERE user_id = ? AND session_version = ?`.
5. Jika versi sesi sudah berubah (version mismatch), bot membalas: `sesi sudah berubah, silakan ulangi` lalu mengarahkan user kembali ke menu update yang sesuai.

Pendekatan ini memastikan update IG/TikTok tetap konsisten walau ada input bertumpuk dalam jeda sangat singkat.
