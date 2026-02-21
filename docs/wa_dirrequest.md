# Menu DirRequest untuk Operator WA
*Last updated: 2026-02-12*

Menu **dirrequest** digunakan tim Ditbinmas untuk memicu pengambilan data,
rekap, dan laporan langsung dari WhatsApp. Menu utama menampilkan beberapa
grup seperti Rekap Data, Absensi, Pengambilan Data, hingga Monitoring
Kasatker. Setiap opsi dipilih dengan membalas angka menu sesuai label yang
ditampilkan bot.

Output menu dari `performAction` kini memakai jalur pengiriman aman khusus chat
grup (`@g.us`) agar bot melewati chat grup yang belum ter-hydrate tanpa
mengubah perilaku pengiriman ke user personal. Pengiriman di grup menggunakan
`safeSendMessage` untuk memastikan chat siap sebelum balasan dikirim.

Untuk eksekusi menu dirrequest via cron, pemilihan client WA kini dilakukan
secara berurutan: **WA-GATEWAY** → **WA** → **WA-USER**. Cron akan memanggil
`waitForWaReady()` pada tiap client dan otomatis fallback jika gateway gagal
siap. Setiap fallback mencatat label client, alasan kegagalan, serta action
menu ke log cron agar mudah ditelusuri. Pengiriman menu memakai
`sendWithClientFallback`, sehingga bila pengiriman gagal pada client utama,
bot akan mencoba client berikutnya dan tetap mencatat konteks action yang
sama di log.

Mulai 18:27 WIB setiap hari, cron khusus Ditbinmas mengeksekusi menu **5**
(absensi likes) dan **10** (absensi komentar) dengan periode **hari ini**
dan hanya mengirim ke penerima khusus `081331780006` (format WA dinormalisasi
ke `@c.us`). Jadwal ini berada di grup cron `dirrequest` sehingga mengikuti
flag `ENABLE_DIRREQUEST_GROUP`.

Blok menu utama kini mencantumkan grup baru **Rekap All Data** dengan opsi:

```
📦 *Rekap All Data*
4️⃣2️⃣ Instagram all data
4️⃣3️⃣ TikTok all data
```

Opsi **4️⃣2️⃣** menjalankan generator Excel rekap likes Instagram lintas polres
(per client Direktorat yang aktif) dan mengirimkan berkasnya via WhatsApp.
Urutan polres pada rekap otomatis disusun dari total akumulasi likes tertinggi
ke terendah agar polres paling aktif muncul di bagian atas. File sementara
disimpan di `export_data/dirrequest` dengan nama berisi client, tanggal, serta
jam eksekusi sebelum dihapus setelah dikirim.

Opsi **4️⃣3️⃣** menyiapkan rekap komentar TikTok lintas polres dengan pola bulan
yang sama (September–bulan berjalan) dan mengirimkan Excel ke WA. Struktur
kolomnya mengikuti rekap Instagram: deretan bulan per kolom, total per polres,
dan baris grand total di bagian bawah.

Input **4️⃣3️⃣** kini dikenali langsung oleh bot tanpa balasan *"Pilihan tidak
valid"*, sehingga operator dapat memicu rekap TikTok all data dari menu utama
dirrequest tanpa langkah tambahan.

## Catatan Integrasi Handler TikTok (Menu 1️⃣4️⃣ dan 1️⃣6️⃣)
- Menu **1️⃣4️⃣** (`fetch + absensi komentar TikTok`) pada service dirrequest kini
  memanggil fungsi yang memang diekspor module handler:
  `fetchAndStoreTiktokContent(targetClientId, waClient, chatId)` dari
  `src/handler/fetchpost/tiktokFetchPost.js` dan
  `handleFetchKomentarTiktokBatch(waClient, chatId, targetClientId)` dari
  `src/handler/fetchengagement/fetchCommentTiktok.js`.
- Urutan argumen fetch konten TikTok sudah diseragamkan menjadi
  `(targetClientId, waClient, chatId)` agar konsisten dengan signature fungsi
  aktual dan mencegah kegagalan dynamic import/pemanggilan saat menu dieksekusi.
- Menu **1️⃣6️⃣** (`fetch post TikTok`) juga menggunakan
  `fetchAndStoreTiktokContent(targetClientId, waClient, chatId)` sehingga jalur
  fetch post mengikuti export yang tersedia di handler TikTok.

## Rekaman Snapshot Engagement per 30 Menit
- Setiap pengambilan likes Instagram dan komentar TikTok yang berjalan lewat
  jadwal 30 menit kini juga menyimpan salinan ke tabel arsip
  `insta_like_audit` dan `tiktok_comment_audit`. Kolom yang dicatat mencakup
  `shortcode`/`video_id`, `usernames` (JSONB), `snapshot_window_start`,
  `snapshot_window_end`, dan `captured_at` (default `NOW()`).
- Fetch komentar TikTok per batch kini dieksekusi dengan model
  `await Promise.all(videoIds.map((videoId) => limit(async () => ...)))`.
  Pendekatan ini menjaga batas concurrency (melalui `p-limit`) namun
  mengizinkan seluruh task video dijadwalkan lebih awal sehingga throughput
  lebih stabil dibanding loop serial yang menunggu tiap iterasi selesai dulu.
- Counter sukses/gagal tidak lagi diinkremen langsung di dalam task paralel.
  Setiap task mengembalikan status (`success`/`failed`) beserta durasi proses,
  lalu agregasi total dilakukan di akhir batch untuk mencegah race condition
  saat banyak video diproses bersamaan.
- Logic retry existing tetap dipertahankan (`MAX_COMMENT_FETCH_ATTEMPTS` dengan
  delay bertingkat per percobaan), dan log debug sekarang menampilkan durasi
  ringkas per video agar bottleneck pasca paralelisasi lebih mudah dipantau.
- Generator pesan tugas sosmed dapat menerima rentang waktu (mis. 30 menit
  terakhir). Jika rentang diberikan, generator lebih dulu membaca snapshot
  terbaru dari tabel audit dan menampilkan label **"Data rentang HH–HH WIB"**.
  Jika arsip untuk rentang tersebut kosong, perhitungan otomatis jatuh ke
  tabel utama seperti sebelumnya sehingga pesan tetap terisi.
- Operator dapat menggunakan rentang ini ketika meninjau hasil fetch per shift
  atau ketika menyusun laporan khusus yang membutuhkan sumber data dengan
  timestamp eksekusi fetch yang eksplisit.
