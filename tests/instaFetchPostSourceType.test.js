import { jest } from '@jest/globals';

process.env.TZ = 'Asia/Jakarta';
process.env.IG_SAFE_DELETE_THRESHOLD_PERCENT = '100';

const mockQuery = jest.fn();
const mockSendDebug = jest.fn();
const mockFetchInstagramPosts = jest.fn();
const mockFetchInstagramPostInfo = jest.fn();
const mockSavePostWithMedia = jest.fn();
const mockUpsertInstaPostKhusus = jest.fn();
const mockUpsertInstaPost = jest.fn();
const mockAddClientToPost = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({ sendDebug: mockSendDebug }));
jest.unstable_mockModule('../src/service/instagramApi.js', () => ({
  fetchInstagramPosts: mockFetchInstagramPosts,
  fetchInstagramPostInfo: mockFetchInstagramPostInfo,
}));
jest.unstable_mockModule('../src/model/instaPostExtendedModel.js', () => ({
  savePostWithMedia: mockSavePostWithMedia,
}));
jest.unstable_mockModule('../src/model/instaPostKhususModel.js', () => ({
  upsertInstaPost: mockUpsertInstaPostKhusus,
}));
jest.unstable_mockModule('../src/model/instaPostModel.js', () => ({
  upsertInstaPost: mockUpsertInstaPost,
}));
jest.unstable_mockModule('../src/model/instaPostClientsModel.js', () => ({
  addClientToPost: mockAddClientToPost,
}));

let fetchAndStoreInstaContent;
let fetchSinglePostKhusus;

beforeAll(async () => {
  ({ fetchAndStoreInstaContent, fetchSinglePostKhusus } = await import('../src/handler/fetchpost/instaFetchPost.js'));
});

beforeEach(() => {
  jest.clearAllMocks();

  const yesterday = Math.floor(Date.now() / 1000) - 86400;
  mockFetchInstagramPosts.mockResolvedValue([
    {
      code: 'OLD123',
      taken_at: yesterday,
      comment_count: 0,
      like_count: 0,
    },
  ]);

  mockQuery.mockImplementation(async (sql, params = []) => {
    if (sql.includes('FROM clients') && sql.includes('client_status=true')) {
      return { rows: [{ id: 'clientA', client_insta: 'officialA' }] };
    }

    if (sql.includes('FROM insta_post_clients pc') && sql.includes('JOIN insta_post p')) {
      return { rows: [{ shortcode: 'CRON001' }, { shortcode: 'MAN001' }] };
    }

    if (sql.includes('SELECT client_insta FROM clients WHERE client_id = $1')) {
      return { rows: [{ client_insta: 'officialA' }] };
    }

    if (sql.includes('SELECT to_regclass($1) AS table_name')) {
      return { rows: [{ table_name: 'exists' }] };
    }

    if (sql.includes('SELECT p.shortcode, p.source_type, u.username')) {
      return {
        rows: [
          { shortcode: 'CRON001', source_type: 'cron_fetch', username: 'officialA' },
          { shortcode: 'MAN001', source_type: 'manual_input', username: 'officialA' },
        ],
      };
    }

    if (sql.includes('DELETE FROM insta_post_clients')) {
      expect(params[0]).toEqual(['CRON001']);
      return { rowCount: 1, rows: [] };
    }

    if (sql.includes('WHERE p.shortcode = ANY($1)') && sql.includes('NOT EXISTS')) {
      return { rows: [{ shortcode: 'CRON001' }] };
    }

    if (sql.includes('DELETE FROM insta_like_audit') || sql.includes('DELETE FROM insta_like WHERE')) {
      expect(params[0]).toEqual(['CRON001']);
      return { rowCount: 1, rows: [] };
    }

    if (sql.includes('DELETE FROM insta_comment')) {
      expect(params[0]).toEqual(['CRON001']);
      return { rowCount: 1, rows: [] };
    }

    if (sql.includes('DELETE FROM insta_post')) {
      expect(params[0]).toEqual(['CRON001']);
      return { rowCount: 1, rows: [] };
    }

    if (sql.includes('SELECT shortcode FROM insta_post WHERE client_id = $1')) {
      return { rows: [{ shortcode: 'CRON001' }, { shortcode: 'MAN001' }] };
    }

    if (sql.includes('SELECT shortcode, created_at FROM insta_post')) {
      return { rows: [] };
    }

    return { rows: [] };
  });
});

