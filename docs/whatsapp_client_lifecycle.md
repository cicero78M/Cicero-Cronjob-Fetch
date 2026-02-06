# WhatsApp client lifecycle & troubleshooting

Dokumen ini menjelaskan siklus hidup WhatsApp client (whatsapp-web.js) di Cicero_V2 serta langkah troubleshooting saat stuck setelah QR dipindai.

## Lokasi kode utama

Lifecycle diatur di `src/service/waService.js` dan adapter di `src/service/wwebjsAdapter.js`.
Untuk mempermudah pencarian event di repo, string berikut wajib ada di file terkait:

```
waClient.on("qr"
change_state
```

## Event yang diharapkan

Urutan normal setelah inisialisasi (`waClient.connect()`):

1. `qr` → QR muncul di terminal.
2. `authenticated` → QR berhasil dipindai dan auth session tersimpan.
3. `ready` → client siap kirim/terima pesan.
4. `change_state` → biasanya `CONNECTED` atau `open` saat koneksi stabil.

Event yang perlu diperhatikan untuk failure:

- `auth_failure` → login gagal (biasanya session rusak/invalid).
- `disconnected` → client terputus dari WhatsApp Web.

Alur khusus logout/unpaired:

- Jika `disconnected` membawa reason **logout/unpaired**, adapter akan **menghapus**
  folder auth `session-<clientId>` dan melakukan `reinitialize()` agar QR baru muncul.
- Setelah logout/unpaired, sistem akan menunggu QR discan ulang sebelum melakukan
  fallback `getState()`/reconnect otomatis untuk mencegah loop status check.
- Reason yang dianggap logout/unpaired saat ini: `LOGGED_OUT`, `UNPAIRED`,
  `CONFLICT`, `UNPAIRED_IDLE`.
- Saat event `qr` muncul, state readiness akan menandai `awaitingQrScan=true` dan
  mencatat `lastQrAt` untuk menahan reinit sampai QR benar-benar dipindai.
- `awaitingQrScan` akan dibersihkan lewat `clearLogoutAwaitingQr` ketika event
  `authenticated`, `ready`, atau `change_state` (`CONNECTED`/`open`) terjadi.

Semua handler log menyertakan label:
- `[WA]` untuk client operator utama.
- `[WA-USER]` untuk user menu.
- `[WA-GATEWAY]` untuk gateway broadcast.

## Endpoint status readiness

Endpoint ringan untuk memeriksa readiness tiap client tersedia di:

- `GET /api/health/wa`

Response contoh:

```json
{
  "status": "ok",
  "shouldInitWhatsAppClients": true,
  "clients": [
    {
      "label": "WA",
      "ready": true,
      "awaitingQrScan": false,
      "lastDisconnectReason": null,
      "lastAuthFailureAt": null,
      "fatalInitError": null,
      "puppeteerExecutablePath": "/usr/bin/google-chrome",
      "sessionPath": "/home/node/.cicero/wwebjs_auth/session-wa-prod"
    },
    {
      "label": "WA-USER",
      "ready": false,
      "awaitingQrScan": true,
      "lastDisconnectReason": "LOGGED_OUT",
      "lastAuthFailureAt": "2024-01-10T08:30:00.000Z",
      "fatalInitError": {
        "type": "missing-chrome",
        "message": "Chrome executable not found"
      },
      "puppeteerExecutablePath": null,
      "sessionPath": "/home/node/.cicero/wwebjs_auth/session-wa-user"
    }
  ]
}
```

Field yang disediakan per client:

- `ready`: status readiness saat ini.
- `awaitingQrScan`: `true` bila sesi menunggu QR scan ulang.
- `lastDisconnectReason`: reason terakhir dari event `disconnected` (bisa `null`).
- `lastAuthFailureAt`: waktu terakhir event `auth_failure` (ISO string atau `null`).
- `fatalInitError`: detail error fatal saat init (mis. `{ type, message }`) atau `null`.
- `puppeteerExecutablePath`: path executable Chrome yang dipakai (atau `null`).
- `sessionPath`: path sesi WhatsApp untuk client tersebut (atau `null`).

## Agregasi message & deduplikasi

`handleIncoming` di `src/service/waEventAggregator.js` dipakai untuk menghindari
duplikasi pesan ketika beberapa adapter aktif. Deduplikasi memakai kombinasi
`remoteJid`/`from` dan `id` pesan. Jika salah satu nilai tidak tersedia,
pesan akan langsung diproses tanpa deduplikasi agar pesan tetap diproses
meskipun adapter tidak mengirim `id` yang lengkap.
Pemanggilan handler kini dibungkus `Promise.resolve` dan akan mencatat error
dengan konteks `jid`, `id`, dan `fromAdapter` agar akar masalah mudah ditelusuri.

## Defer & replay pesan saat belum ready

Ketika readiness belum tercapai, handler pesan di `src/service/waService.js`
menunda pesan ke `pendingMessages` dan menandainya dengan metadata replay
(misalnya `allowReplay`). Saat client dinyatakan ready, `flushPendingMessages`
akan memanggil handler lewat `handleIncoming(..., { allowReplay: true })` agar
pesan yang sebelumnya ditunda tetap diproses tanpa diblokir deduplikasi. Alur
ini memastikan pesan yang diterima sebelum ready tetap ditangani setelah client
siap, sementara dedup tetap aktif untuk pesan normal.

