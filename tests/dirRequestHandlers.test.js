import { jest } from '@jest/globals';
import path from 'path';

process.env.TZ = 'Asia/Jakarta';
process.env.JWT_SECRET = 'testsecret';

const mockGetUsersSocialByClient = jest.fn();
const mockGetUsersByClient = jest.fn();
const mockGetClientsByRole = jest.fn();
const mockGetShortcodesTodayByClient = jest.fn();
const mockGetInstaPostsTodayByClient = jest.fn();
const mockGetVideoIdsTodayByClient = jest.fn();
const mockGetTiktokPostsTodayByClient = jest.fn();
const mockGetRekapLikesByClient = jest.fn();
const mockGetRekapKomentarByClient = jest.fn();
const mockAbsensiLikes = jest.fn();
const mockAbsensiLikesDitbinmasReport = jest.fn();
const mockAbsensiLikesDitbinmasSimple = jest.fn();
const mockAbsensiKomentar = jest.fn();
const mockAbsensiKomentarDitbinmasReport = jest.fn();
const mockAbsensiKomentarDitbinmasSimple = jest.fn();
const mockFindClientById = jest.fn();
const mockFetchTiktokSecUid = jest.fn();
const mockFetchAndStoreInstaContent = jest.fn();
const mockHandleFetchLikesInstagram = jest.fn();
const mockRekapLikesIG = jest.fn();
const mockLapharDitbinmas = jest.fn();
const mockLapharTiktokDitbinmas = jest.fn();
const mockCollectLikesRecap = jest.fn();
const mockSaveLikesRecapExcel = jest.fn();
const mockSaveLikesRecapPerContentExcel = jest.fn();
const mockSaveWeeklyLikesRecapExcel = jest.fn();
const mockSaveMonthlyLikesRecapExcel = jest.fn();
const mockCollectKomentarRecap = jest.fn();
const mockSaveCommentRecapExcel = jest.fn();
const mockSaveCommentRecapPerContentExcel = jest.fn();
const mockSaveWeeklyCommentRecapExcel = jest.fn();
const mockGenerateWeeklyInstagramHighLowReport = jest.fn();
const mockGenerateWeeklyTiktokHighLowReport = jest.fn();
const mockSaveMonthlyCommentRecapExcel = jest.fn();
const mockSaveSatkerUpdateMatrixExcel = jest.fn();
const mockSaveEngagementRankingExcel = jest.fn();
const mockGenerateKasatkerReport = jest.fn();
const mockGenerateKasatkerAttendanceSummary = jest.fn();
const mockGenerateKasatBinmasLikesRecap = jest.fn();
const mockGenerateKasatBinmasTiktokCommentRecap = jest.fn();
const mockGenerateInstagramAllDataRecap = jest.fn();
const mockGenerateTiktokAllDataRecap = jest.fn();
const mockFetchTodaySatbinmasOfficialTiktokMediaForOrgClients = jest.fn();
const mockSyncSatbinmasOfficialTiktokSecUidForOrgClients = jest.fn();
const mockWriteFile = jest.fn();
const mockMkdir = jest.fn();
const mockReadFile = jest.fn();
const mockUnlink = jest.fn();
const mockStat = jest.fn();
const mockSendWAFile = jest.fn();
const mockSafeSendMessage = jest.fn();
const mockFetchAndStoreTiktokContent = jest.fn();
const mockHandleFetchKomentarTiktokBatch = jest.fn();
const mockGenerateSosmedTaskMessage = jest.fn();
const mockMatchesKasatBinmasJabatan = jest.fn();

const createAsyncStub = (value) => jest.fn().mockResolvedValue(value);
const stubEmptyArray = () => createAsyncStub([]);
const stubNull = () => createAsyncStub(null);
const stubVoid = () => jest.fn().mockResolvedValue();

jest.unstable_mockModule('../src/model/userModel.js', () => {
  const asyncEmpty = stubEmptyArray;
  const asyncNull = stubNull;
  const asyncVoid = stubVoid;

  return {
    STATIC_DIVISIONS: [],
    mergeStaticDivisions: (divisions = []) => divisions,
    getClientsByRole: mockGetClientsByRole,
    getUsersByClient: mockGetUsersByClient,
    getOperatorsByClient: asyncEmpty(),
    getUsersByClientFull: asyncEmpty(),
    getAllUsers: asyncEmpty(),
    getInstaFilledUsersByClient: asyncEmpty(),
    getInstaEmptyUsersByClient: asyncEmpty(),
    getTiktokFilledUsersByClient: asyncEmpty(),
    getTiktokEmptyUsersByClient: asyncEmpty(),
    getUsersWithWaByClient: asyncEmpty(),
    getActiveUsersWithWhatsapp: asyncEmpty(),
    getUsersMissingDataByClient: asyncEmpty(),
    getUsersSocialByClient: mockGetUsersSocialByClient,
    findUserById: asyncNull(),
    findUserByEmail: asyncNull(),
    findUserByIdAndClient: asyncNull(),
    updatePremiumStatus: asyncVoid(),
    updateUserField: asyncVoid(),
    getAllExceptionUsers: asyncEmpty(),
    getExceptionUsersByClient: asyncEmpty(),
    getDirektoratUsers: asyncEmpty(),
    getUsersByDirektorat: asyncEmpty(),
    findUserByInsta: asyncNull(),
    findUserByTiktok: asyncNull(),
    findUserByWhatsApp: asyncNull(),
    findUserByIdAndWhatsApp: asyncNull(),
    getAvailableTitles: asyncEmpty(),
    getAvailableSatfung: asyncEmpty(),
    createUser: asyncVoid(),
    updateUser: asyncVoid(),
    updateUserRolesUserId: asyncVoid(),
    deleteUser: asyncVoid(),
    clearUsersWithAdminWA: asyncVoid(),
    findUsersByClientId: mockGetUsersByClient,
    findUserByWA: asyncNull(),
  };
});
jest.unstable_mockModule('../src/model/instaPostModel.js', () => ({
  getShortcodesTodayByClient: mockGetShortcodesTodayByClient,
  getPostsTodayByClient: mockGetInstaPostsTodayByClient,
}));
jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({
  getVideoIdsTodayByClient: mockGetVideoIdsTodayByClient,
  getPostsTodayByClient: mockGetTiktokPostsTodayByClient,
  findPostByVideoId: jest.fn(),
  deletePostByVideoId: jest.fn(),
}));
jest.unstable_mockModule('../src/handler/fetchabsensi/insta/absensiLikesInsta.js', () => ({
  absensiLikes: mockAbsensiLikes,
  rekapLikesIG: mockRekapLikesIG,
  lapharDitbinmas: mockLapharDitbinmas,
  absensiLikesDitbinmasReport: mockAbsensiLikesDitbinmasReport,
  absensiLikesDitbinmasSimple: mockAbsensiLikesDitbinmasSimple,
  collectLikesRecap: mockCollectLikesRecap,
}));
jest.unstable_mockModule('../src/handler/fetchabsensi/tiktok/absensiKomentarTiktok.js', () => ({
  absensiKomentar: mockAbsensiKomentar,
  lapharTiktokDitbinmas: mockLapharTiktokDitbinmas,
  collectKomentarRecap: mockCollectKomentarRecap,
  absensiKomentarDitbinmasReport: mockAbsensiKomentarDitbinmasReport,
  absensiKomentarDitbinmasSimple: mockAbsensiKomentarDitbinmasSimple,
}));
jest.unstable_mockModule('../src/service/clientService.js', () => ({
  findClientById: mockFindClientById,
  fetchTiktokSecUid: mockFetchTiktokSecUid,
}));
jest.unstable_mockModule('../src/service/satbinmasOfficialTiktokService.js', () => ({
  fetchTodaySatbinmasOfficialTiktokMediaForOrgClients:
    mockFetchTodaySatbinmasOfficialTiktokMediaForOrgClients,
  syncSatbinmasOfficialTiktokSecUidForOrgClients:
    mockSyncSatbinmasOfficialTiktokSecUidForOrgClients,
}));
jest.unstable_mockModule('fs/promises', () => ({
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
  readFile: mockReadFile,
  unlink: mockUnlink,
  stat: mockStat,
}));
jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  sendWAFile: mockSendWAFile,
  safeSendMessage: mockSafeSendMessage,
  sendWithClientFallback: jest.fn(),
}));
jest.unstable_mockModule('../src/handler/fetchpost/instaFetchPost.js', () => ({
  fetchAndStoreInstaContent: mockFetchAndStoreInstaContent,
}));
jest.unstable_mockModule('../src/handler/fetchengagement/fetchLikesInstagram.js', () => ({
  handleFetchLikesInstagram: mockHandleFetchLikesInstagram,
}));
jest.unstable_mockModule('../src/handler/fetchpost/tiktokFetchPost.js', () => ({
  fetchAndStoreTiktokContent: mockFetchAndStoreTiktokContent,
}));
jest.unstable_mockModule('../src/handler/fetchengagement/fetchCommentTiktok.js', () => ({
  handleFetchKomentarTiktokBatch: mockHandleFetchKomentarTiktokBatch,
}));
jest.unstable_mockModule('../src/handler/fetchabsensi/sosmedTask.js', () => ({
  generateSosmedTaskMessage: mockGenerateSosmedTaskMessage,
}));
jest.unstable_mockModule('../src/service/likesRecapExcelService.js', () => ({
  saveLikesRecapExcel: mockSaveLikesRecapExcel,
  saveLikesRecapPerContentExcel: mockSaveLikesRecapPerContentExcel,
}));
jest.unstable_mockModule('../src/service/commentRecapExcelService.js', () => ({
  saveCommentRecapExcel: mockSaveCommentRecapExcel,
  saveCommentRecapPerContentExcel: mockSaveCommentRecapPerContentExcel,
}));
jest.unstable_mockModule('../src/service/weeklyLikesRecapExcelService.js', () => ({
  saveWeeklyLikesRecapExcel: mockSaveWeeklyLikesRecapExcel,
}));
jest.unstable_mockModule('../src/service/weeklyInstagramHighLowService.js', () => ({
  generateWeeklyInstagramHighLowReport: mockGenerateWeeklyInstagramHighLowReport,
}));
jest.unstable_mockModule('../src/service/monthlyLikesRecapExcelService.js', () => ({
  saveMonthlyLikesRecapExcel: mockSaveMonthlyLikesRecapExcel,
}));
jest.unstable_mockModule(
  '../src/service/weeklyCommentRecapExcelService.js',
  () => ({
    saveWeeklyCommentRecapExcel: mockSaveWeeklyCommentRecapExcel,
  })
);
jest.unstable_mockModule('../src/service/weeklyTiktokHighLowService.js', () => ({
  generateWeeklyTiktokHighLowReport: mockGenerateWeeklyTiktokHighLowReport,
}));
jest.unstable_mockModule('../src/service/monthlyCommentRecapExcelService.js', () => ({
  saveMonthlyCommentRecapExcel: mockSaveMonthlyCommentRecapExcel,
}));
jest.unstable_mockModule('../src/service/satkerUpdateMatrixService.js', () => ({
  saveSatkerUpdateMatrixExcel: mockSaveSatkerUpdateMatrixExcel,
}));
jest.unstable_mockModule('../src/service/engagementRankingExcelService.js', () => ({
  saveEngagementRankingExcel: mockSaveEngagementRankingExcel,
}));
jest.unstable_mockModule('../src/service/kasatkerReportService.js', () => ({
  generateKasatkerReport: mockGenerateKasatkerReport,
}));
jest.unstable_mockModule('../src/service/kasatkerAttendanceService.js', () => ({
  generateKasatkerAttendanceSummary: mockGenerateKasatkerAttendanceSummary,
  matchesKasatBinmasJabatan: mockMatchesKasatBinmasJabatan,
}));
jest.unstable_mockModule(
  '../src/service/kasatBinmasLikesRecapService.js',
  () => ({
    generateKasatBinmasLikesRecap: mockGenerateKasatBinmasLikesRecap,
    describeKasatBinmasLikesPeriod: () => ({
      type: 'harian',
      label: 'Hari ini',
    }),
    kasatBinmasRankWeight: () => 0,
  })
);
jest.unstable_mockModule(
  '../src/service/kasatBinmasTiktokCommentRecapService.js',
  () => ({
    generateKasatBinmasTiktokCommentRecap: mockGenerateKasatBinmasTiktokCommentRecap,
    resolveBaseDate: (date) => date || new Date('2025-12-16T00:00:00Z'),
    describeKasatBinmasTiktokCommentPeriod: () => ({
      label: 'hari ini',
      dateRange: 'today',
    }),
  })
);
jest.unstable_mockModule('../src/service/instagramAllDataRecapService.js', () => ({
  generateInstagramAllDataRecap: mockGenerateInstagramAllDataRecap,
}));
jest.unstable_mockModule('../src/service/tiktokAllDataRecapService.js', () => ({
  generateTiktokAllDataRecap: mockGenerateTiktokAllDataRecap,
}));
jest.unstable_mockModule('../src/utils/utilsHelper.js', () => ({
  getGreeting: () => 'Selamat malam',
  sortDivisionKeys: (arr) => arr.sort(),
  formatNama: (u) => `${u.title || ''} ${u.nama || ''}`.trim(),
  formatUserData: jest.fn(),
}));

