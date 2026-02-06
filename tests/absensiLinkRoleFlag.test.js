import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetUsersByClient = jest.fn();
const mockGetUsersByDirektorat = jest.fn();
const mockGetOperatorsByClient = jest.fn();
const mockGetShortcodesTodayByClient = jest.fn();
const mockGetReportsTodayByClient = jest.fn();
const mockGetReportsTodayByShortcode = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersByClient: mockGetUsersByClient,
  getUsersByDirektorat: mockGetUsersByDirektorat,
  getOperatorsByClient: mockGetOperatorsByClient,
}));
jest.unstable_mockModule('../src/model/instaPostModel.js', () => ({
  getShortcodesTodayByClient: mockGetShortcodesTodayByClient,
}));
jest.unstable_mockModule('../src/model/linkReportModel.js', () => ({
  getReportsTodayByClient: mockGetReportsTodayByClient,
  getReportsTodayByShortcode: mockGetReportsTodayByShortcode,
}));

let absensiLink;

beforeAll(async () => {
  ({ absensiLink } = await import('../src/handler/fetchabsensi/link/absensiLinkAmplifikasi.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('filters users by roleFlag when provided', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ nama: 'POLRES ABC', client_type: 'instansi' }] });
  mockGetUsersByClient.mockResolvedValueOnce([]);
  mockGetShortcodesTodayByClient.mockResolvedValueOnce([]);

  await absensiLink('POLRES', { roleFlag: 'ditbinmas' });

  expect(mockGetUsersByClient).toHaveBeenCalledWith('POLRES', 'ditbinmas');
  expect(mockGetUsersByDirektorat).not.toHaveBeenCalled();
});

test('reports per-user task and link counts', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ nama: 'POLRES ABC', client_type: 'instansi' }] });
  mockGetUsersByClient.mockResolvedValueOnce([
    { user_id: 1, title: 'AIPTU', nama: 'HARIS ANTON A.', divisi: 'SI KEU', status: true, exception: false },
    { user_id: 2, title: 'BRIPTU', nama: 'BUDI', divisi: 'SI KEU', status: true, exception: false },
  ]);
  mockGetShortcodesTodayByClient.mockResolvedValueOnce(['sc1', 'sc2']);
  mockGetReportsTodayByClient.mockResolvedValueOnce([
    {
      user_id: 1,
      facebook_link: 'f',
      instagram_link: 'i',
      twitter_link: 't',
      tiktok_link: 'tt',
      youtube_link: 'y',
    },
  ]);

  const msg = await absensiLink('POLRES');

  expect(msg).toContain('SI KEU – AIPTU HARIS ANTON A. (Sudah: 1 Tugas / Belum: 1 Tugas / Total Link: 5 Link)');
  expect(msg).toContain('SI KEU – BRIPTU BUDI (Sudah: 0 Tugas / Belum: 2 Tugas / Total Link: 0 Link)');
});
