import { jest } from '@jest/globals';

const mockGetUsersSocialByClient = jest.fn();
const mockGetClientsByRole = jest.fn();
const mockFindClientById = jest.fn();
const mockAoAToSheet = jest.fn();
const mockBookNew = jest.fn();
const mockBookAppendSheet = jest.fn();
const mockWriteFile = jest.fn();

jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersSocialByClient: mockGetUsersSocialByClient,
  getClientsByRole: mockGetClientsByRole,
}));

jest.unstable_mockModule('../src/service/clientService.js', () => ({
  findClientById: mockFindClientById,
}));

jest.unstable_mockModule('xlsx', () => ({
  default: {
    utils: {
      aoa_to_sheet: mockAoAToSheet,
      book_new: mockBookNew,
      book_append_sheet: mockBookAppendSheet,
    },
    writeFile: mockWriteFile,
  },
}));

describe('satkerUpdateMatrixService', () => {
  let collectSatkerUpdateMatrix;
  let saveSatkerUpdateMatrixExcel;

  beforeEach(async () => {
    jest.resetModules();
    mockGetUsersSocialByClient.mockReset();
    mockGetClientsByRole.mockReset();
    mockFindClientById.mockReset();
    mockAoAToSheet.mockReset();
    mockBookNew.mockReset();
    mockBookAppendSheet.mockReset();
    mockWriteFile.mockReset();

    mockBookNew.mockReturnValue({});
    mockAoAToSheet.mockImplementation((aoa) => ({ aoa }));
    mockBookAppendSheet.mockImplementation(() => {});
    mockWriteFile.mockImplementation(() => {});

    mockFindClientById.mockImplementation(async (cid) => {
      const key = String(cid || '').toLowerCase();
      const map = {
        ditbinmas: { nama: 'Direktorat Binmas', client_type: 'direktorat' },
        polres_a: { nama: 'Polres A', client_type: 'org' },
        polres_b: { nama: 'Polres B', client_type: 'org' },
      };
      return map[key] || { nama: key.toUpperCase(), client_type: 'org' };
    });

    ({ collectSatkerUpdateMatrix, saveSatkerUpdateMatrixExcel } = await import(
      '../src/service/satkerUpdateMatrixService.js'
    ));
  });

  test('collectSatkerUpdateMatrix sorts satker with directorate first and computes stats', async () => {
    mockGetUsersSocialByClient.mockResolvedValue([
      { client_id: 'DITBINMAS', user_id: 'DIR1', insta: 'ig', tiktok: 'tt' },
      { client_id: 'POLRES_A', user_id: 'USR1', insta: 'user1', tiktok: 'tk1' },
      { client_id: 'POLRES_A', user_id: 'USR2', insta: '', tiktok: '' },
      { client_id: 'POLRES_B', user_id: 'USR3', insta: 'user2', tiktok: 'tt2' },
      { client_id: 'POLRES_B', user_id: 'USR4', insta: 'user3', tiktok: '' },
    ]);
    mockGetClientsByRole.mockResolvedValue(['polres_a', 'polres_b']);

    const result = await collectSatkerUpdateMatrix('DITBINMAS', 'ditbinmas');

    expect(result.stats).toHaveLength(3);
    expect(result.stats[0]).toMatchObject({
      cid: 'ditbinmas',
      instaPercent: 100,
      tiktokPercent: 100,
      completePercent: 100,
      jumlahDsp: 102,
    });
    expect(result.stats[1]).toMatchObject({
      cid: 'polres_b',
      instaPercent: 100,
      tiktokPercent: 50,
      completePercent: 50,
      jumlahDsp: null,
    });
    expect(result.stats[2]).toMatchObject({
      cid: 'polres_a',
      instaPercent: 50,
      tiktokPercent: 50,
      completePercent: 50,
      jumlahDsp: null,
    });
    expect(result.totals).toMatchObject({
      total: 5,
      instaFilled: 4,
      tiktokFilled: 3,
      completeFilled: 3,
      instaPercent: 80,
      tiktokPercent: 60,
      completePercent: 60,
      platforms: {
        instagram: { filled: 4, empty: 1, percent: 80 },
        tiktok: { filled: 3, empty: 2, percent: 60 },
        complete: { filled: 3, empty: 2, percent: 60 },
      },
    });
  });

  test('collectSatkerUpdateMatrix normalizes client ids from users and roles', async () => {
    mockGetUsersSocialByClient.mockResolvedValue([
      { client_id: '  POLRES_A  ', user_id: 'A1', insta: 'ig', tiktok: '' },
      { client_id: 'polres_a', user_id: 'A2', insta: '', tiktok: 'tt' },
      { client_id: '  POLRES_B', user_id: 'B1', insta: '', tiktok: '' },
    ]);
    mockGetClientsByRole.mockResolvedValue([' POLRES_A ', 'polres_b  ']);

    const result = await collectSatkerUpdateMatrix('  DITBINMAS  ', 'ditbinmas');

    const uniqueIds = new Set(result.stats.map((s) => s.cid));
    expect(uniqueIds).toEqual(new Set(['ditbinmas', 'polres_a', 'polres_b']));

    const polresAStat = result.stats.find((s) => s.cid === 'polres_a');
    expect(polresAStat).toMatchObject({
      total: 2,
      instaFilled: 1,
      tiktokFilled: 1,
      completeFilled: 0,
      completePercent: 0,
    });

    const calls = mockFindClientById.mock.calls.map(([arg]) => arg);
    expect(calls).toEqual(
      expect.arrayContaining(['ditbinmas', 'polres_a', 'polres_b'])
    );
  });

  test('collectSatkerUpdateMatrix deduplicates repeated users and tracks completeness', async () => {
    mockGetUsersSocialByClient.mockResolvedValue([
      { client_id: 'POLRES_A', user_id: 'USR1', insta: 'handle1', tiktok: null },
      { client_id: 'POLRES_A', user_id: 'USR1', insta: null, tiktok: 'tt1' },
      { client_id: 'POLRES_A', user_id: 'USR1', insta: 'handle1', tiktok: 'tt1' },
      { client_id: 'POLRES_A', user_id: 'USR2', insta: null, tiktok: null },
    ]);
    mockGetClientsByRole.mockResolvedValue(['polres_a']);

    const result = await collectSatkerUpdateMatrix('DITBINMAS', 'ditbinmas');

    expect(result.stats).toHaveLength(2);
    const polresA = result.stats.find((s) => s.cid === 'polres_a');
    expect(polresA).toMatchObject({
      total: 2,
      instaFilled: 1,
      tiktokFilled: 1,
      completeFilled: 1,
      instaPercent: 50,
      tiktokPercent: 50,
      completePercent: 50,
    });

    expect(result.totals).toMatchObject({
      total: 2,
      instaFilled: 1,
      tiktokFilled: 1,
      completeFilled: 1,
      platforms: {
        instagram: { filled: 1, empty: 1, percent: 50 },
        tiktok: { filled: 1, empty: 1, percent: 50 },
        complete: { filled: 1, empty: 1, percent: 50 },
      },
    });
  });

  test('collectSatkerUpdateMatrix rejects for non directorate client', async () => {
    mockFindClientById.mockImplementationOnce(async () => ({
      nama: 'Polres A',
      client_type: 'org',
    }));
    await expect(collectSatkerUpdateMatrix('POLRES_A')).rejects.toThrow(
      /direktorat/
    );
  });

  test('saveSatkerUpdateMatrixExcel writes workbook with sanitized username', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-01-15T08:30:45.000Z'));
    mockGetUsersSocialByClient.mockResolvedValue([
      { client_id: 'DITBINMAS', user_id: 'DIR1', insta: 'ig', tiktok: 'tt' },
      { client_id: 'POLRES_A', user_id: 'USR1', insta: '', tiktok: '' },
    ]);
    mockGetClientsByRole.mockResolvedValue(['polres_a']);

    const { filePath } = await saveSatkerUpdateMatrixExcel({
      clientId: 'DITBINMAS',
      roleFlag: 'ditbinmas',
      username: 'Admin 01',
    });

    expect(mockBookNew).toHaveBeenCalledTimes(1);
    expect(mockAoAToSheet).toHaveBeenCalledTimes(1);
    const aoa = mockAoAToSheet.mock.calls[0][0];
    expect(aoa[0]).toEqual([
      'Rekap Matriks Update Satker DIREKTORAT BINMAS',
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(aoa[1]).toEqual([
      'Periode: Senin, 15 Januari 2024 pukul 15.30.45',
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(aoa[2]).toEqual([
      'Disusun oleh: Admin 01',
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(aoa[3]).toEqual([null, null, null, null, null, null, null]);
    expect(aoa[4]).toEqual([
      'Satker',
      'Jumlah DSP',
      'Jumlah Personil',
      'Data Update Instagram',
      null,
      'Data Update Tiktok',
      null,
    ]);
    expect(aoa[5]).toEqual([null, null, null, 'Sudah', 'Belum', 'Sudah', 'Belum']);
    expect(aoa[6]).toEqual([
      'DIREKTORAT BINMAS',
      102,
      1,
      1,
      0,
      1,
      0,
    ]);
    expect(aoa[7]).toEqual([
      'POLRES A',
      null,
      1,
      0,
      1,
      0,
      1,
    ]);

    const worksheet = mockAoAToSheet.mock.results[0].value;
    expect(worksheet['!merges']).toEqual([
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 6 } },
      { s: { r: 4, c: 0 }, e: { r: 5, c: 0 } },
      { s: { r: 4, c: 1 }, e: { r: 5, c: 1 } },
      { s: { r: 4, c: 2 }, e: { r: 5, c: 2 } },
      { s: { r: 4, c: 3 }, e: { r: 4, c: 4 } },
      { s: { r: 4, c: 5 }, e: { r: 4, c: 6 } },
    ]);
    expect(worksheet['!cols']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ wch: expect.any(Number) }),
      ])
    );
    expect(worksheet['!cols']).toHaveLength(7);
    worksheet['!cols'].forEach((col) => {
      expect(col.wch).toBeGreaterThanOrEqual(10);
      expect(col.wch).toBeLessThanOrEqual(60);
    });

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const savedPath = mockWriteFile.mock.calls[0][1];
    expect(savedPath).toContain('Satker_Update_Rank_');
    expect(savedPath).toContain('_Admin_01');
    expect(filePath).toBe(savedPath);
    jest.useRealTimers();
  });
});
