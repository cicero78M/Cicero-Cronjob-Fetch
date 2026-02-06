import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetShortcodesTodayByClient = jest.fn();
const mockGetLikesByShortcode = jest.fn();
const mockGetClientsByRole = jest.fn();
const mockGetUsersByDirektorat = jest.fn();
const mockGetUsersByClient = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/model/instaPostModel.js', () => ({
  getShortcodesTodayByClient: mockGetShortcodesTodayByClient,
}));
jest.unstable_mockModule('../src/model/instaLikeModel.js', () => ({
  getLikesByShortcode: mockGetLikesByShortcode,
}));
jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getClientsByRole: mockGetClientsByRole,
  getUsersByDirektorat: mockGetUsersByDirektorat,
  getUsersByClient: mockGetUsersByClient,
}));

let lapharDitbinmas;

beforeAll(async () => {
  ({ lapharDitbinmas } = await import('../src/handler/fetchabsensi/insta/absensiLikesInsta.js'));
});

beforeEach(() => {
  mockQuery.mockReset();
  mockGetShortcodesTodayByClient.mockReset();
  mockGetLikesByShortcode.mockReset();
  mockGetClientsByRole.mockReset();
  mockGetUsersByDirektorat.mockReset();
});

test('orders clients by likes with ditbinmas first and returns narrative', async () => {
  mockGetShortcodesTodayByClient.mockResolvedValue(['sc1']);
  mockGetLikesByShortcode.mockResolvedValue(['user1', 'user2']);
  mockGetClientsByRole.mockResolvedValue(['polres_a', 'polres_b']);
  mockGetUsersByDirektorat.mockResolvedValue([
    { user_id: '1', client_id: 'DITBINMAS', insta: '@user1', tiktok: 't', status: true },
    { user_id: '2', client_id: 'POLRES_A', insta: '@user2', tiktok: 't', status: true },
    { user_id: '3', client_id: 'POLRES_B', insta: '', tiktok: null, status: true },
  ]);
  mockQuery.mockImplementation(async (_q, [cid]) => ({
    rows: [{
      nama: cid.replace(/_/g, ' ').toUpperCase(),
      client_type: cid.toUpperCase() === 'DITBINMAS' ? 'direktorat' : 'org',
    }],
  }));

  const result = await lapharDitbinmas();

  expect(result.narrative).toMatch(/Mohon Ijin Komandan/);
  expect(result.narrative).toMatch(/Top 5 Likes/);
  expect(result.narrative).toMatch(/Bottom 5 Likes/);
  const idxDit = result.text.indexOf('DIREKTORAT BINMAS');
  const idxA = result.text.indexOf('POLRES A');
  const idxB = result.text.indexOf('POLRES B');
  expect(idxDit).toBeLessThan(idxA);
  expect(idxA).toBeLessThan(idxB);
  expect(result.narrative).toMatch(/POLRES A/);
  expect(result.text).toMatch(/Distribusi Likes per Konten:/);
  expect(result.text).toMatch(/1\. https:\/\/www\.instagram\.com\/p\/sc1 — 2 likes/);
  expect(result.filename).toMatch(/^Absensi_All_Engagement_Instagram_/);
  expect(result.filenameBelum).toMatch(/^Absensi_Belum_Engagement_Instagram_/);
  expect(result.textBelum).toMatch(/Belum Input Sosial media/);
});
