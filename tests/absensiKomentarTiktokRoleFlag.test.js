import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetUsersByClient = jest.fn();
const mockGetUsersByDirektorat = jest.fn();
const mockGetPostsTodayByClient = jest.fn();
const mockGetCommentsByVideoId = jest.fn();
const mockSendDebug = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersByClient: mockGetUsersByClient,
  getUsersByDirektorat: mockGetUsersByDirektorat,
  getClientsByRole: jest.fn(),
}));
jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({
  getPostsTodayByClient: mockGetPostsTodayByClient,
  findPostByVideoId: jest.fn(),
  deletePostByVideoId: jest.fn(),
}));
jest.unstable_mockModule('../src/model/tiktokCommentModel.js', () => ({
  getCommentsByVideoId: mockGetCommentsByVideoId,
  deleteCommentsByVideoId: jest.fn(),
}));
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
  sendDebug: mockSendDebug,
}));

let absensiKomentar;

beforeAll(async () => {
  ({ absensiKomentar } = await import('../src/handler/fetchabsensi/tiktok/absensiKomentarTiktok.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('uses getUsersByDirektorat when roleFlag is a directorate', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ nama: 'POLRES ABC', client_tiktok: '@abc', client_type: 'org' }] });
  mockGetUsersByDirektorat.mockResolvedValueOnce([]);
  mockGetPostsTodayByClient.mockResolvedValueOnce([]);

  await absensiKomentar('POLRES', { roleFlag: 'ditbinmas' });

  expect(mockGetUsersByDirektorat).toHaveBeenCalledWith('ditbinmas');
  expect(mockGetUsersByClient).not.toHaveBeenCalled();
});
