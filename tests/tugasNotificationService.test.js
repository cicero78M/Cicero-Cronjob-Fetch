// tests/tugasNotificationService.test.js

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock dependencies
jest.unstable_mockModule('../src/model/clientModel.js', () => ({
  findById: jest.fn(),
}));

jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  safeSendMessage: jest.fn(),
}));

jest.unstable_mockModule('../src/model/instaPostModel.js', () => ({
  getPostsTodayByClient: jest.fn(),
}));

jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({
  getPostsTodayByClient: jest.fn(),
}));

jest.unstable_mockModule('../src/model/waNotificationOutboxModel.js', () => ({
  enqueueOutboxEvents: jest.fn(),
}));

// Import after mocking
const { sendTugasNotification, buildChangeSummary, enqueueTugasNotification } = await import('../src/service/tugasNotificationService.js');
const { findById } = await import('../src/model/clientModel.js');
const { safeSendMessage } = await import('../src/utils/waHelper.js');
const { getPostsTodayByClient: getPostsTodayByClientInsta } = await import('../src/model/instaPostModel.js');
const { getPostsTodayByClient: getPostsTodayByClientTiktok } = await import('../src/model/tiktokPostModel.js');
const { enqueueOutboxEvents } = await import('../src/model/waNotificationOutboxModel.js');

