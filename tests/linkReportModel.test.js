import { jest } from '@jest/globals';

import { PRIORITY_USER_NAMES } from '../src/utils/constants.js';

const mockQuery = jest.fn();

jest.unstable_mockModule('../src/repository/db.js', () => ({
  query: mockQuery
}));

let createLinkReport;
let getLinkReports;
let findLinkReportByShortcode;
let getReportsTodayByClient;
let getReportsYesterdayByClient;
let getReportsTodayByShortcode;
let getReportsThisMonthByClient;
let getReportsPrevMonthByClient;
let getRekapLinkByClient;
let hasRecentLinkReport;

beforeAll(async () => {
  const mod = await import('../src/model/linkReportModel.js');
  createLinkReport = mod.createLinkReport;
  getLinkReports = mod.getLinkReports;
  findLinkReportByShortcode = mod.findLinkReportByShortcode;
  getReportsTodayByClient = mod.getReportsTodayByClient;
  getReportsYesterdayByClient = mod.getReportsYesterdayByClient;
  getReportsTodayByShortcode = mod.getReportsTodayByShortcode;
  getReportsThisMonthByClient = mod.getReportsThisMonthByClient;
  getReportsPrevMonthByClient = mod.getReportsPrevMonthByClient;
  getRekapLinkByClient = mod.getRekapLinkByClient;
  hasRecentLinkReport = mod.hasRecentLinkReport;
});

beforeEach(() => {
  mockQuery.mockReset();
});

function mockClientType(type = 'instansi') {
  mockQuery.mockResolvedValueOnce({ rows: [{ client_type: type }] });
}

const PRIORITY_UPPER = PRIORITY_USER_NAMES.map(name => name.toUpperCase());

function expectPriorityTail(params, expectedPrefixLength) {
  expect(params.slice(expectedPrefixLength)).toEqual(PRIORITY_UPPER);
}

test('createLinkReport inserts row', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ shortcode: 'abc' }] });
  const data = { shortcode: 'abc', user_id: '1', instagram_link: 'a' };
  const res = await createLinkReport(data);
  expect(res).toEqual({ shortcode: 'abc' });
  expect(mockQuery).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining('FROM link_report'),
    ['abc', '1']
  );
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain("p.created_at >= (NOW() AT TIME ZONE 'Asia/Jakarta') - INTERVAL '2 days'");
  expect(mockQuery).toHaveBeenNthCalledWith(
    2,
    expect.any(String),
    ['abc', '1', 'a', null, null, null, null]
  );
});

test('hasRecentLinkReport enforces 2-day interval', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await hasRecentLinkReport('abc', 'user-1');
  const sql = mockQuery.mock.calls[0][0];
  expect(sql).toContain("INTERVAL '2 days'");
});

test('createLinkReport throws when shortcode missing or older than 2 days', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] });
  await expect(
    createLinkReport({ shortcode: 'xyz', user_id: '1' })
  ).rejects.toThrow('shortcode not found or older than 2 days');
  expect(mockQuery).toHaveBeenCalledTimes(2);
});

test('createLinkReport throws when recent link report exists', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ exists: 1 }] });
  await expect(
    createLinkReport({ shortcode: 'abc', user_id: '1' })
  ).rejects.toThrow('anda mengirimkan link duplikasi');
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('FROM link_report'),
    ['abc', '1']
  );
});

test('getLinkReports joins with insta_post', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ shortcode: 'abc', caption: 'c' }] })
    .mockResolvedValueOnce({ rows: [{ count: '1' }] });
  const result = await getLinkReports();
  expect(result).toEqual({
    rows: [{ shortcode: 'abc', caption: 'c' }],
    totalCount: 1,
    limit: 20,
    offset: 0
  });
  expect(mockQuery).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining('FROM link_report r'),
    [20, 0]
  );
  expect(mockQuery).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining('SELECT COUNT(*)::int AS count FROM link_report')
  );
});

test('findLinkReportByShortcode joins with insta_post', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ shortcode: 'abc', caption: 'c' }] });
  const row = await findLinkReportByShortcode('abc', '1');
  expect(row).toEqual({ shortcode: 'abc', caption: 'c' });
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('WHERE r.shortcode = $1'),
    ['abc', '1']
  );
});

test('getReportsTodayByClient joins insta_post and filters by date', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ client_type: 'instansi' }] })
    .mockResolvedValueOnce({ rows: [{ shortcode: 'x' }] });
  const rows = await getReportsTodayByClient('POLRES');
  expect(rows).toEqual([{ shortcode: 'x' }]);
  expect(mockQuery).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining('SELECT client_type FROM clients'),
    ['POLRES']
  );
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('JOIN insta_post p ON p.shortcode = r.shortcode');
  expect(sql).toContain('JOIN "user" u ON u.user_id = r.user_id');
  expect(sql).toContain("p.created_at::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date");
  expect(sql).toContain("r.created_at::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date");
});

test('getReportsYesterdayByClient joins insta_post and filters by date', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ client_type: 'instansi' }] })
    .mockResolvedValueOnce({ rows: [{ shortcode: 'y' }] });
  const rows = await getReportsYesterdayByClient('POLRES');
  expect(rows).toEqual([{ shortcode: 'y' }]);
  expect(mockQuery).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining('SELECT client_type FROM clients'),
    ['POLRES']
  );
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('JOIN insta_post p ON p.shortcode = r.shortcode');
  expect(sql).toContain('JOIN "user" u ON u.user_id = r.user_id');
  expect(sql).toContain("p.created_at::date = (NOW() AT TIME ZONE 'Asia/Jakarta' - INTERVAL '1 day')::date");
  expect(sql).toContain("r.created_at::date = (NOW() AT TIME ZONE 'Asia/Jakarta' - INTERVAL '1 day')::date");
});

