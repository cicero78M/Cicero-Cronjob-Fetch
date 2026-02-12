import {
  claimPendingOutboxBatch,
  markOutboxDeadLetter,
  markOutboxRetry,
  markOutboxSent,
  releaseProcessingOutbox,
} from '../model/waNotificationOutboxModel.js';
import { waGatewayClient } from './waService.js';
import { safeSendMessage } from '../utils/waHelper.js';

const LOG_TAG = 'WA_OUTBOX_WORKER';
const DEFAULT_BATCH_SIZE = 20;
const BASE_DELAY_SECONDS = 30;
const MAX_BACKOFF_SECONDS = 3600;

function computeBackoffSeconds(attemptCount) {
  const exponent = Math.max(0, Number(attemptCount || 1) - 1);
  return Math.min(BASE_DELAY_SECONDS * (2 ** exponent), MAX_BACKOFF_SECONDS);
}

function buildErrorMessage(error) {
  if (!error) return 'unknown_error';
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`.slice(0, 800);
  }
  return String(error).slice(0, 800);
}

function nextAttemptAtIso(attemptCount) {
  const delaySeconds = computeBackoffSeconds(attemptCount);
  return new Date(Date.now() + delaySeconds * 1000).toISOString();
}

export async function processWaOutboxBatch(batchSize = DEFAULT_BATCH_SIZE) {
  const releasedCount = await releaseProcessingOutbox();
  if (releasedCount > 0) {
    console.warn(`[${LOG_TAG}] Released ${releasedCount} stale processing rows back to retrying status`);
  }

  const rows = await claimPendingOutboxBatch(batchSize);
  if (rows.length === 0) {
    return { claimedCount: 0, sentCount: 0, retriedCount: 0, deadLetterCount: 0 };
  }

  let sentCount = 0;
  let retriedCount = 0;
  let deadLetterCount = 0;

  for (const row of rows) {
    try {
      const sendResult = await safeSendMessage(waGatewayClient, row.group_id, row.message);

      if (!sendResult) {
        throw new Error('safeSendMessage returned false');
      }

      await markOutboxSent(row.outbox_id);
      sentCount += 1;
    } catch (error) {
      const errorMessage = buildErrorMessage(error);
      const maxAttempts = Number(row.max_attempts || 5);
      const attemptCount = Number(row.attempt_count || 1);

      if (attemptCount >= maxAttempts) {
        await markOutboxDeadLetter(row.outbox_id, errorMessage);
        deadLetterCount += 1;
        console.error(`[${LOG_TAG}] Dead-letter outbox_id=${row.outbox_id} after ${attemptCount} attempts: ${errorMessage}`);
      } else {
        const nextAttemptAt = nextAttemptAtIso(attemptCount);
        await markOutboxRetry(row.outbox_id, errorMessage, nextAttemptAt);
        retriedCount += 1;
        console.warn(
          `[${LOG_TAG}] Retry scheduled outbox_id=${row.outbox_id} attempt=${attemptCount}/${maxAttempts} next_attempt_at=${nextAttemptAt}: ${errorMessage}`
        );
      }
    }
  }

  return {
    claimedCount: rows.length,
    sentCount,
    retriedCount,
    deadLetterCount,
  };
}