- Setelah periode post-fetch berakhir, cron fetch sosmed hanya menjalankan refresh
  likes Instagram dan komentar TikTok tanpa menarik postingan baru. Jadwal
  engagement-only aktualnya adalah `30 17-21 * * *` dan `0 18-22 * * *`
  (17:30 s.d. 22:00 WIB).
  Pengambilan konten baru aktif pada cron `5,30 6-16 * * *` dan slot wajib
  `5 17 * * *` (17:05 WIB) untuk semua client aktif.

## Absensi Likes Instagram (Format Dirrequest)
- Rekap absensi likes Instagram (menu dirrequest untuk Direktorat) kini
  menampilkan setiap divisi sebagai header tebal, dipisahkan satu baris kosong
  agar mudah dibaca pada WhatsApp.
- Urutan divisi utama disusun berdasarkan **Akumulasi Pelaksanaan** tertinggi
  (total likes dari seluruh personel pada divisi), lalu fallback ke persentase
  ketercapaian/ukuran divisi bila nilainya sama.
- Header divisi memuat ringkasan:
  - `*NAMA DIVISI*`
  - `Akumulasi Pelaksanaan: <total> (dari <jumlah konten>)`
  - `Jumlah Personil: <angka>`
- Setiap personel ditampilkan dengan label pelaksanaan yang jelas, misalnya
  `- Nama, Pelaksanaan: 3/5`, sehingga operator dapat melihat jumlah konten
  yang sudah dilike oleh masing-masing personel secara cepat.
- Query sumber konten untuk rekap likes harian kini menyamakan mekanisme
  CronJob-Report: mode direktorat menggabungkan post berbasis role
  (`insta_post_roles`) dengan post manual milik client (`source_type`
  `manual_input`/`manual_fetch`) agar konten input manual tetap terbaca pada
  menu **6**.
- Filter tanggal `insta_post.created_at` memakai pola
  `((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date` agar
  penentuan hari berjalan konsisten saat timestamp disimpan dalam UTC.

## Absensi Komentar TikTok Kasat Binmas
- Submenu Absensi Komentar TikTok mengikuti tanggal **Asia/Jakarta (WIB)**.
  Periode harian yang dipilih dari WhatsApp otomatis menormalkan tanggal ke
  WIB sebelum dikirim ke query database sehingga konten di luar hari berjalan
  tidak ikut dihitung.
- Perhitungan harian/mingguan/bulanan kini memaksa konversi zona waktu ke
  **Asia/Jakarta** secara eksplisit (menggunakan `Intl.DateTimeFormat`)
  sehingga tanggal tidak akan melenceng meski server menjalankan bot dengan
  zona waktu default yang berbeda.
- Filter database harian untuk konten TikTok kini diseragamkan dengan
  handler fetch konten: `DATE((created_at AT TIME ZONE 'UTC') AT TIME ZONE
  'Asia/Jakarta') = $tanggal_wib` dengan parameter tanggal acuan berbasis
  `toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })` agar hasil
  harian tetap konsisten saat server tidak berjalan di zona WIB.
- Standar penyimpanan `tiktok_post.created_at` kini memakai **TIMESTAMPTZ (UTC canonical)**. Konversi ke WIB hanya dilakukan saat filter/query pelaporan (`AT TIME ZONE 'Asia/Jakarta'`) agar timestamp mentah tidak lagi ambigu ketika dibaca lintas environment.
- Sinkronisasi fetch TikTok kini menandai asal data pada `tiktok_post.source_type`: `manual_input` untuk konten dari `fetchAndStoreSingleTiktokPost()` dan `cron_fetch` untuk konten dari proses cron/auto fetch.
- Prioritas proteksi konten manual diperketat: proses pembersihan hasil sinkronisasi akun official hanya boleh menghapus kandidat `cron_fetch`; konten `manual_input` tetap dipertahankan walau username/secUid cocok akun official dan tidak muncul lagi di hasil fetch harian.
- Alur menu dapat memasok `referenceDate` (mis. menyimpan `session.referenceDate`
  atau `session.dirRequestReferenceDate`) untuk memaksa label periode, rentang
  minggu, serta parameter query memakai tanggal eksekusi yang diinginkan.
  Nilai yang berada di masa depan otomatis diabaikan agar rekap tidak memakai
  tanggal yang belum terjadi; fallbacknya memakai tanggal **Asia/Jakarta**
  saat ini sehingga selaras dengan menu 3️⃣4️⃣ *Absensi Likes Instagram Kasat Binmas*.
- Nilai `referenceDate` yang dikirim lewat menu 3️⃣5️⃣ kini dinormalisasi lebih
  dulu menggunakan helper `resolveBaseDate` agar tanggal tidak valid atau
  tanggal di masa depan langsung digeser ke hari ini (WIB). Override tanggal
  di sesi `dirrequest` juga otomatis dibersihkan setelah digunakan sehingga
  pemanggilan manual berikutnya kembali memakai hari berjalan, kecuali operator
  secara eksplisit mengirim tanggal lampau yang valid.
- Perhitungan harian membaca tanggal Asia/Jakarta tanpa konversi ganda sehingga
  label periode tidak lagi lompat ke hari berikutnya (contoh: Senin dini hari
  tetap menggunakan Minggu jika rekap dijalankan sebelum pukul 24.00 WIB).
- Pengambilan data langsung (live fallback) kini khusus untuk periode harian.
  Rekap mingguan/bulanan akan menampilkan peringatan jika database belum
  memiliki data pada rentang tersebut, sehingga label periode dan sumber data
  tetap konsisten dengan format laporan di menu 3️⃣4️⃣.
- Format laporan absensi komentar TikTok dirrequest kini menampilkan ringkasan
  per divisi dengan aturan berikut:
  - Header divisi dicetak **tebal** dan dipisahkan dengan satu baris kosong
    agar mudah dibaca di WhatsApp.
  - Urutan divisi disusun dari **Akumulasi Pelaksanaan** tertinggi (total
    komentar dari seluruh personel divisi) ke terendah.
  - Header memuat `Jumlah Personil` dan `Akumulasi Pelaksanaan` (total komentar
    dibanding total target divisi).
  - Setiap personel memakai format
    `- Nama, Pelaksanaan: <commentCount>/<totalKonten>` untuk menampilkan
    jumlah konten yang dikomentari secara jelas.

