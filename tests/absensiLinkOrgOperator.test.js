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

test('uses operator role for org clients', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ nama: 'ORG A', client_type: 'ORG' }] });
  mockGetOperatorsByClient.mockResolvedValueOnce([]);
  mockGetShortcodesTodayByClient.mockResolvedValueOnce([]);

  await absensiLink('ORG1');

  expect(mockGetOperatorsByClient).toHaveBeenCalledWith('ORG1');
  expect(mockGetUsersByClient).not.toHaveBeenCalled();
  expect(mockGetUsersByDirektorat).not.toHaveBeenCalled();
});
