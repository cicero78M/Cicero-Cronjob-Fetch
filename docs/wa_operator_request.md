# Panduan Operator WA Bot
*Last updated: 2026-01-28*

Dokumen ini menjelaskan cara menggunakan perintah `oprrequest` pada Bot WhatsApp **Cicero_V2**. Menu ini hanya untuk operator client dan berguna untuk mengelola data user serta update tugas harian. Akses menu dibatasi sebagai berikut:
- Nomor operator dan **Super Admin** client yang terdaftar pada data client aktif dapat langsung masuk ke menu operator.
- Nomor **Admin WhatsApp** (`ADMIN_WHATSAPP`) dapat masuk ke menu operator setelah memilih client bertipe **org** yang aktif.
Seluruh laporan di menu ini hanya menampilkan data user dengan role **operator**. Menu *Kelola User* hanya tersedia untuk client berstatus aktif dengan `client_type` = **org**. Menu *Kelola Amplifikasi* hanya tersedia untuk client dengan status aktif dan `client_amplify_status` aktif. Menu *Manajemen Engagement* hanya tersedia untuk client dengan Instagram atau TikTok aktif (`client_insta_status` / `client_tiktok_status`).

## Cara Masuk Menu Operator
1. Kirim perintah `oprrequest` ke Bot WhatsApp.
2. Jika nomor Anda adalah Admin WhatsApp, bot menampilkan daftar client bertipe **org** yang aktif. Pilih client dengan membalas nomor atau `client_id` untuk melanjutkan.
3. Jika nomor Anda terdaftar sebagai operator/Super Admin client, bot langsung menampilkan pilihan utama:
   - 1️⃣ Kelola User
   - 2️⃣ Kelola Amplifikasi
   - 3️⃣ Manajemen Engagement
   Ketik angka menu yang diinginkan atau `batal` untuk keluar.
4. Di dalam *Kelola User*, menu yang tersedia:
   - 1️⃣ Tambah user baru
   - 2️⃣ Perbarui data user
   - 3️⃣ Ubah status user (aktif/nonaktif)
   - 4️⃣ Cek data user berdasarkan NRP/NIP
   - 5️⃣ Absensi registrasi user
   - 6️⃣ Absensi update data username
   Submenu **Absensi registrasi user** kini berada di *Kelola User*.
5. Di dalam *Kelola Amplifikasi*, terdapat dua kelompok:
   - **Tugas**
     - 1️⃣ Update tugas rutin
     - 2️⃣ Input tugas khusus
   - **Laporan**
     - **Tugas Rutin**
       - 1️⃣ Rekap link harian
       - 2️⃣ Rekap link harian kemarin
       - 3️⃣ Rekap link per post
       - 4️⃣ Absensi amplifikasi user
     - **Tugas Khusus**
       - 1️⃣ Rekap link tugas khusus
       - 2️⃣ Rekap per post khusus
       - 3️⃣ Absensi amplifikasi khusus
6. Di dalam *Manajemen Engagement*, operator dapat memilih:
   - 1️⃣ Absensi Likes Instagram (hanya jika Instagram client aktif)
   - 2️⃣ Absensi Komentar TikTok (hanya jika TikTok client aktif)

## Menu Manajemen Engagement
Menu ini hanya muncul jika client memiliki kanal engagement yang aktif. Aturan aksesnya:
- **Absensi Likes Instagram** tersedia jika `client_insta_status` aktif.
- **Absensi Komentar TikTok** tersedia jika `client_tiktok_status` aktif.
- Jika hanya salah satu platform aktif, bot hanya menampilkan submenu tersebut. Jika kedua status aktif, kedua submenu tampil di menu yang sama.

## Konvensi Penamaan Menu
- **Menu** dipakai untuk level utama (contoh: *Menu Kelola User*, *Menu Laporan Amplifikasi*).
- **Submenu** dipakai untuk kelompok di bawahnya, misalnya *Laporan Tugas Rutin* dan *Laporan Tugas Khusus*.
- Setiap judul memakai format Title Case, sementara instruksi selalu menyebutkan cara kembali (contoh: ketik *menu* untuk kembali).
- Semua submenu kini menambahkan instruksi **ketik back** untuk kembali ke menu sebelumnya agar navigasi konsisten, termasuk pada *Kelola User* dan seluruh submenu *Kelola Amplifikasi*.