## Rekap Kelengkapan data Personil Satker (Menu 1)
- Label menu utama diperbarui menjadi **1️⃣ Rekap Kelengkapan data Personil Satker.**
  Contoh cuplikan bagian *Rekap Data* pada menu utama:

  ```
  📊 *Rekap Data*
  1️⃣ Rekap Kelengkapan data Personil Satker.
  2️⃣ Ringkasan pengisian data personel
  3️⃣ Rekap data belum lengkap
  4️⃣ Rekap Matriks Update Satker
  ```
- Fungsionalitas tetap sama: bot mengirim rekap personel yang belum melengkapi
  data dan mengelompokkannya per satker sesuai *Client ID* Direktorat yang aktif.
  Urutan daftar pada rekap kini menempatkan **hanya** client Direktorat
  peminta yang memiliki role sama dengan permintaan di posisi pertama, lalu
  diikuti client bertipe **ORG** yang memiliki role sama dengan *Client ID*
  peminta (client Direktorat lain otomatis diabaikan).
- Filter role menyesuaikan tipe client: permintaan dari client bertipe
  **Direktorat** otomatis memakai role default setara *Client ID* ketika
  operator tidak mengirim *roleFlag*, sedangkan client **ORG** tetap menghargai
  *roleFlag* Direktorat yang valid sehingga rekap hanya menghitung personel
  dengan role tersebut.
  Perhitungan rekap **hanya** memasukkan personel yang memiliki role sesuai
  Direktorat peminta atau role yang sedang difilter, termasuk ketika
  Direktorat merekap client ORG.
- Contoh perilaku filter:
  - Direktorat `DITBINMAS` tanpa `roleFlag` → rekap menghitung personel dengan
    role `DITBINMAS` saja, baik saat membaca client Direktorat sendiri maupun
    client ORG.
  - Direktorat `DITLANTAS` dengan `roleFlag=DITHUMAS` → rekap menyingkirkan
    seluruh personel tanpa role `DITHUMAS`, sehingga hasil bisa terlihat kosong
    jika client tidak memiliki role tersebut.
  - Jika operator memilih Client ID Direktorat yang tidak sama dengan
    `roleFlag`, prioritas filter tetap mengikuti Client ID tersebut, sehingga
    personel dari client bertipe ORG hanya dihitung bila memiliki role yang sama
    dengan Direktorat pilihan.

## Pemilihan Client Direktorat
- Saat mengetik `dirrequest`, bot terlebih dahulu menampilkan daftar
  *Client ID* bertipe **Direktorat** yang berstatus aktif.
- Balas dengan angka pada daftar atau langsung mengetik *Client ID* untuk
  memilih target. Balasan `batal` menutup menu.
- Semua submenu dirrequest (rekap, absensi, monitoring Satbinmas Official,
  dan lainnya) dijalankan berdasarkan *Client ID* yang dipilih sehingga tidak
  selalu bergantung pada default `DITBINMAS`.
- Instruksi di setiap submenu kini menambahkan opsi `back` untuk kembali ke
  menu sebelumnya, sehingga navigasi submenu menjadi seragam.
- Seluruh menu pada kelompok **Absensi** (opsi 5–11) menggunakan *Client ID*
  pilihan operator untuk rekap dan narasi, termasuk nama direktorat/klien yang
  ditampilkan pada pesan hasil.
- Submenu **Pengambilan Data** untuk likes/konten (opsi 12–15) kini sepenuhnya
  mengikuti direktorat yang dipilih pada awal alur `dirrequest`. RapidAPI dan
  pipeline penyimpanan akan menerima *Client ID* yang dipilih, sehingga fetch
  konten/engagement Instagram maupun TikTok dapat dijalankan untuk direktorat
  lain tanpa harus mengganti konfigurasi default. Pesan sukses/gagal yang
  dikirim bot juga menyertakan nama/ID direktorat target agar operator tahu
  dengan jelas sasaran eksekusi.

## Rekap data belum lengkap (Menu 3)
- Label submenu diperbarui menjadi **Rekap data belum lengkap** tanpa
  menyebutkan Ditbinmas.
- Menu ini mengeksekusi rekap berdasarkan *Client ID* bertipe **Direktorat**
  yang sedang aktif. Data yang diringkas mengikuti role direktorat tersebut
  (misalnya `DITBINMAS`, `DITLANTAS`, atau `BIDHUMAS`) tanpa mengunci hanya ke
  Ditbinmas. Ketika menggunakan role tambahan (*roleFlag*), rekap hanya
  menghitung personel yang memiliki role tersebut dan/atau terikat ke
  *Client ID* peminta.
- Output tetap memuat daftar personel yang belum mengisi Instagram/TikTok per
  divisi beserta salam dan stempel waktu eksekusi.
- Jika seluruh personel sudah melengkapi Instagram/TikTok, helper rekap
  mengembalikan nilai kosong sehingga bot melewati pengiriman balasan dan
  kembali ke menu tanpa menampilkan pesan kosong.

## Rekap Likes Instagram (Excel) (Menu 1️⃣9️⃣)
- Menu **1️⃣9️⃣** menyiapkan rekap likes Instagram dalam format Excel berdasarkan
  `collectLikesRecap`. Jika helper mengembalikan string (misalnya karena data
  kosong), bot mengirim pesan tersebut dan menghentikan proses.
- Apabila tidak ada `shortcodes`, bot mengirim pesan bahwa tidak ada konten IG
  untuk hari ini.
- Jika `saveLikesRecapExcel` gagal (contohnya workbook kosong atau data tidak
  valid), bot mengirim pesan error spesifik bahwa pembuatan file Excel gagal
  agar operator tahu penyebab kegagalan.
- Kegagalan saat membaca file atau mengirim ke WhatsApp menghasilkan pesan
  error yang jelas bahwa file tidak dapat dikirim.
- File sementara dicek terlebih dahulu, lalu dihapus di blok `finally` agar
  file temp tetap dibersihkan meskipun terjadi error.

## Rekap Komentar TikTok (Excel) (Menu 2️⃣0️⃣)
- Menu **2️⃣0️⃣** menyiapkan rekap komentar TikTok dalam format Excel berdasarkan
  data `collectKomentarRecap` untuk *Client ID* yang aktif.
- Jika pengambilan data komentar gagal/throw, bot mengirim pesan error yang
  menjelaskan bahwa pengambilan data rekap gagal lalu menghentikan eksekusi
  menu tanpa mencoba membuat file.
- Jika pembuatan file Excel, pembacaan berkas, atau pengiriman ke WhatsApp
  gagal, bot mengirim pesan kegagalan yang jelas agar operator tahu file tidak
  berhasil dikirim.
- File sementara yang berhasil dibuat tetap dibersihkan di blok `finally`
  sehingga tidak tertinggal di storage meskipun terjadi error.