let dirRequestHandlers;
let formatRekapUserData;
let formatRekapAllSosmed;
let formatTopPersonnelRanking;
let formatTopPolresRanking;
let topPersonnelRankingDependencies;
let topPolresRankingDependencies;
let dirRequestHandlersModule;
let originalGetRekapLikesByClient;
let originalGetRekapKomentarByClient;
beforeAll(async () => {
  dirRequestHandlersModule = await import('../src/handler/menu/dirRequestHandlers.js');
  ({
    dirRequestHandlers,
    formatRekapUserData,
    formatRekapAllSosmed,
    formatTopPersonnelRanking,
    formatTopPolresRanking,
    topPersonnelRankingDependencies,
    topPolresRankingDependencies,
  } = dirRequestHandlersModule);
  originalGetRekapLikesByClient = topPersonnelRankingDependencies.getRekapLikesByClient;
  originalGetRekapKomentarByClient =
    topPersonnelRankingDependencies.getRekapKomentarByClient;
});

afterAll(() => {
  topPersonnelRankingDependencies.getRekapLikesByClient =
    originalGetRekapLikesByClient;
  topPersonnelRankingDependencies.getRekapKomentarByClient =
    originalGetRekapKomentarByClient;
  topPolresRankingDependencies.getRekapLikesByClient =
    originalGetRekapLikesByClient;
  topPolresRankingDependencies.getRekapKomentarByClient =
    originalGetRekapKomentarByClient;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFindClientById.mockReset();
  mockGetShortcodesTodayByClient.mockResolvedValue([]);
  mockGetInstaPostsTodayByClient.mockResolvedValue([]);
  mockGetVideoIdsTodayByClient.mockResolvedValue([]);
  mockGetTiktokPostsTodayByClient.mockResolvedValue([]);
  mockGetRekapLikesByClient.mockReset();
  mockGetRekapKomentarByClient.mockReset();
  mockFetchTiktokSecUid.mockResolvedValue('');
  mockStat.mockResolvedValue({});
  mockFetchTodaySatbinmasOfficialTiktokMediaForOrgClients.mockResolvedValue({
    clients: [],
    totals: {
      clients: 0,
      accounts: 0,
      fetched: 0,
      inserted: 0,
      updated: 0,
      removed: 0,
    },
  });
  mockSyncSatbinmasOfficialTiktokSecUidForOrgClients.mockResolvedValue({
    clients: [],
    totals: { clients: 0, accounts: 0, resolved: 0, failed: 0, missing: 0 },
  });
  topPersonnelRankingDependencies.getRekapLikesByClient = mockGetRekapLikesByClient;
  topPersonnelRankingDependencies.getRekapKomentarByClient =
    mockGetRekapKomentarByClient;
  topPolresRankingDependencies.getRekapLikesByClient = mockGetRekapLikesByClient;
  topPolresRankingDependencies.getRekapKomentarByClient =
    mockGetRekapKomentarByClient;
  mockMkdir.mockResolvedValue();
  mockWriteFile.mockResolvedValue();
  mockSaveSatkerUpdateMatrixExcel.mockResolvedValue({
    filePath: '/tmp/satker.xlsx',
    fileName: 'Satker.xlsx',
  });
  mockSaveEngagementRankingExcel.mockResolvedValue({
    filePath: '/tmp/ranking.xlsx',
    fileName: 'Ranking.xlsx',
  });
  mockGenerateInstagramAllDataRecap.mockResolvedValue({
    filePath: '/tmp/ig-all.xlsx',
    fileName: 'ig-all.xlsx',
  });
  mockGenerateTiktokAllDataRecap.mockResolvedValue({
    filePath: '/tmp/tiktok-all.xlsx',
    fileName: 'tiktok-all.xlsx',
  });
  mockGenerateKasatkerReport.mockResolvedValue('Narasi Kasatker');
  mockGenerateKasatkerAttendanceSummary.mockResolvedValue('Narasi Absensi Kasatker');
  mockSaveLikesRecapPerContentExcel.mockResolvedValue('/tmp/recap_per_content.xlsx');
  mockGenerateWeeklyInstagramHighLowReport.mockResolvedValue(
    'Laporan IG Top and Bottom'
  );
  mockGenerateWeeklyTiktokHighLowReport.mockResolvedValue('Laporan Top and Bottom');
});

test('main always sets session to DITBINMAS client', async () => {
  mockFindClientById.mockImplementation(async (cid) => {
    if (cid.toUpperCase() === 'DITBINMAS') {
      return { nama: 'DIT BINMAS', client_type: 'direktorat' };
    }
    return null;
  });
  const session = { client_ids: ['a', 'b'] };
  const chatId = '123';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.main(session, chatId, '', waClient);

  expect(session.client_ids).toEqual(['DITBINMAS']);
  expect(session.selectedClientId).toBe('DITBINMAS');
  expect(session.dir_client_id).toBe('DITBINMAS');
  expect(session.clientName).toBe('DIT BINMAS');
  expect(session.step).toBe('choose_menu');
  const msg = waClient.sendMessage.mock.calls[0][1];
  expect(msg).toMatch(/Client: \*DIT BINMAS\*/);
  expect(msg).toContain('3️⃣1️⃣ Top ranking like/komentar personel');
  expect(msg).toContain('3️⃣3️⃣ Absensi Kasatker');
});

test('choose_menu aggregates directorate data by client_id', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2025-08-27T16:06:00Z'));

  mockGetUsersSocialByClient.mockResolvedValue([
    { client_id: 'DITBINMAS', insta: null, tiktok: null },
    { client_id: 'POLRES_PASURUAN_KOTA', insta: 'x', tiktok: 'y' },
  ]);
  mockGetClientsByRole.mockResolvedValue([
    'polres_pasuruan_kota',
    'polres_sidoarjo',
  ]);
  mockFindClientById.mockImplementation(async (cid) => ({
    ditbinmas: { nama: 'DIT BINMAS', client_type: 'direktorat' },
    polres_pasuruan_kota: {
      nama: 'POLRES PASURUAN KOTA',
      client_type: 'org',
    },
    polres_sidoarjo: { nama: 'POLRES SIDOARJO', client_type: 'org' },
  })[cid.toLowerCase()]);

  const session = {
    role: 'ditbinmas',
    selectedClientId: 'polres_pasuruan_kota',
    clientName: 'POLRES PASURUAN KOTA',
    dir_client_id: 'ditbinmas',
  };
  const chatId = '123';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '1', waClient);

  expect(mockGetUsersSocialByClient).toHaveBeenCalledWith('ditbinmas', 'ditbinmas');
  expect(mockGetClientsByRole).toHaveBeenCalledWith('ditbinmas');
  const msg = waClient.sendMessage.mock.calls[0][1];
  expect(msg).toMatch(/1\. DIT BINMAS/);
  expect(msg).toMatch(/Jumlah Total Personil : 2/);
  expect(msg).toMatch(/Jumlah Total Personil Sudah Mengisi Instagram : 1/);
  expect(msg).toMatch(/Jumlah Total Personil Sudah Mengisi Tiktok : 1/);
  expect(msg).toMatch(/Jumlah Total Personil Belum Mengisi Instagram : 1/);
  expect(msg).toMatch(/Jumlah Total Personil Belum Mengisi Tiktok : 1/);
  const idxBinmas = msg.indexOf('DIT BINMAS');
  const idxPasuruan = msg.indexOf('POLRES PASURUAN KOTA');
  expect(idxBinmas).toBeLessThan(idxPasuruan);
  expect(msg).toMatch(/Client Belum Input Data:\n1\. POLRES SIDOARJO/);
  jest.useRealTimers();
});

test('formatRekapUserData defaults to directorate role when none provided', async () => {
  mockFindClientById.mockImplementation(async (cid) => ({
    client_type: 'direktorat',
    nama: cid,
  }));
  mockGetUsersSocialByClient.mockResolvedValue([]);
  mockGetClientsByRole.mockResolvedValue([]);

  await formatRekapUserData('DITBINMAS');

  expect(mockGetUsersSocialByClient).toHaveBeenCalledWith(
    'DITBINMAS',
    'ditbinmas'
  );
});

test('formatRekapUserData uses selected directorate role over mismatched roleFlag', async () => {
  mockFindClientById.mockImplementation(async (cid) => ({
    client_type: 'direktorat',
    nama: cid,
  }));
  mockGetUsersSocialByClient.mockResolvedValue([]);
  mockGetClientsByRole.mockResolvedValue([]);

  await formatRekapUserData('BIDHUMAS', 'ditbinmas');

  expect(mockGetUsersSocialByClient).toHaveBeenCalledWith(
    'BIDHUMAS',
    'bidhumas'
  );
});

test('formatRekapUserData applies roleFlag for org clients', async () => {
  mockFindClientById.mockImplementation(async (cid) => {
    const key = cid.toLowerCase();
    if (key === 'polres_a') {
      return { client_type: 'org', nama: 'POLRES A' };
    }
    if (key === 'ditlantas') {
      return { client_type: 'direktorat', nama: 'DIT LANTAS' };
    }
    return { client_type: 'org', nama: cid };
  });
  mockGetUsersSocialByClient.mockResolvedValue([
    {
      client_id: 'POLRES_A',
      insta: null,
      tiktok: null,
    },
  ]);
  mockGetClientsByRole.mockResolvedValue(['POLRES_A']);

  await formatRekapUserData('POLRES_A', 'ditlantas');

  expect(mockGetUsersSocialByClient).toHaveBeenCalledWith(
    'POLRES_A',
    'ditlantas'
  );
});

test('formatRekapUserData sorts by updated then total', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2025-08-27T16:06:00Z'));

  mockGetUsersSocialByClient.mockResolvedValue([
    { client_id: 'POLRES_A', insta: 'x', tiktok: 'y' },
    { client_id: 'POLRES_A', insta: 'x', tiktok: 'y' },
    { client_id: 'POLRES_B', insta: 'x', tiktok: 'y' },
    { client_id: 'POLRES_B', insta: 'x', tiktok: null },
    { client_id: 'POLRES_B', insta: 'x', tiktok: 'y' },
    { client_id: 'POLRES_C', insta: 'x', tiktok: 'y' },
  ]);
  mockGetClientsByRole.mockResolvedValue([
    'polres_a',
    'polres_b',
    'polres_c',
  ]);
  mockFindClientById.mockImplementation(async (cid) => ({
    ditbinmas: { nama: 'DIT BINMAS', client_type: 'direktorat' },
    polres_a: { nama: 'POLRES A', client_type: 'org' },
    polres_b: { nama: 'POLRES B', client_type: 'org' },
    polres_c: { nama: 'POLRES C', client_type: 'org' },
  })[cid.toLowerCase()]);

  const msg = await formatRekapUserData('ditbinmas', 'ditbinmas');

  const idxBinmas = msg.indexOf('DIT BINMAS');
  const idxB = msg.indexOf('POLRES B');
  const idxA = msg.indexOf('POLRES A');
  const idxC = msg.indexOf('POLRES C');
  expect(idxBinmas).toBeLessThan(idxB);
  expect(idxB).toBeLessThan(idxA);
  expect(idxA).toBeLessThan(idxC);
  jest.useRealTimers();
});

test('formatRekapUserData orders users by rank', async () => {
  mockFindClientById.mockResolvedValue({ client_type: 'org', nama: 'POLRES A' });
  mockGetUsersSocialByClient.mockResolvedValue([
    { client_id: 'POLRES_A', divisi: 'Sat A', title: 'AKP', nama: 'Budi', insta: 'x', tiktok: 'y' },
    { client_id: 'POLRES_A', divisi: 'Sat A', title: 'KOMPOL', nama: 'Agus', insta: 'x', tiktok: 'y' },
    { client_id: 'POLRES_A', divisi: 'Sat A', title: 'IPDA', nama: 'Charlie', insta: 'x', tiktok: null },
  ]);
  const msg = await formatRekapUserData('POLRES_A');
  const idxKompol = msg.indexOf('KOMPOL Agus');
  const idxAkp = msg.indexOf('AKP Budi');
  const idxIpda = msg.indexOf('IPDA Charlie');
  expect(idxKompol).toBeLessThan(idxAkp);
  expect(idxAkp).toBeLessThan(idxIpda);
});