## Throttling pengiriman pesan per client

Pengiriman pesan keluar dibungkus `wrapSendMessage` di `src/service/waService.js`
dan kini memakai antrean terpisah untuk tiap WhatsApp client. Setiap instance
client menyimpan queue sendiri (concurrency 1) sehingga throttle/delay tidak
lagi bersifat global lintas client. Dampaknya:

- Pesan dari `[WA]`, `[WA-USER]`, dan `[WA-GATEWAY]` tidak saling memblokir.
- Delay respons (`responseDelayMs`) tetap konsisten per client, tetapi tidak
  memperlambat client lain.

## Guard error sesi menu WA

`src/service/waService.js` kini memvalidasi handler menu WhatsApp untuk
`oprrequest`, `dirrequest`, dan `clientrequest` sebelum mengeksekusi langkah
yang tersimpan di sesi. Jika step tidak valid atau handler melempar error,
bot akan:

- Membersihkan sesi agar tidak terjebak di langkah yang rusak.
- Mengirim pesan peringatan/kegagalan yang aman ke user.
- Mencatat log error tanpa menghentikan proses sehingga request WA tidak
  memicu restart server karena crash handler.

## Inisialisasi paralel

Pada startup, ketiga WhatsApp client (`waClient`, `waUserClient`, `waGatewayClient`)
diinisialisasi **secara paralel**. Artinya:

- QR/ready pada salah satu sesi tidak memblokir sesi lain untuk memulai koneksi.
- Log error tetap terpisah per label (`[WA]`, `[WA-USER]`, `[WA-GATEWAY]`) agar mudah
  melacak sesi yang bermasalah.
- Fallback readiness (`getState()` setelah ~60 detik) tetap dijadwalkan untuk semua
  client segera setelah inisialisasi dimulai, namun sekarang **one-shot per siklus**
  start/restart: ketika `isReady()` atau `getState()` mengembalikan `CONNECTED/open`,
  fallback dianggap selesai dan tidak dijadwalkan ulang hingga siklus baru dimulai
  (reset saat event `qr`, `authenticated`, `auth_failure`, disconnect/change_state
  yang menandakan putus, atau saat `connect()`/`reinitialize()` dipanggil).
- `connect()` dapat **reject** (hard failure) jika inisialisasi gagal, misalnya setelah
  retry fallback webVersion tetap gagal. Saat ini, `waService.js` menandai client
  sebagai tidak siap dan menjadwalkan reinit dengan backoff lebih panjang
  (hingga beberapa menit), serta akan **abort** setelah sejumlah retry tertentu.

## Lokasi penyimpanan auth

Adapter `src/service/wwebjsAdapter.js` memakai `LocalAuth` dan menyimpan session di:

- Default: `~/.cicero/wwebjs_auth/session-<clientId>`
- Override: `WA_AUTH_DATA_PATH` (env) → path absolut, tetap menghasilkan folder `session-<clientId>`.

Lock Puppeteer (`SingletonLock`, `SingletonCookie`, `SingletonSocket`) berada di
folder `session-<clientId>` yang sama, misalnya:
`<authPath>/session-wa-gateway-prod/SingletonLock`.

## Guard sesi bersama (shared session)

Adapter kini memeriksa **lock aktif** sebelum `client.initialize()` untuk
mendeteksi proses lain yang memakai `clientId`/`sessionPath` yang sama. Jika
lock aktif ditemukan, inisialisasi akan gagal cepat agar tidak terjadi bentrok
profil browser.

Rekomendasi untuk multi-instance (PM2, systemd, container paralel):

- Gunakan `WA_AUTH_DATA_PATH` **berbeda** per proses.
- Atur `WA_WWEBJS_FALLBACK_AUTH_DATA_PATH` bila ingin fallback path terpisah.
- Tambahkan suffix unik per proses dengan
  `WA_WWEBJS_FALLBACK_USER_DATA_DIR_SUFFIX` (contoh:
  `WA_WWEBJS_FALLBACK_USER_DATA_DIR_SUFFIX=worker-${PM2_INSTANCE_ID}`).

Guard ini dapat dilewati secara eksplisit dengan
`WA_WWEBJS_ALLOW_SHARED_SESSION=true` (default: `false`).

Jika perlu memindahkan profil browser (userDataDir), atur:

- `WA_AUTH_DATA_PATH` untuk lokasi utama userDataDir/session.
- `WA_WWEBJS_FALLBACK_AUTH_DATA_PATH` untuk base path fallback (opsional).
- `WA_WWEBJS_FALLBACK_USER_DATA_DIR_SUFFIX` untuk menambahkan suffix khusus
  saat fallback unik dipakai (mis. `NODE_ENV`/cluster label).

Pastikan path ini writable oleh user yang menjalankan service.

