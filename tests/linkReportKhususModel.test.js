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
let getReportsTodayByShortcode;
let getRekapLinkByClient;

beforeAll(async () => {
  const mod = await import('../src/model/linkReportKhususModel.js');
  createLinkReport = mod.createLinkReport;
  getLinkReports = mod.getLinkReports;
  findLinkReportByShortcode = mod.findLinkReportByShortcode;
  getReportsTodayByClient = mod.getReportsTodayByClient;
  getReportsTodayByShortcode = mod.getReportsTodayByShortcode;
  getRekapLinkByClient = mod.getRekapLinkByClient;
});

beforeEach(() => {
  mockQuery.mockReset();
});

const PRIORITY_UPPER = PRIORITY_USER_NAMES.map(name => name.toUpperCase());

test('createLinkReport inserts row', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ shortcode: 'abc' }] });
  const data = { shortcode: 'abc', user_id: '1', instagram_link: 'a' };
  const res = await createLinkReport(data);
  expect(res).toEqual({ shortcode: 'abc' });
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('FROM insta_post_khusus p'),
    ['abc', '1', 'a', null, null, null, null]
  );
});

test('createLinkReport throws when shortcode missing or not today', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await expect(createLinkReport({ shortcode: 'xyz' })).rejects.toThrow(
    'shortcode not found or not from today'
  );
  expect(mockQuery).toHaveBeenCalled();
});

test('getLinkReports joins with insta_post_khusus', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ shortcode: 'abc', caption: 'c' }] });
  const rows = await getLinkReports();
  expect(rows).toEqual([{ shortcode: 'abc', caption: 'c' }]);
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('FROM link_report_khusus r'),
    expect.any(Array)
  );
});

test('findLinkReportByShortcode joins with insta_post_khusus', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ shortcode: 'abc', caption: 'c' }] });
  const row = await findLinkReportByShortcode('abc', '1');
  expect(row).toEqual({ shortcode: 'abc', caption: 'c' });
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('WHERE r.shortcode = $1'),
    ['abc', '1']
  );
});

test('getReportsTodayByClient filters by client', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ shortcode: 'x' }] });
  const rows = await getReportsTodayByClient('POLRES');
  expect(rows).toEqual([{ shortcode: 'x' }]);
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('JOIN "user" u ON u.user_id = r.user_id'),
    ['POLRES']
  );
});

test('getReportsTodayByClient filters by client and operator role', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ shortcode: 'x' }] });
  const rows = await getReportsTodayByClient('POLRES', 'operator');
  expect(rows).toEqual([{ shortcode: 'x' }]);
  const calledQuery = mockQuery.mock.calls[0][0];
  expect(calledQuery).toMatch(/JOIN user_roles ur ON ur\.user_id = u\.user_id/);
  expect(calledQuery).toMatch(/JOIN roles ro ON ur\.role_id = ro\.role_id/);
  expect(calledQuery).toMatch(/LOWER\(ro\.role_name\) = 'operator'/);
  expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['POLRES']);
});

test('getReportsTodayByShortcode filters by client and shortcode', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ shortcode: 'abc' }] });
  const rows = await getReportsTodayByShortcode('POLRES', 'abc');
  expect(rows).toEqual([{ shortcode: 'abc' }]);
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('r.shortcode = $2'),
    ['POLRES', 'abc']
  );
});

test('getReportsTodayByShortcode filters by client, shortcode and operator role', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ shortcode: 'abc' }] });
  const rows = await getReportsTodayByShortcode('POLRES', 'abc', 'operator');
  expect(rows).toEqual([{ shortcode: 'abc' }]);
  const calledQuery = mockQuery.mock.calls[0][0];
  expect(calledQuery).toMatch(/JOIN user_roles ur ON ur\.user_id = u\.user_id/);
  expect(calledQuery).toMatch(/JOIN roles ro ON ur\.role_id = ro\.role_id/);
  expect(calledQuery).toMatch(/LOWER\(ro\.role_name\) = 'operator'/);
  expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['POLRES', 'abc']);
});

test('getRekapLinkByClient_khusus orders by priority list first', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ jumlah_post: '0' }] })
    .mockResolvedValueOnce({ rows: [] });
  await getRekapLinkByClient('POLRES');
  expect(mockQuery).toHaveBeenCalledTimes(2);
  const sql = mockQuery.mock.calls[1][0];
  const params = mockQuery.mock.calls[1][1];
  expect(params.slice(0, 1)).toEqual(['POLRES']);
  expect(params.slice(1)).toEqual(PRIORITY_UPPER);
  const matches = sql.match(/WHEN UPPER\(u\.nama\) = \$\d+/g) || [];
  expect(matches.length).toBeGreaterThanOrEqual(PRIORITY_UPPER.length);
  expect(sql).toContain('CASE WHEN');
  expect(sql).toContain('UPPER(u.nama)');
});

test('getRekapLinkByClient_khusus filters by operator role', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ jumlah_post: '5' }] })
    .mockResolvedValueOnce({ rows: [{ user_id: '1', nama: 'User 1', jumlah_link: '10' }] });
  await getRekapLinkByClient('POLRES', 'harian', null, 'operator');
  expect(mockQuery).toHaveBeenCalledTimes(2);
  const sql = mockQuery.mock.calls[1][0];
  const params = mockQuery.mock.calls[1][1];
  expect(sql).toMatch(/AND EXISTS \(/);
  expect(sql).toMatch(/JOIN roles r ON ur\.role_id = r\.role_id/);
  expect(sql).toMatch(/LOWER\(r\.role_name\) = LOWER\(\$\d+\)/);
  expect(params[params.length - 1]).toBe('operator');
});
