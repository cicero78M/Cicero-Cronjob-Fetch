import { jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../src/repository/db.js', () => ({
  query: mockQuery,
}));

let getPostsTodayByClient;
let getVideoIdsTodayByClient;
let countPostsByClient;
let upsertTiktokPosts;
let upsertTiktokPostWithStatus;

const toJakartaDateInput = (date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(date);

beforeAll(async () => {
  ({ getPostsTodayByClient, getVideoIdsTodayByClient, countPostsByClient, upsertTiktokPosts, upsertTiktokPostWithStatus } = await import(
    '../src/model/tiktokPostModel.js'
  ));
});

beforeEach(() => {
  mockQuery.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

test('getPostsTodayByClient filters by Jakarta date and orders results', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2024-07-01T17:00:00.000Z'));
  mockQuery.mockResolvedValueOnce({ rows: [] });

  const expectedDate = toJakartaDateInput(new Date('2024-07-01T17:00:00.000Z'));

  await getPostsTodayByClient('Client 1');

  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringMatching(/AT TIME ZONE 'UTC'\)\s*AT TIME ZONE 'Asia\/Jakarta'\)\:\:date = \$2\:\:date/i),
    ['client 1', expectedDate]
  );
  expect(mockQuery.mock.calls[0][0]).toMatch(/ORDER BY\s+created_at\s+ASC,\s+video_id\s+ASC/i);
});

test('getPostsTodayByClient respects Jakarta-normalized referenceDate on non-WIB servers', async () => {
  const originalTZ = process.env.TZ;
  process.env.TZ = 'America/New_York';
  mockQuery.mockResolvedValueOnce({ rows: [] });

  try {
    const referenceDate = new Date('2024-06-30T17:00:00.000Z');
    const expectedDate = toJakartaDateInput(referenceDate);

    await getPostsTodayByClient('Client 2', referenceDate);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringMatching(/AT TIME ZONE 'UTC'\)\s*AT TIME ZONE 'Asia\/Jakarta'\)\:\:date = \$2\:\:date/i),
      ['client 2', expectedDate]
    );
  } finally {
    process.env.TZ = originalTZ;
  }
});

test('getVideoIdsTodayByClient applies Jakarta date filter for reference date', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  const referenceDate = new Date('2024-05-10T18:30:00.000Z');
  const expectedDate = toJakartaDateInput(referenceDate);

  await getVideoIdsTodayByClient('Client 3', referenceDate);

  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringMatching(/AT TIME ZONE 'UTC'\)\s*AT TIME ZONE 'Asia\/Jakarta'\)\:\:date = \$2\:\:date/i),
    ['client 3', expectedDate]
  );
});

function mockClientType(type = 'instansi') {
  mockQuery.mockResolvedValueOnce({ rows: [{ client_type: type }] });
}

test('countPostsByClient filters by client_id when no scope supplied', async () => {
  mockClientType('instansi');
  mockQuery.mockResolvedValueOnce({ rows: [{ jumlah_post: '4' }] });

  const result = await countPostsByClient('C1', 'harian', undefined, undefined, undefined, {});

  expect(mockQuery).toHaveBeenCalledTimes(2);
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('COUNT(DISTINCT p.video_id)');
  expect(sql).toContain('LOWER(TRIM(p.client_id)) = LOWER($1)');
  expect(result).toBe(4);
});

test('countPostsByClient applies role join for directorate scope', async () => {
  mockClientType('direktorat');
  mockQuery.mockResolvedValueOnce({ rows: [{ jumlah_post: '2' }] });

  await countPostsByClient('DITA', 'harian', undefined, undefined, undefined, {
    role: 'dita',
    scope: 'direktorat',
  });

  expect(mockQuery).toHaveBeenCalledTimes(2);
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('LEFT JOIN tiktok_post_roles pr ON pr.video_id = p.video_id');
  expect(sql).toContain('LOWER(TRIM(p.client_id)) = LOWER($1)');
  expect(sql).toContain('OR LOWER(TRIM(pr.role_name)) = LOWER($1)');
});