Catatan penting: `USER_WA_CLIENT_ID` dan `GATEWAY_WA_CLIENT_ID` **harus lowercase**
dan **tidak boleh default** (`wa-userrequest`/`wa-gateway`). Service akan
menghentikan proses sejak awal jika nilai masih default, mengandung huruf besar,
atau folder `session-<clientId>` di `WA_AUTH_DATA_PATH` memakai casing berbeda.
Karena nama folder session mengikuti `clientId`, pastikan nilai env dan folder
session selalu konsisten.

Checklist operasional (casing & path):

1. Tentukan path auth yang aktif:
   - `WA_AUTH_DATA_PATH` jika di-set, atau default `~/.cicero/wwebjs_auth/`.
2. Periksa folder `session-<clientId>` yang sudah ada.
   - Jika ada `session-<clientId>` dengan casing tidak lowercase, rename folder
     tersebut menjadi lowercase (contoh: `session-Wa-Gateway` → `session-wa-gateway`)
     agar sesuai dengan `GATEWAY_WA_CLIENT_ID` yang baru.
   - Saat mengganti `GATEWAY_WA_CLIENT_ID`, hapus atau rename folder session lama
     di `WA_AUTH_DATA_PATH` agar sesi usang tidak tertinggal.
3. Pastikan nilai `USER_WA_CLIENT_ID` dan `GATEWAY_WA_CLIENT_ID` lowercase serta unik di
   semua konfigurasi proses
   (deployment, PM2/daemon, systemd, atau env file) agar tidak membuat session baru
   saat restart.

Ketika logout/unpaired terjadi, folder `session-<clientId>` akan dibersihkan
agar sesi lama tidak tersisa dan QR baru dapat dipindai ulang.

## Profil browser per client (LocalAuth)

`LocalAuth` mengelola profil Puppeteer di dalam folder session per client
(`session-<clientId>`). Ini sudah memisahkan state browser antar client.
Jika ada beberapa proses yang menjalankan client dengan `clientId` sama,
pastikan `WA_AUTH_DATA_PATH` berbeda per proses agar tidak bentrok di folder
session yang sama.

## Fallback init untuk webVersionCache

Jika `client.initialize()` gagal dengan error yang mengandung `LocalWebCache.persist`
atau `Cannot read properties of null (reading '1')`, adapter akan:

1. Override `webVersionCache` menjadi `{ type: 'none' }` dan menghapus `webVersion`.
2. Mencatat warning dengan label `clientId` agar mudah ditelusuri.
3. Menyarankan pemeriksaan `WA_WEB_VERSION_CACHE_URL` dan/atau pengaturan `WA_WEB_VERSION`.
4. Mencoba `initialize()` ulang satu kali setelah fallback diterapkan.
5. Jika retry gagal, `connect()` akan reject sehingga caller dapat menandai
   kegagalan sebagai hard failure.

Langkah ini membantu ketika cache web version dari WhatsApp Web tidak kompatibel.

## Timeout connect & connect in progress

Adapter `wwebjsAdapter` menyimpan timestamp ketika `startConnect()` dipanggil dan
menjalankan `initialize()` dengan timeout. Jika timeout tercapai, log akan
menyebut “koneksi macet”/timeout dan `connect()` akan melempar error agar
`scheduleHardInitRetry` atau reinit lainnya bisa berjalan.

Konfigurasi timeout dan ambang monitoring:

- `WA_CONNECT_TIMEOUT_MS` (default 180000ms) → batas maksimal `initialize()`.
- `WA_WWEBJS_CONNECT_RETRY_ATTEMPTS` (default 3) → jumlah retry `initialize()` per connect.
- `WA_WWEBJS_CONNECT_RETRY_BACKOFF_MS` (default 5000ms) → backoff awal retry.
- `WA_WWEBJS_CONNECT_RETRY_BACKOFF_MULTIPLIER` (default 2) → multiplier backoff.
- `WA_CONNECT_INFLIGHT_WARN_MS` (default 120000ms) → log warning ketika
  `connectInFlight` terlalu lama.
- `WA_CONNECT_INFLIGHT_REINIT_MS` (default 300000ms) → trigger reinit otomatis
  jika `connectInProgress` macet terlalu lama.

Jika log `connect in progress` muncul berulang-ulang, artinya koneksi masih
in-flight. Sistem akan mencatat durasi dan melakukan reinit saat melewati
ambang waktu di atas, atau lebih cepat jika timeout connect tercapai.

Log `fallback readiness skipped; connect in progress` kini juga membawa konteks
`awaitingQrScan`, `lastDisconnectReason`, dan `lastQrAt` untuk membantu
troubleshooting stuck/QR. Interpretasinya:

- `awaitingQrScan=true` + `lastDisconnectReason` bernilai `LOGGED_OUT/UNPAIRED/...`
  → koneksi memang menunggu QR dipindai ulang; fokuskan pada scan QR terbaru.
- `lastQrAt` menunjukkan kapan QR terakhir dicetak (ISO timestamp); jika nilainya
  "none" berarti belum ada QR baru tercatat pada sesi tersebut.
- Saat `awaitingQrScan=true` dan QR baru muncul, guard fallback akan menunda reinit
  agar proses tidak mereset sesi sebelum QR sempat dipindai.

