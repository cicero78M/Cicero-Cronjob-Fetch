import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetUsersByClient = jest.fn();
const mockGetUsersByDirektorat = jest.fn();
const mockGetShortcodesTodayByClient = jest.fn();
const mockGetLikesByShortcode = jest.fn();
const mockGetClientsByRole = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersByClient: mockGetUsersByClient,
  getUsersByDirektorat: mockGetUsersByDirektorat,
  getClientsByRole: mockGetClientsByRole,
}));
jest.unstable_mockModule('../src/model/instaPostModel.js', () => ({ getShortcodesTodayByClient: mockGetShortcodesTodayByClient }));
jest.unstable_mockModule('../src/model/instaLikeModel.js', () => ({ getLikesByShortcode: mockGetLikesByShortcode }));

let absensiLikes;
let lapharDitbinmas;
let absensiLikesDitbinmasReport;

beforeAll(async () => {
  ({
    absensiLikes,
    lapharDitbinmas,
    absensiLikesDitbinmasReport,
  } = await import('../src/handler/fetchabsensi/insta/absensiLikesInsta.js'));
});

beforeEach(() => {
  mockQuery.mockReset();
  mockGetUsersByClient.mockReset();
  mockGetUsersByDirektorat.mockReset();
  mockGetShortcodesTodayByClient.mockReset();
  mockGetLikesByShortcode.mockReset();
  mockGetClientsByRole.mockReset();
});

test('marks user with @username as already liking', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ nama: 'POLRES ABC', client_type: 'instansi' }] });
  mockGetUsersByClient.mockResolvedValueOnce([
    {
      user_id: 'u1',
      title: 'Aiptu',
      nama: 'Budi',
      insta: '@TestUser',
      divisi: 'BAG',
      exception: false,
    },
  ]);
  mockGetShortcodesTodayByClient.mockResolvedValueOnce(['sc1']);
  mockGetLikesByShortcode.mockResolvedValueOnce(['testuser']);

  const msg = await absensiLikes('POLRES', { mode: 'sudah' });

  expect(msg).toMatch(/Sudah melaksanakan\* : \*1 user\*/);
  expect(msg).toMatch(/Belum melaksanakan\* : \*0 user\*/);
});

test('uses directorate users when roleFlag matches directorate', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ nama: 'DITBINMAS', client_type: 'direktorat' }] });
  mockGetClientsByRole.mockResolvedValueOnce([]);
  mockGetUsersByDirektorat.mockResolvedValueOnce([
    {
      user_id: 'u1',
      title: 'Aiptu',
      nama: 'Budi',
      insta: '@TestUser',
      divisi: 'BAG',
      exception: false,
      status: true,
    },
  ]);
  mockGetShortcodesTodayByClient.mockResolvedValueOnce(['sc1']);
  mockGetLikesByShortcode.mockResolvedValueOnce(['testuser']);

  const msg = await absensiLikes('DITBINMAS', {
    mode: 'sudah',
    roleFlag: 'DITBINMAS',
  });

  expect(mockGetUsersByDirektorat).toHaveBeenCalled();
  expect(mockGetUsersByClient).not.toHaveBeenCalled();
});

test('roleFlag uses directorate logic even if client is not directorate', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ nama: 'DITBINMAS', client_type: 'instansi' }] });
  mockGetClientsByRole.mockResolvedValueOnce([]);
  mockGetUsersByDirektorat.mockResolvedValueOnce([]);
  mockGetShortcodesTodayByClient.mockResolvedValueOnce(['sc1']);
  mockGetLikesByShortcode.mockResolvedValueOnce([]);

  await absensiLikes('DITBINMAS', { roleFlag: 'ditbinmas' });

  expect(mockGetUsersByDirektorat).toHaveBeenCalledWith('ditbinmas');
  expect(mockGetUsersByClient).not.toHaveBeenCalled();
});

