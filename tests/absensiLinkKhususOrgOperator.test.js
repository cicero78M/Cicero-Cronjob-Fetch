import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetUsersByClient = jest.fn();
const mockGetOperatorsByClient = jest.fn();
const mockGetShortcodesTodayByClient = jest.fn();
const mockGetReportsTodayByClient = jest.fn();
const mockGetReportsTodayByShortcode = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersByClient: mockGetUsersByClient,
  getOperatorsByClient: mockGetOperatorsByClient,
}));
jest.unstable_mockModule('../src/model/instaPostKhususModel.js', () => ({
  getShortcodesTodayByClient: mockGetShortcodesTodayByClient,
}));
jest.unstable_mockModule('../src/model/linkReportKhususModel.js', () => ({
  getReportsTodayByClient: mockGetReportsTodayByClient,
  getReportsTodayByShortcode: mockGetReportsTodayByShortcode,
}));

let absensiLinkKhusus;

beforeAll(async () => {
  ({ absensiLinkKhusus } = await import('../src/handler/fetchabsensi/link/absensiLinkKhusus.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('uses operator role for org clients', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ nama: 'ORG A', client_type: 'ORG' }] });
  mockGetOperatorsByClient.mockResolvedValueOnce([]);
  mockGetShortcodesTodayByClient.mockResolvedValueOnce([]);

  await absensiLinkKhusus('ORG1');

  expect(mockGetOperatorsByClient).toHaveBeenCalledWith('ORG1');
  expect(mockGetUsersByClient).not.toHaveBeenCalled();
});

test('passes operator roleFlag to getReportsTodayByClient when roleFlag is operator', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ nama: 'TEST', client_type: 'polres' }] });
  mockGetOperatorsByClient.mockResolvedValueOnce([{ user_id: '1', nama: 'User 1' }]);
  mockGetShortcodesTodayByClient.mockResolvedValueOnce(['abc123']);
  mockGetReportsTodayByClient.mockResolvedValueOnce([]);

  await absensiLinkKhusus('TEST', { roleFlag: 'operator' });

  expect(mockGetOperatorsByClient).toHaveBeenCalledWith('TEST');
  expect(mockGetReportsTodayByClient).toHaveBeenCalledWith('TEST', 'operator');
});

