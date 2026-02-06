import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetUsersByDirektorat = jest.fn();
const mockGetClientsByRole = jest.fn();
const mockGetUsersByClient = jest.fn();
const mockGetPostsTodayByClient = jest.fn();
const mockGetCommentsByVideoId = jest.fn();
const mockSendDebug = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersByDirektorat: mockGetUsersByDirektorat,
  getClientsByRole: mockGetClientsByRole,
  getUsersByClient: mockGetUsersByClient,
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
jest.unstable_mockModule('../src/utils/constants.js', () => ({ hariIndo: [] }));
jest.unstable_mockModule('../src/utils/utilsHelper.js', () => ({
  groupByDivision: () => ({}),
  sortDivisionKeys: () => [],
  formatNama: () => '',
}));
jest.unstable_mockModule('../src/utils/sqlPriority.js', () => ({
  getNamaPriorityIndex: () => 0,
}));
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
  sendDebug: mockSendDebug,
}));

let collectKomentarRecap;

const toJakartaDateInput = (date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(date);

beforeEach(() => {
  jest.clearAllMocks();
});

test('collectKomentarRecap forwards Jakarta-normalized referenceDate to TikTok post query', async () => {
  const originalTZ = process.env.TZ;
  process.env.TZ = 'UTC';
  mockQuery.mockResolvedValueOnce({
    rows: [{ nama: 'POLRES A', client_tiktok: '@polresa', client_type: 'org' }],
  });
  mockGetUsersByDirektorat.mockResolvedValue([]);
  mockGetClientsByRole.mockResolvedValue([]);
  mockGetUsersByClient.mockResolvedValue([]);
  mockGetPostsTodayByClient.mockResolvedValue([{ video_id: 'VID-1' }]);
  mockGetCommentsByVideoId.mockResolvedValue({ comments: [] });

  try {
    await jest.isolateModulesAsync(async () => {
      ({ collectKomentarRecap } = await import(
        '../src/handler/fetchabsensi/tiktok/absensiKomentarTiktok.js'
      ));
    });

    const referenceDate = new Date('2024-01-01T18:00:00.000Z');
    const expectedDate = toJakartaDateInput(referenceDate);

    await collectKomentarRecap('polres_a', { selfOnly: true, referenceDate });

    expect(mockGetPostsTodayByClient).toHaveBeenCalledWith(
      'polres_a',
      expectedDate
    );
  } finally {
    process.env.TZ = originalTZ;
  }
});