## Alur Singkat Setiap Menu
- **Tambah User Baru**
  1. Masukkan NRP/NIP yang belum terdaftar.
  2. Isi nama, pangkat, satfung, dan jabatan sesuai instruksi. Untuk satfung,
     Anda dapat mengetik *nomor urut* pada daftar atau menuliskan namanya secara
    lengkap. Daftar satfung yang ditampilkan hanya berasal dari client Anda.
    Selain daftar tersebut, bot juga menerima satfung khusus berikut meskipun
    belum ada di data user: **SUBBID MULTIMEDIA**, **SUBBID PENMAS**,
    **SUBBID PID**, dan **SUB BAG RENMIN**. Daftar statis ini sekarang juga
    dipakai untuk memvalidasi input via web dashboard, sehingga satfung seperti
    **SUBBID MULTIMEDIA** akan selalu diterima walau belum ada di database.
  3. Bot akan menyimpan data, mencatat `created_at`/`updated_at` otomatis, lalu mengirim ringkasan user. Role **operator** akan ditetapkan secara otomatis.
- **Ubah Status User**
  1. Masukkan NRP/NIP yang ingin diubah.
  2. Pilih status baru: 1 untuk aktif, 2 untuk nonaktif.
  3. Bot mengonfirmasi perubahan status dan memperbarui `updated_at`.
- **Absensi Update Data Username**
  1. Bot menampilkan absensi pengisian username Instagram dan TikTok personil.
  2. Data dikelompokkan berdasarkan satfung/divisi, lalu dipisah menjadi lengkap, kurang, dan belum.
  3. Setiap baris menampilkan format: pangkat nama – username Instagram, username TikTok.
- **Cek Data User**
  1. Masukkan NRP/NIP user milik client Anda.
  2. Bot menampilkan detail user beserta statusnya jika ditemukan pada client yang sama.
- **Rekap Link Harian**
  1. Bot menampilkan rangkuman link konten yang dikumpulkan hari ini dari pengguna dengan role **operator** di client.
- **Rekap Link Harian Kemarin**
  1. Bot menampilkan rangkuman link konten yang dikumpulkan kemarin dari pengguna dengan role **operator** di client.
- **Update Tugas Instagram**
  1. Bot menjalankan proses pengambilan tugas terbaru untuk client terkait.
  2. Sistem juga menjalankan cron otomatis untuk client aktif dengan amplifikasi aktif menggunakan jadwal aktual `5,30 6-16 * * *` (post fetch + refresh) serta `30 17-21 * * *` dan `0 18-22 * * *` (refresh engagement saja), sehingga tugas rutin tetap terbarui tanpa perlu trigger manual.
- **Absensi Likes Instagram**
  1. Bot menampilkan rekap absensi likes Instagram untuk user operator berdasarkan mode (semua/sudah/belum).
  2. Mode akumulasi menampilkan daftar per satfung dengan sub-list *lengkap/kurang/belum* (lengkap = seluruh konten terpenuhi).
  3. Jumlah konten dan daftar link selalu mengikuti client aktif (ORG) yang dipilih operator, bukan berdasarkan role operator.
- **Absensi Komentar TikTok**
  1. Bot menampilkan rekap absensi komentar TikTok untuk user operator berdasarkan mode (semua/sudah/belum).
  2. Mode akumulasi menampilkan daftar per satfung dengan sub-list *lengkap/kurang/belum* (lengkap = seluruh konten terpenuhi).

### Input Akun Resmi Satbinmas
Untuk menambahkan akun resmi Satbinmas melalui bot:

1. Masuk menu *Client Request* → *Manajemen Client & User* → *Kelola client*.
2. Pilih client tujuan lalu pilih opsi **5️⃣ Input Akun Resmi Satbinmas**.
3. Bot otomatis menetapkan peran menjadi *Akun Resmi Satbinmas* dan memakai
   Client ID aktif dari nomor WhatsApp yang sedang login (tanpa perlu mengetik
   ulang). Gunakan `kembali` jika ingin mengganti Client ID secara manual.
