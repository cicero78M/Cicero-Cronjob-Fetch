import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetUsersByClient = jest.fn();
const mockGetPostsTodayByClient = jest.fn();
const mockGetCommentsByVideoId = jest.fn();
const mockSendDebug = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersByClient: mockGetUsersByClient,
  getUsersByDirektorat: jest.fn(),
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

beforeEach(() => {
  jest.clearAllMocks();
});

test('returns compact analytical recap with lampiran details', async () => {
  mockQuery.mockResolvedValue({
    rows: [{ nama: 'POLRES X', client_tiktok: '@polresx', client_type: 'org' }],
  });
  mockGetUsersByClient.mockResolvedValue([
    {
      user_id: '1',
      nama: 'Personel 1',
      title: 'AKP',
      divisi: 'SAT INTEL',
      tiktok: 'user1',
      status: true,
    },
    {
      user_id: '2',
      nama: 'Personel 2',
      title: 'IPDA',
      divisi: 'SAT INTEL',
      tiktok: 'user2',
      status: true,
    },
    {
      user_id: '3',
      nama: 'Personel 3',
      title: 'BRIPTU',
      divisi: 'SAT RESKRIM',
      tiktok: '',
      status: true,
    },
  ]);
  mockGetPostsTodayByClient.mockResolvedValue([
    { video_id: 'v1', caption: 'Konten A' },
    { video_id: 'v2', caption: 'Konten B' },
  ]);
  mockGetCommentsByVideoId
    .mockResolvedValueOnce({ comments: [{ username: 'user1' }, { username: 'user2' }] })
    .mockResolvedValueOnce({ comments: [{ username: 'user1' }] });

  let absensiKomentar;
  await jest.isolateModulesAsync(async () => {
    ({ absensiKomentar } = await import('../src/handler/fetchabsensi/tiktok/absensiKomentarTiktok.js'));
  });

  const message = await absensiKomentar('polres_x');

  expect(message).toMatch(/📊 \*Rekap Analitik Komentar TikTok\*/);
  expect(message).toMatch(/\*Ringkasan Capaian\*/);
  expect(message).toMatch(/• Konten dipantau : 2/);
  expect(message).toMatch(/• Performa tertinggi : Konten A – 2 akun/);
  expect(message).toMatch(/1\. AKP Personel 1/);
  expect(message).toMatch(/\*Catatan personel:\*/);
  expect(message).toMatch(/📎 ✅ \*Lampiran – Personel mencapai target\*/);
  expect(message).toMatch(/📎 ❌ \*Lampiran – Personel belum mencapai target\*/);
});

afterAll(() => {
  jest.resetModules();
});
