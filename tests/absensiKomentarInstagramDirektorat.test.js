import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetUsersByDirektorat = jest.fn();
const mockGetShortcodesTodayByClient = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersByClient: jest.fn(),
  getUsersByDirektorat: mockGetUsersByDirektorat,
}));
jest.unstable_mockModule('../src/model/instaPostModel.js', () => ({
  getShortcodesTodayByClient: mockGetShortcodesTodayByClient,
}));

let absensiKomentarInstagram;
beforeAll(async () => {
  ({ absensiKomentarInstagram } = await import('../src/handler/fetchabsensi/insta/absensiKomentarInstagram.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('uses getUsersByDirektorat without client filter', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ nama: 'DIT BINMAS' }] });
  mockGetUsersByDirektorat.mockResolvedValueOnce([]);
  mockGetShortcodesTodayByClient.mockResolvedValueOnce([]);

  await absensiKomentarInstagram('ditbinmas', { roleFlag: 'ditbinmas' });

  expect(mockGetUsersByDirektorat).toHaveBeenCalledWith('ditbinmas');
});

