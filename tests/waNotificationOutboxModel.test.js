import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockWithTransaction = jest.fn();

jest.unstable_mockModule('../src/repository/db.js', () => ({
  query: mockQuery,
  withTransaction: mockWithTransaction,
}));

const {
  enqueueOutboxEvents,
  claimPendingOutboxBatch,
  markOutboxSent,
  markOutboxRetry,
  markOutboxDeadLetter,
  releaseProcessingOutbox,
} = await import('../src/model/waNotificationOutboxModel.js');

describe('waNotificationOutboxModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('enqueueOutboxEvents inserts rows and tracks duplicates', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 0 });

    const result = await enqueueOutboxEvents([
      { clientId: 'A', groupId: 'g1@g.us', message: 'm1', idempotencyKey: 'k1' },
      { clientId: 'A', groupId: 'g1@g.us', message: 'm1', idempotencyKey: 'k1' },
    ]);

    expect(result).toEqual({ insertedCount: 1, duplicatedCount: 1 });
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  test('claimPendingOutboxBatch locks and marks processing in one transaction', async () => {
    const txQuery = jest.fn().mockResolvedValue({ rows: [{ outbox_id: 10 }] });
    mockWithTransaction.mockImplementation(async (fn) => fn({ query: txQuery }));

    const rows = await claimPendingOutboxBatch(5);

    expect(rows).toEqual([{ outbox_id: 10 }]);
    expect(txQuery).toHaveBeenCalledTimes(1);
    expect(txQuery.mock.calls[0][1]).toEqual([['pending', 'retrying'], 5]);
  });


  test('releaseProcessingOutbox only releases stale processing rows', async () => {
    mockQuery.mockResolvedValue({ rowCount: 2 });

    const releasedCount = await releaseProcessingOutbox(600);

    expect(releasedCount).toBe(2);
    expect(mockQuery).toHaveBeenCalledTimes(1);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("WHERE status = 'processing'");
    expect(sql).toContain('COALESCE(last_attempt_at, updated_at, created_at)');
    expect(params).toEqual([600]);
  });

  test('mark helpers update delivery status columns', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    await markOutboxSent(1);
    await markOutboxRetry(2, 'error', '2026-01-01T00:00:00.000Z');
    await markOutboxDeadLetter(3, 'fatal');

    expect(mockQuery).toHaveBeenCalledTimes(3);

    const sentSql = mockQuery.mock.calls[0][0];
    const retrySql = mockQuery.mock.calls[1][0];
    const deadLetterSql = mockQuery.mock.calls[2][0];

    expect(sentSql).not.toContain('next_attempt_at = NULL');
    expect(sentSql).not.toContain('next_attempt_at =');

    expect(retrySql).toContain('next_attempt_at = $3');

    expect(deadLetterSql).not.toContain('next_attempt_at = NULL');
    expect(deadLetterSql).toContain('next_attempt_at = NOW()');
  });
});