Jika `getState()` berulang kali mengembalikan `close` pada `[WA-GATEWAY]` sementara
folder `session-<clientId>` masih berisi data auth, fallback readiness akan
menghapus session tersebut dan menjalankan reinit agar inisialisasi tidak
terjebak di status close tanpa QR baru. Pastikan operator siap melakukan scan
ulang setelah cleanup otomatis ini terjadi.

## Recovery saat browser sudah berjalan (lock userDataDir)

Entri konfigurasi dan log lock ada di `src/service/wwebjsAdapter.js`, sementara
initialisasi client dipanggil dari `src/service/waService.js` lewat
`createWwebjsClient()`. Gunakan dua file ini sebagai titik entry ketika perlu
mengubah perilaku WWEBJS atau menambahkan log baru.

Jika `initialize()` gagal dengan pesan seperti `browser is already running for ...`,
adapter akan:

0. **Sebelum** memulai `initialize()`, adapter mengecek lock di `session-<clientId>`.
   Jika lock ada tetapi proses browser sudah tidak aktif, lock akan dibersihkan.
   Jika proses browser masih aktif, cleanup dilewati dan hanya dicatat di log.
1. Memanggil `client.destroy()` hanya jika Puppeteer sudah terinisialisasi (`pupBrowser`/`pupPage`).
   Jika belum, destroy dilewati dan hanya dicatat debug agar recovery tetap bersih.
2. Memverifikasi apakah lock masih aktif dengan membaca `SingletonLock` (PID) dan
   mengecek `SingletonSocket`. Jika terdeteksi proses Chromium masih hidup, lock
   dianggap aktif.
3. Jika lock **tidak aktif**, file lock Puppeteer (`SingletonLock`, `SingletonCookie`,
   `SingletonSocket`) di dalam folder `session-<clientId>` akan dibersihkan.
4. Jika lock **aktif**, adapter tidak menghapus file lock dan menggunakan backoff
   lebih panjang sebelum retry. Dengan `WA_WWEBJS_LOCK_RECOVERY_STRICT=true`, adapter
   akan **bail out** dengan error jelas agar operator memakai sesi yang sama atau
   menghentikan proses lama secara eksplisit. Jika strict **false** tetapi fallback
   userDataDir gagal diterapkan setelah melewati ambang `WA_WWEBJS_LOCK_FALLBACK_THRESHOLD`,
   adapter juga akan melempar error terminal agar retry tidak terus berulang.
5. Jika lock **aktif** berulang kali dan koneksi tetap gagal, adapter akan
   menggunakan **fallback userDataDir** yang unik (berbasis hostname/PID/attempt
   dan optional suffix) agar sesi baru bisa berjalan tanpa menimpa lock lama.

Durasi backoff dasar dapat diatur via `WA_WWEBJS_BROWSER_LOCK_BACKOFF_MS`
(default 20000ms). Saat lock aktif, backoff akan dinaikkan otomatis. Gunakan
`WA_WWEBJS_LOCK_RECOVERY_STRICT=true` untuk mode aman (tanpa menghapus lock
ketika lock aktif) dan memaksa operator melakukan cleanup manual sebelum reinit.
Ambang aktivasi fallback lock dapat diatur via `WA_WWEBJS_LOCK_FALLBACK_THRESHOLD`
(default 2).

Langkah operasional saat lock aktif:

- Gunakan sesi yang sama (jangan membuat `clientId` baru) ketika proses lama masih berjalan.
- Hentikan proses Chromium/Node lama secara eksplisit sebelum melakukan reinit.
- Jika proses lama sudah mati, hapus lock stale di folder `session-<clientId>`
  (file `SingletonLock`, `SingletonCookie`, `SingletonSocket`) lalu restart service.
- Bila lock aktif terus-menerus, gunakan `WA_WWEBJS_FALLBACK_AUTH_DATA_PATH` atau
  suffix `WA_WWEBJS_FALLBACK_USER_DATA_DIR_SUFFIX` agar instance baru memakai
  userDataDir berbeda tanpa menimpa sesi lama.

### Gejala lock aktif (log WWEBJS)

Lock aktif biasanya terlihat dari salah satu log berikut:

- `[WWEBJS] Active browser lock detected before <context> for clientId=...`
  → ada proses Chromium yang masih hidup sehingga cleanup dilewati, sekarang log
  membawa `profilePath` dan `pid` agar operator bisa mematikan proses yang tepat.
- `[WWEBJS] Detected browser lock for clientId=... (<trigger>) (active lock: ...) (profilePath=..., pid=...)`
  → fallback recovery berjalan dan akan menunggu backoff.
- `[WWEBJS] Active browser lock detected for clientId=...; skipping lock cleanup`
  → mode aman/strict mencegah penghapusan lock aktif.
- `[WWEBJS] Browser lock still active for clientId=... Reuse the existing session...`
  → strict mode menolak reinit; hentikan instance lama atau pakai userDataDir lain.
- `[WWEBJS] Browser lock still active for clientId=... after <n> attempts (profilePath=..., pid=...)`
  → fallback gagal diterapkan setelah melewati ambang, sehingga adapter berhenti retry.