test('countPostsByClient filters by regional_id when provided', async () => {
  mockClientType('instansi');
  mockQuery.mockResolvedValueOnce({ rows: [{ jumlah_post: '3' }] });

  await countPostsByClient('C1', 'harian', undefined, undefined, undefined, {
    regionalId: 'jatim',
  });

  expect(mockQuery).toHaveBeenCalledTimes(2);
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('JOIN clients c ON c.client_id = p.client_id');
  expect(sql).toContain('UPPER(c.regional_id) = $2');
});

test('countPostsByClient falls back to client filter when role-scope returns zero', async () => {
  mockClientType('direktorat');
  mockQuery
    .mockResolvedValueOnce({ rows: [{ jumlah_post: '0' }] })
    .mockResolvedValueOnce({ rows: [{ jumlah_post: '5' }] });

  const result = await countPostsByClient('DITA', 'harian', undefined, undefined, undefined, {
    role: 'dita',
    scope: 'direktorat',
  });

  expect(mockQuery).toHaveBeenCalledTimes(3);
  const fallbackSql = mockQuery.mock.calls[2][0];
  expect(fallbackSql).toContain('LOWER(TRIM(p.client_id)) = LOWER($1)');
  expect(fallbackSql).not.toContain('tiktok_post_roles');
  expect(result).toBe(5);
});

test('getVideoIdsTodayByClient treats late-night UTC as same Jakarta day', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  const nearMidnightUtc = new Date('2024-02-29T17:30:00.000Z');
  const expectedJakarta = toJakartaDateInput(nearMidnightUtc);

  await getVideoIdsTodayByClient('Client 4', nearMidnightUtc);

  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringMatching(/AT TIME ZONE 'UTC'\)\s*AT TIME ZONE 'Asia\/Jakarta'\)\:\:date = \$2\:\:date/i),
    ['client 4', expectedJakarta]
  );
  expect(expectedJakarta).toBe('2024-03-01');
});


test('upsertTiktokPosts writes internal created_at and original_created_at separately', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });

  await upsertTiktokPosts('CLIENT_X', [
    {
      video_id: 'vid-001',
      caption: 'caption',
      like_count: 5,
      comment_count: 1,
      created_at: '2024-03-10T08:30:00.000Z',
      original_created_at: '2024-03-09T08:30:00.000Z',
      source_type: 'manual_input',
    },
  ]);

  expect(mockQuery).toHaveBeenCalledTimes(1);
  const [sql, params] = mockQuery.mock.calls[0];
  expect(sql).toContain('original_created_at');
  expect(params[5]).toBe('2024-03-10T08:30:00.000Z');
  expect(params[6]).toBe('2024-03-09T08:30:00.000Z');
  expect(params[7]).toBe('manual_input');
});


test('upsertTiktokPosts keeps manual_input source_type when cron payload upserts conflict', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });

  await upsertTiktokPosts('CLIENT_X', [
    {
      video_id: 'vid-002',
      caption: 'cron caption',
      like_count: 1,
      comment_count: 0,
      source_type: 'cron_fetch',
    },
  ]);

  expect(mockQuery).toHaveBeenCalledTimes(1);
  const [sql, params] = mockQuery.mock.calls[0];
  expect(sql).toContain("WHEN tiktok_post.source_type = 'manual_input' THEN tiktok_post.source_type");
  expect(params[7]).toBe('cron_fetch');
});

test('upsertTiktokPostWithStatus keeps manual_input source_type when cron payload upserts conflict', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ inserted: false }] });

  const result = await upsertTiktokPostWithStatus({
    client_id: 'CLIENT_Y',
    video_id: 'vid-003',
    caption: 'cron update',
    like_count: 12,
    comment_count: 4,
    source_type: 'cron_fetch',
  });

  expect(result).toEqual({ inserted: false, updated: true });
  const [sql, params] = mockQuery.mock.calls[0];
  expect(sql).toContain("WHEN tiktok_post.source_type = 'manual_input' THEN tiktok_post.source_type");
  expect(params[7]).toBe('cron_fetch');
});
