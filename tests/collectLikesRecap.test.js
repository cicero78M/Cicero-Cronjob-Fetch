import { jest } from '@jest/globals';

const mockGetShortcodesTodayByClient = jest.fn();
const mockGetLikesByShortcode = jest.fn();
const mockGetClientsByRole = jest.fn();
const mockGetUsersByDirektorat = jest.fn();
const mockGetUsersByClient = jest.fn();
const mockQuery = jest.fn();

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
jest.unstable_mockModule('../src/db/index.js', () => ({
  query: mockQuery,
}));

let collectLikesRecap;
beforeAll(async () => {
  ({ collectLikesRecap } = await import('../src/handler/fetchabsensi/insta/absensiLikesInsta.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('collectLikesRecap normalizes client IDs', async () => {
  mockGetShortcodesTodayByClient.mockResolvedValue(['SC1']);
  mockGetLikesByShortcode.mockResolvedValue(['user1']);
  mockGetClientsByRole.mockResolvedValue(['polres_a']);
  mockGetUsersByDirektorat.mockResolvedValue([
    {
      client_id: 'POLRES_A',
      divisi: 'Sat A',
      title: 'AKP',
      nama: 'Budi',
      insta: 'user1',
      status: true,
    },
  ]);
  mockQuery.mockResolvedValue({ rows: [{ nama: 'POLRES A' }] });

  const result = await collectLikesRecap('ditbinmas');

  expect(mockGetUsersByDirektorat).toHaveBeenCalledWith('ditbinmas');
  expect(result.recap['POLRES A']).toEqual([
    {
      pangkat: 'AKP',
      nama: 'Budi',
      satfung: 'Sat A',
      SC1: 1,
    },
  ]);
});

test('collectLikesRecap selfOnly limits to given client', async () => {
  mockGetShortcodesTodayByClient.mockResolvedValue(['SC1']);
  mockGetLikesByShortcode.mockResolvedValue(['user1']);
  mockGetUsersByDirektorat.mockResolvedValue([
    {
      client_id: 'DITBINMAS',
      divisi: 'Sat A',
      title: 'AKP',
      nama: 'Budi',
      insta: 'user1',
      status: true,
    },
  ]);
  mockQuery.mockResolvedValue({ rows: [{ nama: 'DITBINMAS' }] });

  const result = await collectLikesRecap('DITBINMAS', { selfOnly: true });

  expect(mockGetClientsByRole).not.toHaveBeenCalled();
  expect(mockGetUsersByDirektorat).toHaveBeenCalledWith('ditbinmas', ['DITBINMAS']);
  expect(result.recap['DITBINMAS']).toEqual([
    {
      pangkat: 'AKP',
      nama: 'Budi',
      satfung: 'Sat A',
      SC1: 1,
    },
  ]);
});
