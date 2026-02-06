# Cicero Enterprise Architecture
*Last updated: 2025-11-06*

This document provides a high level overview of the architecture behind Cicero Web, consisting of a **backend** service (`Cicero_V2`) and a **Next.js** based dashboard (`cicero-dashboard`).

## Overview

- **Frontend**: Next.js application located in `cicero-dashboard` (see the [Cicero Web repository](https://github.com/cicero78M/Cicero_Web)).
- **Backend**: Node.js/Express REST API located in this repository.
- **Database**: PostgreSQL (with optional support for MySQL or SQLite via the database adapter).
- **Queue**: RabbitMQ for high‑volume asynchronous jobs.
- **Cache/Session**: Redis for caching and session storage.
- **Messaging**: Dual WhatsApp sessions powered by `whatsapp-web.js` (operator-facing `waClient` and broadcast-oriented `waGatewayClient`).
- **External APIs**: Instagram and TikTok data fetched through RapidAPI.

## Components

### Backend (`Cicero_V2`)

The backend exposes REST endpoints to manage clients, users, and social media analytics. Key modules include:

- `app.js` – Express entry point registering middleware, routes, and scheduled cron buckets based on WhatsApp readiness.
- `src/controller` – Controller layer for clients, users, OAuth callbacks, dashboard metrics, editorial events, aggregator feeds, premium flows, and social media endpoints.
- `src/service` – Cron helpers, API wrappers, WhatsApp helpers, OTP/email delivery, Google contact sync, RabbitMQ queues, and various utility functions.
- `src/handler` – WhatsApp menu logic, link amplification processors, and fetch helpers for automation.
- `src/routes` – API routes for auth, clients, users, Instagram/TikTok, logs, metadata, dashboards, aggregator widgets, Penmas editorial workflows, OTP claim flows, premium requests, and link amplification.
- `src/middleware` – Authentication (JWT, dashboard, Penmas), request deduplication, debugging, and global error handling.
- `src/repository` – Database helper queries.
- `src/model` – Database models for clients, users, social media posts, metrics, and visitor logs.
- `src/config` – Environment management (`env.js`) and Redis connection (`redis.js`).

### Frontend (`cicero-dashboard`)

Located in the separate `Cicero_Web/cicero-dashboard` directory. The dashboard communicates with the backend using helper functions defined in `utils/api.ts`. Key aspects:

- Built with Next.js 14 using TypeScript and Tailwind CSS.
- Custom React hooks and context provide authentication and global state management.
- Pages under `app/` render analytics views for Instagram and TikTok, user directories, and client info.
- Environment variable `NEXT_PUBLIC_API_URL` configures the backend base URL.

## Integration Flow

1. **Authentication**
   - Dashboard or Android user logs in via `/api/auth/dashboard-login`, `/api/auth/login`, or `/api/auth/user-login` and receives a JWT. OTP-based data claims start with `/api/claim/request-otp` and continue after verifying the emailed code.
   - Backend returns a JWT token stored in `localStorage` on the frontend (dashboard) or in secure storage on the mobile app.
   - Subsequent requests attach `Authorization: Bearer <token>` header or reuse the `token` HTTP-only cookie.

2. **Data Retrieval**
   - Dashboard calls backend endpoints (e.g., `/api/insta/rapid-posts`) using the helper functions in `utils/api.ts`.
   - Backend fetches data from RapidAPI (Instagram/TikTok) if necessary and stores results in PostgreSQL and Redis cache.
   - Responses are normalized so the frontend receives consistent field names regardless of the upstream API format.

3. **Notifications & Editorial Actions**
   - Cron buckets run in the backend to fetch new posts, calculate stats, deliver link amplification recaps, and send WhatsApp notifications to administrators.
   - Penmas editorial events trigger approval requests that notify administrators through WhatsApp commands handled by `waService.js`.

4. **Queue Processing**
- High‑volume tasks can be published to RabbitMQ using `src/service/rabbitMQService.js` for asynchronous processing.
- OTP emails are dispatched synchronously through `src/service/otpQueue.js` → `src/service/emailService.js`, eliminating the earlier background worker delay.

## Deployment Considerations

- Both frontend and backend are Node.js applications and can run on the same host or separately.
- Environment variables are managed via `.env` files (`.env` for backend, `.env.local` for frontend).
- Use PM2 for clustering and process management in production.
- Monitor PostgreSQL, Redis, and RabbitMQ health for reliability.

## Diagram

Below is a conceptual diagram of the main components and their interactions:

```
+-------------+      HTTPS       +--------------+
|  Browser    | <--------------> |  Next.js UI  |
+-------------+                  +--------------+
        |                               |
        | REST API calls                 | fetch() via utils/api.ts
        v                               v
+-------------+     Express      +----------------+
|  Backend    | <--------------> |  PostgreSQL DB |
|  (Node.js)  |                  +----------------+
+-------------+
     |  ^            Redis & RabbitMQ            ^
     |  |--------------------------------------- |
     |        External Services (Instagram, TikTok, WhatsApp, SMTP, Google People API)
     |             via RapidAPI, whatsapp-web.js, Nodemailer, Google SDK
```

The frontend communicates only with the backend. The backend orchestrates data retrieval, persistence, caching, and messaging integrations.


Refer to [docs/naming_conventions.md](naming_conventions.md) for code style guidelines.