test('filters users by role when roleFlag provided for polres', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ nama: 'POLRES ABC', client_type: 'instansi' }] });
  mockGetUsersByClient.mockResolvedValueOnce([]);
  mockGetShortcodesTodayByClient.mockResolvedValueOnce([]);

  await absensiLikes('POLRES', { roleFlag: 'ditbinmas' });

  expect(mockGetUsersByClient).toHaveBeenCalledWith('POLRES', 'ditbinmas');
  expect(mockGetShortcodesTodayByClient).toHaveBeenCalledWith('ditbinmas');
});

test('directorate summarizes across clients', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ nama: 'Ditbinmas', client_type: 'direktorat' }] })
    .mockResolvedValueOnce({ rows: [{ nama: 'POLRES A' }] })
    .mockResolvedValueOnce({ rows: [{ nama: 'POLRES B' }] });
  mockGetClientsByRole.mockResolvedValueOnce(['polresa', 'polresb']);
  mockGetShortcodesTodayByClient.mockResolvedValueOnce(['sc1', 'sc2', 'sc3']);
  mockGetLikesByShortcode
    .mockResolvedValueOnce(['user1', 'user3'])
    .mockResolvedValueOnce(['user3'])
    .mockResolvedValueOnce([]);
  mockGetUsersByDirektorat.mockResolvedValueOnce([
    {
      user_id: 'u1',
      nama: 'User1',
      insta: '@user1',
      client_id: 'POLRESA',
      exception: false,
      status: true,
    },
    {
      user_id: 'u2',
      nama: 'User2',
      insta: '',
      client_id: 'POLRESA',
      exception: false,
      status: true,
    },
    {
      user_id: 'u3',
      nama: 'User3',
      insta: '@user3',
      client_id: 'POLRESB',
      exception: false,
      status: true,
    },
    {
      user_id: 'u4',
      nama: 'User4',
      insta: '@user4',
      client_id: 'POLRESB',
      exception: false,
      status: true,
    },
  ]);

  const msg = await absensiLikes('DITBINMAS');

  expect(mockGetClientsByRole).toHaveBeenCalledWith('ditbinmas');
  expect(mockGetShortcodesTodayByClient).toHaveBeenCalledWith('ditbinmas');
  expect(mockGetUsersByDirektorat).toHaveBeenCalledWith('ditbinmas');
  expect(msg).toContain('*Jumlah Total Personil :* 4 pers');
  expect(msg).toContain('✅ *Sudah melaksanakan :* 2 pers');
  expect(msg).toContain('- ⚠️ Melaksanakan kurang lengkap : 1 pers');
  expect(msg).toContain('❌ *Belum melaksanakan :* 2 pers');
  expect(msg).toContain('⚠️❌ *Belum Update Username Instagram :* 1 pers');
  expect(msg).toMatch(
    /1\. POLRES B\n\*Jumlah Personil :\* 2 pers\n\*Sudah Melaksanakan :\* 1 pers\n- Melaksanakan lengkap : 1 pers\n- Melaksanakan kurang lengkap : 0 pers\n\*Belum melaksanakan :\* 1 pers\n\*Belum Update Username Instagram :\* 0 pers/
  );
  expect(msg).toMatch(
    /2\. POLRES A\n\*Jumlah Personil :\* 2 pers\n\*Sudah Melaksanakan :\* 1 pers\n- Melaksanakan lengkap : 0 pers\n- Melaksanakan kurang lengkap : 1 pers\n\*Belum melaksanakan :\* 1 pers\n\*Belum Update Username Instagram :\* 1 pers/
  );
});