test('getReportsTodayByShortcode filters by client and shortcode', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ client_type: 'instansi' }] })
    .mockResolvedValueOnce({ rows: [{ shortcode: 'abc' }] });
  const rows = await getReportsTodayByShortcode('POLRES', 'abc');
  expect(rows).toEqual([{ shortcode: 'abc' }]);
  expect(mockQuery).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining('SELECT client_type FROM clients'),
    ['POLRES']
  );
  expect(mockQuery).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining('r.shortcode = $2'),
    ['POLRES', 'abc']
  );
});

test('getReportsTodayByClient uses role filter for directorate', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ client_type: 'direktorat' }] })
    .mockResolvedValueOnce({ rows: [] });
  await getReportsTodayByClient('ditbinmas');
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('user_roles');
  expect(sql).toContain('roles');
  expect(sql).toContain('role_name = $1');
});

test('getReportsTodayByShortcode uses role filter for directorate', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ client_type: 'direktorat' }] })
    .mockResolvedValueOnce({ rows: [] });
  await getReportsTodayByShortcode('ditbinmas', 'abc');
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('user_roles');
  expect(sql).toContain('roles');
  expect(sql).toContain('role_name = $1');
});

test('getReportsThisMonthByClient selects monthly rows', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ date: '2024-01-01' }] });
  const rows = await getReportsThisMonthByClient('POLRES');
  expect(rows).toEqual([{ date: '2024-01-01' }]);
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining("date_trunc('month', r.created_at AT TIME ZONE 'Asia/Jakarta')"),
    ['POLRES']
  );
});

test('getReportsPrevMonthByClient selects previous month rows', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ date: '2023-12-01' }] });
  const rows = await getReportsPrevMonthByClient('POLRES');
  expect(rows).toEqual([{ date: '2023-12-01' }]);
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining("date_trunc('month', (NOW() AT TIME ZONE 'Asia/Jakarta') - INTERVAL '1 month')"),
    ['POLRES']
  );
});

test('getRekapLinkByClient uses provided date', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ jumlah_post: '1' }] })
    .mockResolvedValueOnce({ rows: [] });
  await getRekapLinkByClient('POLRES', 'harian', '2024-01-02');
  expect(mockQuery).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining('FROM insta_post p'),
    ['POLRES', '2024-01-02']
  );
  expect(mockQuery).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining('link_sum AS'),
    expect.any(Array)
  );
  expect(mockQuery.mock.calls[1][1].slice(0, 2)).toEqual(['POLRES', '2024-01-02']);
  expectPriorityTail(mockQuery.mock.calls[1][1], 2);
});

test('getRekapLinkByClient handles start_date and end_date', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ jumlah_post: '2' }] })
    .mockResolvedValueOnce({ rows: [] });
  await getRekapLinkByClient('POLRES', 'harian', null, '2024-01-01', '2024-01-31');
  expect(mockQuery).toHaveBeenCalledTimes(2);
  expect(mockQuery).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining('BETWEEN $2::date AND $3::date'),
    ['POLRES', '2024-01-01', '2024-01-31']
  );
  expect(mockQuery).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining('BETWEEN $2::date AND $3::date'),
    expect.any(Array)
  );
  expect(mockQuery.mock.calls[1][1].slice(0, 3)).toEqual(['POLRES', '2024-01-01', '2024-01-31']);
  expectPriorityTail(mockQuery.mock.calls[1][1], 3);
});

test('getRekapLinkByClient applies post date filter in link_sum', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ jumlah_post: '0' }] })
    .mockResolvedValueOnce({
      rows: [
        {
          user_id: 'u1',
          title: 'Aiptu',
          nama: 'Budi',
          username: 'budi',
          divisi: 'Humas',
          exception: false,
          jumlah_link: 1
        }
      ]
    });
  await getRekapLinkByClient('POLRES');
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('p.created_at');
  expect(sql).toContain('r.created_at');
  expectPriorityTail(mockQuery.mock.calls[1][1], 1);
});

test('getRekapLinkByClient marks sudahMelaksanakan when user has links', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ jumlah_post: '1' }] })
    .mockResolvedValueOnce({
      rows: [
        {
          user_id: 'u1',
          title: 'Aiptu',
          nama: 'Budi',
          username: 'budi',
          divisi: 'Humas',
          exception: false,
          jumlah_link: 1
        }
      ]
    });
  const rows = await getRekapLinkByClient('POLRES');
  expect(rows[0].sudahMelaksanakan).toBe(true);
});

test('getRekapLinkByClient applies priority ordering to nama', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ jumlah_post: '0' }] })
    .mockResolvedValueOnce({ rows: [] });
  await getRekapLinkByClient('POLRES');
  const sql = mockQuery.mock.calls[1][0];
  const matches = sql.match(/WHEN UPPER\(u\.nama\) = \$\d+/g) || [];
  expect(matches.length).toBeGreaterThanOrEqual(PRIORITY_UPPER.length);
  expect(sql).toContain('CASE WHEN');
  expect(sql).toContain('UPPER(u.nama)');
});

test('getRekapLinkByClient includes directorate role filter for ditbinmas', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ jumlah_post: '0' }] })
    .mockResolvedValueOnce({ rows: [] });
  await getRekapLinkByClient('ditbinmas', 'harian', undefined, undefined, undefined, 'ditbinmas');
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('insta_post_roles');
  expect(sql).toContain('user_roles');
});
