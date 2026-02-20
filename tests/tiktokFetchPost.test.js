import { jest } from '@jest/globals';

describe('fetchAndStoreTiktokContent timezone handling', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
  });

  test('treats posts crossing UTC boundary as today in Asia/Jakarta', async () => {
    jest.useFakeTimers();
    const systemTime = new Date('2024-02-29T18:00:00Z');
    jest.setSystemTime(systemTime);

    const expectedJakartaDate = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Jakarta',
    });

    const mockQuery = jest.fn();
    const mockUpsert = jest.fn().mockResolvedValue();
    const mockSendDebug = jest.fn();

    const boundaryCreateTime = Math.floor(
      new Date('2024-02-29T17:30:00Z').getTime() / 1000
    );

    jest.unstable_mockModule('../src/db/index.js', () => ({
      query: mockQuery,
    }));
    jest.unstable_mockModule('../src/model/clientModel.js', () => ({
      update: jest.fn(),
    }));
    jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({
      upsertTiktokPosts: mockUpsert,
    }));
    jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
      sendDebug: mockSendDebug,
    }));
    jest.unstable_mockModule('../src/service/tiktokApi.js', () => ({
      fetchTiktokPosts: jest.fn().mockResolvedValue([]),
      fetchTiktokPostsBySecUid: jest
        .fn()
        .mockResolvedValue([
          {
            id: 'boundary-video',
            createTime: boundaryCreateTime,
            stats: { diggCount: 5, commentCount: 2 },
          },
        ]),
      fetchTiktokInfo: jest.fn(),
      fetchTiktokPostDetail: jest.fn(),
    }));

    const { fetchAndStoreTiktokContent } = await import(
      '../src/handler/fetchpost/tiktokFetchPost.js'
    );

    mockQuery
      .mockResolvedValueOnce({ rows: [{ video_id: 'old-1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'CLIENT_A',
            client_tiktok: '@clienta',
            tiktok_secuid: 'SEC123',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ client_tiktok: '@clienta', tiktok_secuid: 'SEC123' }],
      })
      .mockResolvedValueOnce({ rows: [{ table_name: 'tiktok_snapshots' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            video_id: 'old-1',
            author_username: '@clienta',
            author_secuid: 'SEC123',
            source_type: 'cron_fetch',
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ client_id: 'CLIENT_A', client_tiktok: '@clienta' }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            video_id: 'boundary-video',
            client_id: 'CLIENT_A',
            created_at: new Date('2024-02-29T17:30:00Z'),
          },
        ],
      });

    await fetchAndStoreTiktokContent('CLIENT_A');

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const upsertPayload = mockUpsert.mock.calls[0][1][0];
    expect(upsertPayload.video_id).toBe('boundary-video');

    const selectTodayCall = mockQuery.mock.calls.find((call) =>
      call[0].startsWith('SELECT video_id FROM tiktok_post')
    );
    expect(selectTodayCall).toBeDefined();
    expect(selectTodayCall[0]).toContain(
      "DATE((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta') = $1"
    );
    expect(selectTodayCall[1]).toEqual([expectedJakartaDate, 'client_a']);

    const deleteCall = mockQuery.mock.calls.find((call) =>
      call[0].startsWith('DELETE FROM tiktok_post')
    );
    expect(deleteCall).toBeDefined();
    expect(deleteCall[0]).toContain(
      "DATE((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta') = $2"
    );
    expect(deleteCall[1]).toEqual([
      ['old-1'],
      expectedJakartaDate,
      'client_a',
    ]);

    const finalSelectCall = mockQuery.mock.calls.find((call) =>
      call[0].startsWith('SELECT video_id, client_id, created_at FROM tiktok_post')
    );
    expect(finalSelectCall).toBeDefined();
    expect(finalSelectCall[0]).toContain(
      "DATE((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta') = $1"
    );
    expect(finalSelectCall[1]).toEqual([expectedJakartaDate, 'client_a']);
  });
});