test('auto-delete hanya menghapus post source_type cron_fetch', async () => {
  await fetchAndStoreInstaContent(null, null, null, 'clientA');

  const deleteInstaPostClientsCall = mockQuery.mock.calls.find(([sql]) =>
    sql.includes('DELETE FROM insta_post_clients'),
  );

  expect(deleteInstaPostClientsCall).toBeTruthy();
  expect(deleteInstaPostClientsCall[1][0]).toEqual(['CRON001']);
});


test('upsert query cron menjaga source_type manual_input pada konflik shortcode', async () => {
  const todayUnix = Math.floor(Date.now() / 1000);
  mockFetchInstagramPosts.mockResolvedValueOnce([
    {
      code: 'MANUAL-LOCKED',
      taken_at: todayUnix,
      comment_count: 2,
      like_count: 3,
    },
  ]);

  await fetchAndStoreInstaContent(null, null, null, 'clientA');

  const upsertCall = mockQuery.mock.calls.find(([sql]) =>
    sql.includes('INSERT INTO insta_post') && sql.includes('ON CONFLICT (shortcode) DO UPDATE'),
  );

  expect(upsertCall).toBeTruthy();
  expect(upsertCall[0]).toContain("WHEN insta_post.source_type = 'manual_input' THEN insta_post.source_type");
  expect(upsertCall[1][11]).toBe('cron_fetch');
});

test('manual input hari ini tetap memakai source_type manual_input dan created_at waktu input', async () => {
  const yesterday = Math.floor(Date.now() / 1000) - 86400;
  mockFetchInstagramPostInfo.mockResolvedValue({
    caption: { text: 'caption' },
    comment_count: 1,
    thumbnail_url: 'https://img.test/1.jpg',
    is_video: false,
    taken_at: yesterday,
  });

  const beforeFetch = Date.now();
  await fetchSinglePostKhusus('https://www.instagram.com/p/MANUAL01/', 'clientA');
  const afterFetch = Date.now();

  expect(mockUpsertInstaPost).toHaveBeenCalledWith(
    expect.objectContaining({
      shortcode: 'MANUAL01',
      source_type: 'manual_input',
    }),
  );

  const upsertPayload = mockUpsertInstaPost.mock.calls[0][0];
  const createdAtMs = new Date(upsertPayload.created_at).getTime();
  const originalCreatedAtMs = new Date(upsertPayload.original_created_at).getTime();

  expect(createdAtMs).toBeGreaterThanOrEqual(beforeFetch - 1000);
  expect(createdAtMs).toBeLessThanOrEqual(afterFetch + 1000);
  expect(originalCreatedAtMs).toBe(yesterday * 1000);
  expect(new Date(upsertPayload.created_at).toDateString()).toBe(new Date().toDateString());
});

