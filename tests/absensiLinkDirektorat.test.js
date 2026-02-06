import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetUsersByDirektorat = jest.fn();
const mockGetOperatorsByClient = jest.fn();
const mockGetShortcodesTodayByClient = jest.fn();
const mockGetReportsTodayByClient = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersByClient: jest.fn(),
  getUsersByDirektorat: mockGetUsersByDirektorat,
  getOperatorsByClient: mockGetOperatorsByClient,
}));
jest.unstable_mockModule('../src/model/instaPostModel.js', () => ({
  getShortcodesTodayByClient: mockGetShortcodesTodayByClient,
}));
jest.unstable_mockModule('../src/model/linkReportModel.js', () => ({
  getReportsTodayByClient: mockGetReportsTodayByClient,
  getReportsTodayByShortcode: jest.fn(),
}));
jest.unstable_mockModule('../src/utils/utilsHelper.js', () => ({
  getGreeting: () => 'Selamat pagi',
  groupByDivision: jest.fn(),
  sortDivisionKeys: jest.fn(),
  formatUserData: jest.fn(),
}));

let absensiLink;
beforeAll(async () => {
  ({ absensiLink } = await import('../src/handler/fetchabsensi/link/absensiLinkAmplifikasi.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('aggregates directorate data per client', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ nama: 'DIT A', client_type: 'direktorat' }] })
    .mockResolvedValueOnce({ rows: [{ nama: 'POLRES A', client_type: 'org' }] })
    .mockResolvedValueOnce({ rows: [{ nama: 'POLRES B', client_type: 'org' }] });
  mockGetShortcodesTodayByClient.mockResolvedValueOnce(['sc1']);
  mockGetUsersByDirektorat.mockResolvedValueOnce([
    { user_id: 1, client_id: 'polres_a', status: true, exception: false },
    { user_id: 2, client_id: 'polres_b', status: true, exception: false },
  ]);
  mockGetReportsTodayByClient.mockResolvedValueOnce([
    { user_id: 1, client_id: 'polres_a', facebook_link: 'f' },
  ]);

  const msg = await absensiLink('ditA');

  expect(msg).toContain('POLRES A');
  expect(msg).toContain('✅ *Sudah melaksanakan* : *1 user*');
  expect(msg).toContain('POLRES B');
  expect(msg).toContain('❌ *Belum melaksanakan* : *1 user*');
  expect(msg).not.toMatch(/\bAIPTU\b/i);
});