describe('fetchAndStoreTiktokContent fallback handling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-03-10T08:00:00Z')); // 15:00 WIB, within fallback window
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
  });

  test('falls back to username fetch when secUid posts are empty', async () => {
    const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'CLIENT_FALLBACK',
            client_tiktok: '@clientfallback',
            tiktok_secuid: 'SEC123',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ client_id: 'CLIENT_FALLBACK', client_tiktok: '@clientfallback' }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            video_id: 'fallback-video',
            client_id: 'CLIENT_FALLBACK',
            created_at: new Date(),
          },
        ],
      });

    const mockUpsert = jest.fn().mockResolvedValue();
    const mockSendDebug = jest.fn();
    const mockFetchBySecUid = jest.fn().mockResolvedValue([]);
    const fallbackPost = {
      video_id: 'fallback-video',
      create_time: Math.floor(Date.now() / 1000),
      stats: { diggCount: 3, commentCount: 1 },
    };
    const mockFetchByUsername = jest.fn().mockResolvedValue([fallbackPost]);

    jest.unstable_mockModule('../src/db/index.js', () => ({
      query: mockQuery,
    }));
    jest.unstable_mockModule('../src/model/clientModel.js', () => ({
      update: jest.fn(),
    }));
    jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({
      upsertTiktokPosts: mockUpsert,
    }));
    jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
      sendDebug: mockSendDebug,
    }));
    jest.unstable_mockModule('../src/service/tiktokApi.js', () => ({
      fetchTiktokPosts: mockFetchByUsername,
      fetchTiktokPostsBySecUid: mockFetchBySecUid,
      fetchTiktokInfo: jest.fn(),
      fetchTiktokPostDetail: jest.fn(),
    }));

    const { fetchAndStoreTiktokContent } = await import(
      '../src/handler/fetchpost/tiktokFetchPost.js'
    );

    await fetchAndStoreTiktokContent('CLIENT_FALLBACK');

    expect(mockFetchBySecUid).toHaveBeenCalledTimes(1);
    expect(mockFetchByUsername).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const upsertPayload = mockUpsert.mock.calls[0][1][0];
    expect(upsertPayload.video_id).toBe('fallback-video');
    expect(upsertPayload.comment_count).toBe(1);
  });

  test('uses fallback fetch when primary call throws', async () => {
    const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'CLIENT_FALLBACK',
            client_tiktok: '@clientfallback',
            tiktok_secuid: 'SEC123',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ client_id: 'CLIENT_FALLBACK', client_tiktok: '@clientfallback' }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            video_id: 'fallback-video-2',
            client_id: 'CLIENT_FALLBACK',
            created_at: new Date(),
          },
        ],
      });

    const mockUpsert = jest.fn().mockResolvedValue();
    const mockSendDebug = jest.fn();
    const mockFetchBySecUid = jest.fn().mockRejectedValue(new Error('primary down'));
    const fallbackPost = {
      video_id: 'fallback-video-2',
      create_time: Math.floor(Date.now() / 1000),
      stats: { diggCount: 7, commentCount: 4 },
    };
    const mockFetchByUsername = jest.fn().mockResolvedValue([fallbackPost]);

    jest.unstable_mockModule('../src/db/index.js', () => ({
      query: mockQuery,
    }));
    jest.unstable_mockModule('../src/model/clientModel.js', () => ({
      update: jest.fn(),
    }));
    jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({
      upsertTiktokPosts: mockUpsert,
    }));
    jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
      sendDebug: mockSendDebug,
    }));
    jest.unstable_mockModule('../src/service/tiktokApi.js', () => ({
      fetchTiktokPosts: mockFetchByUsername,
      fetchTiktokPostsBySecUid: mockFetchBySecUid,
      fetchTiktokInfo: jest.fn(),
      fetchTiktokPostDetail: jest.fn(),
    }));

    const { fetchAndStoreTiktokContent } = await import(
      '../src/handler/fetchpost/tiktokFetchPost.js'
    );

    await fetchAndStoreTiktokContent('CLIENT_FALLBACK');

    expect(mockFetchBySecUid).toHaveBeenCalledTimes(1);
    expect(mockFetchByUsername).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const upsertPayload = mockUpsert.mock.calls[0][1][0];
    expect(upsertPayload.video_id).toBe('fallback-video-2');
    expect(upsertPayload.like_count).toBe(7);
  });

  test('falls back to username when primary posts do not include today', async () => {
    jest.useFakeTimers();
    const systemTime = new Date('2024-03-10T04:30:00Z'); // 11:30 WIB
    jest.setSystemTime(systemTime);

    const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'CLIENT_FALLBACK',
            client_tiktok: '@clientfallback',
            tiktok_secuid: 'SEC123',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ client_id: 'CLIENT_FALLBACK', client_tiktok: '@clientfallback' }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            video_id: 'fresh-video',
            client_id: 'CLIENT_FALLBACK',
            created_at: new Date(systemTime),
          },
        ],
      });

    const mockUpsert = jest.fn().mockResolvedValue();
    const mockSendDebug = jest.fn();
    const mockFetchBySecUid = jest.fn().mockResolvedValue([
      {
        id: 'stale-video',
        createTime: Math.floor(new Date('2024-03-09T03:00:00Z').getTime() / 1000),
        stats: { diggCount: 1, commentCount: 1 },
      },
    ]);
    const freshTimestamp = Math.floor(systemTime.getTime() / 1000);
    const mockFetchByUsername = jest.fn().mockResolvedValue([
      {
        id: 'fresh-video',
        create_time: freshTimestamp,
        stats: { diggCount: 2, commentCount: 0 },
      },
    ]);

    jest.unstable_mockModule('../src/db/index.js', () => ({
      query: mockQuery,
    }));
    jest.unstable_mockModule('../src/model/clientModel.js', () => ({
      update: jest.fn(),
    }));
    jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({
      upsertTiktokPosts: mockUpsert,
    }));
    jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
      sendDebug: mockSendDebug,
    }));
    jest.unstable_mockModule('../src/service/tiktokApi.js', () => ({
      fetchTiktokPosts: mockFetchByUsername,
      fetchTiktokPostsBySecUid: mockFetchBySecUid,
      fetchTiktokInfo: jest.fn(),
      fetchTiktokPostDetail: jest.fn(),
    }));

    const { fetchAndStoreTiktokContent } = await import(
      '../src/handler/fetchpost/tiktokFetchPost.js'
    );

    await fetchAndStoreTiktokContent('CLIENT_FALLBACK');

    expect(mockFetchBySecUid).toHaveBeenCalledTimes(1);
    expect(mockFetchByUsername).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const upsertPayload = mockUpsert.mock.calls[0][1][0];
    expect(upsertPayload.video_id).toBe('fresh-video');
    expect(upsertPayload.like_count).toBe(2);
    expect(upsertPayload.comment_count).toBe(0);
  });
});