### Lokasi userDataDir & file lock

- Default userDataDir: `~/.cicero/wwebjs_auth/session-<clientId>`
- Override lewat env: `WA_AUTH_DATA_PATH=/path/custom` → tetap membuat
  `session-<clientId>` di dalam path tersebut.
- File lock Puppeteer berada di folder `session-<clientId>`:
  `SingletonLock`, `SingletonCookie`, `SingletonSocket`.

### Contoh konfigurasi env (userDataDir & multi-instance)

Contoh dasar untuk memindahkan userDataDir utama:

```bash
WA_AUTH_DATA_PATH=/var/lib/cicero/wwebjs_auth
```

Contoh multi-instance aman (setiap node memakai suffix unik):

```bash
WA_AUTH_DATA_PATH=/var/lib/cicero/wwebjs_auth
WA_WWEBJS_FALLBACK_AUTH_DATA_PATH=/var/lib/cicero/wwebjs_auth_fallback
WA_WWEBJS_FALLBACK_USER_DATA_DIR_SUFFIX=${HOSTNAME}-${NODE_ENV}
```

Strategi lain jika satu host menjalankan beberapa proses:

```bash
WA_AUTH_DATA_PATH=/var/lib/cicero/wwebjs_auth
WA_WWEBJS_FALLBACK_USER_DATA_DIR_SUFFIX=worker-${PM2_INSTANCE_ID}
```

Pastikan `GATEWAY_WA_CLIENT_ID`/`USER_WA_CLIENT_ID` tetap lowercase agar folder
`session-<clientId>` konsisten dan tidak bentrok antar instance.

Timeout DevTools Protocol Puppeteer di whatsapp-web.js dapat diatur lewat
`WA_WWEBJS_PROTOCOL_TIMEOUT_MS` (default 120000ms). Ini memperbesar ambang
`Runtime.callFunctionOn` saat koneksi lambat; naikkan ke 180000ms atau lebih jika
host sering time out ketika melakukan evaluasi di halaman WhatsApp Web.
Override per client tersedia dalam dua format: alias role berbasis prefix dan suffix
client ID uppercase. Alias role memakai `WA_WWEBJS_PROTOCOL_TIMEOUT_MS_GATEWAY`
untuk client ID yang diawali `wa-gateway` dan `WA_WWEBJS_PROTOCOL_TIMEOUT_MS_USER`
untuk `wa-user`. Contoh untuk `wa-gateway-prod`: alias `WA_WWEBJS_PROTOCOL_TIMEOUT_MS_GATEWAY=180000`,
atau suffix eksplisit `WA_WWEBJS_PROTOCOL_TIMEOUT_MS_WA_GATEWAY_PROD=180000`
(client ID uppercase + non-alfanumerik jadi `_`). Dengan begitu, admin tetap memakai default sementara
client tertentu bisa diperpanjang tanpa mengganggu WA admin.
Adapter juga dapat menaikkan timeout secara adaptif setelah error `Runtime.callFunctionOn timed out`
saat inisialisasi. Atur batas maksimum via `WA_WWEBJS_PROTOCOL_TIMEOUT_MAX_MS` (default 300000ms)
dan laju kenaikan via `WA_WWEBJS_PROTOCOL_TIMEOUT_BACKOFF_MULTIPLIER` (default 1.5). Pastikan nilai
max lebih besar dari timeout per-client agar mekanisme adaptif bisa bekerja.

## Normalisasi opsi sendMessage

Adapter `wwebjsAdapter` selalu menormalkan parameter `options` untuk `sendMessage`
menjadi objek sebelum diteruskan ke `whatsapp-web.js`. Default internal `sendSeen`
diset `false` (kecuali caller eksplisit mengaktifkan) agar penandaan dibaca dilakukan
secara manual setelah chat tervalidasi. Ini mencegah error seperti
`Cannot read properties of undefined (reading 'markedUnread')` yang dapat muncul
saat opsi tidak dikirim atau bernilai `null` dari caller, sekaligus menghindari
`sendSeen` pada chat yang belum ter-hydrate. Jika payload teks tidak memiliki `text`,
adapter akan mengirim string kosong agar tetap kompatibel. Setelah `sendMessage`,
adapter memvalidasi response dan melempar error terkontrol jika tidak ada `message.id`.
Log peringatan akan menyertakan `jid` dan tipe konten untuk investigasi. Caller
disarankan memakai `safeSendMessage` atau menangkap error lokal saat membutuhkan
penanganan kegagalan yang konsisten.

Guard `sendSeen` kini dipusatkan di adapter. Handler pesan masuk memanggil
`waClient.sendSeen(chatId)` setelah jeda singkat, dan adapter `wwebjsAdapter`
melakukan hidrasi chat via `getChatById(jid)` sebelum mengirim status read. Pemanggilan
ini dikendalikan oleh opsi handler `markSeen` (default aktif) sehingga seluruh
client WA dapat menandai pesan sebagai dibaca tanpa bergantung pada logika menu
pengguna. Adapter memvalidasi state chat (`chat._data`) sebelum memanggil `sendSeen`;
jika state hilang, adapter akan log warning dengan `chatId` dan `event=sendSeen`,
lalu keluar aman. Nilai `markedUnread` diperlakukan sebagai opsional dengan fallback
default, dan ketika field tidak tersedia adapter mencatat log fallback agar
troubleshooting tetap jelas. Jika chat tidak menyediakan `sendSeen` atau WhatsApp
Web masih melempar error `markedUnread`, adapter akan return `false` dan menulis
log berisi `jid` sehingga error tidak merambat ke layer atas.

