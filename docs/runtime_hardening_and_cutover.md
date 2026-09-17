# Fetch runtime hardening and cutover

## Safe defaults on the new server

The new-server PM2 entry keeps Fetch in standby until cutover:

- `FETCH_SCHEDULER_ENABLED=false`
- `WA_OUTBOX_ENABLED=false`
- `WA_LOG_CLIENT_ENABLED=false`
- `CRON_STATUS_LOOKUP_STRATEGY=fail_closed`

Start the standby definition from the repository root with
`ecosystem.config.cjs`. It is pinned to one fork-mode instance, disables file
watching, and uses capped PM2 restart backoff to avoid restart storms.

Do not enable the new WhatsApp consumers while the old Fetch process owns its sessions.

## Bounded runtime settings

| Setting | Default | Purpose |
| --- | ---: | --- |
| `HTTP_REQUEST_TIMEOUT_MS` | 45000 | Bounds Instagram and TikTok HTTP calls. |
| `DB_CONNECT_TIMEOUT_MS` | 5000 | Bounds PostgreSQL connection establishment. |
| `DB_QUERY_TIMEOUT_MS` | 60000 | Bounds PostgreSQL query and statement execution. |
| `DB_IDLE_TIMEOUT_MS` | 30000 | Releases idle pool connections. |
| `DB_POOL_MAX` | 10 | Caps PostgreSQL concurrency. |
| `REDIS_CONNECT_TIMEOUT_MS` | 5000 | Bounds Redis connection establishment. |

The cron lock renews its lease while a run is active. Queued client work is skipped if the lease is lost or the run deadline is reached.

## Read-only preflight

Run `npm run preflight` with the production-equivalent environment supplied by the host. The command never sends WhatsApp messages or writes application data. It checks required configuration, PostgreSQL schema, Redis, and provider fallback configuration.

Preflight must report `"ok": true` before cutover.

## Release gates

1. `npm run lint` passes.
2. `npm run test:fetch` passes.
3. `npm run preflight` passes from the new host.
4. TikTok primary subscription is valid and the fallback is below its rate limit.
5. Old-server outbox has no `pending`, `retrying`, or stale `processing` rows.
6. No active Fetch cron run holds `cron:dirfetch:sosmed`.
7. A backup of the old PM2 definition and WhatsApp auth state exists.

## Cutover order

1. Wait for an old-server fetch cycle to finish.
2. Stop old Fetch and verify its PID is gone.
3. Start new Fetch with the scheduler enabled but WhatsApp workers disabled.
4. Validate one targeted fetch and its database result.
5. Transfer the WhatsApp session while both consumers are stopped.
6. Enable the new outbox and log consumers, then validate readiness.
7. Keep the old process stopped but intact through the observation window.

## Automatic rollback conditions

Stop the new process before restarting the old process when any of these occur:

- three consecutive PostgreSQL or Redis failures;
- the cron lease is lost;
- a run misses its bounded runtime;
- TikTok primary and fallback both fail;
- `Bad MAC` or `BAD_SESSION` repeats;
- the outbox backlog or dead-letter count increases.

Never run old and new WhatsApp consumers simultaneously.
