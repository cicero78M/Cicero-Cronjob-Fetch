import { query, withTransaction } from '../repository/db.js';

const OUTBOX_PENDING_STATUSES = ['pending', 'retrying'];

export async function enqueueOutboxEvents(events = []) {
  if (!Array.isArray(events) || events.length === 0) {
    return { insertedCount: 0, duplicatedCount: 0 };
  }

  let insertedCount = 0;

  for (const event of events) {
    const res = await query(
      `INSERT INTO wa_notification_outbox (
        client_id,
        group_id,
        message,
        idempotency_key,
        status,
        max_attempts,
        attempt_count,
        next_attempt_at
      )
      VALUES ($1, $2, $3, $4, 'pending', COALESCE($5, 5), 0, NOW())
      ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        event.clientId,
        event.groupId,
        event.message,
        event.idempotencyKey,
        event.maxAttempts,
      ]
    );

    insertedCount += res.rowCount || 0;
  }

  return {
    insertedCount,
    duplicatedCount: events.length - insertedCount,
  };
}

export async function claimPendingOutboxBatch(limit = 20) {
  const safeLimit = Math.max(1, Number(limit) || 20);

  return withTransaction(async (client) => {
    const res = await client.query(
      `WITH candidate AS (
         SELECT outbox_id
         FROM wa_notification_outbox
         WHERE status = ANY($1::text[])
           AND next_attempt_at <= NOW()
         ORDER BY created_at ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED
       )
       UPDATE wa_notification_outbox o
       SET status = 'processing',
           attempt_count = o.attempt_count + 1,
           last_attempt_at = NOW(),
           updated_at = NOW()
       FROM candidate c
       WHERE o.outbox_id = c.outbox_id
       RETURNING o.*`,
      [OUTBOX_PENDING_STATUSES, safeLimit]
    );

    return res.rows || [];
  });
}

export async function markOutboxSent(outboxId) {
  await query(
    `UPDATE wa_notification_outbox
     SET status = 'sent',
         sent_at = NOW(),
         error_message = NULL,
         updated_at = NOW()
     WHERE outbox_id = $1`,
    [outboxId]
  );
}

export async function markOutboxRetry(outboxId, errorMessage, nextAttemptAtIso) {
  await query(
    `UPDATE wa_notification_outbox
     SET status = 'retrying',
         error_message = $2,
         next_attempt_at = $3,
         updated_at = NOW()
     WHERE outbox_id = $1`,
    [outboxId, errorMessage, nextAttemptAtIso]
  );
}

export async function markOutboxDeadLetter(outboxId, errorMessage) {
  await query(
    `UPDATE wa_notification_outbox
     SET status = 'dead_letter',
         error_message = $2,
         next_attempt_at = NOW(),
         updated_at = NOW()
     WHERE outbox_id = $1`,
    [outboxId, errorMessage]
  );
}

export async function releaseProcessingOutbox() {
  const res = await query(
    `UPDATE wa_notification_outbox
     SET status = 'retrying',
         updated_at = NOW()
     WHERE status = 'processing'`
  );

  return res.rowCount || 0;
}