describe('tugasNotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('buildChangeSummary', () => {
    it('should build summary for Instagram additions', () => {
      const changes = {
        igAdded: [{ shortcode: 'abc123' }, { shortcode: 'def456' }],
        tiktokAdded: [],
        igDeleted: 0,
        tiktokDeleted: 0,
        linkChanges: []
      };
      
      const summary = buildChangeSummary(changes);
      expect(summary).toBe('+2 IG posts');
    });

    it('should build summary for TikTok additions', () => {
      const changes = {
        igAdded: [],
        tiktokAdded: [{ video_id: '123' }],
        igDeleted: 0,
        tiktokDeleted: 0,
        linkChanges: []
      };
      
      const summary = buildChangeSummary(changes);
      expect(summary).toBe('+1 TikTok posts');
    });

    it('should build summary for deletions', () => {
      const changes = {
        igAdded: [],
        tiktokAdded: [],
        igDeleted: 3,
        tiktokDeleted: 2,
        linkChanges: []
      };
      
      const summary = buildChangeSummary(changes);
      expect(summary).toBe('-3 IG posts, -2 TikTok posts');
    });

    it('should return "no changes" for empty changes', () => {
      const changes = {
        igAdded: [],
        tiktokAdded: [],
        igDeleted: 0,
        tiktokDeleted: 0,
        linkChanges: []
      };
      
      const summary = buildChangeSummary(changes);
      expect(summary).toBe('no changes');
    });
  });

  describe('sendTugasNotification - Group ID Normalization', () => {
    const mockWaClient = { sendMessage: jest.fn() };
    const mockClient = {
      client_id: 'TEST_CLIENT',
      nama: 'Test Client',
      client_group: ''
    };

    beforeEach(() => {
      findById.mockResolvedValue(mockClient);
      safeSendMessage.mockResolvedValue(true);
    });

    it('should normalize group ID without @g.us suffix', async () => {
      mockClient.client_group = '120363123456789';
      
      await sendTugasNotification(mockWaClient, 'TEST_CLIENT', {
        igAdded: [{ shortcode: 'abc123', caption: 'Test' }],
        tiktokAdded: [],
        igDeleted: 0,
        tiktokDeleted: 0,
        linkChanges: []
      });

      expect(safeSendMessage).toHaveBeenCalledWith(
        mockWaClient,
        '120363123456789@g.us',
        expect.any(String)
      );
    });

    it('should handle group ID with @g.us suffix already', async () => {
      mockClient.client_group = '120363123456789@g.us';
      
      await sendTugasNotification(mockWaClient, 'TEST_CLIENT', {
        igAdded: [{ shortcode: 'abc123', caption: 'Test' }],
        tiktokAdded: [],
        igDeleted: 0,
        tiktokDeleted: 0,
        linkChanges: []
      });

      expect(safeSendMessage).toHaveBeenCalledWith(
        mockWaClient,
        '120363123456789@g.us',
        expect.any(String)
      );
    });

    it('should handle group ID with additional ID (with hyphen)', async () => {
      mockClient.client_group = '120363123456789-987654321@g.us';
      
      await sendTugasNotification(mockWaClient, 'TEST_CLIENT', {
        igAdded: [{ shortcode: 'abc123', caption: 'Test' }],
        tiktokAdded: [],
        igDeleted: 0,
        tiktokDeleted: 0,
        linkChanges: []
      });

      expect(safeSendMessage).toHaveBeenCalledWith(
        mockWaClient,
        '120363123456789-987654321@g.us',
        expect.any(String)
      );
    });

    it('should skip invalid group ID (individual chat format)', async () => {
      mockClient.client_group = '628123456789@c.us';
      
      const result = await sendTugasNotification(mockWaClient, 'TEST_CLIENT', {
        igAdded: [{ shortcode: 'abc123', caption: 'Test' }],
        tiktokAdded: [],
        igDeleted: 0,
        tiktokDeleted: 0,
        linkChanges: []
      });

      expect(result).toBe(false);
      expect(safeSendMessage).not.toHaveBeenCalled();
    });

    it('should handle multiple group IDs', async () => {
      mockClient.client_group = '120363111111111@g.us,120363222222222';
      
      await sendTugasNotification(mockWaClient, 'TEST_CLIENT', {
        igAdded: [{ shortcode: 'abc123', caption: 'Test' }],
        tiktokAdded: [],
        igDeleted: 0,
        tiktokDeleted: 0,
        linkChanges: []
      });

      expect(safeSendMessage).toHaveBeenCalledTimes(2);
      expect(safeSendMessage).toHaveBeenNthCalledWith(
        1,
        mockWaClient,
        '120363111111111@g.us',
        expect.any(String)
      );
      expect(safeSendMessage).toHaveBeenNthCalledWith(
        2,
        mockWaClient,
        '120363222222222@g.us',
        expect.any(String)
      );
    });
  });

  describe('sendTugasNotification - Scheduled Notifications', () => {
    const mockWaClient = { sendMessage: jest.fn() };
    const mockClient = {
      client_id: 'TEST_CLIENT',
      nama: 'Test Client',
      client_group: '120363123456789@g.us'
    };

    beforeEach(() => {
      findById.mockResolvedValue(mockClient);
      safeSendMessage.mockResolvedValue(true);
      // Mock post fetching functions to return empty arrays by default
      getPostsTodayByClientInsta.mockResolvedValue([]);
      getPostsTodayByClientTiktok.mockResolvedValue([]);
    });

    it('should send scheduled notification with task counts', async () => {
      // Mock actual posts to match expected counts
      getPostsTodayByClientInsta.mockResolvedValue([
        { shortcode: 'post1', caption: 'Post 1' },
        { shortcode: 'post2', caption: 'Post 2' },
        { shortcode: 'post3', caption: 'Post 3' },
        { shortcode: 'post4', caption: 'Post 4' },
        { shortcode: 'post5', caption: 'Post 5' },
        { shortcode: 'post6', caption: 'Post 6' },
        { shortcode: 'post7', caption: 'Post 7' },
        { shortcode: 'post8', caption: 'Post 8' },
        { shortcode: 'post9', caption: 'Post 9' },
        { shortcode: 'post10', caption: 'Post 10' }
      ]);
      getPostsTodayByClientTiktok.mockResolvedValue([
        { video_id: 'vid1', caption: 'Video 1', author_username: 'testuser' },
        { video_id: 'vid2', caption: 'Video 2', author_username: 'testuser' },
        { video_id: 'vid3', caption: 'Video 3', author_username: 'testuser' },
        { video_id: 'vid4', caption: 'Video 4', author_username: 'testuser' },
        { video_id: 'vid5', caption: 'Video 5', author_username: 'testuser' }
      ]);

      const changes = {
        igAdded: [],
        tiktokAdded: [],
        igDeleted: 0,
        tiktokDeleted: 0,
        linkChanges: []
      };

      const result = await sendTugasNotification(mockWaClient, 'TEST_CLIENT', changes, {
        forceScheduled: true,
        igCount: 10,
        tiktokCount: 5
      });

      expect(result).toBe(true);
      expect(safeSendMessage).toHaveBeenCalledWith(
        mockWaClient,
        '120363123456789@g.us',
        expect.stringContaining('📋 *Daftar Tugas - Test Client*')
      );

      const scheduledMessage = safeSendMessage.mock.calls[0][2];
      expect(scheduledMessage).toContain('🕒 Pengambilan data:');
      expect(scheduledMessage).toMatch(/🕒 Pengambilan data: .* WIB/);
      expect(safeSendMessage).toHaveBeenCalledWith(
        mockWaClient,
        '120363123456789@g.us',
        expect.stringContaining('📸 Instagram: *10* konten')
      );
      expect(safeSendMessage).toHaveBeenCalledWith(
        mockWaClient,
        '120363123456789@g.us',
        expect.stringContaining('🎵 TikTok: *5* konten')
      );
    });

    it('should send scheduled notification with changes included', async () => {
      const changes = {
        igAdded: [{ shortcode: 'abc123', caption: 'New post' }],
        tiktokAdded: [],
        igDeleted: 0,
        tiktokDeleted: 0,
        linkChanges: []
      };

      const result = await sendTugasNotification(mockWaClient, 'TEST_CLIENT', changes, {
        forceScheduled: true,
        igCount: 10,
        tiktokCount: 5
      });

      expect(result).toBe(true);
      expect(safeSendMessage).toHaveBeenCalledWith(
        mockWaClient,
        '120363123456789@g.us',
        expect.stringContaining('📊 *Perubahan Hari Ini:*')
      );
      expect(safeSendMessage).toHaveBeenCalledWith(
        mockWaClient,
        '120363123456789@g.us',
        expect.stringContaining('✅ +1 konten Instagram baru')
      );
    });

    it('should not send notification if no changes and not scheduled', async () => {
      const changes = {
        igAdded: [],
        tiktokAdded: [],
        igDeleted: 0,
        tiktokDeleted: 0,
        linkChanges: []
      };

      const result = await sendTugasNotification(mockWaClient, 'TEST_CLIENT', changes, {
        forceScheduled: false,
        igCount: 10,
        tiktokCount: 5
      });

      expect(result).toBe(false);
      expect(safeSendMessage).not.toHaveBeenCalled();
    });

    it('should include Instagram and TikTok links grouped by platform in scheduled notification', async () => {
      // Mock Instagram posts
      getPostsTodayByClientInsta.mockResolvedValue([
        {
          shortcode: 'abc123',
          caption: 'Test Instagram post 1',
          created_at: '2026-02-17T00:15:00.000Z',
          comment_count: 8,
        },
        {
          shortcode: 'def456',
          caption: 'Test Instagram post 2',
          created_at: '2026-02-17T02:15:00.000Z',
          like_count: null,
          comment_count: null,
        }
      ]);
      
      // Mock TikTok posts
      getPostsTodayByClientTiktok.mockResolvedValue([
        {
          video_id: 'tiktok123',
          caption: 'Test TikTok video 1',
          author_username: 'testuser',
          created_at: '2026-02-17T01:20:00.000Z',
          like_count: 1200,
          comment_count: 25,
        },
        {
          video_id: 'tiktok456',
          caption: 'Test TikTok video 2',
          author_username: 'testuser',
          created_at: null,
          like_count: null,
          comment_count: undefined,
        }
      ]);

      const changes = {
        igAdded: [],
        tiktokAdded: [],
        igDeleted: 0,
        tiktokDeleted: 0,
        linkChanges: []
      };

      const result = await sendTugasNotification(mockWaClient, 'TEST_CLIENT', changes, {
        forceScheduled: true,
        igCount: 2,
        tiktokCount: 2
      });

      expect(result).toBe(true);
      const sentMessage = safeSendMessage.mock.calls[0][2];
      
      // Verify Instagram section and metadata are included
      expect(sentMessage).toContain('📸 *Tugas Instagram (2 konten):*');
      expect(sentMessage).toContain('https://www.instagram.com/p/abc123/');
      expect(sentMessage).toContain('https://www.instagram.com/p/def456/');
      expect(sentMessage).toContain('Upload:');
      expect(sentMessage).toContain('WIB');
      expect(sentMessage).toContain('Likes: - | Komentar: 0');
      expect(sentMessage).toContain('Likes: 1.200 | Komentar: 25');
      
      // Verify TikTok section and metadata are included
      expect(sentMessage).toContain('🎵 *Tugas TikTok (2 konten):*');
      expect(sentMessage).toContain('https://www.tiktok.com/@testuser/video/tiktok123');
      expect(sentMessage).toContain('https://www.tiktok.com/@testuser/video/tiktok456');
      expect(sentMessage).toContain('Upload: -');
      expect(sentMessage).toContain('Likes: 0 | Komentar: 0');
    });
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
    getPostsTodayByClientInsta.mockResolvedValue([]);
    getPostsTodayByClientTiktok.mockResolvedValue([]);
  });

  it('enqueues notification events to outbox', async () => {
    const result = await enqueueTugasNotification('TEST_CLIENT', {
      igAdded: [{ shortcode: 'abc123', caption: 'Test' }],
      tiktokAdded: [],
      igDeleted: 0,
      tiktokDeleted: 0,
      linkChanges: [],
    });

    expect(result).toEqual({ enqueuedCount: 1, duplicatedCount: 0 });
    expect(enqueueOutboxEvents).toHaveBeenCalledTimes(1);
    expect(enqueueOutboxEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        clientId: 'TEST_CLIENT',
        groupId: '120363123456789@g.us',
        maxAttempts: 5,
      }),
    ]);
  });
});
