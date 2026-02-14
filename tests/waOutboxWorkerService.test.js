import { jest } from '@jest/globals';

const mockClaimPendingOutboxBatch = jest.fn();
const mockMarkOutboxSent = jest.fn();
const mockMarkOutboxRetry = jest.fn();
const mockMarkOutboxDeadLetter = jest.fn();
const mockReleaseProcessingOutbox = jest.fn();
const mockSafeSendMessage = jest.fn();

jest.unstable_mockModule('../src/model/waNotificationOutboxModel.js', () => ({
  claimPendingOutboxBatch: mockClaimPendingOutboxBatch,
  markOutboxSent: mockMarkOutboxSent,
  markOutboxRetry: mockMarkOutboxRetry,
  markOutboxDeadLetter: mockMarkOutboxDeadLetter,
  releaseProcessingOutbox: mockReleaseProcessingOutbox,
}));

jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  safeSendMessage: mockSafeSendMessage,
}));

jest.unstable_mockModule('../src/service/waService.js', () => ({
  waGatewayClient: { id: 'gateway' },
}));

const { processWaOutboxBatch } = await import('../src/service/waOutboxWorkerService.js');

describe('waOutboxWorkerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.WA_OUTBOX_PROCESSING_STALE_SECONDS;
    mockReleaseProcessingOutbox.mockResolvedValue(0);
  });

  test('marks sent row when WhatsApp send succeeds', async () => {
    mockClaimPendingOutboxBatch.mockResolvedValue([
      { outbox_id: 1, group_id: 'g1@g.us', message: 'm', attempt_count: 1, max_attempts: 5 },
    ]);
    mockSafeSendMessage.mockResolvedValue(true);

    const result = await processWaOutboxBatch(10);

    expect(result).toEqual({ claimedCount: 1, sentCount: 1, retriedCount: 0, deadLetterCount: 0 });
    expect(mockReleaseProcessingOutbox).toHaveBeenCalledWith(300);
    expect(mockMarkOutboxSent).toHaveBeenCalledWith(1);
  });

  test('uses env-configured stale threshold when releasing processing rows', async () => {
    process.env.WA_OUTBOX_PROCESSING_STALE_SECONDS = '900';
    mockClaimPendingOutboxBatch.mockResolvedValue([]);

    const result = await processWaOutboxBatch(10);

    expect(result).toEqual({ claimedCount: 0, sentCount: 0, retriedCount: 0, deadLetterCount: 0 });
    expect(mockReleaseProcessingOutbox).toHaveBeenCalledWith(900);
  });

  test('schedules retry with backoff when send fails before max attempts', async () => {
    mockClaimPendingOutboxBatch.mockResolvedValue([
      { outbox_id: 2, group_id: 'g1@g.us', message: 'm', attempt_count: 2, max_attempts: 5 },
    ]);
    mockSafeSendMessage.mockResolvedValue(false);

    const result = await processWaOutboxBatch(10);

    expect(result).toEqual({ claimedCount: 1, sentCount: 0, retriedCount: 1, deadLetterCount: 0 });
    expect(mockMarkOutboxRetry).toHaveBeenCalledTimes(1);
    expect(mockMarkOutboxDeadLetter).not.toHaveBeenCalled();
  });

  test('moves row to dead letter when max attempts reached', async () => {
    mockClaimPendingOutboxBatch.mockResolvedValue([
      { outbox_id: 3, group_id: 'g1@g.us', message: 'm', attempt_count: 5, max_attempts: 5 },
    ]);
    mockSafeSendMessage.mockRejectedValue(new Error('network down'));

    const result = await processWaOutboxBatch(10);

    expect(result).toEqual({ claimedCount: 1, sentCount: 0, retriedCount: 0, deadLetterCount: 1 });
    expect(mockMarkOutboxDeadLetter).toHaveBeenCalledWith(3, expect.stringContaining('network down'));
  });

  test('overlapping workers do not produce duplicate send for the same outbox row', async () => {
    const sharedRow = { outbox_id: 77, group_id: 'g1@g.us', message: 'm', attempt_count: 1, max_attempts: 5 };

    mockClaimPendingOutboxBatch.mockResolvedValueOnce([sharedRow]).mockResolvedValueOnce([]);

    let resolveSend;
    const pendingSend = new Promise((resolve) => {
      resolveSend = resolve;
    });
    mockSafeSendMessage.mockImplementation(() => pendingSend);

    const firstWorkerPromise = processWaOutboxBatch(1);
    await Promise.resolve();
    const secondWorkerPromise = processWaOutboxBatch(1);

    resolveSend(true);

    const [firstResult, secondResult] = await Promise.all([firstWorkerPromise, secondWorkerPromise]);

    expect(firstResult).toEqual({ claimedCount: 1, sentCount: 1, retriedCount: 0, deadLetterCount: 0 });
    expect(secondResult).toEqual({ claimedCount: 0, sentCount: 0, retriedCount: 0, deadLetterCount: 0 });
    expect(mockSafeSendMessage).toHaveBeenCalledTimes(1);
    expect(mockMarkOutboxSent).toHaveBeenCalledTimes(1);
    expect(mockMarkOutboxSent).toHaveBeenCalledWith(77);
  });
});