test('formatTopPersonnelRanking merges like and comment totals', async () => {
  mockGetRekapLikesByClient.mockResolvedValue({
    rows: [
      {
        user_id: '1001',
        title: 'AKP',
        nama: 'Budi',
        client_name: 'Satker A',
        jumlah_like: 5,
      },
      {
        user_id: '1002',
        title: 'IPTU',
        nama: 'Agus',
        client_name: 'Satker B',
        jumlah_like: '2',
      },
      {
        user_id: '1003',
        title: 'AIPTU',
        nama: 'Charlie',
        client_name: 'Satker C',
        jumlah_like: 0,
      },
    ],
  });
  mockGetRekapKomentarByClient.mockResolvedValue([
    {
      user_id: '1001',
      title: 'AKP',
      nama: 'Budi',
      client_name: 'Satker A',
      jumlah_komentar: 3,
    },
    {
      user_id: '1002',
      title: 'IPTU',
      nama: 'Agus',
      client_name: 'Satker B',
      jumlah_komentar: 1,
    },
  ]);

  const message = await formatTopPersonnelRanking('DITBINMAS', 'ditbinmas');

  expect(mockGetRekapLikesByClient).toHaveBeenCalledWith(
    'DITBINMAS',
    'semua',
    undefined,
    undefined,
    undefined,
    'ditbinmas'
  );
  expect(mockGetRekapKomentarByClient).toHaveBeenCalledWith(
    'DITBINMAS',
    'semua',
    undefined,
    undefined,
    undefined,
    'ditbinmas'
  );
  expect(message).toContain('📊 *Top Ranking Like & Komentar Personel*');
  expect(message).toContain('Periode: semua');
  const firstEntry = message.indexOf('1. Nama: Budi');
  const secondEntry = message.indexOf('2. Nama: Agus');
  expect(firstEntry).toBeGreaterThan(-1);
  expect(secondEntry).toBeGreaterThan(-1);
  expect(firstEntry).toBeLessThan(secondEntry);
  expect(message).not.toContain('Charlie');
  expect(message).toContain('Total Like/Komentar: 8');
  expect(message).toContain('Total Like/Komentar: 3');
});

test('formatTopPolresRanking aggregates totals per client', async () => {
  mockGetRekapLikesByClient.mockResolvedValue({
    rows: [
      {
        client_id: 'POLRES_A',
        client_name: 'Polres A',
        jumlah_like: 5,
      },
      {
        client_id: 'POLRES_B',
        client_name: 'Polres B',
        jumlah_like: '3',
      },
      {
        client_id: 'POLRES_A',
        client_name: 'Polres A',
        jumlah_like: 2,
      },
    ],
  });
  mockGetRekapKomentarByClient.mockResolvedValue([
    {
      client_id: 'POLRES_A',
      client_name: 'Polres A',
      jumlah_komentar: 4,
    },
    {
      client_id: 'POLRES_B',
      client_name: 'Polres B',
      jumlah_komentar: '1',
    },
    {
      client_id: 'POLRES_C',
      client_name: 'Polres C',
      jumlah_komentar: 7,
    },
  ]);

  const message = await formatTopPolresRanking('DITBINMAS', 'ditbinmas');

  expect(mockGetRekapLikesByClient).toHaveBeenCalledWith(
    'DITBINMAS',
    'semua',
    undefined,
    undefined,
    undefined,
    'ditbinmas'
  );
  expect(mockGetRekapKomentarByClient).toHaveBeenCalledWith(
    'DITBINMAS',
    'semua',
    undefined,
    undefined,
    undefined,
    'ditbinmas'
  );
  expect(message).toContain('📊 *Top Ranking Like & Komentar Polres*');
  expect(message).toContain('Periode: semua');
  const firstEntry = message.indexOf('1. Kesatuan: POLRES A');
  const secondEntry = message.indexOf('2. Kesatuan: POLRES C');
  expect(firstEntry).toBeGreaterThan(-1);
  expect(secondEntry).toBeGreaterThan(-1);
  expect(firstEntry).toBeLessThan(secondEntry);
  expect(message).toContain('Total Like/Komentar: 11');
  expect(message).toContain('Like: 7 | Komentar: 4');
  expect(message).toContain('Like: 0 | Komentar: 7');
});

test('choose_menu option 2 executive summary reports totals', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2025-09-05T00:46:00Z'));
  mockGetUsersSocialByClient.mockResolvedValue([
    { client_id: 'a', insta: 'x', tiktok: 'y' },
    { client_id: 'a', insta: null, tiktok: 'y' },
    { client_id: 'b', insta: 'x', tiktok: null },
  ]);
  mockFindClientById.mockImplementation(async (cid) => ({ nama: cid.toUpperCase() }));
  const session = { selectedClientId: 'a', clientName: 'A' };
  const chatId = '111';
  const waClient = { sendMessage: jest.fn() };
  await dirRequestHandlers.choose_menu(session, chatId, '2', waClient);
  const msg = waClient.sendMessage.mock.calls[0][1];
  expect(msg).toMatch(/\*Personil Saat ini:\* 3/);
  expect(msg).toMatch(/IG 66\.7% \(2\/3\)/);
  expect(msg).toMatch(/TT 66\.7% \(2\/3\)/);
  expect(msg).toMatch(/User Belum Update data/);
  jest.useRealTimers();
});

test('choose_menu option 4 generates satker update matrix excel', async () => {
  mockReadFile.mockResolvedValue(Buffer.from('excel'));
  const session = {
    role: 'ditbinmas',
    selectedClientId: 'ditbinmas',
    clientName: 'DIT BINMAS',
    dir_client_id: 'ditbinmas',
    username: 'dashboard1',
  };
  const chatId = '400';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '4', waClient);

  expect(mockSaveSatkerUpdateMatrixExcel).toHaveBeenCalledWith({
    clientId: 'ditbinmas',
    roleFlag: 'ditbinmas',
    username: 'dashboard1',
  });
  expect(mockReadFile).toHaveBeenCalledWith('/tmp/satker.xlsx');
  expect(mockSendWAFile).toHaveBeenCalledWith(
    waClient,
    expect.any(Buffer),
    path.basename('/tmp/satker.xlsx'),
    chatId,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  expect(mockUnlink).toHaveBeenCalledWith('/tmp/satker.xlsx');
  expect(waClient.sendMessage).toHaveBeenCalledWith(chatId, '✅ File Excel dikirim.');
});