## Laporan Harian Ditbinmas (Menu 2️⃣1️⃣)
- Menu **2️⃣1️⃣** mengirim ringkasan gabungan Instagram dan TikTok untuk
  *Client ID* yang dipilih. Narasi utama disusun lewat
  `formatRekapAllSosmed` berdasarkan hasil `lapharDitbinmas` dan
  `lapharTiktokDitbinmas`, termasuk data ranking jika tersedia.
- Jika laporan teks (`.txt`) tersedia, bot menyimpan sementara berkas di
  folder `laphar`, mengirimkannya ke WhatsApp, lalu menghapus file temp
  setelah proses selesai.
- Rekap Excel likes Instagram hanya dibuat ketika `collectLikesRecap`
  mengembalikan data valid berisi `shortcodes`. Jika helper tersebut
  mengembalikan pesan string (misalnya karena data kosong), bot mengirim
  pesan tersebut dan melewati pembuatan file Excel.
- Rekap Excel komentar TikTok dibuat setelah `collectKomentarRecap` sukses
  mengembalikan `videoIds`. Jika terjadi error saat koleksi data, bot
  mengirim pesan kegagalan dan tidak melanjutkan proses file.
- Seluruh file sementara (teks maupun Excel) dibersihkan di blok `finally`
  untuk mencegah file temp tertinggal.

## Monitoring Kasatker – Rekap Likes IG Kasat Binmas (Excel)
- Blok Monitoring Kasatker kini menambahkan entri **4️⃣4️⃣ Rekap likes Instagram
  Kasat Binmas (Excel)**. Opsi ini berjalan berdampingan dengan menu absensi
  naratif (3️⃣4️⃣) dan komentar TikTok (3️⃣5️⃣), namun langsung menyiapkan file
  Excel tanpa menampilkan rangkuman teks.
- Setelah memilih **4️⃣4️⃣**, bot meminta periode rekap: **1. Harian**, **2.
  Mingguan** (Senin–Minggu berjalan), atau **3. Bulanan**. Balas angka 1–3
  atau ketik *batal* untuk kembali ke menu utama Monitoring Kasatker.
- Saat menu **4️⃣4️⃣** dijalankan lewat dirrequest terjadwal (via context
  `referenceDate`), periode harian/mingguan/bulanan dihitung dari tanggal acuan
  tersebut. Sumber tanggal yang dibaca berurutan dari
  `dirRequestReferenceDate`, `executionDate`, lalu `referenceDate` agar hasil
  rekap selaras dengan jadwal eksekusi.
- Semua respons dalam alur **4️⃣4️⃣** (prompt periode, input invalid, batal,
  maupun pesan error) dikirim memakai `safeSendMessage` agar tidak memicu reset
  sesi WhatsApp.
- File Excel yang dikirim berisi kolom **Polres**, **Pangkat dan Nama**, dan
  **Total Likes (akumulatif)**. Baris diurutkan dari total likes tertinggi,
  lalu pangkat (mengikuti urutan PANGKAT_ORDER Kasat Binmas), lalu nama agar
  rekap mudah dipantau oleh pimpinan.
- Generator Excel menu **4️⃣4️⃣** hanya menyusun tiga kolom inti di atas untuk
  menjaga payload tetap ringan, lalu menyimpan berkas via jalur async
  (buffer → `writeFile`) agar tidak memblokir event loop.
- Jika jumlah personel Kasat Binmas melebihi **500 baris**, proses ekspor
  langsung dihentikan dan bot mengirim pesan singkat agar operator mempersempit
  periode/filter sebelum mencoba ulang.
- Label periode pada baris kedua sheet mengikuti format submenu (contoh: harian
  "Rabu, 22 Mei 2024", mingguan "Senin, 20 Mei 2024 s.d. Minggu, 26 Mei 2024",
  bulanan "Bulan Mei 2024").
- Berkas disimpan sementara di `export_data/dirrequest`, dikirim melalui WA
  dengan MIME Excel, lalu dihapus otomatis setelah proses selesai agar direktori
  kerja tetap bersih.
