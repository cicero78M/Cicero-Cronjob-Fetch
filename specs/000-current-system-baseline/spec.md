# Current System Baseline: Cicero Social Media Fetch

**Status**: Baseline — audit 2026-10-24  
**Runtime**: PM2 `fetch`, online  
**Entry**: `app.js` → `src/cron/cronManifest.js` and `src/cron/cronDirRequestFetchSosmed.js`

## Purpose

Fetch Instagram and TikTok posts and engagement for active clients, persist normalized records, and publish operational notifications through the WhatsApp outbox. This document describes the current system; it is not authorization to change business rules.

## Topology and structure

```text
cron → handler/fetchpost + handler/fetchengagement
     → service (RapidAPI, client, notification, locking)
     → model/repository → PostgreSQL/Redis
     → cronWaOutboxWorker → WhatsApp gateway
```

Key modules: `src/cron/`, `src/handler/fetchpost/`, `src/handler/fetchengagement/`, `src/service/`, `src/model/`, `src/db/`.

## Current capabilities

- Scheduled Instagram/TikTok post collection and like/comment refresh.
- Jakarta-time slot gating via `shouldFetchPostsForClient` and `resolveClientFetchSegment`.
- Active-client and platform-account filtering, distributed-lock protection, retries and bounded HTTP timeouts.
- Persistence for clients, posts, likes, comments, snapshots, and notification outbox records.
- WhatsApp task/log delivery through the outbox worker; no direct send may be introduced in cron paths.

## Safety invariants

- Do not alter cron slots or client segment gates without an explicit feature spec and regression tests.
- Engagement refresh remains independent from post-fetch gating.
- Use parameterized DB access and existing models/services; do not change schema implicitly at runtime.
- A fetch failure for one client/platform must not abort other clients in the same cycle.
- Never duplicate a WhatsApp session owner or commit auth state/credentials.

## Acceptance checks

- `npm run lint`, `npm test`, and the fetch-focused test command pass.
- A dry code review confirms changed files are limited to the requested feature and documentation.
- PM2 process remains online and no scheduler/outbox ownership changes occur as a documentation-only update.