describe('formatRekapAllSosmed', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('structures report with numbered sections and backlog/closing insights', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-08-27T16:06:00Z'));
    const clientName = 'Direktorat Samapta';

    mockFindClientById.mockResolvedValue({
      client_type: 'direktorat',
      client_tiktok: '@ditbinmas',
      nama: clientName,
    });
    mockGetInstaPostsTodayByClient.mockResolvedValue([
      { shortcode: 'alpha' },
      { shortcode: 'beta' },
    ]);
    mockGetTiktokPostsTodayByClient.mockResolvedValue([
      { video_id: 'vid-1' },
    ]);

    const igNarrative = `Mohon Ijin Komandan, rekap singkat likes Instagram hari Rabu, 27 Agustus 2025 pukul 23.06 WIB.\n\n📸 Instagram\nTop 5 Likes:\n1. Satker A – 500 likes\n2. Satker B – 450 likes\n3. Satker C – 400 likes\n4. Satker D – 350 likes\n5. Satker E – 300 likes\n\nBottom 5 Likes:\n1. Satker V – 80 likes\n2. Satker W – 70 likes\n3. Satker X – 60 likes\n4. Satker Y – 50 likes\n5. Satker Z – 40 likes`;

    const ttNarrative = `Mohon Ijin Komandan, rekap singkat komentar TikTok hari Rabu, 27 Agustus 2025 pukul 23.06 WIB.\n\n🎵 TikTok\nTop 5 Komentar:\n1. Satker Alpha – 120 komentar\n2. Satker Beta – 110 komentar\n3. Satker Gamma – 100 komentar\n4. Satker Delta – 90 komentar\n5. Satker Epsilon – 80 komentar\n\nBottom 5 Komentar:\n1. Satker U – 12 komentar\n2. Satker T – 11 komentar\n3. Satker S – 10 komentar\n4. Satker R – 9 komentar\n5. Satker Q – 8 komentar`;

    const message = await formatRekapAllSosmed(
      igNarrative,
      ttNarrative,
      clientName,
      'DITSAMAPTA'
    );

    const linkLines = message
      .split('\n')
      .filter((line) => line.startsWith('- IG') || line.startsWith('- TikTok'));

    expect(message).toContain('*Laporan Harian Engagement – Rabu, 27 Agustus 2025*');
    expect(message).toContain(`*${clientName}*`);
    expect(message).toContain('List Link Tugas Instagram dan Tiktok Hari ini :');
    expect(linkLines).toEqual([
      '- IG 1. https://www.instagram.com/p/alpha',
      '- IG 2. https://www.instagram.com/p/beta',
      '- TikTok 1. https://www.tiktok.com/@ditbinmas/video/vid-1',
    ]);
    expect(message).toContain('1. 📸 *Instagram*');
    expect(message).toContain('2. 🎵 *TikTok*');
    expect(message).toContain('🎵 TikTok (DIREKTORAT SAMAPTA)');
    expect(message).toContain('Top 5 Likes:');
    expect(message).toContain('Bottom 5 Komentar:');
    expect(message).not.toContain('Mohon Ijin Komandan, rekap singkat komentar TikTok');
    expect(message).toContain('Target harian belum sepenuhnya terpenuhi; kolaborasi halus antar satker akan membantu menutup gap likes dan komentar.');
  });

  test('falls back to ranking data when TikTok narrative header lacks entries', async () => {
    jest.useFakeTimers();
    const currentDate = new Date('2025-12-30T10:00:00Z');
    jest.setSystemTime(currentDate);

    const ttNarrative = '🎵 TikTok\nTop 5 Komentar:\n\nBottom 5 Komentar:';
    const ttRankingData = {
      generatedDateKey: currentDate.toDateString(),
      metricLabel: 'komentar',
      top: [{ name: 'Satker Alpha', score: 120 }],
      bottom: [{ name: 'Satker Omega', score: 5 }],
    };

    const message = await formatRekapAllSosmed(
      '',
      ttNarrative,
      'Direktorat Binmas',
      'DITBINMAS',
      { ttRankingData }
    );

    const tikTokSection = message
      .split('\n')
      .slice(message.split('\n').indexOf('2. 🎵 *TikTok*'))
      .join('\n');

    expect(tikTokSection).toContain('🎵 TikTok (DIREKTORAT BINMAS)');
    expect(tikTokSection).toContain('Top 5 Komentar:');
    expect(tikTokSection).toContain('- 1. Satker Alpha — 120 komentar');
    expect(tikTokSection).toContain('Bottom 5 Komentar:');
    expect(tikTokSection).toContain('- 1. Satker Omega — 5 komentar');
    expect(tikTokSection).not.toContain('Top 5 Komentar:\n\nBottom 5 Komentar');
  });

  test('suppresses TikTok ranking headers when no data is available', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-31T06:00:00Z'));

    const ttNarrative = '🎵 TikTok\nTop 5 Komentar:\n\nBottom 5 Komentar:';

    const message = await formatRekapAllSosmed(
      '',
      ttNarrative,
      'Direktorat Binmas'
    );

    const tikTokSection = message
      .split('\n')
      .slice(message.split('\n').indexOf('2. 🎵 *TikTok*'))
      .join('\n');

    expect(tikTokSection).toContain('Tidak ada data peringkat komentar TikTok.');
    expect(tikTokSection).not.toContain('Top 5 Komentar:');
    expect(message).not.toContain('Capaian IG & TikTok sudah sesuai target');
  });

  test('builds TikTok task list without mixing top/bottom highlights', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-11-27T12:00:00Z'));

    const igNarrative = `DIREKTORAT BINMAS\n\n# Insight Likes Konten\n- Jumlah konten aktif: 1 link.\n- Total likes: 100 dari 200 (50,0% capaian).\n- Target harian ≥95%: 190 likes → kekurangan 90.\n- Distribusi likes per konten:\n1. https://instagram.com/p/alpha — 100 likes\n\n# Status Data Personel\n- Personil tercatat: 10 → IG 50,0% (5), TT 40,0% (4).`;

    const ttNarrative = `Mohon Ijin Komandan, melaporkan analitik pelaksanaan komentar TikTok hari Kamis, 27 November 2025 pukul 19.00 WIB.\n\n📊 *Ringkasan Analitik Komentar TikTok – DIREKTORAT BINMAS*\n\n*Tugas TikTok*\n1. https://www.tiktok.com/@binmas/video/aaa — 30 komentar\n2. https://www.tiktok.com/@binmas/video/bbb — 20 komentar\n\n*Sorotan Konten*\n• Performa tertinggi : https://www.tiktok.com/@binmas/video/aaa — 30 komentar\n• Performa terendah : https://www.tiktok.com/@binmas/video/ccc — 1 komentar\n\n*Catatan Backlog*\n• Personel belum komentar : 5 (prioritas: Satker A (2))`;

    const message = await formatRekapAllSosmed(igNarrative, ttNarrative);

    const tiktokLines = message
      .split('\n')
      .filter((line) => line.startsWith('- TikTok'));

    expect(tiktokLines).toEqual([
      '- TikTok 1. https://www.tiktok.com/@binmas/video/aaa — 30 komentar',
      '- TikTok 2. https://www.tiktok.com/@binmas/video/bbb — 20 komentar',
    ]);

    jest.useRealTimers();
  });

  test('drops performance highlights that sit inside the TikTok task section', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-11-29T08:00:00Z'));

    const igNarrative = `DIREKTORAT BINMAS\n\n# Insight Likes Konten\n- Jumlah konten aktif: 1 link.\n- Total likes: 90 dari 100 (90,0% capaian).\n- Distribusi likes per konten:\n1. https://instagram.com/p/single — 90 likes`;

    const ttNarrative = `*Tugas TikTok*\n1. https://www.tiktok.com/@binmas/video/aaa — 12 komentar\n2. https://www.tiktok.com/@binmas/video/bbb — 5 komentar\n• Performa tertinggi : https://www.tiktok.com/@binmas/video/aaa — 12 komentar\n• Performa terendah : https://www.tiktok.com/@binmas/video/ccc — 1 komentar`;

    const message = await formatRekapAllSosmed(igNarrative, ttNarrative);

    const tiktokLines = message
      .split('\n')
      .filter((line) => line.startsWith('- TikTok'));

    expect(tiktokLines).toEqual([
      '- TikTok 1. https://www.tiktok.com/@binmas/video/aaa — 12 komentar',
      '- TikTok 2. https://www.tiktok.com/@binmas/video/bbb — 5 komentar',
    ]);

    jest.useRealTimers();
  });

  test('scopes IG/TT tasks to the selected client section', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-03T09:00:00Z'));

    const igNarrative = `DIREKTORAT LALU LINTAS\n\n# Insight Likes Konten\n1. https://instagram.com/p/alpha — 50 likes\n\nDIREKTORAT BINMAS\n\n# Insight Likes Konten\n1. https://instagram.com/p/binmas-1 — 120 likes\n2. https://instagram.com/p/binmas-2 — 80 likes`;

    const ttNarrative = `📊 *Ringkasan Analitik Komentar TikTok – DIREKTORAT LALU LINTAS*\n\n*Tugas TikTok*\n1. https://www.tiktok.com/@ditlantas/video/zzz — 4 komentar\n\n📊 *Ringkasan Analitik Komentar TikTok – DIREKTORAT BINMAS*\n\n*Tugas TikTok*\n1. https://www.tiktok.com/@binmas/video/bin-1 — 10 komentar\n2. https://www.tiktok.com/@binmas/video/bin-2 — 5 komentar`;

    const message = await formatRekapAllSosmed(
      igNarrative,
      ttNarrative,
      'Direktorat Binmas'
    );

    const igLines = message
      .split('\n')
      .filter((line) => line.startsWith('- IG'));
    const ttLines = message
      .split('\n')
      .filter((line) => line.startsWith('- TikTok'));

    expect(igLines).toEqual([
      '- IG 1. https://instagram.com/p/binmas-1 — 120 likes',
      '- IG 2. https://instagram.com/p/binmas-2 — 80 likes',
    ]);
    expect(ttLines).toEqual([
      '- TikTok 1. https://www.tiktok.com/@binmas/video/bin-1 — 10 komentar',
      '- TikTok 2. https://www.tiktok.com/@binmas/video/bin-2 — 5 komentar',
    ]);

    jest.useRealTimers();
  });

  test('adapts closing note when target tercapai dan backlog rendah', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-08-27T16:06:00Z'));

    const igNarrative = `Mohon Ijin Komandan, melaporkan perkembangan Implementasi Update data dan Absensi likes oleh personil hari Rabu, 27 Agustus 2025 pukul 23.06 WIB.\n\nDIREKTORAT BINMAS\n\n# Insight Likes Konten\n- Jumlah konten aktif: 2 link.\n- Total likes: 1.600 dari 1.500 kemungkinan likes (106,7% capaian).\n- Target harian ≥95%: 1.425 likes (target tercapai).\n- Rata-rata likes/konten: 800,0; Seluruh konten stabil.\n- Kontributor likes terbesar: Satker A → menyumbang 40% dari total likes saat ini.\n- Distribusi likes per konten:\n1. https://instagram.com/p/abc — 900 likes\n2. https://instagram.com/p/def — 700 likes\n\n# Status Data Personel\n- Personil tercatat: 120 → IG 97,5% (117), TT 92,0% (110).\n- Rata-rata satker: IG 95,0% (median 95,0%), TT 90,0% (median 90,0%).\n- Satker dengan capaian ≥90% IG & TT: *Satker Juara*.\n\n# Backlog & Prioritas Singkat\n- IG belum diisi: 5 akun (Top-10 menyumbang ≈40,0%: Satker Fokus)\n- TikTok belum diisi: 4 akun (Top-10 menyumbang ≈35,0%: Satker Fokus)\n- Proyeksi jika 70% Top-10 teratasi: IG → ~99,0%, TT → ~96,0%.\n\n# Performa Satker\n- Top performer rata-rata IG/TT: Satker Juara (98%).\n- Bottom performer rata-rata IG/TT: Satker Pembina (85%).\n\nDemikian Komandan hasil analisa yang bisa kami laporkan.`;

    const ttNarrative = `Mohon Ijin Komandan, melaporkan analitik pelaksanaan komentar TikTok hari Rabu, 27 Agustus 2025 pukul 23.06 WIB.\n\n📊 *Ringkasan Analitik Komentar TikTok – DIREKTORAT BINMAS*\n\n*Ringkasan Kinerja*\n• Konten dipantau : 2\n• Interaksi aktual : 400/400 (100,0%)\n• Personel mencapai target : 100/100 (100,0%)\n• Personel aktif (≥1 konten) : 100/100 (100,0%)\n• Partisipan unik : 100 akun\n\n*Kontributor Utama*\n• Penyumbang komentar terbesar : Satker Alpha (150)\n• Top satker aktif : 1. Satker Alpha – 150 komentar; 2. Satker Beta – 120 komentar\n\n*Catatan Backlog*\n• Personel belum komentar : 3 (prioritas: Satker Solid (1))\n• Belum input akun TikTok : 1 (sumber utama: Satker Solid (1))\n\nDemikian Komandan, terimakasih.`;

    const message = await formatRekapAllSosmed(igNarrative, ttNarrative);

    expect(message).toContain('Capaian IG sudah sesuai target; terima kasih atas sinergi hangat seluruh pembina di jajaran DIREKTORAT BINMAS.');
  });

  test('falls back to daily ranking data when narratives lack ranking sections', async () => {
    jest.useFakeTimers();
    const current = new Date('2025-12-10T03:00:00Z');
    jest.setSystemTime(current);

    const generatedDate = current.toLocaleDateString('id-ID');
    const generatedDateKey = current.toDateString();

    mockFindClientById.mockResolvedValue({
      client_type: 'direktorat',
      client_tiktok: '@ditbinmas',
      nama: 'Direktorat Binmas',
    });
    mockGetInstaPostsTodayByClient.mockResolvedValue([
      { shortcode: 'ig-today' },
    ]);
    mockGetTiktokPostsTodayByClient.mockResolvedValue([
      { video_id: 'tt-today' },
    ]);

    const message = await formatRekapAllSosmed('', '', 'Direktorat Binmas', 'DITBINMAS', {
      igRankingData: {
        generatedDate,
        generatedDateKey,
        metricLabel: 'likes',
        top: [{ name: 'Satker A', score: 200 }],
        bottom: [{ name: 'Satker Z', score: 5 }],
      },
      ttRankingData: {
        generatedDate,
        generatedDateKey,
        metricLabel: 'komentar',
        top: [{ name: 'Satker T', score: 50 }],
        bottom: [{ name: 'Satker Q', score: 1 }],
      },
    });

    expect(message).toContain('Top 5 Likes:');
    expect(message).toContain('- 1. Satker A — 200 likes');
    expect(message).toContain('Bottom 5 Komentar:');
    expect(message).toContain('- 1. Satker Q — 1 komentar');
  });
});

test('choose_menu option 5 absensi likes ditbinmas', async () => {
  mockAbsensiLikesDitbinmasReport.mockResolvedValue('laporan');

  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '321';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '5', waClient);

  expect(mockAbsensiLikesDitbinmasReport).toHaveBeenCalled();
  expect(mockAbsensiLikes).not.toHaveBeenCalled();
  expect(waClient.sendMessage).toHaveBeenCalledWith(chatId, 'laporan');
});

test('choose_menu option 31 sends top personnel ranking', async () => {
  mockFindClientById.mockResolvedValue({ nama: 'DIT BINMAS' });
  mockGetRekapLikesByClient.mockResolvedValue({
    rows: [
      {
        user_id: '1001',
        title: 'AKP',
        nama: 'Budi',
        client_name: 'Satker A',
        jumlah_like: 4,
      },
    ],
  });
  mockGetRekapKomentarByClient.mockResolvedValue([
    {
      user_id: '1001',
      title: 'AKP',
      nama: 'Budi',
      client_name: 'Satker A',
      jumlah_komentar: 6,
    },
  ]);

  const session = {
    role: 'ditbinmas',
    selectedClientId: 'ditbinmas',
    clientName: 'DIT BINMAS',
    dir_client_id: 'ditbinmas',
  };
  const chatId = '500';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '31', waClient);

  expect(mockGetRekapLikesByClient).toHaveBeenCalled();
  expect(mockGetRekapKomentarByClient).toHaveBeenCalled();
  expect(waClient.sendMessage).toHaveBeenNthCalledWith(
    1,
    chatId,
    expect.stringContaining('Total Like/Komentar: 10')
  );
  const menuMsg = waClient.sendMessage.mock.calls[1][1];
  expect(menuMsg).toContain('3️⃣1️⃣ Top ranking like/komentar personel');
  expect(menuMsg).toContain('3️⃣2️⃣ Top ranking like/komentar polres tertinggi');
});

test('choose_menu option 32 top polres ranking', async () => {
  mockGetRekapLikesByClient.mockResolvedValue({
    rows: [
      { client_id: 'POLRES_A', client_name: 'Polres A', jumlah_like: 5 },
    ],
  });
  mockGetRekapKomentarByClient.mockResolvedValue([
    { client_id: 'POLRES_A', client_name: 'Polres A', jumlah_komentar: 2 },
  ]);

  const session = {
    role: 'ditbinmas',
    selectedClientId: 'ditbinmas',
    clientName: 'DIT BINMAS',
    dir_client_id: 'ditbinmas',
  };
  const chatId = '501';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '32', waClient);

  expect(mockGetRekapLikesByClient).toHaveBeenCalled();
  expect(mockGetRekapKomentarByClient).toHaveBeenCalled();
  expect(waClient.sendMessage).toHaveBeenNthCalledWith(
    1,
    chatId,
    expect.stringContaining('Top Ranking Like & Komentar Polres')
  );
  const menuMsg = waClient.sendMessage.mock.calls[1][1];
  expect(menuMsg).toContain('3️⃣2️⃣ Top ranking like/komentar polres tertinggi');
});

test('choose_menu option 6 absensi likes ditbinmas simple', async () => {
  mockAbsensiLikesDitbinmasSimple.mockResolvedValue('simple laporan');

  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '322';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '6', waClient);

  expect(mockAbsensiLikesDitbinmasSimple).toHaveBeenCalled();
  expect(waClient.sendMessage).toHaveBeenCalledWith(chatId, 'simple laporan');
});

test('choose_menu option 10 absensi komentar ditbinmas detail', async () => {
  mockAbsensiKomentarDitbinmasReport.mockResolvedValue('detail komentar');

  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '333';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '10', waClient);

  expect(mockAbsensiKomentarDitbinmasReport).toHaveBeenCalled();
  expect(waClient.sendMessage).toHaveBeenCalledWith(chatId, 'detail komentar');
});

