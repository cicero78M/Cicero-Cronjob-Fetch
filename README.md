# Cicero Social Media Fetch CronJob

A lightweight Node.js application that automatically fetches social media data (posts, likes, and comments) from Instagram and TikTok accounts.

## Overview

This service runs scheduled cron jobs to:
- Fetch Instagram posts, likes, and comments
- Fetch TikTok posts and comments
- Store all data in PostgreSQL database
- Send task notifications via WhatsApp Gateway
- Send system logs and errors via WhatsApp to admin numbers

## Features

- **Automated Fetching**: 
  - Post fetch + engagement refresh mengikuti cron `5,30 6-16 * * *` + slot wajib `0 17 * * *` (06:05, 06:30, ... , 16:05, 16:30, 17:00 WIB)
  - Engagement-only (likes & comments) mengikuti cron `30 17-21 * * *` dan `0 18-22 * * *` (17:30 s.d. 22:00 WIB)
- **Multi-Platform Support**: Instagram and TikTok
- **Engagement Tracking**: Posts, likes, and comments
- **Database Storage**: All data stored in PostgreSQL
- **Client Management**: Supports multiple social media accounts
- **Error Handling**: Robust error logging and recovery
- **WhatsApp Notifications**: Hourly task notifications from 06:00-17:59 WIB (termasuk slot wajib 17:00) via WA Gateway
- **WhatsApp Logging**: System logs and errors sent to admin WhatsApp numbers

## Requirements

- Node.js v20+
- PostgreSQL database
- RapidAPI keys for Instagram and TikTok APIs
- Redis (for caching)
- WhatsApp using Baileys (for both task notifications and system logs)

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file based on `.env.example`:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/cicero

# Redis
REDIS_URL=redis://localhost:6379

# WhatsApp Admin (for system logs and errors)
ADMIN_WHATSAPP=628xxxxxx,628yyyyyy

# WhatsApp Gateway (for social media task notifications)
GATEWAY_WHATSAPP_ADMIN=628xxxxxx,628yyyyyy
GATEWAY_WA_CLIENT_ID=wa-gateway-prod

# API Keys
RAPIDAPI_KEY=your_rapidapi_key_here
RAPIDAPI_INSTAGRAM_HOST=social-api4.p.rapidapi.com
RAPIDAPI_TIKTOK_HOST=tiktok-api23.p.rapidapi.com

# Environment
NODE_ENV=production
```

### Setting up WhatsApp for Logs

1. Ensure you have WhatsApp installed on your phone
2. Add admin WhatsApp numbers to `ADMIN_WHATSAPP` in `.env` (comma-separated, format: 628xxxxxx)
3. On first run, the system will display a QR code for the log client
4. Scan the QR code with WhatsApp to authenticate
5. System logs, errors, and cron reports will be sent to the admin numbers

## Usage

### Start the service

```bash
npm start
```

### Development mode with auto-reload

```bash
npm run dev
```

## Cron Schedule

The fetch job runs on the following schedule (Asia/Jakarta timezone):

### Unified Fetch + Engagement Refresh (`0,30` + final `:58`)
- Cron gabungan: `0,30 6-21 * * *` + `58 20-21 * * *`
- Runs at: 06:00, 06:30, 07:00, 07:30, ..., 20:30, 20:58, 21:00, 21:30, 21:58
- Setiap run selalu refresh Instagram likes + TikTok comments
- Fetch post Instagram/TikTok mengikuti segmentasi runtime client:
  - **Segmen A** (`org` / `ditbinmas`) valid hingga 20:58 WIB
  - **Segmen B** (`direktorat` selain `ditbinmas`) valid hingga 21:58 WIB
- Di luar slot valid segmen, proses tetap berjalan untuk engagement refresh dengan `skipPostFetch=true`
- Notifikasi daftar tugas bersifat **change-driven only**: hanya dikirim saat ada perubahan data post/link (`hasNotableChanges`), tanpa blast terjadwal per jam


## Operational Notes

- `telegramService` adalah wrapper WA untuk backward compatibility. Meski namanya `telegram`, implementasi saat ini dipakai untuk kanal logging/error ke WhatsApp admin.
- Source of truth jadwal + flow notifikasi: [docs/notification_schedule_source_of_truth.md](docs/notification_schedule_source_of_truth.md).

## Checklist Wajib Update Dokumentasi (Perubahan Fungsi/Modul)

Setiap perubahan fungsi/module **wajib** mengaudit dan memperbarui dokumentasi terdampak:
- `README.md`
- `docs/business_process.md`
- `docs/scheduled_notifications.md`
- dokumen `docs/wa_*.md` yang relevan
- `docs/notification_schedule_source_of_truth.md` jika jadwal/flow berubah


### PM2 Deploy Checklist (Baileys Session Ownership)

- [ ] Jangan jalankan lebih dari satu process untuk `clientId` yang sama.
- [ ] Jangan share auth path antar service tanpa ownership yang jelas (`WA_AUTH_DATA_PATH` + `clientId` harus punya owner tunggal).
- [ ] Opsional fail-fast: set `WA_BAILEYS_STRICT_SINGLE_OWNER=true` agar process exit saat lock conflict `WA_BAILEYS_SHARED_SESSION_LOCK`.

## Database Schema

The application uses the following main tables:
- `clients` - Social media account configurations
- `insta_post` - Instagram posts
- `insta_like` - Instagram likes
- `tiktok_post` - TikTok posts
- `tiktok_comment` - TikTok comments

## Project Structure

```
src/
├── cron/               # Cron job definitions
├── handler/            # Fetch handlers
│   ├── fetchpost/      # Post fetching logic
│   └── fetchengagement/# Likes & comments fetching
├── model/              # Database models
├── service/            # External API services
├── utils/              # Utility functions
├── config/             # Configuration
└── db/                 # Database connection
```

## Scripts

- `npm start` - Start the application
- `npm run dev` - Start in development mode with nodemon
- `npm test` - Run tests
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## Documentation

For detailed documentation, see the `docs/` directory:

- [Bad MAC Error Handling](docs/bad_mac_error_handling.md) - Automatic recovery from WhatsApp session errors
- [Baileys Migration Guide](docs/baileys_migration_guide.md) - WhatsApp library migration details
- [WhatsApp Troubleshooting](docs/wa_troubleshooting.md) - Common WhatsApp issues and solutions

## License

MIT

## Author

Rizqo Febryan Prastyo