- Jika tidak ada data Kasat Binmas atau konten Instagram pada periode terpilih,
  bot **tidak** mengirim file. Sebagai gantinya, bot hanya mengirim pesan
  informasi (contoh: "Belum ada konten Instagram Kasat Binmas untuk periode
  ...") lalu langsung kembali ke menu utama Monitoring Kasatker tanpa mengulang
  prompt periode.
- Jika pengiriman gagal, bot mencatat log bertanda **submenu 4️⃣4️⃣** dan
  mengirim pesan error lewat helper `safeSendMessage`. Bot **tidak** keluar
  dari submenu 4️⃣4️⃣ dan tetap menampilkan prompt periode agar operator bisa
  mencoba ulang; perilaku terbaru ini memastikan menu 4️⃣4️⃣ tidak lagi
  memicu "restart" sesi saat gagal kirim file.
- Untuk menjaga stabilitas pengiriman file di menu **4️⃣4️⃣**, pastikan
  konfigurasi environment menetapkan `WA_WEB_VERSION_CACHE_URL` atau
  `WA_WEB_VERSION` yang valid. Rekomendasi: gunakan cache URL
  `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/versions.json`
  agar WhatsApp Web version cache tetap sinkron. Jika kedua nilai kosong, cache
  akan dimatikan dan WA client lebih rentan re-init saat beban pengiriman file
  meningkat.

## Monitoring Kasatker – Rekap Komentar TikTok Kasat Binmas (Excel)
- Grup Monitoring Kasatker menambahkan menu **4️⃣5️⃣ Rekap komentar TikTok Kasat
  Binmas (Excel)**. Opsi ini menyajikan rekap akumulasi komentar langsung dalam
  format Excel tanpa narasi teks panjang.
- Setelah memilih **4️⃣5️⃣**, bot menampilkan pilihan periode rekap: **1. Harian**,
  **2. Mingguan** (Senin–Minggu), atau **3. Bulanan**. Operator bisa membalas
  angka 1–3 atau ketik *batal* untuk kembali ke menu Monitoring Kasatker.
- File Excel memuat kolom **Polres**, **Pangkat dan Nama**, dan **Total
  Komentar**. Baris diurutkan berdasarkan total komentar terbanyak, lalu pangkat
  (sesuai urutan PANGKAT_ORDER Kasat Binmas), kemudian nama pengguna untuk
  memudahkan pemetaan capaian.
- Label periode pada baris kedua sheet mengikuti pilihan submenu (contoh: harian
  "Rabu, 22 Mei 2024", mingguan "Senin, 20 Mei 2024 s.d. Minggu, 26 Mei 2024",
  bulanan "Bulan Mei 2024").
- Berkas disimpan sementara di `export_data/dirrequest`, dikirim melalui WA
  dengan MIME Excel, lalu dihapus otomatis setelah pengiriman berhasil agar
  direktori tetap bersih.
- Jika pengiriman gagal, bot tetap mengirim pesan error lewat helper
  `safeSendMessage` untuk mencegah *unhandled rejection* ketika WA client belum
  siap.

## Monitoring Satbinmas Official
Grup menu terbaru di bagian bawah menambahkan alur khusus untuk memantau akun
resmi Satbinmas. Menu utama kini menampilkan rentang opsi **3️⃣6️⃣–4️⃣1️⃣** untuk
alur ini sehingga operator bisa langsung memilih pengambilan data maupun
rekap.

- **3️⃣6️⃣ Ambil metadata harian IG Satbinmas Official**
  1. Pilih opsi **3️⃣6️⃣** dari menu dirrequest.
  2. Bot menampilkan prompt *Monitoring Satbinmas Official* yang otomatis
     memakai *Client ID* aktif (default `DITBINMAS`).
  3. Balas dengan format `username` atau `CLIENT_ID username` jika ingin
     mengecek akun Satbinmas milik client lain. Contoh: `satbinmas_official`
  atau `MKS01 satbinmas_official`.
  4. Bot memanggil layanan RapidAPI (`fetchInstagramInfo`) untuk menarik
     metadata profil Instagram (nama, followers, postingan, status verifikasi,
     dan privasi).
  5. Hasil dikirim kembali ke operator dalam satu pesan ringkasan. Jika
     metadata tidak ditemukan atau layanan gagal diakses, bot menampilkan pesan
     kegagalan beserta alasan singkat.
  6. Balasan `batal` kapan pun akan menutup alur ini dan kembali ke menu utama
     dirrequest.

- **3️⃣7️⃣ Ambil konten harian IG Satbinmas Official**
  1. Pilih opsi **3️⃣7️⃣**. Bot langsung mengeksekusi tanpa menunggu balasan.
  2. Sistem otomatis memuat seluruh akun Instagram Satbinmas Official untuk
     setiap client bertipe `ORG` dari tabel `satbinmas_official_accounts`
     (tanpa filter `is_active`), dieksekusi berurutan per client dengan jeda
     agar tidak melanggar rate limit RapidAPI.
  3. RapidAPI Instagram dipanggil melalui
     `fetchTodaySatbinmasOfficialMediaForOrgClients` untuk menarik konten hari
     berjalan (filter `taken_at` hari ini) dan menormalkan metadata, termasuk
     hashtag dan mention ke tabel terpisah.
  4. Operator menerima rekap harian yang memuat periode pengambilan data,
     total polres/akun/konten (tanpa rincian baru/update/gagal), daftar akun
     aktif (urutan konten tertinggi) lengkap dengan total likes dan komentar
     per akun, akun pasif, serta client ORG yang belum pernah memasukkan akun
     Satbinmas Official. Nama polres dipakai apabila tersedia agar mudah
     dibaca. Rekap tetap memuat daftar akun yang gagal diproses jika ada.

- **3️⃣8️⃣ Sinkronisasi secUid TikTok Satbinmas Official**
  1. Pilih opsi **3️⃣8️⃣** untuk memicu sinkronisasi otomatis tanpa perlu
     membalas username.
  2. Bot mengambil seluruh akun TikTok Satbinmas Official dari tabel
     `satbinmas_official_accounts` milik *semua* client bertipe `ORG`, lalu
     memanggil RapidAPI TikTok (`fetchTiktokProfile`) satu per satu untuk
     menarik `secUid` terbaru dengan jeda aman.
  3. Setiap hasil sukses disimpan kembali ke kolom `secuid` melalui layanan
     `syncSatbinmasOfficialTiktokSecUidForOrgClients`, sementara kegagalan
     (username kosong, konflik, atau RapidAPI error) dicatat dalam ringkasan.
  4. Operator menerima rekap agregat (jumlah client, akun berhasil, akun gagal)
     beserta daftar client tanpa akun TikTok yang terdaftar.

- **3️⃣9️⃣ Ambil konten harian TikTok Satbinmas Official**
  1. Pilih opsi **3️⃣9️⃣**. Bot langsung mengeksekusi tanpa menunggu balasan.
  2. Sistem otomatis memuat seluruh akun TikTok Satbinmas Official untuk setiap
     client bertipe `ORG` dari tabel `satbinmas_official_accounts` dan mengeksekusi
     berurutan per client dengan jeda agar aman dari batas RapidAPI.
  3. RapidAPI TikTok dipanggil melalui
     `fetchTodaySatbinmasOfficialTiktokMediaForOrgClients` untuk menarik konten
     yang dibuat hari ini (berdasarkan `createTime`).
  4. Seluruh profil, konten, dan hashtag tersimpan di tabel
     `satbinmas_tiktok_accounts`, `satbinmas_tiktok_posts`, dan
     `satbinmas_tiktok_post_hashtags`.
  5. Operator menerima rekap otomatis dengan format baru: periode pengambilan
     data, total polres/akun/konten, daftar akun aktif (urutan konten tertinggi
     beserta likes dan komentar per akun), akun pasif, serta client ORG yang
     belum memiliki akun TikTok terdaftar. Kegagalan per akun juga dicantumkan.

- **4️⃣0️⃣ Rekap Instagram Satbinmas Official**
  1. Pilih opsi **4️⃣0️⃣** untuk membuka submenu rekap.
  2. Bot menampilkan pilihan periode: **1. Harian** (hari ini), **2. Mingguan**
     (Senin–Minggu berjalan), dan **3. Bulanan** (tanggal 1 s/d akhir bulan
     berjalan).
  3. Balasan angka **1–3** hanya membaca rekap yang sudah ada di tabel
     `satbinmas_official_media`; tidak ada pemanggilan RapidAPI.
  4. Operator menerima ringkasan berformat sama dengan rekap harian: klasifikasi
     akun aktif/pasif/belum input dengan label periode, total konten, beserta
     total likes dan komentar per akun.
  5. Balasan `batal`, `0`, atau `kembali` menutup submenu dan kembali ke menu
     utama tanpa menjalankan proses apa pun.

- **4️⃣1️⃣ Rekap TikTok Satbinmas Official**
  1. Pilih opsi **4️⃣1️⃣** untuk membuka submenu rekap TikTok.
  2. Submenu menawarkan periode **1. Harian** (hari ini), **2. Mingguan**
     (Senin–Minggu berjalan), dan **3. Bulanan** (tanggal 1 s/d akhir bulan
     berjalan) yang semuanya memakai data tersimpan di tabel
     `satbinmas_tiktok_posts` yang terhubung lewat `secUid` akun Satbinmas
     Official.
  3. Tidak ada pemanggilan RapidAPI; rekap dibangun dari agregasi data lokal
     (total konten, likes, komentar per akun) dan tetap menandai akun yang
     belum memiliki `secUid` tersinkron.
  4. Hasil dikirim sebagai pesan ringkasan ke operator. Balasan `batal`, `0`,
  atau `kembali` akan menutup submenu dan kembali ke menu utama.

- **Catatan pemanggilan data**
  - Menu **3️⃣7️⃣** dan **3️⃣9️⃣** tetap menjalankan pengambilan konten via
    RapidAPI (Instagram/TikTok) sebelum disimpan dan diringkas.
  - Menu rekap **4️⃣0️⃣** dan **4️⃣1️⃣** tidak memanggil RapidAPI; outputnya murni
    berasal dari data yang sudah tersimpan di database.

Opsi ini membantu Ditbinmas memantau kesiapan akun resmi Satbinmas tanpa harus
berpindah ke dashboard web atau menjalankan skrip manual.

## Rekap Instagram All Data (Menu 4️⃣2️⃣)
- Rentang bulan selalu dimulai dari **September** (tahun berjalan) dan
  otomatis mundur ke September tahun sebelumnya bila bulan saat ini belum
  memasuki September. Rekap berhenti pada bulan berjalan.
- Setiap bulan memanggil `getRekapLikesByClient(clientId, 'bulanan', <YYYY-MM>,
  null, null, roleFlag)` dan mengakumulasikan `jumlah_like` per `client_name`
  (polres). Nama polres dipakai langsung dari kolom `client_name` hasil query.
- Excel disusun sebagai array-of-arrays dengan kolom: `Polres`, satu kolom per
  bulan (nama bulan Indonesia + tahun), serta kolom `Total` per polres. Baris
  `TOTAL` di bagian akhir menjumlahkan seluruh polres per bulan sekaligus
  grand total.
- Judul dan periode pada baris pertama serta kedua digabung (merged), header
  dibekukan (`freeze`) bersama kolom Polres, dan `!cols` dihitung dari panjang
  teks terpanjang di setiap kolom agar lebar menyesuaikan isi.
- Sel angka diformat memakai `#,##0` (locale Indonesia) sehingga ribuan
  menggunakan pemisah yang mudah dibaca, termasuk pada kolom total.
- Berkas disimpan di `export_data/dirrequest` dengan format nama
  `<CLIENT>_Rekap_Instagram_All_Data_<tanggal>_<jam>.xlsx`, dikirim ke WA via
  `sendWAFile`, lalu dihapus begitu pengiriman selesai.

## Rekap TikTok All Data (Menu 4️⃣3️⃣)
- Tujuan: merangkum jumlah komentar TikTok per polres untuk setiap bulan mulai
  **September** hingga bulan saat ini dengan otomatis mundur ke September tahun
  sebelumnya bila eksekusi dilakukan sebelum September.
- Per bulan, layanan memanggil
  `getRekapKomentarByClient(clientId, 'bulanan', <YYYY-MM>, null, null, roleFlag)`
  dan menjumlahkan `jumlah_komentar` per `client_name` (polres) untuk menghasilkan
  kolom **Total** per polres.
- Baris polres diurutkan berdasarkan total komentar terbanyak ke paling sedikit,
  lalu diurutkan alfabetis jika totalnya sama. Baris terakhir adalah `TOTAL` yang
  menjumlahkan setiap kolom bulan serta grand total komentar.
- Struktur Excel mengikuti rekap Instagram all data: baris judul dan periode
  digabung (merged), header dibekukan (`freeze`) bersama kolom `Polres`, dan
  lebar kolom dihitung dari isi terpanjang agar mudah dibaca.
- Sel angka memakai format `#,##0` (locale Indonesia). Nama file mengikuti pola
  `<CLIENT>_Rekap_TikTok_All_Data_<tanggal>_<jam>.xlsx` dan dikirim ke WA lewat
  `sendWAFile` sebelum berkas sementara dihapus.

## Automasi Cron Satbinmas Official
- Cron `cronDirRequestSatbinmasOfficialMedia` menjalankan menu **3️⃣7️⃣** dan
  **3️⃣9️⃣** secara berurutan setiap hari pukul **13.05** dan **22.05**
  (zona waktu Asia/Jakarta).
- Rekap dikirim hanya ke daftar admin WhatsApp (`ADMIN_WHATSAPP`). Cron ini
  tidak mengirim laporan ke Super Admin, Operator, atau Group WA dan akan
  dilewati jika tidak ada admin penerima yang valid.

## Automasi Cron Ditbinmas Group Recap
- Cron `cronDirRequestDitbinmasGroupRecap.js` berjalan setiap hari pukul
  **15:10** dan **18:14 WIB** untuk menjalankan menu **2️⃣1️⃣** dan **2️⃣2️⃣**
  dengan pilihan periode **hari ini**.
- Pengiriman hanya ke Group WhatsApp Ditbinmas (`client_group`). Super Admin,
  Operator, maupun admin WhatsApp lain tidak menjadi target penerima.
- Menu **2️⃣2️⃣** memakai rekap ranking engagement periode *today* sehingga file
  Excel yang dikirim selalu mengacu pada data hari berjalan.

## Automasi Cron Ditbinmas Super Admin Harian
- Cron `cronDirRequestDitbinmasSuperAdminDaily.js` berjalan setiap hari pukul
  **18:10 WIB** untuk menjalankan menu **6**, **9**, **3️⃣4️⃣**, dan **3️⃣5️⃣**
  dengan pilihan data **hari ini**.
- Rekap hanya dikirim ke daftar Super Admin Ditbinmas (`client_super`) tanpa
  broadcast ke grup atau operator.

## Automasi Cron Ditbinmas Operator Harian
- Cron `cronDirRequestDitbinmasOperatorDaily.js` berjalan setiap hari pukul
  **18:12 WIB** untuk menjalankan menu **3️⃣0️⃣** dengan pilihan data
  **hari ini**.
- Rekap hanya dikirim ke daftar Operator Ditbinmas (`client_operator`) tanpa
  broadcast ke grup maupun Super Admin.

## Rekap personel yang belum melengkapi Instagram/TikTok Ditsamapta
- Cron `cronDirRequestRekapBelumLengkapDitsamapta` memanggil helper
  `formatRekapBelumLengkapDirektorat("DITSAMAPTA")` setiap pukul **menit 15**
  pada jam **07:00–21:00 WIB**.
- Target penerima hanya kanal super admin dan operator admin yang sudah
  terdaftar pada konfigurasi admin (termasuk `ADMIN_WHATSAPP` untuk routing
  admin dan kontak super/operator milik client), tanpa broadcast ke grup WA.
- Jika hasil format menyatakan seluruh personel sudah lengkap (helper
  mengembalikan nilai kosong), cron berhenti tanpa mengirim pesan apa pun
  sehingga tidak membanjiri admin dengan laporan kosong.

## Logging terstruktur Cron DirRequest Sosmed
- Cron `cronDirRequestFetchSosmed` memakai helper log terstruktur dengan
  atribut `phase`, `clientId`, `action`, `result`, `countsBefore`,
  `countsAfter`, `recipients`, dan `skipReason` untuk mengirim pesan yang sama
  ke saluran debug dan admin WA.
- Target cron ini mencakup seluruh client aktif (direktorat maupun org) yang
  memiliki Instagram atau TikTok aktif, bukan hanya direktorat.
- Pesan startup Telegram kini memakai label periode terpadu, karena evaluasi fetch post dilakukan per-client: client `org` dan `ditbinmas` fetch post hingga **20:00 WIB**, sedangkan `bidhumas` dan `ditintelkam` (termasuk penulisan `diitintelkam`) fetch post hingga **22:00 WIB**.
- Tahap logging utama yang dicetak berurutan:
  1. **start**: memuat *Client ID* target dan penerima grup WA yang valid.
  2. **timeCheck**: cron berjalan periodik hingga malam, dengan keputusan fetch post ditentukan per-client berdasarkan jendela waktu masing-masing.
  3. **fetchPosts**: menarik konten baru IG/TikTok selama masih di dalam jendela fetch post client (`06:00-20:59 WIB` untuk `org`/`ditbinmas`, `06:00-22:59 WIB` untuk `bidhumas`/`ditintelkam`).
  4. **refreshEngagement**: memperbarui likes/komentar menggunakan konten yang baru diambil, termasuk setelah batas fetch post client terlewati.
     - Untuk Instagram likes, sumber konten memakai kombinasi relasi `insta_post_clients` (konten hasil cron) dan fallback konten `manual_input` milik client yang sama pada hari berjalan (WIB), sehingga manual fetch tetap ikut diproses.
  5. **buildMessage**: merangkum aksi (fetch/refresh), delta konten, dan total
     penerima.
  6. **sendToRecipients**: mengirim narasi ke grup WA per client dan saluran debug dengan status `sent` atau `skipped`.
- Pesan *no changes* tetap dicetak ketika tidak ada konten baru atau ketika
  seluruh akun tidak berubah; log tersebut memuat `action=refresh_only` atau
  `result=no_change` sehingga admin tahu cron berjalan tetapi tidak ada delta.
- Eksekusi fetch sosmed sekarang menambahkan **distributed lock Redis** dengan
  key tetap `cron:dirfetch:sosmed` dan TTL `35 menit` (sedikit di atas durasi
  maksimum run 30 menit). Jika lock masih dipegang instance lain, proses
  langsung berhenti dengan log metric `lock_skipped`.
- Setelah lock berhasil diambil, cron tetap memakai penjaga proses lokal
  (`isFetchInFlight`) untuk mencegah overlap di proses Node.js yang sama.
  Jalur skip karena `isFetchInFlight=true` sekarang dieksekusi di dalam blok
  `try/finally`, sehingga lock Redis tetap aman dilepas sebelum function keluar.
- Pada blok `finally`, lock Redis selalu dilepas, menulis log
  `action=lock_released result=released`, lalu metrik `run_duration` dicatat
  agar durasi total eksekusi tetap terpantau.
- Contoh log WhatsApp/debug:
  - **Sukses kirim** ke grup: `cronDirRequestFetchSosmed | clientId=DITBINMAS`
    `action=fetch_dirrequest result=sent countsBefore=ig:12/tk:9`
    `countsAfter=ig:15/tk:10 recipients=120363419830216549@g.us`.
  - **Error** pada refresh: `cronDirRequestFetchSosmed | clientId=BIDHUMAS`
    `action=refreshEngagement result=error message="RapidAPI 429"`
    `recipients=admin@c.us` (stack trace dicetak di log debug).
- Error ditangkap dengan metadata (stack trace, nama error) dan dikirim ke
  kedua saluran untuk mempermudah investigasi. Seluruh log selalu mencantumkan
  *Client ID*, aksi yang dijalankan, delta sebelum/sesudah, daftar penerima,
  dan alasan skip jika berlaku.

## Automasi Cron BIDHUMAS Malam
- Cron `cronDirRequestBidhumasEvening.js` berjalan setiap hari pukul
  **22:00 WIB**. Urutan eksekusi: menjalankan menu **6** (Instagram likes),
  **9** (komentar TikTok), **2️⃣8️⃣** (rekap likes per konten), dan **2️⃣9️⃣**
  (rekap komentar per konten) khusus untuk client `BIDHUMAS` tanpa langkah fetch
  post/engagement tambahan di awal.
- Hasil hanya dikirim ke Group WhatsApp BIDHUMAS (`client_group`) dan daftar
  super admin BIDHUMAS (`client_super`). Operator atau admin WhatsApp lainnya
  tidak menerima laporan ini.
- Log progres dikirim ke admin WhatsApp untuk setiap fase: pembuka cron, daftar
  penerima valid, progres per menu/penerima, hingga ringkasan akhir. Pesan
  memakai label `[CRON DIRREQ BIDHUMAS 22:00]` agar mudah difilter.
- Pengiriman setiap pesan dibatasi jeda **2 detik** per menu/penerima agar tidak
  membanjiri gateway WA; jeda ini hanya memblokir alur BIDHUMAS saja, bukan cron
  lain.

## Penerima Cron DirRequest
- Cron `cronDirRequestFetchSosmed` kini mengeksekusi **seluruh client bertipe
  Direktorat** yang aktif dan memiliki status **TikTok** aktif. Instagram
  bersifat opsional; jika `client_insta_status` nonaktif, cron otomatis
  melewati fetch/refresh Instagram tapi tetap memproses TikTok.
- Eksekusi dilakukan **berurutan** mengikuti urutan `client_id` dari tabel
  `clients`.
- Pesan laporan tugas kini dikirim **hanya ke Group WA** milik masing-masing
  client berdasarkan kolom `client_group` (format wajib `@g.us`). Nomor
  **Super Admin** dan **Operator** tidak lagi dipakai untuk cron ini.
- Client Direktorat yang tidak memiliki group valid akan dilewati sehingga
  tidak ada pesan broadcast keluar.
- Seluruh **log proses** cron tetap dikirim ke nomor **ADMIN_WHATSAPP** untuk
  pemantauan admin, sementara pesan tugas/respons hanya dikirim ke Group WA
  per client.
- Pesan tugas **menggunakan nama client** pada salam pembuka (contoh: BID
  HUMAS) sehingga tidak lagi terpaku pada label Ditbinmas.
- Jika akun Direktorat belum memiliki relasi `insta_post_roles`, cron akan
  otomatis membaca konten berdasarkan `client_id` agar daftar tugas tidak
  kosong (misalnya pada client BID HUMAS).
- Daftar tugas Instagram pada notifikasi cron kini menampilkan angka likes per
  konten dari snapshot tabel `insta_like.likes` (`jsonb_array_length`) karena
  skema `insta_post` tidak memiliki kolom `like_count`. Strategi ini dipilih
  agar sumber likes konsisten dengan hasil refresh engagement harian.
- Cron peringkat, rekap, serta kirim ulang tugas (Engage Rank, Sosmed Rank,
  High/Low, Kasat Binmas, Kasatker, dan Rekap All Sosmed) **dihentikan** sehingga
  hanya pengambilan konten dasar dan pengingat tugas otomatis yang berjalan
  dari bucket dirRequest.
- Pengingat otomatis `cronWaNotificationReminder` tetap berjalan untuk pengguna
  Ditbinmas maupun BIDHUMAS yang mendaftar melalui `notifwa#on` dan masih
  dikirim ke nomor personal sesuai preferensi opt-in. Status pengiriman harian disimpan di tabel
  `wa_notification_reminder_state` (key: `date_key`, `chat_id`, `client_id`) **hanya setelah pesan berhasil terkirim**,
  sehingga penerima yang sudah tercatat selesai untuk tiap client tidak dikirimi ulang pada eksekusi berikutnya di
  hari yang sama, sementara penerima yang belum lengkap tetap maju ke tahap
  follow-up berikutnya dan pengiriman yang gagal akan dicoba kembali pada run berikutnya.

### Format Nomor Super Admin & Operator
- Kolom `client_super` dan `client_operator` menerima:
  - Nomor lokal dengan awalan `0`, misalnya `0812-3456-7890` → distandarkan ke
    `6281234567890@c.us`.
  - Nomor internasional yang sudah berawalan `62`, misalnya `6281234567890` →
    tetap `6281234567890@c.us`.
  - WID yang sudah memiliki sufiks `@c.us` atau `@s.whatsapp.net` akan
    dipertahankan apa adanya selama digit angkanya valid.
- Token non-numerik (seperti `not-a-number`) atau nomor dengan digit kurang
  dari **8 angka** akan ditolak sehingga penerima tidak akan disertakan di
  daftar `recipients` cron. Saat terjadi, cron akan mencatat log
  `[SKIP WA] invalid recipient` untuk memudahkan penelusuran.

### Format Grup WA untuk DirRequest
- Kolom `client_group` menerima beberapa variasi input untuk grup Ditbinmas dan
  Direktorat lain:
  - ID grup penuh seperti `120363419830216549@g.us` (huruf besar/kecil diabaikan).
  - ID numerik tanpa sufiks seperti `120363419830216549`, yang otomatis akan
    ditambahkan `@g.us` ketika pola ID grup valid.
  - Tautan undangan WhatsApp seperti
    `https://chat.whatsapp.com/invite/120363419830216549` atau
    `https://chat.whatsapp.com/120363419830216549`; bagian undangan akan dibuang
    dan token numerik di ujung akan dipakai.
- Spasi di awal/akhir akan dihilangkan sebelum validasi. Hanya token numerik
  sepanjang 10–22 digit yang lolos dan diubah menjadi format standar
  `<ID>@g.us`; token lain atau undangan dengan kode huruf akan diabaikan sehingga
  laporan untuk client tersebut tidak dikirim.

## RapidAPI (Instagram & TikTok)
- Opsi pengambilan konten (**3️⃣6️⃣**, **3️⃣7️⃣**, **3️⃣8️⃣**, **3️⃣9️⃣**) membutuhkan
  kredensial RapidAPI. Pastikan variabel lingkungan `RAPIDAPI_KEY` terisi
  sebelum bot dijalankan.
- TikTok memakai host `tiktok-api23.p.rapidapi.com` melalui
  `fetchTiktokProfile` untuk mengambil `secUid`. Instagram memakai host yang
  sama via fungsi `fetchInstagramInfo` dan `fetchInstagramPosts`.
- Menu rekap (**4️⃣0️⃣**, **4️⃣1️⃣**) hanya membaca database sehingga tetap dapat
  dipakai ketika RapidAPI tidak tersedia, selama data konten sudah ada di
  tabel yang disebutkan di atas.


## Referensi Operasional
- Jadwal dan alur notifikasi resmi untuk cron fetch sosmed dipusatkan di
  [notification_schedule_source_of_truth.md](notification_schedule_source_of_truth.md).
- `telegramService` dipakai sebagai wrapper WA logging/error demi backward compatibility.
- Setiap perubahan fungsi/modul dirrequest yang berdampak ke jadwal/notifikasi
  wajib disertai update dokumentasi terkait (`README`, `business_process`,
  `scheduled_notifications`, dan dokumen `wa_*` yang terdampak).


## Jendela Waktu Fetch Post per Client
- Batas fetch post **17:00 WIB** sudah dihapus.
- Rentang dasar fetch post sekarang dimulai dari **06:00 WIB** dan berakhir sesuai kategori client:
  - `client_type=org` dan `client_id=ditbinmas`: fetch post sampai **20:00 WIB** (hour `<= 20`).
  - `client_id=bidhumas`, `client_id=ditintelkam`, dan alias `client_id=diitintelkam`: fetch post sampai **22:00 WIB** (hour `<= 22`).
- Di luar jendela di atas, cron tetap menjalankan refresh engagement (likes/komentar) agar data malam tetap terbarui.