test('choose_menu option 8 absensi komentar tiktok', async () => {
  mockAbsensiKomentar.mockResolvedValue('laporan komentar');

  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '444';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '8', waClient);

  expect(mockAbsensiKomentar).toHaveBeenCalledWith('DITBINMAS', { roleFlag: 'ditbinmas' });
  expect(waClient.sendMessage).toHaveBeenCalledWith(chatId, 'laporan komentar');
});

test('choose_menu option 9 absensi komentar ditbinmas simple', async () => {
  mockAbsensiKomentarDitbinmasSimple.mockResolvedValue('komentar simple');

  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '445';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '9', waClient);

  expect(mockAbsensiKomentarDitbinmasSimple).toHaveBeenCalled();
  expect(waClient.sendMessage).toHaveBeenCalledWith(chatId, 'komentar simple');
});

test('choose_menu option 7 absensi likes mengikuti client pilihan', async () => {
  mockAbsensiLikes.mockResolvedValue('laporan');
  mockFindClientById.mockResolvedValue({ client_type: 'org', nama: 'POLRES A' });

  const session = {
    role: 'ditbinmas',
    selectedClientId: 'polres_a',
    clientName: 'POLRES A',
    dir_client_id: 'ditbinmas',
  };
  const chatId = '999';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '7', waClient);

  expect(mockAbsensiLikes).toHaveBeenCalledWith('POLRES_A', {
    mode: 'all',
    roleFlag: 'ditbinmas',
  });
});

test('choose_menu option 7 tetap berjalan untuk client polres', async () => {
  mockAbsensiLikes.mockResolvedValue('laporan');

  const session = {
    role: 'polres',
    selectedClientId: 'polres_a',
    clientName: 'POLRES A',
  };
  const chatId = '555';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '7', waClient);

  expect(mockAbsensiLikes).toHaveBeenCalledWith('POLRES_A', {
    mode: 'all',
    roleFlag: 'polres',
  });
  expect(waClient.sendMessage).toHaveBeenCalledWith(chatId, 'laporan');
});


test('choose_menu option 12 fetch insta returns rekap likes report', async () => {
  mockFetchAndStoreInstaContent.mockResolvedValue();
  mockHandleFetchLikesInstagram.mockResolvedValue();
  mockRekapLikesIG.mockResolvedValue('laporan likes');
  mockSafeSendMessage.mockResolvedValue(true);

  const session = {
    role: 'ditbinmas',
    selectedClientId: 'ditbinmas',
    clientName: 'DITBINMAS',
    dir_client_id: 'ditbinmas',
  };
  const chatId = '777';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '12', waClient);

  expect(mockFetchAndStoreInstaContent).toHaveBeenCalledWith(
    ['shortcode', 'caption', 'like_count', 'timestamp'],
    waClient,
    chatId,
    'DITBINMAS'
  );
  expect(mockHandleFetchLikesInstagram).toHaveBeenCalledWith(null, null, 'DITBINMAS');
  expect(mockRekapLikesIG).toHaveBeenCalledWith('DITBINMAS');
  expect(waClient.sendMessage).toHaveBeenCalledWith(chatId, 'laporan likes');
  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    waClient,
    '120363419830216549@g.us',
    'laporan likes'
  );
});

test('choose_menu option 14 fetch tiktok returns komentar report', async () => {
  mockFetchAndStoreTiktokContent.mockResolvedValue();
  mockHandleFetchKomentarTiktokBatch.mockResolvedValue();
  mockAbsensiKomentarDitbinmasReport.mockResolvedValue('laporan tiktok');
  mockSafeSendMessage.mockResolvedValue(true);
  mockFindClientById.mockResolvedValue({ client_type: 'direktorat', nama: 'DITBINMAS' });

  const session = {
    role: 'ditbinmas',
    selectedClientId: 'ditbinmas',
    clientName: 'DITBINMAS',
    dir_client_id: 'ditbinmas',
  };
  const chatId = '888';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '14', waClient);

  expect(mockFetchAndStoreTiktokContent).toHaveBeenCalledWith(
    'DITBINMAS',
    waClient,
    chatId
  );
  expect(mockHandleFetchKomentarTiktokBatch).toHaveBeenCalledWith(
    waClient,
    chatId,
    'DITBINMAS'
  );
  expect(mockAbsensiKomentarDitbinmasReport).toHaveBeenCalled();
  expect(waClient.sendMessage).toHaveBeenCalledWith(chatId, 'laporan tiktok');
  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    waClient,
    '120363419830216549@g.us',
    'laporan tiktok'
  );
});

test('choose_menu option 16 fetch sosial media sends combined task', async () => {
  mockGetShortcodesTodayByClient.mockResolvedValue(['oldSc']);
  mockGetVideoIdsTodayByClient.mockResolvedValue(['vid123']);
  mockFetchAndStoreInstaContent.mockResolvedValue();
  mockHandleFetchLikesInstagram.mockResolvedValue();
  mockFetchAndStoreTiktokContent.mockResolvedValue();
  mockHandleFetchKomentarTiktokBatch.mockResolvedValue();
  mockGenerateSosmedTaskMessage.mockResolvedValue({
    text: 'tugas sosmed',
    igCount: 0,
    tiktokCount: 0,
  });
  mockSafeSendMessage.mockResolvedValue(true);
  mockFindClientById.mockResolvedValue({ client_type: 'direktorat', nama: 'DITBINMAS' });

  const session = {
    role: 'ditbinmas',
    selectedClientId: 'ditbinmas',
    clientName: 'DITBINMAS',
    dir_client_id: 'ditbinmas',
  };
  const chatId = '1001';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '16', waClient);

  expect(mockFetchAndStoreInstaContent).toHaveBeenCalledWith(
    ['shortcode', 'caption', 'like_count', 'timestamp'],
    waClient,
    chatId,
    'DITBINMAS'
  );
  expect(mockHandleFetchLikesInstagram).toHaveBeenCalledWith(null, null, 'DITBINMAS');
  expect(mockFetchAndStoreTiktokContent).toHaveBeenCalledWith(
    'DITBINMAS',
    waClient,
    chatId
  );
  expect(mockHandleFetchKomentarTiktokBatch).toHaveBeenCalledWith(null, null, 'DITBINMAS');
  expect(mockGenerateSosmedTaskMessage).toHaveBeenCalledWith('DITBINMAS', {
    skipTiktokFetch: true,
    skipLikesFetch: true,
    previousState: {
      igShortcodes: ['oldSc'],
      tiktokVideoIds: ['vid123'],
    },
  });
  expect(waClient.sendMessage).toHaveBeenCalledWith(chatId, 'tugas sosmed');
  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    waClient,
    '120363419830216549@g.us',
    'tugas sosmed'
  );
});

test('choose_menu option 17 sends laphar file, narrative, and likes recap excel', async () => {
  mockLapharDitbinmas.mockResolvedValue({
    text: 'lap',
    filename: 'lap.txt',
    textBelum: 'belum',
    filenameBelum: 'belum.txt',
    narrative: 'narasi',
  });
  mockCollectLikesRecap.mockResolvedValue({ shortcodes: ['sc1'] });
  mockSaveLikesRecapExcel.mockResolvedValue('/tmp/recap.xlsx');
  mockReadFile.mockResolvedValue(Buffer.from('excel'));
  mockUnlink.mockResolvedValue();
  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '999';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '17', waClient);

  expect(mockLapharDitbinmas).toHaveBeenCalled();
  expect(mockCollectLikesRecap).toHaveBeenCalledWith('ditbinmas');
  expect(mockSaveLikesRecapExcel).toHaveBeenCalledWith({ shortcodes: ['sc1'] }, 'ditbinmas');
  expect(mockReadFile).toHaveBeenCalledWith('/tmp/recap.xlsx');
  expect(mockUnlink).toHaveBeenCalledWith('/tmp/recap.xlsx');
  expect(mockMkdir).toHaveBeenCalledWith('laphar', { recursive: true });
  expect(mockWriteFile).toHaveBeenNthCalledWith(
    1,
    path.join('laphar', 'lap.txt'),
    expect.any(Buffer)
  );
  expect(mockSendWAFile).toHaveBeenNthCalledWith(
    1,
    waClient,
    expect.any(Buffer),
    'lap.txt',
    chatId,
    'text/plain'
  );
  expect(mockWriteFile).toHaveBeenNthCalledWith(
    2,
    path.join('laphar', 'belum.txt'),
    expect.any(Buffer)
  );
  expect(mockSendWAFile).toHaveBeenNthCalledWith(
    2,
    waClient,
    expect.any(Buffer),
    'belum.txt',
    chatId,
    'text/plain'
  );
  expect(mockSendWAFile).toHaveBeenNthCalledWith(
    3,
    waClient,
    expect.any(Buffer),
    path.basename('/tmp/recap.xlsx'),
    chatId,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  expect(waClient.sendMessage.mock.calls[0][0]).toBe(chatId);
  expect(waClient.sendMessage.mock.calls[0][1]).toBe('narasi');
  expect(waClient.sendMessage.mock.invocationCallOrder[0]).toBeLessThan(
    mockWriteFile.mock.invocationCallOrder[0],
  );
});

test('choose_menu option 18 sends tiktok laphar file narrative and recap excel', async () => {
  mockLapharTiktokDitbinmas.mockResolvedValue({
    text: 'lap',
    filename: 'lap.txt',
    textBelum: 'belum',
    filenameBelum: 'belum.txt',
    narrative: 'narasi',
  });
  mockCollectKomentarRecap.mockResolvedValue({
    videoIds: ['vid1'],
    recap: { POLRES_A: [{ pangkat: 'AKP', nama: 'Budi', satfung: 'SAT A', vid1: 1 }] },
  });
  mockSaveCommentRecapExcel.mockResolvedValue('/tmp/komentar.xlsx');
  mockReadFile.mockResolvedValue(Buffer.from('excel'));
  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '555';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '18', waClient);

  expect(mockLapharTiktokDitbinmas).toHaveBeenCalled();
  expect(mockCollectKomentarRecap).toHaveBeenCalledWith('ditbinmas');
  expect(mockSaveCommentRecapExcel).toHaveBeenCalledWith({
    videoIds: ['vid1'],
    recap: { POLRES_A: [{ pangkat: 'AKP', nama: 'Budi', satfung: 'SAT A', vid1: 1 }] },
  }, 'ditbinmas');
  expect(mockReadFile).toHaveBeenCalledWith('/tmp/komentar.xlsx');
  expect(mockMkdir).toHaveBeenCalledWith('laphar', { recursive: true });
  expect(mockWriteFile).toHaveBeenNthCalledWith(
    1,
    path.join('laphar', 'lap.txt'),
    expect.any(Buffer)
  );
  expect(mockSendWAFile).toHaveBeenNthCalledWith(
    1,
    waClient,
    expect.any(Buffer),
    'lap.txt',
    chatId,
    'text/plain'
  );
  expect(mockWriteFile).toHaveBeenNthCalledWith(
    2,
    path.join('laphar', 'belum.txt'),
    expect.any(Buffer)
  );
  expect(mockSendWAFile).toHaveBeenNthCalledWith(
    2,
    waClient,
    expect.any(Buffer),
    'belum.txt',
    chatId,
    'text/plain'
  );
  expect(mockSendWAFile).toHaveBeenNthCalledWith(
    3,
    waClient,
    expect.any(Buffer),
    path.basename('/tmp/komentar.xlsx'),
    chatId,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  expect(mockUnlink).toHaveBeenCalledWith('/tmp/komentar.xlsx');
  expect(waClient.sendMessage.mock.calls[0][0]).toBe(chatId);
  expect(waClient.sendMessage.mock.calls[0][1]).toBe('narasi');
});

test('choose_menu option 19 generates likes recap excel and sends file', async () => {
  mockCollectLikesRecap.mockResolvedValue({
    shortcodes: ['sc1'],
    recap: { POLRES_A: [{ pangkat: 'AKP', nama: 'Budi', satfung: 'SAT A', sc1: 1 }] },
  });
  mockSaveLikesRecapExcel.mockResolvedValue('/tmp/recap.xlsx');
  mockReadFile.mockResolvedValue(Buffer.from('excel'));
  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '777';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '19', waClient);

  expect(mockCollectLikesRecap).toHaveBeenCalledWith('ditbinmas');
  expect(mockSaveLikesRecapExcel).toHaveBeenCalledWith({
    shortcodes: ['sc1'],
    recap: { POLRES_A: [{ pangkat: 'AKP', nama: 'Budi', satfung: 'SAT A', sc1: 1 }] },
  }, 'ditbinmas');
  expect(mockReadFile).toHaveBeenCalledWith('/tmp/recap.xlsx');
  expect(mockSendWAFile).toHaveBeenCalledWith(
    waClient,
    expect.any(Buffer),
    path.basename('/tmp/recap.xlsx'),
    chatId,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  expect(mockUnlink).toHaveBeenCalledWith('/tmp/recap.xlsx');
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringContaining('File Excel dikirim')
  );
});

