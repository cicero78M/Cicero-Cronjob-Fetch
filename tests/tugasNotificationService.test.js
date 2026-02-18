// tests/tugasNotificationService.test.js

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../src/model/clientModel.js', () => ({
  findById: jest.fn(),
}));

jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  safeSendMessage: jest.fn(),
}));

jest.unstable_mockModule('../src/model/waNotificationOutboxModel.js', () => ({
  enqueueOutboxEvents: jest.fn(),
}));

const { sendTugasNotification, buildChangeSummary, enqueueTugasNotification } = await import('../src/service/tugasNotificationService.js');
const { findById } = await import('../src/model/clientModel.js');
const { safeSendMessage } = await import('../src/utils/waHelper.js');
const { enqueueOutboxEvents } = await import('../src/model/waNotificationOutboxModel.js');

const EMPTY_CHANGES = {
  igAdded: [],
  tiktokAdded: [],
  igDeleted: 0,
  tiktokDeleted: 0,
  linkChanges: [],
};

describe('tugasNotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('buildChangeSummary', () => {
    it('returns no changes for empty changes', () => {
      expect(buildChangeSummary(EMPTY_CHANGES)).toBe('no changes');
    });

    it('builds summary for mixed changes', () => {
      const summary = buildChangeSummary({
        igAdded: [{ shortcode: 'abc' }],
        tiktokAdded: [{ video_id: '1' }],
        igDeleted: 2,
        tiktokDeleted: 1,
        linkChanges: [{ shortcode: 'abc' }],
      });

      expect(summary).toBe('+1 IG posts, +1 TikTok posts, -2 IG posts, -1 TikTok posts, ~1 link changes');
    });
  });

  describe('sendTugasNotification', () => {
    const mockWaClient = { sendMessage: jest.fn() };
    const mockClient = {
      client_id: 'TEST_CLIENT',
      nama: 'Test Client',
      client_group: '120363123456789@g.us',
    };

    beforeEach(() => {
      findById.mockResolvedValue(mockClient);
      safeSendMessage.mockResolvedValue(true);
    });

    it('normalizes numeric group id before sending', async () => {
      mockClient.client_group = '120363123456789';

      await sendTugasNotification(mockWaClient, 'TEST_CLIENT', {
        ...EMPTY_CHANGES,
        igAdded: [{ shortcode: 'abc123', caption: 'Test' }],
      });

      expect(safeSendMessage).toHaveBeenCalledWith(
        mockWaClient,
        '120363123456789@g.us',
        expect.any(String)
      );
    });

    it('does not send when there are no actual changes', async () => {
      const result = await sendTugasNotification(mockWaClient, 'TEST_CLIENT', EMPTY_CHANGES);

      expect(result).toBe(false);
      expect(safeSendMessage).not.toHaveBeenCalled();
    });
  });

  describe('enqueueTugasNotification', () => {
    const mockClient = {
      client_id: 'TEST_CLIENT',
      nama: 'Test Client',
      client_group: '120363123456789@g.us',
    };

    beforeEach(() => {
      findById.mockResolvedValue(mockClient);
      enqueueOutboxEvents.mockResolvedValue({ insertedCount: 1, duplicatedCount: 0 });
    });

    it('does not enqueue outbox event when changes are empty', async () => {
      const result = await enqueueTugasNotification('TEST_CLIENT', EMPTY_CHANGES);

      expect(result).toEqual({ enqueuedCount: 0, duplicatedCount: 0 });
      expect(enqueueOutboxEvents).not.toHaveBeenCalled();
    });

    it('enqueues outbox events for additions/deletions/link changes', async () => {
      enqueueOutboxEvents.mockResolvedValue({ insertedCount: 3, duplicatedCount: 0 });

      const result = await enqueueTugasNotification('TEST_CLIENT', {
        igAdded: [{ shortcode: 'abc123', caption: 'New IG post' }],
        tiktokAdded: [{ video_id: '987', caption: 'New TT post', author_username: 'user' }],
        igDeleted: 1,
        tiktokDeleted: 0,
        igDeletedPosts: ['https://www.instagram.com/p/abc123/'],
        linkChanges: [{ shortcode: 'abc123', user_name: 'Tester', instagram_link: 'https://instagram.com/x' }],
      });

      expect(result).toEqual({ enqueuedCount: 3, duplicatedCount: 0 });
      expect(enqueueOutboxEvents).toHaveBeenCalledTimes(1);

      const outboxEvents = enqueueOutboxEvents.mock.calls[0][0];
      expect(outboxEvents).toHaveLength(4);
      outboxEvents.forEach((event) => {
        expect(event.clientId).toBe('TEST_CLIENT');
        expect(event.groupId).toBe('120363123456789@g.us');
        expect(event.maxAttempts).toBe(5);
        expect(event.idempotencyKey).toMatch(/^[a-f0-9]{64}$/);
      });
    });
  });
});