test('fail-safe delete lanjut ke client berikutnya untuk error replica identity', async () => {
  const todayUnix = Math.floor(Date.now() / 1000);
  mockFetchInstagramPosts.mockResolvedValue([
    {
      code: 'KEEP_TODAY',
      taken_at: todayUnix,
      comment_count: 0,
      like_count: 0,
    },
  ]);

  mockQuery.mockImplementation(async (sql, params = []) => {
    if (sql.includes('FROM clients') && sql.includes('client_status=true')) {
      return {
        rows: [
          { id: 'clientA', client_insta: 'officialA' },
          { id: 'clientB', client_insta: 'officialB' },
        ],
      };
    }

    if (sql.includes('FROM insta_post_clients pc') && sql.includes('JOIN insta_post p')) {
      if (params[0] === 'clientA') return { rows: [{ shortcode: 'OLD_A' }, { shortcode: 'KEEP_TODAY' }] };
      if (params[0] === 'clientB') return { rows: [{ shortcode: 'OLD_B' }, { shortcode: 'KEEP_TODAY' }] };
      return { rows: [] };
    }

    if (sql.includes('SELECT client_insta FROM clients WHERE client_id = $1')) {
      return { rows: [{ client_insta: params[0] === 'clientA' ? 'officialA' : 'officialB' }] };
    }

    if (sql.includes('SELECT to_regclass($1) AS table_name')) {
      return { rows: [{ table_name: 'exists' }] };
    }

    if (sql.includes('SELECT p.shortcode, p.source_type, u.username')) {
      return { rows: [{ shortcode: params[0][0], source_type: 'cron_fetch', username: 'officialA' }] };
    }

    if (sql.includes('DELETE FROM insta_post_clients')) {
      if (params[1] === 'clientA') {
        const err = new Error('cannot delete from table "insta_post_clients" because it does not have a replica identity and publishes deletes');
        err.code = '55000';
        throw err;
      }
      return { rowCount: 1, rows: [] };
    }

    if (sql.includes('WHERE p.shortcode = ANY($1)') && sql.includes('NOT EXISTS')) {
      return { rows: [{ shortcode: params[0][0] }] };
    }

    if (
      sql.includes('DELETE FROM insta_like_audit') ||
      sql.includes('DELETE FROM insta_like WHERE') ||
      sql.includes('DELETE FROM insta_comment') ||
      sql.includes('DELETE FROM insta_post')
    ) {
      return { rowCount: 1, rows: [] };
    }

    if (sql.includes('INSERT INTO insta_post') && sql.includes('ON CONFLICT (shortcode) DO UPDATE')) {
      return { rowCount: 1, rows: [] };
    }

    if (sql.includes('SELECT shortcode FROM insta_post WHERE client_id = $1')) {
      return { rows: [{ shortcode: 'KEEP_TODAY' }] };
    }

    if (sql.includes('SELECT shortcode, created_at FROM insta_post')) {
      return { rows: [] };
    }

    return { rows: [] };
  });

  const summary = await fetchAndStoreInstaContent(null, null, null, null);

  expect(summary.clientA).toBeDefined();
  expect(summary.clientB).toBeDefined();
  expect(mockSendDebug).toHaveBeenCalledWith(
    expect.objectContaining({
      tag: 'IG_DELETE_CASCADE_FAILED',
      client_id: 'clientA',
      error_classification: 'REPLICATION_IDENTITY_MISSING',
      fail_safe: true,
    }),
  );
  expect(mockSendDebug).toHaveBeenCalledWith(
    expect.objectContaining({
      tag: 'IG SAFE DELETE',
      msg: expect.stringContaining('"action":"delete_fail_safe_continue"'),
      client_id: 'clientA',
    }),
  );
});

test('delete error non-replica identity tetap fail-fast', async () => {
  const todayUnix = Math.floor(Date.now() / 1000);
  mockFetchInstagramPosts.mockResolvedValue([
    {
      code: 'KEEP_TODAY',
      taken_at: todayUnix,
      comment_count: 0,
      like_count: 0,
    },
  ]);

  mockQuery.mockImplementation(async (sql, params = []) => {
    if (sql.includes('FROM clients') && sql.includes('client_status=true')) {
      return { rows: [{ id: 'clientA', client_insta: 'officialA' }] };
    }

    if (sql.includes('FROM insta_post_clients pc') && sql.includes('JOIN insta_post p')) {
      return { rows: [{ shortcode: 'OLD_A' }, { shortcode: 'KEEP_TODAY' }] };
    }

    if (sql.includes('SELECT client_insta FROM clients WHERE client_id = $1')) {
      return { rows: [{ client_insta: 'officialA' }] };
    }

    if (sql.includes('SELECT to_regclass($1) AS table_name')) {
      return { rows: [{ table_name: 'exists' }] };
    }

    if (sql.includes('SELECT p.shortcode, p.source_type, u.username')) {
      return { rows: [{ shortcode: 'OLD_A', source_type: 'cron_fetch', username: 'officialA' }] };
    }

    if (sql.includes('DELETE FROM insta_post_clients')) {
      const err = new Error('deadlock detected');
      err.code = '40P01';
      throw err;
    }

    if (sql.includes('INSERT INTO insta_post') && sql.includes('ON CONFLICT (shortcode) DO UPDATE')) {
      return { rowCount: 1, rows: [] };
    }

    return { rows: [] };
  });

  await expect(fetchAndStoreInstaContent(null, null, null, null)).rejects.toThrow('deadlock detected');

  expect(mockSendDebug).toHaveBeenCalledWith(
    expect.objectContaining({
      tag: 'IG_DELETE_CASCADE_FAILED',
      client_id: 'clientA',
      error_classification: 'UNCLASSIFIED_DELETE_ERROR',
      fail_safe: false,
    }),
  );
});