test('choose_menu option 28 generates per content likes recap excel and sends file', async () => {
  mockCollectLikesRecap.mockResolvedValue({
    shortcodes: ['sc1'],
    recap: { POLRES_A: [{ pangkat: 'AKP', nama: 'Budi', satfung: 'SAT A', sc1: 1 }] },
  });
  mockSaveLikesRecapPerContentExcel.mockResolvedValue('/tmp/per_content.xlsx');
  mockReadFile.mockResolvedValue(Buffer.from('excel'));
  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '778';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '28', waClient);

  expect(mockCollectLikesRecap).toHaveBeenCalledWith('ditbinmas');
  expect(mockSaveLikesRecapPerContentExcel).toHaveBeenCalledWith({
    shortcodes: ['sc1'],
    recap: { POLRES_A: [{ pangkat: 'AKP', nama: 'Budi', satfung: 'SAT A', sc1: 1 }] },
  }, 'ditbinmas');
  expect(mockReadFile).toHaveBeenCalledWith('/tmp/per_content.xlsx');
  expect(mockSendWAFile).toHaveBeenCalledWith(
    waClient,
    expect.any(Buffer),
    path.basename('/tmp/per_content.xlsx'),
    chatId,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  expect(mockUnlink).toHaveBeenCalledWith('/tmp/per_content.xlsx');
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringContaining('File Excel dikirim')
  );
});

test('choose_menu option 29 generates TikTok per content comment recap excel and sends file', async () => {
  mockCollectKomentarRecap.mockResolvedValue({
    videoIds: ['vid1'],
    recap: {
      POLRES_A: [
        { pangkat: 'AKP', nama: 'Budi', satfung: 'SAT A', vid1: 1 },
      ],
    },
  });
  mockSaveCommentRecapPerContentExcel.mockResolvedValue('/tmp/tiktok_per_content.xlsx');
  mockReadFile.mockResolvedValue(Buffer.from('excel'));
  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '780';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '29', waClient);

  expect(mockCollectKomentarRecap).toHaveBeenCalledWith('ditbinmas');
  expect(mockSaveCommentRecapPerContentExcel).toHaveBeenCalledWith(
    {
      videoIds: ['vid1'],
      recap: {
        POLRES_A: [
          { pangkat: 'AKP', nama: 'Budi', satfung: 'SAT A', vid1: 1 },
        ],
      },
    },
    'ditbinmas'
  );
  expect(mockReadFile).toHaveBeenCalledWith('/tmp/tiktok_per_content.xlsx');
  expect(mockSendWAFile).toHaveBeenCalledWith(
    waClient,
    expect.any(Buffer),
    path.basename('/tmp/tiktok_per_content.xlsx'),
    chatId,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  expect(mockUnlink).toHaveBeenCalledWith('/tmp/tiktok_per_content.xlsx');
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringContaining('File Excel dikirim')
  );
});

test('choose_menu option 29 reports no TikTok content when recap empty', async () => {
  mockCollectKomentarRecap.mockResolvedValue({ videoIds: [] });
  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '781';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '29', waClient);

  expect(mockSaveCommentRecapPerContentExcel).not.toHaveBeenCalled();
  expect(mockReadFile).not.toHaveBeenCalled();
  expect(mockSendWAFile).not.toHaveBeenCalled();
  expect(mockUnlink).not.toHaveBeenCalled();
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringContaining('Tidak ada konten TikTok')
  );
});

test('choose_menu option 43 generates TikTok all data excel and sends file', async () => {
  mockFindClientById.mockResolvedValue({ nama: 'DIT BINMAS' });
  mockReadFile.mockResolvedValue(Buffer.from('excel'));
  mockUnlink.mockResolvedValue();
  const session = {
    selectedClientId: 'ditbinmas',
    dir_client_id: 'ditbinmas',
    clientName: 'DIT BINMAS',
    role: 'ditbinmas',
  };
  const chatId = '43-menu';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '43', waClient);

  expect(mockFindClientById).toHaveBeenCalledWith('DITBINMAS');
  expect(mockGenerateTiktokAllDataRecap).toHaveBeenCalledWith({
    clientId: 'ditbinmas',
    roleFlag: 'ditbinmas',
    clientName: 'DIT BINMAS',
  });
  expect(mockReadFile).toHaveBeenCalledWith('/tmp/tiktok-all.xlsx');
  expect(mockSendWAFile).toHaveBeenCalledWith(
    waClient,
    expect.any(Buffer),
    path.basename('/tmp/tiktok-all.xlsx'),
    chatId,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  expect(mockUnlink).toHaveBeenCalledWith('/tmp/tiktok-all.xlsx');
  const messages = waClient.sendMessage.mock.calls.map((call) => call[1]);
  expect(messages.some((message) => message.includes('TikTok all data dikirim'))).toBe(true);
});

test('choose_menu option 20 generates TikTok comment recap excel and sends file', async () => {
  mockCollectKomentarRecap.mockResolvedValue({ videoIds: ['vid1'] });
  mockSaveCommentRecapExcel.mockResolvedValue('/tmp/tiktok.xlsx');

  mockReadFile.mockResolvedValue(Buffer.from('excel'));
  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '778';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '20', waClient);

  expect(mockCollectKomentarRecap).toHaveBeenCalledWith('ditbinmas');
  expect(mockSaveCommentRecapExcel).toHaveBeenCalledWith({ videoIds: ['vid1'] }, 'ditbinmas');
  expect(mockReadFile).toHaveBeenCalledWith('/tmp/tiktok.xlsx');
  expect(mockSendWAFile).toHaveBeenCalledWith(
    waClient,
    expect.any(Buffer),
    path.basename('/tmp/tiktok.xlsx'),
    chatId,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  expect(mockUnlink).toHaveBeenCalledWith('/tmp/tiktok.xlsx');
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringContaining('File Excel dikirim')
  );
});

test('choose_menu option 20 reports no TikTok content when recap empty', async () => {  mockCollectKomentarRecap.mockResolvedValue({ videoIds: [] });
  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '779';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '20', waClient);

  expect(mockSaveCommentRecapExcel).not.toHaveBeenCalled();
  expect(mockReadFile).not.toHaveBeenCalled();
  expect(mockSendWAFile).not.toHaveBeenCalled();
  expect(mockUnlink).not.toHaveBeenCalled();
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringContaining('Tidak ada konten TikTok')

  );
});

test('choose_menu option 22 opens engagement recap submenu', async () => {
  const session = {
    selectedClientId: 'ditbinmas',
    clientName: 'DIT BINMAS',
    role: 'ditbinmas',
  };
  const chatId = '788';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '22', waClient);

  expect(session.step).toBe('choose_engagement_recap_period');
  expect(mockSaveEngagementRankingExcel).not.toHaveBeenCalled();
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringContaining('Silakan pilih periode rekap ranking engagement jajaran:')
  );
});

test('choose_engagement_recap_period option 1 sends today recap and returns to main menu', async () => {
  mockReadFile.mockResolvedValue(Buffer.from('excel'));
  const session = {
    selectedClientId: 'ditbinmas',
    dir_client_id: 'ditbinmas',
    clientName: 'DIT BINMAS',
    role: 'ditbinmas',
  };
  const chatId = '789';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_engagement_recap_period(session, chatId, '1', waClient);

  expect(mockSaveEngagementRankingExcel).toHaveBeenCalledWith({
    clientId: 'ditbinmas',
    roleFlag: 'ditbinmas',
    period: 'today',
  });
  expect(mockReadFile).toHaveBeenCalledWith('/tmp/ranking.xlsx');
  expect(mockSendWAFile).toHaveBeenCalledWith(
    waClient,
    expect.any(Buffer),
    path.basename('/tmp/ranking.xlsx'),
    chatId,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  expect(mockUnlink).toHaveBeenCalledWith('/tmp/ranking.xlsx');
  expect(waClient.sendMessage.mock.calls.map((call) => call[1])).toEqual(
    expect.arrayContaining([
      expect.stringContaining('File Excel rekap ranking engagement (hari ini) dikirim.'),
    ])
  );
  expect(session.step).toBe('choose_menu');
});

test('choose_engagement_recap_period handles service failure gracefully', async () => {
  mockSaveEngagementRankingExcel.mockRejectedValueOnce(
    new Error('Tidak ada data engagement untuk direkap.')
  );
  const session = {
    selectedClientId: 'ditbinmas',
    dir_client_id: 'ditbinmas',
    clientName: 'DIT BINMAS',
  };
  const chatId = '790';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_engagement_recap_period(session, chatId, '2', waClient);

  expect(mockReadFile).not.toHaveBeenCalled();
  expect(mockSendWAFile).not.toHaveBeenCalled();
  expect(mockUnlink).not.toHaveBeenCalled();
  expect(waClient.sendMessage.mock.calls.map((call) => call[1])).toEqual(
    expect.arrayContaining([
      expect.stringContaining('Tidak ada data engagement'),
    ])
  );
  expect(session.step).toBe('choose_menu');
});

test('choose_engagement_recap_period dapat dibatalkan', async () => {
  const session = {
    selectedClientId: 'ditbinmas',
    dir_client_id: 'ditbinmas',
    clientName: 'DIT BINMAS',
  };
  const chatId = '791';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_engagement_recap_period(session, chatId, 'batal', waClient);

  expect(mockSaveEngagementRankingExcel).not.toHaveBeenCalled();
  expect(session.step).toBe('choose_menu');
  expect(waClient.sendMessage.mock.calls.map((call) => call[1])).toEqual(
    expect.arrayContaining([
      expect.stringContaining('Menu rekap ranking engagement ditutup.'),
    ])
  );
});

test('choose_engagement_recap_period mengingatkan saat pilihan tidak valid', async () => {
  const session = {
    selectedClientId: 'ditbinmas',
    dir_client_id: 'ditbinmas',
    clientName: 'DIT BINMAS',
  };
  const chatId = '792';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_engagement_recap_period(session, chatId, '9', waClient);

  expect(mockSaveEngagementRankingExcel).not.toHaveBeenCalled();
  expect(mockReadFile).not.toHaveBeenCalled();
  expect(session.step).toBeUndefined();
  const messages = waClient.sendMessage.mock.calls.map((call) => call[1]);
  expect(messages).toEqual(
    expect.arrayContaining([
      expect.stringContaining('Pilihan tidak valid'),
      expect.stringContaining('Silakan pilih periode rekap ranking engagement jajaran:'),
    ])
  );
});

test('choose_menu option 23 generates weekly likes recap excel and sends file', async () => {
  mockSaveWeeklyLikesRecapExcel.mockResolvedValue('/tmp/weekly.xlsx');
  mockReadFile.mockResolvedValue(Buffer.from('excel'));
  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '790';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '23', waClient);

  expect(mockSaveWeeklyLikesRecapExcel).toHaveBeenCalledWith('ditbinmas');
  expect(mockReadFile).toHaveBeenCalledWith('/tmp/weekly.xlsx');
  expect(mockSendWAFile).toHaveBeenCalledWith(
    waClient,
    expect.any(Buffer),
    path.basename('/tmp/weekly.xlsx'),
    chatId,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  expect(mockUnlink).toHaveBeenCalledWith('/tmp/weekly.xlsx');
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringContaining('File Excel dikirim')
  );
});

test('choose_menu option 23 sends no data message when service returns null', async () => {
  mockSaveWeeklyLikesRecapExcel.mockResolvedValue(null);
  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '791';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '23', waClient);

  expect(mockReadFile).not.toHaveBeenCalled();
  expect(mockSendWAFile).not.toHaveBeenCalled();
  expect(mockUnlink).not.toHaveBeenCalled();
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringMatching(/tidak ada data/i)
  );
});

test('choose_menu option 24 generates weekly comment recap excel and sends file', async () => {
  mockSaveWeeklyCommentRecapExcel.mockResolvedValue('/tmp/weekly-comments.xlsx');
  mockReadFile.mockResolvedValue(Buffer.from('excel'));
  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '792';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '24', waClient);

  expect(mockSaveWeeklyCommentRecapExcel).toHaveBeenCalledWith('ditbinmas');
  expect(mockReadFile).toHaveBeenCalledWith('/tmp/weekly-comments.xlsx');
  expect(mockSendWAFile).toHaveBeenCalledWith(
    waClient,
    expect.any(Buffer),
    path.basename('/tmp/weekly-comments.xlsx'),
    chatId,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  expect(mockUnlink).toHaveBeenCalledWith('/tmp/weekly-comments.xlsx');
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringContaining('File Excel dikirim')
  );
});