4. Pilih platform (Instagram/TikTok), lalu ketik username (boleh memakai `@`).
   Bot memanggil RapidAPI untuk menarik `display_name`, `profile_url`, status
   aktif, dan status verifikasi sebelum menyimpan ke tabel
   `satbinmas_official_accounts`.
5. Setelah akun tersimpan, bot menanyakan apakah operator ingin menambah akun
   official lain atau mengubah data yang sudah ada. Balasan `tambah` akan
   mengulangi langkah pemilihan platform, sedangkan `ubah` memicu input ulang
   untuk memperbarui data. `selesai`/`batal` kembali ke menu kelola client.

### Kelola Client: Update Data Client
Alur *Update Data Client* kini memakai submenu kategori agar pilihan field lebih ringkas.

1. Masuk menu *Client Request* → *Manajemen Client & User* → *Kelola client*.
2. Pilih client, lalu pilih **1️⃣ Update Data Client**.
3. Bot menampilkan kategori berikut (pilih dengan membalas angka):
   - **Identitas & Tipe** (contoh: `client_type`, `client_group`)
   - **Kontak WA** (contoh: `client_operator`, `client_super`)
   - **Akun Sosmed** (contoh: `client_insta`, `client_tiktok`, `tiktok_secuid`)
   - **Status & Amplifikasi** (contoh: `client_status`, `client_insta_status`, `client_tiktok_status`, `client_amplify_status`)
4. Setelah memilih kategori, bot menampilkan daftar field di dalam kategori tersebut. Balas angka sesuai field yang ingin diperbarui.
5. Saat memperbarui **client_tiktok**, bot akan otomatis mengambil `secUid` dari RapidAPI dan menyimpan ke `tiktok_secuid` (jika gagal, nilai `tiktok_secuid` dikosongkan).
6. Saat memilih **tiktok_secuid**, bot tidak meminta input manual dan langsung menyinkronkan `secUid` dari RapidAPI berdasarkan `client_tiktok` yang tersimpan. Jika `client_tiktok` masih kosong, bot meminta operator mengisi username TikTok terlebih dahulu.
7. Ketik value baru sesuai instruksi (untuk boolean gunakan `true/false`). Gunakan `back` untuk kembali ke daftar kategori atau `batal` untuk keluar.

### Permintaan Melalui WA Gateway: `#SatbinmasOfficial`
Permintaan informasi akun resmi Satbinmas dapat dikirim lewat nomor *WA Gateway* dengan mengirim teks `#SatbinmasOfficial` (case-insensitive). Alur dan syaratnya:

1. Selama pesan dikirim ke sesi *WA Gateway* (DM/non-grup), bot otomatis memperlakukan pesan sebagai hasil forward gateway. Tag prefix `wagateway`/`wabot` tetap diterima, tetapi tidak lagi wajib.
2. Balasan yang ditandai WhatsApp sebagai *status message* (termasuk balasan angka ke prompt) tetap diproses selama dikirim lewat chat pribadi gateway; hanya pesan dari `status@broadcast` yang diabaikan.
3. Nomor pengirim wajib terdaftar pada tabel `dashboard_user` dengan status aktif dan bukan berperan sebagai operator. Jika nomor tidak terdaftar, bot akan mengirim pesan penolakan.
4. Relasi ke client melalui tabel `dashboard_user_clients` harus ada. Jika dashboard user tidak memiliki client aktif, permintaan ditolak dengan pesan aman.
5. Bot memetakan client utama (ID pertama pada relasi), mengambil detail client (misalnya nama/Polres), lalu menarik daftar akun resmi Satbinmas via `satbinmas_official_accounts`.
6. Respons mencantumkan: Client ID, nama Polres, role dashboard yang digunakan, dan daftar akun resmi per platform (IG/TikTok) lengkap dengan status aktif, status centang biru (verifikasi akun), serta *Link profile* yang otomatis diisi dari URL tersimpan atau dibangunkan dari username ketika URL kosong. Jika URL tersimpan bukan berasal dari domain profil resmi platform (misalnya tautan CDN foto Instagram), tautan akan diganti menjadi URL profil resmi sesuai platform—contoh: `https://www.instagram.com/mulyadi.bejo.2` untuk Instagram. Setelah daftar akun, bot menambahkan prompt apakah operator ingin menambah atau mengubah data; jika belum ada akun resmi, prompt tersebut sekaligus menjelaskan bahwa balasan *ya* akan menambahkan akun baru.
7. Balasan *ya* akan langsung memulai alur input akun resmi Satbinmas dengan menggunakan Client ID yang sama, sehingga operator bisa melanjutkan penambahan atau pembaruan akun tanpa menavigasi ulang menu.