describe('fetchAndStoreTiktokContent delete-on-api-success', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
  });

  test('deletes DB post that is no longer in API response even when no posts are from today', async () => {
    jest.useFakeTimers();
    // 14:00 WIB (07:00 UTC) — within fallback window
    const systemTime = new Date('2024-03-10T07:00:00Z');
    jest.setSystemTime(systemTime);

    const expectedJakartaDate = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Jakarta',
    });

    const mockQuery = jest.fn();
    const mockUpsert = jest.fn().mockResolvedValue();
    const mockSendDebug = jest.fn();

    // oldVideoId was posted today and is now deleted from TikTok
    const oldVideoId = 'deleted-today-video';

    jest.unstable_mockModule('../src/db/index.js', () => ({
      query: mockQuery,
    }));
    jest.unstable_mockModule('../src/model/clientModel.js', () => ({
      update: jest.fn(),
    }));
    jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({
      upsertTiktokPosts: mockUpsert,
    }));
    jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
      sendDebug: mockSendDebug,
    }));

    // API returns one post from YESTERDAY (not today) — account deleted today's post
    const yesterdayTimestamp = Math.floor(
      new Date('2024-03-09T10:00:00Z').getTime() / 1000
    );
    jest.unstable_mockModule('../src/service/tiktokApi.js', () => ({
      fetchTiktokPosts: jest.fn().mockResolvedValue([]),
      fetchTiktokPostsBySecUid: jest.fn().mockResolvedValue([
        {
          id: 'yesterday-video',
          createTime: yesterdayTimestamp,
          stats: { diggCount: 10, commentCount: 3 },
        },
      ]),
      fetchTiktokInfo: jest.fn(),
      fetchTiktokPostDetail: jest.fn(),
    }));

    const { fetchAndStoreTiktokContent } = await import(
      '../src/handler/fetchpost/tiktokFetchPost.js'
    );

    mockQuery
      // 1: getVideoIdsToday — DB has the deleted post
      .mockResolvedValueOnce({ rows: [{ video_id: oldVideoId }] })
      // 2: getEligibleTiktokClients
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'CLIENT_DEL',
            client_tiktok: '@clientdel',
            tiktok_secuid: 'SEC_DEL',
          },
        ],
      })
      // 3: official account lookup for filter
      .mockResolvedValueOnce({
        rows: [{ client_tiktok: '@clientdel', tiktok_secuid: 'SEC_DEL' }],
      })
      // 4: tiktok_snapshots exists
      .mockResolvedValueOnce({ rows: [{ table_name: 'tiktok_snapshots' }] })
      // 5: candidate row is official cron content
      .mockResolvedValueOnce({
        rows: [
          {
            video_id: oldVideoId,
            author_username: '@clientdel',
            author_secuid: 'SEC_DEL',
            source_type: 'cron_fetch',
          },
        ],
      })
      // 6: DELETE (deleteVideoIds for oldVideoId)
      .mockResolvedValueOnce({ rowCount: 1 })
      // 7: clientsForMap
      .mockResolvedValueOnce({
        rows: [{ client_id: 'CLIENT_DEL', client_tiktok: '@clientdel' }],
      })
      // 8: final summary
      .mockResolvedValueOnce({ rows: [] });

    await fetchAndStoreTiktokContent('CLIENT_DEL');

    // No upsert because no posts from today
    expect(mockUpsert).not.toHaveBeenCalled();

    // DELETE must be called to remove the post that was deleted from the official account
    const deleteCall = mockQuery.mock.calls.find((call) =>
      call[0].startsWith('DELETE FROM tiktok_post')
    );
    expect(deleteCall).toBeDefined();
    expect(deleteCall[1]).toEqual([
      [oldVideoId],
      expectedJakartaDate,
      'client_del',
    ]);
  });


  test('keeps manual_input and deletes only cron_fetch for mixed same-day leftovers', async () => {
    jest.useFakeTimers();
    const systemTime = new Date('2024-03-10T07:00:00Z');
    jest.setSystemTime(systemTime);

    const expectedJakartaDate = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Jakarta',
    });

    const mockQuery = jest.fn();
    const mockUpsert = jest.fn().mockResolvedValue();

    jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
    jest.unstable_mockModule('../src/model/clientModel.js', () => ({ update: jest.fn() }));
    jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({ upsertTiktokPosts: mockUpsert }));
    jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({ sendDebug: jest.fn() }));
    jest.unstable_mockModule('../src/service/tiktokApi.js', () => ({
      fetchTiktokPosts: jest.fn().mockResolvedValue([]),
      fetchTiktokPostsBySecUid: jest.fn().mockResolvedValue([
        {
          id: 'yesterday-video',
          createTime: Math.floor(new Date('2024-03-09T10:00:00Z').getTime() / 1000),
          stats: { diggCount: 10, commentCount: 3 },
        },
      ]),
      fetchTiktokInfo: jest.fn(),
      fetchTiktokPostDetail: jest.fn(),
    }));

    const { fetchAndStoreTiktokContent } = await import(
      '../src/handler/fetchpost/tiktokFetchPost.js'
    );

    mockQuery
      .mockResolvedValueOnce({ rows: [{ video_id: 'cron-orphan' }, { video_id: 'manual-orphan' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'CLIENT_MIX',
            client_tiktok: '@clientmix',
            tiktok_secuid: 'SEC_MIX',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ client_tiktok: '@clientmix', tiktok_secuid: 'SEC_MIX' }],
      })
      .mockResolvedValueOnce({ rows: [{ table_name: 'tiktok_snapshots' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            video_id: 'cron-orphan',
            author_username: '@clientmix',
            author_secuid: 'SEC_MIX',
            source_type: 'cron_fetch',
          },
          {
            video_id: 'manual-orphan',
            author_username: '@clientmix',
            author_secuid: 'SEC_MIX',
            source_type: 'manual_input',
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ client_id: 'CLIENT_MIX', client_tiktok: '@clientmix' }],
      })
      .mockResolvedValueOnce({ rows: [] });

    await fetchAndStoreTiktokContent('CLIENT_MIX');

    expect(mockUpsert).not.toHaveBeenCalled();

    const deleteCall = mockQuery.mock.calls.find((call) =>
      call[0].startsWith('DELETE FROM tiktok_post')
    );
    expect(deleteCall).toBeDefined();
    expect(deleteCall[1]).toEqual([
      ['cron-orphan'],
      expectedJakartaDate,
      'client_mix',
    ]);
  });

});