test('choose_menu option 24 sends no data message when service returns null', async () => {
  mockSaveWeeklyCommentRecapExcel.mockResolvedValue(null);
  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '793';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '24', waClient);

  expect(mockReadFile).not.toHaveBeenCalled();
  expect(mockSendWAFile).not.toHaveBeenCalled();
  expect(mockUnlink).not.toHaveBeenCalled();
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringMatching(/tidak ada data/i)
  );
});

test('choose_menu option 25 sends TikTok Top and Bottom recap', async () => {
  mockGenerateWeeklyTiktokHighLowReport.mockResolvedValue('Ringkasan Top and Bottom');
  const session = {
    selectedClientId: 'ditbinmas',
    clientName: 'DIT BINMAS',
    role: 'ditbinmas',
  };
  const chatId = '794';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '25', waClient);

  expect(mockGenerateWeeklyTiktokHighLowReport).toHaveBeenCalledWith('ditbinmas', {
    roleFlag: 'ditbinmas',
  });
  const messages = waClient.sendMessage.mock.calls.map((call) => call[1]);
  expect(messages).toContain('Ringkasan Top and Bottom');
});

test('choose_menu option 26 sends Instagram Top and Bottom recap', async () => {
  mockGenerateWeeklyInstagramHighLowReport.mockResolvedValue(
    'Ringkasan IG Top and Bottom'
  );
  const session = {
    selectedClientId: 'ditbinmas',
    clientName: 'DIT BINMAS',
    role: 'ditbinmas',
  };
  const chatId = '794-ig';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '26', waClient);

  expect(mockGenerateWeeklyInstagramHighLowReport).toHaveBeenCalledWith(
    'ditbinmas',
    {
      roleFlag: 'ditbinmas',
    }
  );
  const messages = waClient.sendMessage.mock.calls.map((call) => call[1]);
  expect(messages).toContain('Ringkasan IG Top and Bottom');
});

test('choose_menu option 26 blocks non-DITBINMAS users', async () => {
  const session = {
    selectedClientId: 'polres_kediri',
    clientName: 'POLRES KEDIRI',
    role: 'operator',
  };
  const chatId = '794-block';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '26', waClient);

  expect(mockGenerateWeeklyInstagramHighLowReport).not.toHaveBeenCalled();
  const messages = waClient.sendMessage.mock.calls.map((call) => call[1]);
  expect(messages).toEqual(
    expect.arrayContaining([
      expect.stringContaining('hanya tersedia untuk pengguna DITBINMAS'),
    ])
  );
});

test('choose_menu option 25 reports failure when TikTok Top and Bottom service throws', async () => {
  mockGenerateWeeklyTiktokHighLowReport.mockRejectedValue(
    new Error('Tidak ada data mingguan tersedia')
  );
  const session = {
    selectedClientId: 'ditbinmas',
    clientName: 'DIT BINMAS',
    role: 'ditbinmas',
  };
  const chatId = '795';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '25', waClient);

  expect(mockGenerateWeeklyTiktokHighLowReport).toHaveBeenCalledWith('ditbinmas', {
    roleFlag: 'ditbinmas',
  });
  const messages = waClient.sendMessage.mock.calls.map((call) => call[1]);
  expect(messages).toEqual(
    expect.arrayContaining([expect.stringContaining('Tidak ada data mingguan tersedia')])
  );
});

test('choose_menu option 27 generates monthly likes recap excel and sends file', async () => {
  mockSaveMonthlyLikesRecapExcel.mockResolvedValue('/tmp/monthly.xlsx');
  mockReadFile.mockResolvedValue(Buffer.from('excel'));
  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '991';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '27', waClient);

  expect(mockSaveMonthlyLikesRecapExcel).toHaveBeenCalledWith('ditbinmas');
  expect(mockReadFile).toHaveBeenCalledWith('/tmp/monthly.xlsx');
  expect(mockSendWAFile).toHaveBeenCalledWith(
    waClient,
    expect.any(Buffer),
    path.basename('/tmp/monthly.xlsx'),
    chatId,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  expect(mockUnlink).toHaveBeenCalledWith('/tmp/monthly.xlsx');
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringContaining('File Excel dikirim')
  );
});

test('choose_menu option 27 reports no data when service returns null', async () => {
  mockSaveMonthlyLikesRecapExcel.mockResolvedValue(null);
  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '992';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '27', waClient);

  expect(mockReadFile).not.toHaveBeenCalled();
  expect(mockSendWAFile).not.toHaveBeenCalled();
  expect(mockUnlink).not.toHaveBeenCalled();
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringMatching(/tidak ada data/i)
  );
});

test('choose_menu option 30 opens Kasatker report submenu', async () => {
  const session = {
    selectedClientId: 'ditbinmas',
    clientName: 'DIT BINMAS',
    role: 'ditbinmas',
  };
  const chatId = '993';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '30', waClient);

  expect(session.step).toBe('choose_kasatker_report_period');
  expect(mockGenerateKasatkerReport).not.toHaveBeenCalled();
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringContaining('Silakan pilih periode Laporan Kasatker:')
  );
});

test('choose_menu option 33 memanggil layanan absensi Kasatker dan kembali ke menu utama', async () => {
  const session = {
    selectedClientId: 'ditbinmas',
    clientName: 'DIT BINMAS',
    role: 'ditbinmas',
  };
  const chatId = '998';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '33', waClient);

  expect(session.step).toBe('choose_menu');
  expect(mockGenerateKasatkerAttendanceSummary).toHaveBeenCalledWith({
    clientId: 'ditbinmas',
    roleFlag: 'ditbinmas',
  });
  const messages = waClient.sendMessage.mock.calls.map((call) => call[1]);
  expect(messages[0]).toBe('Narasi Absensi Kasatker');
  expect(messages.some((msg) => msg.includes('Client: *DITBINMAS*'))).toBe(true);
});

test('choose_menu option 34 membuka submenu Absensi Likes Kasat Binmas', async () => {
  const session = {
    selectedClientId: 'ditbinmas',
    clientName: 'DIT BINMAS',
  };
  const chatId = '998a';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '34', waClient);

  expect(session.step).toBe('choose_kasat_binmas_likes_period');
  expect(mockGenerateKasatBinmasLikesRecap).not.toHaveBeenCalled();
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringContaining('Silakan pilih rekap Absensi Likes Kasat Binmas:')
  );
});

test('choose_kasat_binmas_likes_period option 2 memanggil layanan mingguan', async () => {
  mockGenerateKasatBinmasLikesRecap.mockResolvedValue('Rekap mingguan siap');
  const session = { selectedClientId: 'ditbinmas' };
  const chatId = '998b';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_kasat_binmas_likes_period(
    session,
    chatId,
    '2',
    waClient
  );

  expect(mockGenerateKasatBinmasLikesRecap).toHaveBeenCalledWith({
    period: 'weekly',
  });
  const messages = waClient.sendMessage.mock.calls.map((call) => call[1]);
  expect(messages).toContain('Rekap mingguan siap');
  expect(session.step).toBe('choose_menu');
});

test('choose_kasat_binmas_likes_period dapat dibatalkan', async () => {
  const session = { selectedClientId: 'ditbinmas' };
  const chatId = '998c';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_kasat_binmas_likes_period(
    session,
    chatId,
    'batal',
    waClient
  );

  expect(mockGenerateKasatBinmasLikesRecap).not.toHaveBeenCalled();
  expect(session.step).toBe('choose_menu');
  const messages = waClient.sendMessage.mock.calls.map((call) => call[1]);
  expect(messages).toEqual(
    expect.arrayContaining([
      expect.stringContaining('Menu Absensi Likes Kasat Binmas ditutup.'),
    ])
  );
});

test('choose_kasat_binmas_likes_period mengingatkan saat pilihan tidak valid', async () => {
  const session = { selectedClientId: 'ditbinmas' };
  const chatId = '998d';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_kasat_binmas_likes_period(
    session,
    chatId,
    '9',
    waClient
  );

  expect(mockGenerateKasatBinmasLikesRecap).not.toHaveBeenCalled();
  expect(session.step).toBeUndefined();
  const messages = waClient.sendMessage.mock.calls.map((call) => call[1]);
  expect(messages).toEqual(
    expect.arrayContaining([
      expect.stringContaining('Pilihan tidak valid'),
      expect.stringContaining('Silakan pilih rekap Absensi Likes Kasat Binmas:'),
    ])
  );
});

test('choose_kasat_binmas_likes_period menampilkan pesan error saat layanan gagal', async () => {
  mockGenerateKasatBinmasLikesRecap.mockRejectedValue(
    new Error('Tidak ada data Kasat Binmas')
  );
  const session = { selectedClientId: 'ditbinmas' };
  const chatId = '998e';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_kasat_binmas_likes_period(
    session,
    chatId,
    '1',
    waClient
  );

  expect(mockGenerateKasatBinmasLikesRecap).toHaveBeenCalledWith({
    period: 'daily',
  });
  expect(session.step).toBe('choose_menu');
  const messages = waClient.sendMessage.mock.calls.map((call) => call[1]);
  expect(messages).toEqual(
    expect.arrayContaining([expect.stringContaining('Tidak ada data Kasat Binmas')])
  );
});

test('choose_menu option 35 membuka submenu Absensi Komentar TikTok Kasat Binmas', async () => {
  const session = {
    selectedClientId: 'ditbinmas',
    clientName: 'DIT BINMAS',
  };
  const chatId = '998f';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '35', waClient);

  expect(session.step).toBe('choose_kasat_binmas_tiktok_comment_period');
  expect(mockGenerateKasatBinmasTiktokCommentRecap).not.toHaveBeenCalled();
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringContaining('Silakan pilih rekap Absensi Komentar TikTok Kasat Binmas:')
  );
});

test('choose_kasat_binmas_tiktok_comment_period option 2 memanggil layanan mingguan', async () => {
  mockGenerateKasatBinmasTiktokCommentRecap.mockResolvedValue('Rekap komentar mingguan siap');
  const session = { selectedClientId: 'ditbinmas' };
  const chatId = '998g';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_kasat_binmas_tiktok_comment_period(
    session,
    chatId,
    '2',
    waClient
  );

  expect(mockGenerateKasatBinmasTiktokCommentRecap).toHaveBeenCalledWith(
    expect.objectContaining({ period: 'weekly' })
  );
  const messages = waClient.sendMessage.mock.calls.map((call) => call[1]);
  expect(messages).toContain('Rekap komentar mingguan siap');
  expect(session.step).toBe('choose_menu');
});

test('choose_kasat_binmas_tiktok_comment_period meneruskan referenceDate dari sesi', async () => {
  mockGenerateKasatBinmasTiktokCommentRecap.mockResolvedValue(
    'Rekap komentar bulanan siap'
  );
  const session = {
    selectedClientId: 'ditbinmas',
    referenceDate: '2024-12-05T10:00:00.000Z',
  };
  const chatId = '998g2';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_kasat_binmas_tiktok_comment_period(
    session,
    chatId,
    '3',
    waClient
  );

  expect(mockGenerateKasatBinmasTiktokCommentRecap).toHaveBeenCalledWith(
    expect.objectContaining({
      period: 'monthly',
      referenceDate: '2024-12-05T10:00:00.000Z',
    })
  );
  const messages = waClient.sendMessage.mock.calls.map((call) => call[1]);
  expect(messages).toContain('Rekap komentar bulanan siap');
  expect(session.step).toBe('choose_menu');
});

test('choose_kasat_binmas_tiktok_comment_period dapat dibatalkan', async () => {
  const session = { selectedClientId: 'ditbinmas' };
  const chatId = '998h';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_kasat_binmas_tiktok_comment_period(
    session,
    chatId,
    'batal',
    waClient
  );

  expect(mockGenerateKasatBinmasTiktokCommentRecap).not.toHaveBeenCalled();
  expect(session.step).toBe('choose_menu');
  const messages = waClient.sendMessage.mock.calls.map((call) => call[1]);
  expect(messages).toEqual(
    expect.arrayContaining([
      expect.stringContaining('Menu Absensi Komentar TikTok Kasat Binmas ditutup.'),
    ])
  );
});

test('choose_kasat_binmas_tiktok_comment_period mengingatkan saat pilihan tidak valid', async () => {
  const session = { selectedClientId: 'ditbinmas' };
  const chatId = '998i';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_kasat_binmas_tiktok_comment_period(
    session,
    chatId,
    '9',
    waClient
  );

  expect(mockGenerateKasatBinmasTiktokCommentRecap).not.toHaveBeenCalled();
  expect(session.step).toBeUndefined();
  const messages = waClient.sendMessage.mock.calls.map((call) => call[1]);
  expect(messages).toEqual(
    expect.arrayContaining([
      expect.stringContaining('Pilihan tidak valid'),
      expect.stringContaining('Silakan pilih rekap Absensi Komentar TikTok Kasat Binmas:'),
    ])
  );
});

