# Aturan `createUser` Endpoint
*Last updated: 2025-11-19*

Dokumen ini menjelaskan perilaku endpoint `createUser` pada controller `src/controller/userController.js` untuk skenario pembuatan atau reaktivasi user.

## Penambahan User Baru
- Operator boleh mengirimkan array `roles` di payload. Nilai yang dikirim akan diubah ke huruf kecil dan setiap role di-set ke `true` pada user baru.
- Jika operator tidak mengirimkan `roles`, role `operator` akan diberikan secara default.
- User dengan role direktorat (`ditbinmas`, `ditlantas`, `bidhumas`) otomatis menandai user baru dengan role sesuai login, serta mengikat `client_id` ke `client_id` milik admin yang membuat permintaan.
- Sistem otomatis mengisi `created_at` dan `updated_at` saat user baru dibuat tanpa perlu input tambahan.

## Reaktivasi User Lama
- **User masih aktif:** role baru hanya ditambahkan (di-set ke `true`) tanpa menghapus role yang sudah ada.
- **User tidak aktif:** status diubah menjadi aktif dan **seluruh role di-reset** agar hanya sesuai dengan role user yang sedang login ketika melakukan input. Role lain dihapus sehingga hak akses mengikuti role pembuat perubahan.
- Setiap perubahan data user akan memperbarui `updated_at` secara otomatis untuk kebutuhan audit.

Perubahan ini memastikan penambahan role tidak pernah menghilangkan izin yang sudah ada, sementara reaktivasi user selalu menyelaraskan role dengan identitas admin yang melakukan aksi.