Untuk pemanggilan `getChat`, adapter kini melakukan validasi awal: `jid` harus
bernilai string non-kosong dan `WidFactory` harus tersedia sebelum memanggil
`getChatById`. Jika salah satu kondisi gagal, adapter mencatat warning ringan dan
langsung mengembalikan `null` untuk mencegah error internal seperti
`Cannot read properties of undefined (reading 'update')` saat store WhatsApp Web
belum siap.

## Fallback pengiriman pesan (gateway → utama → user)

Untuk notifikasi/broadcast, helper `sendWithClientFallback` dipakai agar pengiriman
tetap berjalan ketika salah satu client WA bermasalah. Urutan fallback:

1. `waGatewayClient` (label `WA-GATEWAY`).
2. `waClient` (label `WA`).
3. `waUserClient` (label `WA-USER`).

Setiap percobaan memakai `safeSendMessage` agar readiness dan retry tetap terjaga.
Jika satu client gagal, sistem akan log ringkas yang berisi `client label`, `chatId`,
serta ringkasan error dari attempt sebelumnya sebelum melanjutkan ke client berikutnya.
Jika semua attempt gagal, helper akan:

- Mengirim ringkasan ke admin melalui `sendWAReport` (jika report client tersedia).
- Menuliskan log error terstruktur (`event=wa_fallback_failed`) agar mudah dipantau.

Pemakaian fallback ini menjadi standar untuk cron notifikasi dan pengiriman gateway
agar pesan tidak bergantung pada satu sesi WA saja.

## Fallback saat authenticated tapi tidak ready

Jika event `authenticated` muncul namun `ready` tidak datang dalam `WA_AUTH_READY_TIMEOUT_MS`
(default 45 detik), sistem akan:

1. Log warning dengan label client.
2. Coba `isReady()` / `getState()`.
3. Jika masih belum siap, trigger `connect()` ulang.

Ini membantu mengatasi kondisi “stuck setelah QR” tanpa restart manual.

## Timeout `waitForWaReady` / `waitForClientReady`

Helper `waitForWaReady`/`waitForClientReady` kini menunggu lebih lama agar
fallback readiness punya kesempatan berjalan sebelum promise reject. Default
timeout diturunkan dari kombinasi berikut:

- `WA_READY_TIMEOUT_MS` → override default timeout untuk semua client (opsional).
- Jika `WA_READY_TIMEOUT_MS` tidak diisi, default dihitung sebagai
  `max(WA_AUTH_READY_TIMEOUT_MS, WA_FALLBACK_READY_DELAY_MS + 5000)`.
- `WA_FALLBACK_READY_DELAY_MS` (default 60000ms) → jeda fallback readiness pertama.
- `WA_FALLBACK_READY_COOLDOWN_MS` (default 300000ms) → jeda cooldown setelah
  fallback reinit mencapai batas agar siklus pemulihan berikutnya tetap berjalan.
- `WA_GATEWAY_READY_TIMEOUT_MS` → override khusus client `WA-GATEWAY` (jika tidak
  diisi, otomatis memakai `WA_READY_TIMEOUT_MS` + `WA_FALLBACK_READY_DELAY_MS`).
- Override per client masih dimungkinkan lewat `client.readyTimeoutMs`
  (misalnya untuk memanjangkan timeout pada client tertentu).

Perubahan ini memastikan fallback readiness pertama sempat dijalankan sebelum
`waitForWaReady` menolak dengan error “client not ready”.

Saat timeout `waitForWaReady`/`waitForClientReady` terjadi, log sekarang
menyertakan konteks tambahan (tanpa payload QR) untuk mempercepat debugging:

- `label` → identitas client (`WA`, `WA-USER`, `WA-GATEWAY`).
- `clientId` → nilai `clientId` yang dipakai `LocalAuth`.
- `sessionPath` → lokasi folder `session-<clientId>` yang dipakai.
- `awaitingQrScan` → `true` jika sistem sedang menunggu QR discan ulang.
- `lastDisconnectReason` → reason terakhir dari event `disconnected` (atau `none`).
- `lastAuthFailureAt` → timestamp ISO dari event `auth_failure` terakhir (atau `none`).

Interpretasi cepat:

- `awaitingQrScan=true` + `lastDisconnectReason` logout/unpaired → butuh scan QR baru.
- `lastAuthFailureAt` terisi → kemungkinan session invalid atau auth gagal berulang.
- `sessionPath` memastikan folder auth yang dipakai sudah benar dan writable.
- Jika terdeteksi missing Chrome (`fatalInitError.type=missing-chrome`), helper
  akan langsung reject sebelum timer berjalan dengan error "WhatsApp client not ready:
  missing Chrome executable" beserta konteks readiness di atas agar leak resolver
  bisa dihindari. Deteksi ini kini memverifikasi executable path terlebih dulu; jika
  path ternyata bisa diakses, `fatalInitError` akan di-clear agar retry/inisialisasi
  tetap berjalan.
