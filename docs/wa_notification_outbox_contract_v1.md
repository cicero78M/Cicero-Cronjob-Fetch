# PostgreSQL WhatsApp Notification Outbox Contract v1

Status: documentation and test baseline only; no runtime or schema change.

This contract is separate from the BullMQ `wa-outbox` contract used by the Web
Backend and the intended Baileys-User worker.

## Owner and path

- producer: Fetch notification services;
- persistence: PostgreSQL table `wa_notification_outbox`;
- dispatcher: Fetch cron module `cronWaOutboxWorker.js`;
- delivery adapter: Fetch `waGatewayClient` through `safeSendMessage`;
- schedule: every minute, subject to the existing cron manifest/configuration.

## Durable envelope

Each row contains `client_id`, `group_id`, `message`, and a unique
`idempotency_key`. The unique key and `ON CONFLICT DO NOTHING` prevent duplicate
enqueueing for the same logical notification.

## State machine

```text
pending -> processing -> sent
pending -> processing -> retrying -> processing
pending -> processing -> dead_letter
processing (stale) -> retrying
```

Claims use a transaction with `FOR UPDATE SKIP LOCKED`. Retry uses bounded
exponential backoff and `max_attempts`; stale processing rows are released
after the configured threshold.

## Safety gates

- This worker must not be treated as a BullMQ worker or merged into the
  BullMQ `wa-outbox` ownership decision.
- Any schema, index, status, retry, or dispatcher change requires a staging
  test and a rollback plan.
- Do not run a production replay, retry, or cleanup from this contract.
- Delivery is an external side effect; database idempotency prevents duplicate
  enqueueing but cannot guarantee exactly-once WhatsApp delivery after a
  network timeout. Cutover must account for this ambiguity.
- Observe counts and ages by state, stale-processing count, retry/dead-letter
  rate, and gateway errors before changing ownership or namespace.

## Verified baseline

The existing Fetch unit suite covering the outbox worker, claiming,
retry/dead-letter behavior, distributed locking, and related fetch paths
passed **27/27** in an isolated test run. No production database or gateway
connection was used by that test run.

## Staging observability gate

A read-only inspection of the masked PostgreSQL clone on server 3 confirmed
the expected 14-column table shape and found:

- `sent`: 13,916 rows;
- `dead_letter`: 141 rows;
- `processing` rows stale beyond five minutes: 0.

This is a staging snapshot only. No production database was queried, and no
row was inserted, updated, retried, or deleted.

## Migration boundary

The PostgreSQL outbox and BullMQ queue require separate owners, metrics,
idempotency keys, retry policies, and cutover plans. No namespace migration,
permission restriction, worker startup, or database change is authorized by
this document.