Contoh respons:
```
📡 Data Akun Resmi Satbinmas
Client ID : MKS01
Polres    : Polrestabes Makassar
Role      : admin
Dashboard : admin_makassar

Akun Resmi:
1. [Instagram] @satbinmas_mks
   Status: Aktif
   Display Name: Satbinmas Makassar
   Centang Biru: Belum
   Link profile: https://instagram.com/satbinmas_mks
2. [TikTok] @satbinmas.tiktok
   Status: Nonaktif
   Display Name: Satbinmas Tiktok
   Centang Biru: Sudah
   Link profile: -

Apakah Anda ingin menambah atau mengubah data akun resmi Satbinmas? Balas *ya* untuk melanjutkan input data atau *batal* untuk berhenti.
```

### Whitelist Grup WA Gateway
- Pesan grup yang masuk ke nomor *WA Gateway* hanya diproses bila ID grup WhatsApp tercatat sebagai `client_group` pada client aktif di tabel `clients`. Grup yang tidak terdaftar akan diabaikan.
- Daftar grup yang diizinkan di-*cache* saat inisialisasi dan diperbarui otomatis setelah data client berubah (misalnya setelah perintah `thisgroup#ClientID` atau pembaruan client lain melalui bot). Bot juga melakukan penyegaran berkala untuk menangkap perubahan yang terjadi di luar alur bot.
- Jika cache belum tersedia atau gagal dimuat, bot akan menolak memproses pesan grup sebagai langkah aman hingga daftar grup berhasil diambil kembali.

Menu operator ini membantu mengelola user dan memantau laporan secara cepat melalui WhatsApp.


## Guard Stale Reply untuk Validator Async Profil
- Session *client request* kini membawa `sessionVersion` per `chatId` agar balasan async tidak salah konteks ketika user cepat berpindah state/menu.
- Saat state berpindah (contoh `awaiting_instagram` ke `main_menu`), handler wajib memanggil helper transisi yang otomatis *increment* `sessionVersion` hanya ketika state benar-benar berubah.
- Saat proses async validator dimulai (cek duplikat username Instagram/TikTok/dll), simpan snapshot `versionAtStart`.
- Sebelum mengirim balasan async, bandingkan `versionAtStart` dengan versi sesi terbaru. Jika berbeda, balasan dianggap **stale** dan harus dibatalkan.
- Logging validator async menggunakan format terstruktur berikut agar mudah *trace*:
  - `chatId`
  - `messageId`
  - `state`
  - `versionAtStart`
  - `currentVersion`
  - `droppedAsStale`
- Mekanisme ini berlaku untuk semua validator async (Instagram, TikTok, dan validator async field lain), bukan hanya satu field tertentu.

## Readiness Check Client WA
- Sistem mengecek kesiapan koneksi dengan `client.isReady()` dan hanya
  menandai *ready* jika hasilnya boolean `true`, sehingga status tidak
  dianggap siap hanya karena Promise sudah dibuat.
- Jika `isReady` bernilai `false` atau gagal, sistem tetap menjalankan
  fallback `client.getState()` dan menganggap siap ketika state
  `CONNECTED` atau `open` terdeteksi.


> Referensi jadwal resmi: [docs/notification_schedule_source_of_truth.md](notification_schedule_source_of_truth.md).