test('aggregates likes report per division for Ditbinmas with Ditbinmas first', async () => {
  mockGetShortcodesTodayByClient.mockResolvedValueOnce(['sc1', 'sc2']);
  mockGetLikesByShortcode
    .mockResolvedValueOnce(['user2', 'user3', 'user4'])
    .mockResolvedValueOnce(['user2', 'user3']);
  mockGetUsersByDirektorat.mockResolvedValueOnce([
    { user_id: 'u1', nama: 'User1', insta: 'user1', divisi: 'DITBINMAS', client_id: 'DITBINMAS', status: true },
    { user_id: 'u2', nama: 'User2', insta: 'user2', divisi: 'DIV A', client_id: 'DITBINMAS', status: true },
    { user_id: 'u3', nama: 'User3', insta: 'user3', divisi: 'DIV A', client_id: 'DITBINMAS', status: true },
    { user_id: 'u4', nama: 'User4', insta: 'user4', divisi: 'DIV B', client_id: 'DITBINMAS', status: true },
    { user_id: 'u5', nama: 'User5', insta: 'user5', divisi: 'DIV B', client_id: 'DITBINMAS', status: true },
  ]);

  const msg = await absensiLikesDitbinmasReport();

  expect(mockGetUsersByDirektorat).toHaveBeenCalledWith('ditbinmas', 'DITBINMAS');
  expect(msg).toContain('*Jumlah Total Personil :* 5 pers');
  expect(msg).toContain('✅ *Sudah Melaksanakan :* 3 pers');
  expect(msg).toContain('- ✅ *Melaksanakan Lengkap :* 2 pers');
  expect(msg).toContain('- ⚠️ *Melaksanakan kurang lengkap :* 1 pers');
  expect(msg).toContain('❌ *Belum melaksanakan :* 2 pers');
  expect(msg).toContain('⚠️❌ *Belum Update Username Instagram :* 0 pers');

  expect(msg).toContain('1. DITBINMAS');
  expect(msg).toContain('2. DIV A');
  expect(msg).toContain('3. DIV B');

  expect((msg.match(/❌ Belum melaksanakan \(1 pers\)/g) || []).length).toBe(2);
});

test('DIREKTORAT BINMAS is placed first regardless of counts', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ nama: 'DIREKTORAT BINMAS', client_type: 'direktorat' }] })
    .mockResolvedValueOnce({ rows: [{ nama: 'DIREKTORAT BINMAS' }] })
    .mockResolvedValueOnce({ rows: [{ nama: 'POLRES A' }] });
  mockGetClientsByRole.mockResolvedValueOnce(['ditbinmas', 'polresa']);
  mockGetShortcodesTodayByClient.mockResolvedValueOnce(['sc1']);
  mockGetLikesByShortcode.mockResolvedValueOnce(['user2']);
  mockGetUsersByDirektorat.mockResolvedValueOnce([
    {
      user_id: 'u1',
      nama: 'User1',
      insta: '@user1',
      client_id: 'DITBINMAS',
      exception: false,
      status: true,
    },
    {
      user_id: 'u2',
      nama: 'User2',
      insta: '@user2',
      client_id: 'POLRESA',
      exception: false,
      status: true,
    },
  ]);

  const msg = await absensiLikes('DITBINMAS');

  expect(msg).toMatch(/1\. DIREKTORAT BINMAS\n/);
  expect(msg).toMatch(/2\. POLRES A\n/);
});

test('absensiLikesDitbinmasReport filters users by client_id DITBINMAS', async () => {
  mockGetShortcodesTodayByClient.mockResolvedValueOnce(['sc1']);
  mockGetLikesByShortcode.mockResolvedValueOnce([]);
  mockGetUsersByDirektorat.mockResolvedValueOnce([]);

  await absensiLikesDitbinmasReport();

  expect(mockGetUsersByDirektorat).toHaveBeenCalledWith('ditbinmas', 'DITBINMAS');
});

test('lapharDitbinmas does not count exception usernames as likes', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ nama: 'DITBINMAS', client_type: 'direktorat' }] });
  mockGetShortcodesTodayByClient.mockResolvedValueOnce(['sc1']);
  mockGetLikesByShortcode.mockResolvedValueOnce([]);
  mockGetClientsByRole.mockResolvedValueOnce([]);
  mockGetUsersByDirektorat.mockResolvedValueOnce([
    {
      user_id: 'u1',
      nama: 'User1',
      insta: '@user1',
      client_id: 'DITBINMAS',
      exception: true,
      status: true,
    },
  ]);

  const result = await lapharDitbinmas();

  expect(result.narrative).toMatch(/https:\/\/www.instagram.com\/p\/sc1 — 0 likes/);
});

