import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetUsersByDirektorat = jest.fn();
const mockGetPostsTodayByClient = jest.fn();
const mockGetCommentsByVideoId = jest.fn();
const mockSendDebug = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersByClient: jest.fn(),
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
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({ sendDebug: mockSendDebug }));

let absensiKomentar;
beforeAll(async () => {
  ({ absensiKomentar } = await import('../src/handler/fetchabsensi/tiktok/absensiKomentarTiktok.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('aggregates directorate data per client', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ nama: 'DIT A', client_tiktok: '@dita', client_type: 'direktorat' }] })
    .mockResolvedValueOnce({ rows: [{ nama: 'POLRES A', client_tiktok: '@a', client_type: 'org' }] })
    .mockResolvedValueOnce({ rows: [{ nama: 'POLRES B', client_tiktok: '@b', client_type: 'org' }] });
  mockGetUsersByDirektorat.mockResolvedValueOnce([
    { user_id: 1, client_id: 'polres_a', tiktok: 'usera', status: true, exception: false },
    { user_id: 2, client_id: 'polres_b', tiktok: 'userb', status: true, exception: false },
  ]);
  mockGetPostsTodayByClient.mockResolvedValueOnce([{ video_id: 'v1' }]);
  mockGetCommentsByVideoId.mockResolvedValueOnce({ comments: [{ username: 'usera' }] });

  const msg = await absensiKomentar('ditbinmas', { roleFlag: 'ditbinmas' });

  expect(mockGetUsersByDirektorat).toHaveBeenCalledWith('ditbinmas');

  expect(msg).toContain(
    '*1. POLRES A*\n*Jumlah user:* 1\n*Sudah Melaksanakan* : *1 user*\n- Melaksanakan Lengkap : 1 user'
  );
  expect(msg).toContain('POLRES B');
  expect(msg).toContain('❌ *Belum Melaksanakan* : *1 user*');
  expect(msg).not.toMatch(/usera/i);
});

test('sorts satker reports with Ditbinmas first and by percentage and count', async () => {
  mockQuery.mockImplementation(async (sql, params) => {
    const cid = (params[0] || '').toString().toUpperCase();
    return { rows: [{ nama: cid, client_tiktok: '', client_type: 'org' }] };
  });
  mockGetPostsTodayByClient.mockResolvedValueOnce([{ video_id: 'v1' }]);

  function createUsers(clientId, total) {
    const normalizedId = clientId.toLowerCase();
    return Array.from({ length: total }, (_, i) => {
      const username = `user${normalizedId}${i}`;
      return {
        user_id: `${clientId}-${i}`,
        client_id: clientId,
        tiktok: username,
        status: true,
        exception: false,
      };
    });
  }

  const users = [
    ...createUsers('DITBINMAS', 2),
    ...createUsers('POLRES_A', 100),
    ...createUsers('POLRES_B', 100),
    ...createUsers('POLRES_C', 99),
    ...createUsers('POLRES_D', 99),
  ];
  mockGetUsersByDirektorat.mockResolvedValueOnce(users);

  const commentUsernames = [];
  function addComments(clientId, sudah) {
    const normalizedId = clientId.toLowerCase();
    for (let i = 0; i < sudah; i += 1) {
      commentUsernames.push({ username: `user${normalizedId}${i}` });
    }
  }

  addComments('DITBINMAS', 1);
  addComments('POLRES_A', 80);
  addComments('POLRES_B', 50);
  addComments('POLRES_C', 70);
  addComments('POLRES_D', 75);

  mockGetCommentsByVideoId.mockResolvedValueOnce({ comments: commentUsernames });

  const msg = await absensiKomentar('DITBINMAS', { roleFlag: 'ditbinmas' });

  const idxDitbinmas = msg.indexOf('DITBINMAS');
  const idxA = msg.indexOf('POLRES_A');
  const idxB = msg.indexOf('POLRES_B');
  const idxD = msg.indexOf('POLRES_D');
  const idxC = msg.indexOf('POLRES_C');
  expect(idxDitbinmas).toBeLessThan(idxA);
  expect(idxA).toBeLessThan(idxB);
  expect(idxB).toBeLessThan(idxD);
  expect(idxD).toBeLessThan(idxC);
});
