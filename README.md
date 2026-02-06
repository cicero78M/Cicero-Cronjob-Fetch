# Cicero Social Media Fetch CronJob

A lightweight Node.js application that automatically fetches social media data (posts, likes, and comments) from Instagram and TikTok accounts.

## Overview

This service runs scheduled cron jobs to:
- Fetch Instagram posts, likes, and comments
- Fetch TikTok posts and comments
- Store all data in PostgreSQL database

## Features

- **Automated Fetching**: Runs every 30 minutes from 6 AM to 10 PM (Jakarta time)
- **Multi-Platform Support**: Instagram and TikTok
- **Engagement Tracking**: Posts, likes, and comments
- **Database Storage**: All data stored in PostgreSQL
- **Client Management**: Supports multiple social media accounts
- **Error Handling**: Robust error logging and recovery

## Requirements

- Node.js v20+
- PostgreSQL database
- RapidAPI keys for Instagram and TikTok APIs
- Redis (for caching)

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

# API Keys
RAPIDAPI_KEY=your_rapidapi_key_here
RAPIDAPI_INSTAGRAM_HOST=social-api4.p.rapidapi.com
RAPIDAPI_TIKTOK_HOST=tiktok-api23.p.rapidapi.com

# Environment
NODE_ENV=production
```

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
- Every 30 minutes from 6:00 AM to 9:30 PM
- Once at 10:00 PM

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

## License

MIT

## Author

Rizqo Febryan Prastyo