- `waitForWaReady`/`waitForClientReady` juga akan melakukan pengecekan ulang
  `isReady()` dan `getState()` sebelum timeout benar-benar menolak promise. Jika
  readiness bisa diinfer dari dua sinyal tersebut (misalnya event `ready`
  terlewat), helper akan menandai client siap dan menghindari timeout palsu.

## Deferral pesan gateway sebelum ready

`handleGatewayMessage` akan memanggil `waitForWaReady` untuk `waGatewayClient`
di awal proses. Jika client belum siap, pesan gateway akan **ditunda** dengan
menambahkan payload ke `pendingMessages` dan handler segera keluar tanpa
melakukan akses DB atau forward. Ketika `markClientReady` menandai client
siap, `flushPendingMessages` akan meneruskan pesan yang tertunda dengan
men-emit event `message` sehingga alur gateway berjalan seperti biasa setelah
readiness tercapai.

## Fallback readiness (retry `getState()` dan reinit)

Pada fallback readiness, `getState()` bisa mengembalikan status selain `CONNECTED/open`
ketika koneksi belum stabil atau ada glitch sementara. Sistem akan:

Catatan: fallback readiness bersifat **one-shot per siklus start/restart**. Jika
`isReady()` atau `getState()` sudah menunjukkan `CONNECTED/open`, fallback dianggap
selesai dan tidak dijadwalkan ulang hingga ada siklus baru (reset saat `qr`,
`authenticated`, `auth_failure`, disconnect/change_state yang menandakan putus,
atau saat `connect()`/`reinitialize()` dipanggil).

1. Sebelum memanggil `getState()`, fallback readiness mengecek `isReady()` sebagai sinyal
   diagnostik untuk menunda reinit jika client terlihat siap, **tanpa** menandai ready.
   `client.info` **tidak** dipakai sebagai sinyal ready; jika hanya `client.info` yang
   tersedia, log akan mencatat bahwa readiness ditunda.
2. Melakukan retry `getState()` beberapa kali (maksimal 3x) dengan jeda acak 15–30 detik.
3. Jika tetap belum `CONNECTED/open`, log alasan state terakhir dan panggil `connect()`
   ulang secara terbatas (maksimal beberapa kali per client) agar tidak loop tanpa batas.
   Setelah mencapai batas reinit, fallback readiness tetap berjalan dengan jeda cooldown
   sebelum memulai siklus retry baru (default 5 menit) agar pemulihan terus mencoba tanpa
   restart proses.
4. Untuk `WA-GATEWAY` dan `WA-USER`, fallback readiness **hanya akan clear session**
   jika ada indikasi logout/auth failure (misalnya `lastDisconnectReason` termasuk
   `LOGGED_OUT/UNPAIRED/CONFLICT/UNPAIRED_IDLE` atau event `auth_failure` tercatat)
   dan folder `session-<clientId>` masih ada. Jika tidak ada indikasi tersebut,
   sistem tetap reinit tanpa clear session agar sesi yang masih valid tidak terhapus.
   Sebelum menghapus manual, backup folder session agar autentikasi bisa dipulihkan
   bila diperlukan.
   - **Escalation khusus `WA-GATEWAY`**: bila `getState()` terus `unknown` melewati
     beberapa siklus retry, readiness akan menaikkan `unknown-state retries` dan
     memaksa `reinitialize({ clearAuthSession: true })` meskipun indikator auth
     kosong, agar gateway tidak terus-menerus stuck di state tak dikenal. Log akan
     mencatat alasan escalation serta jumlah retry yang sudah dilewati.
5. Jika `connect()` sudah berjalan (in-flight), fallback readiness akan ditunda dan
   dijadwalkan ulang agar tidak menambah retry atau reinit yang redundan.
   Saat durasi in-flight melewati ambang, log akan menyertakan durasi dan
   fallback readiness dapat memicu reinit untuk memutus koneksi yang macet.
6. Proses retry ini otomatis berhenti jika event `ready` atau `change_state` sudah terjadi,
   atau jika `isReady()`/`getState()` sudah menunjukkan koneksi `CONNECTED/open`
   (fallback ditandai selesai tanpa reschedule). `markClientReady` **hanya** dipanggil
   dari event resmi tersebut (bukan dari fallback readiness), sehingga timer authenticated
   fallback dan status `awaitingQrScan` dibersihkan saat event resmi diterima.
7. Jika status terakhir menandakan logout/unpaired, fallback readiness akan
   **menunggu QR discan ulang** sebelum mencoba `getState()` kembali.

## Guard readiness untuk `getNumberId`

Adapter `wwebjsAdapter` sekarang memastikan `getNumberId` hanya berjalan setelah
`WidFactory` ter-inject di `window.Store`. Helper `ensureWidFactory` akan:

1. Mengecek `client.pupPage` (atau `client.info?.wid` jika sudah siap).
2. Menjalankan `pupPage.evaluate` untuk memastikan `window.Store.WidFactory`
   tersedia dan menambahkan `toUserWidOrThrow` bila belum ada.
3. Mengembalikan `null` dan mencatat warning jika `WidFactory` belum tersedia,
   sehingga caller bisa retry setelah client benar-benar ready.

## Checklist troubleshooting

1. **Periksa log event**
   - Pastikan ada `qr`, `authenticated`, `ready`, dan `change_state`.
   - Jika ada `auth_failure`, hapus session folder dan scan ulang.

2. **Cek auth path**
   - Pastikan `WA_AUTH_DATA_PATH` (jika diset) writable.
   - Default path: `~/.cicero/wwebjs_auth/`.

3. **`Could not find Chrome` / `Could not find browser`**
   - whatsapp-web.js memakai Puppeteer untuk menjalankan Chrome.
   - Install Chrome lewat `npx puppeteer browsers install chrome` (menggunakan cache Puppeteer) atau via package OS (Chrome/Chromium).
   - Jika Chrome sudah terpasang atau path cache diubah, set `WA_PUPPETEER_EXECUTABLE_PATH`
     (prioritas) atau `PUPPETEER_EXECUTABLE_PATH`, dan/atau `PUPPETEER_CACHE_DIR`.
   - Jika env path kosong, adapter akan mencari Chrome di cache Puppeteer. Cache memakai
     `PUPPETEER_CACHE_DIR` bila di-set, jika tidak fallback ke `~/.cache/puppeteer`.
     Adapter memilih folder `chrome/linux-*/chrome-linux64/chrome` dengan versi tertinggi
     dan hanya memakai path yang lolos `X_OK`. Contoh path cache:
     `/home/gonet/.cache/puppeteer/chrome/linux-143.0.7499.192/chrome-linux64/chrome`.
   - Jika env path kosong, adapter akan mencoba beberapa path umum (mis. `/usr/bin/google-chrome`,
     `/usr/bin/chromium-browser`, `/usr/bin/chromium`, `/opt/google/chrome/chrome`) dan menulis log
     `Resolved Puppeteer executable` sekali saat inisialisasi (termasuk `clientId` dan sumber).
   - Contoh log yang sering muncul: `Error: Could not find Chrome (ver. 121.0.6167.85)` atau `Error: Could not find browser executable`.
   - Inisialisasi akan menganggap error ini sebagai fatal dan **melewati retry otomatis** sampai Chrome tersedia, tetapi hanya setelah path executable diverifikasi tidak tersedia/invalid.
   - Jika executable path valid, error dianggap misleading, `fatalInitError` di-clear, dan retry/inisialisasi tetap berjalan.
   - Error readiness terkait Chrome kini menyertakan hint: “Set `WA_PUPPETEER_EXECUTABLE_PATH` atau jalankan `npx puppeteer browsers install chrome`”.
   - Saat error ini muncul dengan `WA_PUPPETEER_EXECUTABLE_PATH`/`PUPPETEER_EXECUTABLE_PATH` terisi, log menampilkan `resolvedPath`, `stat.mode`, dan kode error `access` (mis. `EACCES`, `ENOENT`) plus hint perbaikan seperti `chmod +x` atau `mount -o remount,exec` bila relevan.
   - **Chrome terpasang tetapi tidak bisa dieksekusi**
     - Pastikan `WA_PUPPETEER_EXECUTABLE_PATH` menunjuk ke binary yang benar (contoh: `/usr/bin/google-chrome`).
     - Verifikasi permission dengan `ls -l /usr/bin/google-chrome` dan pastikan bit eksekusi aktif (contoh output: `-rwxr-xr-x`).
     - Jika mount berstatus `noexec`, Chrome akan terlihat seperti “missing Chrome executable” meskipun file ada; remount dengan `exec` atau pindahkan binary ke path yang bisa dieksekusi.

4. **Stuck setelah authenticated**
   - Lihat warning fallback: “Authenticated but no ready event”.
   - Jika ada warning `getState=<state>`, tunggu retry selesai.
     Sistem akan mencoba `connect()` ulang secara otomatis jika state tetap belum
     `CONNECTED/open`.
   - Pastikan network untuk WhatsApp Web tidak diblokir.

5. **Sering disconnect**
   - Pastikan session valid dan host tidak sleep.
   - Periksa log `disconnected` untuk reason.

6. **connect() hard failure**
   - Periksa log `Initialization failed (hard failure)` dan root cause error.
   - Tunggu retry backoff yang lebih panjang, atau lakukan reinit manual jika perlu.
   - Pastikan konfigurasi `WA_WEB_VERSION` / `WA_WEB_VERSION_CACHE_URL` valid dan
     path `WA_AUTH_DATA_PATH` writable.

## Referensi kode

- `src/service/waService.js`: event handler `qr`, `authenticated`, `auth_failure`, `ready`, `change_state`, `disconnected`.
- `src/service/wwebjsAdapter.js`: konfigurasi `LocalAuth`, `WA_AUTH_DATA_PATH`, dan penanganan writable path.