test('choose_kasat_binmas_tiktok_comment_period menampilkan pesan error saat layanan gagal', async () => {
  mockGenerateKasatBinmasTiktokCommentRecap.mockRejectedValue(
    new Error('Tidak ada data Kasat Binmas')
  );
  const session = { selectedClientId: 'ditbinmas' };
  const chatId = '998j';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_kasat_binmas_tiktok_comment_period(
    session,
    chatId,
    '1',
    waClient
  );

  expect(mockGenerateKasatBinmasTiktokCommentRecap).toHaveBeenCalledWith(
    expect.objectContaining({ period: 'daily' })
  );
  expect(session.step).toBe('choose_menu');
  const messages = waClient.sendMessage.mock.calls.map((call) => call[1]);
  expect(messages).toEqual(
    expect.arrayContaining([expect.stringContaining('Tidak ada data Kasat Binmas')])
  );
});

test('choose_kasatker_attendance mengirim pesan error ketika layanan gagal', async () => {
  mockGenerateKasatkerAttendanceSummary.mockRejectedValueOnce(
    new Error('Tidak ada data Kasat Binmas')
  );
  const session = {
    selectedClientId: 'ditbinmas',
    clientName: 'DIT BINMAS',
  };
  const chatId = '999';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_kasatker_attendance(session, chatId, '', waClient);

  const messages = waClient.sendMessage.mock.calls.map((call) => call[1]);
  expect(messages).toEqual(
    expect.arrayContaining([expect.stringContaining('Tidak ada data Kasat Binmas')])
  );
  expect(session.step).toBe('choose_menu');
});

test('choose_kasatker_report_period option 1 mengirim narasi dan kembali ke menu utama', async () => {
  mockFindClientById.mockResolvedValue({ nama: 'DIT BINMAS' });
  const session = {
    selectedClientId: 'ditbinmas',
    dir_client_id: 'ditbinmas',
    clientName: 'DIT BINMAS',
    role: 'ditbinmas',
  };
  const chatId = '994';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_kasatker_report_period(session, chatId, '1', waClient);

  expect(mockGenerateKasatkerReport).toHaveBeenCalledWith({
    clientId: 'ditbinmas',
    roleFlag: 'ditbinmas',
    period: 'today',
  });
  const messages = waClient.sendMessage.mock.calls.map((call) => call[1]);
  expect(messages[0]).toBe('Narasi Kasatker');
  expect(messages).toEqual(
    expect.arrayContaining([expect.stringContaining('Client: *DIT BINMAS*')])
  );
  expect(session.step).toBe('choose_menu');
});

test('choose_kasatker_report_period option 4 mengirim narasi semua periode', async () => {
  mockFindClientById.mockResolvedValue({ nama: 'DIT BINMAS' });
  const session = {
    selectedClientId: 'ditbinmas',
    dir_client_id: 'ditbinmas',
    clientName: 'DIT BINMAS',
    role: 'ditbinmas',
  };
  const chatId = '994a';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_kasatker_report_period(session, chatId, '4', waClient);

  expect(mockGenerateKasatkerReport).toHaveBeenCalledWith({
    clientId: 'ditbinmas',
    roleFlag: 'ditbinmas',
    period: 'all_time',
  });
  expect(session.step).toBe('choose_menu');
});

test('choose_kasatker_report_period menampilkan pesan error ketika layanan gagal', async () => {
  mockGenerateKasatkerReport.mockRejectedValueOnce(
    new Error('Tidak ada data satker untuk disusun.')
  );
  mockFindClientById.mockResolvedValue({ nama: 'DIT BINMAS' });
  const session = {
    selectedClientId: 'ditbinmas',
    dir_client_id: 'ditbinmas',
    clientName: 'DIT BINMAS',
    role: 'ditbinmas',
  };
  const chatId = '995';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_kasatker_report_period(session, chatId, '2', waClient);

  const messages = waClient.sendMessage.mock.calls.map((call) => call[1]);
  expect(messages).toEqual(
    expect.arrayContaining([expect.stringContaining('Tidak ada data satker')])
  );
  expect(session.step).toBe('choose_menu');
});

test('choose_kasatker_report_period dapat dibatalkan', async () => {
  mockFindClientById.mockResolvedValue({ nama: 'DIT BINMAS' });
  const session = {
    selectedClientId: 'ditbinmas',
    dir_client_id: 'ditbinmas',
    clientName: 'DIT BINMAS',
  };
  const chatId = '996';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_kasatker_report_period(session, chatId, 'batal', waClient);

  expect(mockGenerateKasatkerReport).not.toHaveBeenCalled();
  expect(session.step).toBe('choose_menu');
  const messages = waClient.sendMessage.mock.calls.map((call) => call[1]);
  expect(messages).toEqual(
    expect.arrayContaining([expect.stringContaining('Menu Laporan Kasatker ditutup.')])
  );
});

test('choose_kasatker_report_period mengingatkan saat pilihan tidak valid', async () => {
  const session = {
    selectedClientId: 'ditbinmas',
    dir_client_id: 'ditbinmas',
    clientName: 'DIT BINMAS',
  };
  const chatId = '997';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_kasatker_report_period(session, chatId, '7', waClient);

  expect(mockGenerateKasatkerReport).not.toHaveBeenCalled();
  expect(session.step).toBeUndefined();
  const messages = waClient.sendMessage.mock.calls.map((call) => call[1]);
  expect(messages).toEqual(
    expect.arrayContaining([
      expect.stringContaining('Pilihan tidak valid'),
      expect.stringContaining('Silakan pilih periode Laporan Kasatker:'),
    ])
  );
});

test('choose_menu option 21 sends combined sosmed recap and files', async () => {
  mockLapharDitbinmas.mockResolvedValue({
    text: 'ig',
    filename: 'ig.txt',
    narrative: [
      'Mohon Ijin Komandan, melaporkan perkembangan Implementasi Update data dan Absensi likes oleh personil hari Senin, 1/1/2024 pukul 07:00 WIB.',
      '',
      'DIREKTORAT BINMAS',
      '',
      'Konten hari ini: 2 link: https://instagram.com/p/1, https://instagram.com/p/2',
      '',
      'Kinerja Likes konten: 150/200 (75.00%)',
      'Target harian ≥95% = 190 likes → kekurangan 40',
      '',
      'Kontributor likes terbesar (konten hari ini):',
      'Operator A → menyumbang 30% dari total likes saat ini.',
      '',
      '*Personil Saat ini :* 100 Personil',
      '* *Cakupan keseluruhan:* IG *80,0%* (80/100), TT *70,0%* (70/100).',
      '* *Rata-rata satker:* IG *75,0%* (median 70,0%), TT *65,0%* (median 60,0%)',
      '',
      '#Highlight Pencapaian & Masalah',
      '',
      '*Top performer (rata-rata IG/TT):*',
      '- SATKER A',
      '',
      '## Catatan per Satker.',
      '',
      '- SATKER A: tetap dipertahankan.',
      '',
      'Demikian Komandan hasil analisa yang bisa kami laporkan.',
    ].join('\n'),
  });
  mockCollectLikesRecap.mockResolvedValue({ shortcodes: ['sc1'] });
  mockSaveLikesRecapExcel.mockResolvedValue('/tmp/ig.xlsx');
  mockLapharTiktokDitbinmas.mockResolvedValue({
    text: 'tt',
    filename: 'tt.txt',
    narrative: [
      'Mohon Ijin Komandan, melaporkan perkembangan Implementasi Update data dan Absensi komentar oleh personil hari Senin, 1/1/2024 pukul 07:00 WIB.',
      '',
      'DIREKTORAT BINMAS',
      '',
      'Konten Tiktok hari ini: 1 link: https://www.tiktok.com/@ditbinmas/video/1',
      '',
      'Kinerja Komentar konten: 80/100 (80.00%)',
      'Target harian ≥95% = 95 komentar → kekurangan 15',
      '',
      'Kontributor komentar terbesar (konten hari ini):',
      'Operator B → menyumbang 40% dari total komentar saat ini.',
      '',
      '*Personil Saat ini :* 100 Personil',
      '* *Cakupan keseluruhan:* IG *80,0%* (80/100), TT *70,0%* (70/100).',
      '* *Rata-rata satker:* IG *75,0%* (median 70,0%), TT *65,0%* (median 60,0%)',
      '',
      '#Highlight Pencapaian & Masalah',
      '',
      '*Top performer (rata-rata IG/TT):*',
      '- SATKER A',
      '',
      '## Catatan per Satker.',
      '',
      '- SATKER A: tetap dipertahankan.',
      '',
      'Demikian Komandan hasil analisa yang bisa kami laporkan.',
    ].join('\n'),
  });
  mockCollectKomentarRecap.mockResolvedValue({ videoIds: ['vid1'] });
  mockSaveCommentRecapExcel.mockResolvedValue('/tmp/tt.xlsx');
  mockReadFile.mockResolvedValue(Buffer.from('excel'));
  mockUnlink.mockResolvedValue();
  mockGetUsersSocialByClient.mockResolvedValue([]);
  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '888';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '21', waClient);

  expect(mockLapharDitbinmas).toHaveBeenCalledWith('ditbinmas');
  expect(mockLapharTiktokDitbinmas).toHaveBeenCalledWith('ditbinmas');
  const combined = waClient.sendMessage.mock.calls[0][1];
  expect(combined).toContain('*Laporan Harian Engagement');
  expect(combined).toContain('*ditbinmas*');
  expect(combined).toContain('1. 📸 *Instagram*');
  expect(combined).toContain('2. 🎵 *TikTok*');
  expect(combined).toContain('Target harian');
  expect(mockSendWAFile).toHaveBeenNthCalledWith(
    1,
    waClient,
    expect.any(Buffer),
    'ig.txt',
    chatId,
    'text/plain'
  );
  expect(mockSendWAFile).toHaveBeenNthCalledWith(
    2,
    waClient,
    expect.any(Buffer),
    path.basename('/tmp/ig.xlsx'),
    chatId,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  expect(mockSendWAFile).toHaveBeenNthCalledWith(
    3,
    waClient,
    expect.any(Buffer),
    'tt.txt',
    chatId,
    'text/plain'
  );
  expect(mockSendWAFile).toHaveBeenNthCalledWith(
    4,
    waClient,
    expect.any(Buffer),
    path.basename('/tmp/tt.xlsx'),
    chatId,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  expect(mockUnlink).toHaveBeenCalledWith('/tmp/ig.xlsx');
  expect(mockUnlink).toHaveBeenCalledWith('/tmp/tt.xlsx');
});
test('choose_menu option 3 reports ditbinmas incomplete users by division', async () => {
  mockGetUsersSocialByClient.mockResolvedValue([
    { client_id: 'DITBINMAS', divisi: 'Div A', title: 'AKP', nama: 'Budi', insta: null, tiktok: 'x' },
    { client_id: 'DITBINMAS', divisi: 'Div A', title: 'IPTU', nama: 'Adi', insta: 'y', tiktok: null },
    { client_id: 'DITBINMAS', divisi: 'Div B', title: 'KOMPOL', nama: 'Cici', insta: null, tiktok: null },
    { client_id: 'POLRES_A', divisi: 'Div B', title: 'AKP', nama: 'Edi', insta: null, tiktok: null },
  ]);
  const session = { selectedClientId: 'ditbinmas', clientName: 'DIT BINMAS' };
  const chatId = '444';
  const waClient = { sendMessage: jest.fn() };

  await dirRequestHandlers.choose_menu(session, chatId, '3', waClient);

  expect(mockGetUsersSocialByClient).toHaveBeenCalledWith('DITBINMAS', 'ditbinmas');
  const msg = waClient.sendMessage.mock.calls[0][1];
  expect(msg).toMatch(/\*DIV A\* \(2\)/);
  expect(msg).toMatch(/AKP Budi, Instagram kosong/);
  expect(msg).toMatch(/IPTU Adi, TikTok kosong/);
  const idxBudi = msg.indexOf('AKP Budi');
  const idxAdi = msg.indexOf('IPTU Adi');
  expect(idxBudi).toBeLessThan(idxAdi);
  expect(msg).toMatch(/\*DIV B\* \(1\)/);
  expect(msg).toMatch(/KOMPOL Cici, Instagram kosong, TikTok kosong/);
  expect(msg).not.toMatch(/Edi/);
});