describe('fetchAndStoreSingleTiktokPost manual timestamp behavior', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-03-10T08:30:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
  });

  test('manual input fetched today keeps created_at as fetch time and stores original_created_at', async () => {
    const mockQuery = jest.fn();
    const mockUpsert = jest.fn().mockResolvedValue();

    const yesterdayUnix = Math.floor(new Date('2024-03-09T08:30:00.000Z').getTime() / 1000);

    jest.unstable_mockModule('../src/db/index.js', () => ({
      query: mockQuery,
    }));
    jest.unstable_mockModule('../src/model/clientModel.js', () => ({
      update: jest.fn(),
    }));
    jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({
      upsertTiktokPosts: mockUpsert,
    }));
    jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
      sendDebug: jest.fn(),
    }));
    jest.unstable_mockModule('../src/service/tiktokApi.js', () => ({
      fetchTiktokPosts: jest.fn(),
      fetchTiktokPostsBySecUid: jest.fn(),
      fetchTiktokInfo: jest.fn(),
      fetchTiktokPostDetail: jest.fn().mockResolvedValue({
        id: 'manual-001',
        desc: 'manual caption',
        createTime: yesterdayUnix,
        stats: { diggCount: 10, commentCount: 2 },
      }),
    }));

    mockQuery.mockResolvedValueOnce({ rows: [{ client_id: 'CLIENT_MANUAL' }] });

    const { fetchAndStoreSingleTiktokPost } = await import(
      '../src/handler/fetchpost/tiktokFetchPost.js'
    );

    const beforeFetch = Date.now();
    const result = await fetchAndStoreSingleTiktokPost('CLIENT_MANUAL', 'https://www.tiktok.com/@acc/video/12345678');
    const afterFetch = Date.now();

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const upsertPayload = mockUpsert.mock.calls[0][1][0];

    const createdAtMs = new Date(upsertPayload.created_at).getTime();
    const originalCreatedAtMs = new Date(upsertPayload.original_created_at).getTime();

    expect(createdAtMs).toBeGreaterThanOrEqual(beforeFetch - 1000);
    expect(createdAtMs).toBeLessThanOrEqual(afterFetch + 1000);
    expect(new Date(upsertPayload.created_at).toDateString()).toBe(new Date().toDateString());

    expect(originalCreatedAtMs).toBe(yesterdayUnix * 1000);
    expect(result.originalCreatedAt.getTime()).toBe(yesterdayUnix * 1000);
  });
});
