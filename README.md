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
  - Posts fetch every 30 minutes from 6 AM to 4:30 PM (Jakarta time)
  - Engagement tracking (likes & comments) every 30 minutes from 6 AM to 10 PM (Jakarta time)
- **Multi-Platform Support**: Instagram and TikTok
- **Engagement Tracking**: Posts, likes, and comments
- **Database Storage**: All data stored in PostgreSQL
- **Client Management**: Supports multiple social media accounts
- **Error Handling**: Robust error logging and recovery
- **WhatsApp Notifications**: Hourly task notifications from 6 AM to 4:30 PM via WA Gateway
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

### Post Fetch (06:00 - 16:30)
- Runs every 30 minutes: 6:00, 6:30, 7:00, ..., 16:00, 16:30
- Fetches Instagram posts, TikTok posts, Instagram likes, and TikTok comments
- Sends task notifications every hour

### Engagement Only (17:30 - 22:00)
- Runs every 30 minutes: 17:30, 18:00, 18:30, ..., 21:30, 22:00
- Only fetches Instagram likes and TikTok comments (no posts)
- No task notifications sent during this period

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
