import { jest } from '@jest/globals';

const mockFindClientById = jest.fn();
const mockGetShortcodesByDateRange = jest.fn();
const mockGetLikesSets = jest.fn();
const mockGroupUsersByClientDivision = jest.fn();
const mockGetPostsByClientAndDateRange = jest.fn();
const mockGetCommentsByVideoId = jest.fn();
const mockAoAToSheet = jest.fn();
const mockBookNew = jest.fn();
const mockBookAppendSheet = jest.fn();
const mockWriteFile = jest.fn();
const mockMkdir = jest.fn();

jest.unstable_mockModule('../src/service/clientService.js', () => ({
  findClientById: mockFindClientById,
}));

jest.unstable_mockModule('../src/model/instaPostModel.js', () => ({
  getShortcodesByDateRange: mockGetShortcodesByDateRange,
}));

jest.unstable_mockModule('../src/utils/likesHelper.js', () => ({
  getLikesSets: mockGetLikesSets,
  groupUsersByClientDivision: mockGroupUsersByClientDivision,
  normalizeUsername: (username) =>
    (username || '')
      .toString()
      .trim()
      .replace(/^@/, '')
      .toLowerCase(),
}));

jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({
  getPostsByClientAndDateRange: mockGetPostsByClientAndDateRange,
  findPostByVideoId: jest.fn(),
  deletePostByVideoId: jest.fn(),
}));

jest.unstable_mockModule('../src/model/tiktokCommentModel.js', () => ({
  getCommentsByVideoId: mockGetCommentsByVideoId,
  deleteCommentsByVideoId: jest.fn(),
}));

jest.unstable_mockModule('fs/promises', () => ({
  mkdir: mockMkdir,
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

describe('engagementRankingExcelService', () => {
  let collectEngagementRanking;
  let saveEngagementRankingExcel;

  beforeEach(async () => {
    jest.resetModules();
    mockFindClientById.mockReset();
    mockGetShortcodesByDateRange.mockReset();
    mockGetLikesSets.mockReset();
    mockGroupUsersByClientDivision.mockReset();
    mockGetPostsByClientAndDateRange.mockReset();
    mockGetCommentsByVideoId.mockReset();
    mockAoAToSheet.mockReset();
    mockBookNew.mockReset();
    mockBookAppendSheet.mockReset();
    mockWriteFile.mockReset();
    mockMkdir.mockReset();

    mockBookNew.mockReturnValue({});
    mockAoAToSheet.mockImplementation((aoa) => ({ aoa }));
    mockBookAppendSheet.mockImplementation(() => {});
    mockWriteFile.mockImplementation(() => {});
    mockMkdir.mockResolvedValue();

    mockFindClientById.mockImplementation(async (cid) => {
      const map = {
        ditbinmas: { nama: 'Direktorat Binmas', client_type: 'direktorat' },
        polres_a: { nama: 'Polres A', client_type: 'org' },
        polres_b: { nama: 'Polres B', client_type: 'org' },
      };
      return map[String(cid || '').toLowerCase()] || null;
    });

    mockGroupUsersByClientDivision.mockResolvedValue({
      polresIds: ['DITBINMAS', 'POLRES_A', 'POLRES_B'],
      usersByClient: {
        DITBINMAS: [
          { insta: '@dit1', tiktok: '@dit1', exception: false },
          { insta: '', tiktok: '', exception: false },
        ],
        POLRES_A: [
          { insta: '@userA', tiktok: '@userA', exception: false },
          { insta: '@userB', tiktok: '', exception: true },
        ],
        POLRES_B: [{ insta: '@userC', tiktok: '@userC', exception: false }],
      },
    });

    mockGetShortcodesByDateRange.mockResolvedValue(['sc1', 'sc2']);
    mockGetLikesSets.mockResolvedValue([
      new Set(['dit1', 'usera', 'userc']),
      new Set(['usera']),
    ]);

    mockGetPostsByClientAndDateRange.mockResolvedValue([
      { video_id: 'vid1' },
      { video_id: 'vid2' },
    ]);
    mockGetCommentsByVideoId.mockResolvedValue({
      comments: [
        { username: '@userA' },
        { user: { unique_id: 'userc' } },
      ],
    });

    ({ collectEngagementRanking, saveEngagementRankingExcel } = await import(
      '../src/service/engagementRankingExcelService.js'
    ));
  });

  test('collectEngagementRanking aggregates stats per satker', async () => {
    const result = await collectEngagementRanking('DITBINMAS', 'ditbinmas');

    expect(mockGroupUsersByClientDivision).toHaveBeenCalledWith('ditbinmas');
    expect(mockGetShortcodesByDateRange).toHaveBeenCalledWith(
      'ditbinmas',
      expect.any(String),
      expect.any(String)
    );
    expect(mockGetPostsByClientAndDateRange).toHaveBeenCalledWith(
      'ditbinmas',
      expect.any(String),
      expect.any(String)
    );
    expect(result.entries).toHaveLength(3);
    expect(result.entries.map((entry) => entry.name)).toEqual([
      'DIREKTORAT BINMAS',
      'POLRES A',
      'POLRES B',
    ]);

    const first = result.entries[0];
    expect(first.name).toBe('DIREKTORAT BINMAS');
    expect(first.igSudah).toBe(1);
    expect(first.igBelum).toBe(0);
    expect(first.ttSudah).toBe(0);
    expect(first.ttKosong).toBe(1);
    expect(first.igLikeCount).toBe(1);
    expect(first.ttCommentCount).toBe(0);
    expect(first.engagementTotal).toBe(1);

    const second = result.entries[1];
    expect(second.name).toBe('POLRES A');
    expect(second.engagementTotal).toBeGreaterThan(first.engagementTotal);
    expect(second.igLikeCount).toBe(2);
    expect(second.ttCommentCount).toBe(2);

    const third = result.entries[2];
    expect(third.name).toBe('POLRES B');
    expect(third.engagementTotal).toBe(3);

    const totals = result.totals;
    expect(totals.totalPersonil).toBe(5);
    expect(totals.igSudah).toBeGreaterThan(0);
    expect(result.igPostsCount).toBe(2);
    expect(result.ttPostsCount).toBe(2);
    expect(result.periodInfo.period).toBe('today');
    expect(result.periodInfo.label).toMatch(/Hari, Tanggal:/);
  });

  test('collectEngagementRanking menggunakan rentang semua periode saat diminta', async () => {
    const result = await collectEngagementRanking('DITBINMAS', 'ditbinmas', {
      period: 'all_time',
    });

    expect(mockGetShortcodesByDateRange).toHaveBeenLastCalledWith(
      'ditbinmas',
      '2000-01-01',
      expect.any(String)
    );
    expect(mockGetPostsByClientAndDateRange).toHaveBeenLastCalledWith(
      'ditbinmas',
      '2000-01-01',
      expect.any(String)
    );
    expect(result.periodInfo.period).toBe('all_time');
    expect(result.periodInfo.label).toMatch(/Semua periode data/);
  });

  test('collectEngagementRanking menyertakan satker yang hanya muncul pada data user', async () => {
    mockGroupUsersByClientDivision.mockResolvedValueOnce({
      polresIds: ['DITBINMAS'],
      usersByClient: {
        DITBINMAS: [],
        POLRES_SHADOW: [
          { insta: '@shadow', tiktok: '@shadow', exception: false },
        ],
      },
    });
    mockGetShortcodesByDateRange.mockResolvedValueOnce([]);
    mockGetPostsByClientAndDateRange.mockResolvedValueOnce([]);

    const result = await collectEngagementRanking('DITBINMAS', 'ditbinmas');

    const satkerCids = result.entries.map((entry) => entry.cid);
    expect(satkerCids).toContain('polres_shadow');
    const shadowEntry = result.entries.find((entry) => entry.cid === 'polres_shadow');
    expect(shadowEntry.name).toBe('POLRES_SHADOW');
  });

  test('saveEngagementRankingExcel writes workbook and returns file path', async () => {
    const { filePath, fileName } = await saveEngagementRankingExcel({
      clientId: 'DITBINMAS',
      roleFlag: 'ditbinmas',
    });

    expect(mockAoAToSheet).toHaveBeenCalled();
    const aoa = mockAoAToSheet.mock.calls[0][0];
    expect(aoa[0][0]).toMatch(/Rekap Ranking Engagement/i);
    expect(aoa[1][0]).toMatch(/Hari, Tanggal:/);
    expect(aoa[2][0]).toMatch(/Jam Pengambilan Data:/);
    expect(aoa[6]).toEqual([
      'NAMA SATKER',
      'JUMLAH PERSONIL',
      'INSTAGRAM',
      null,
      null,
      'TIKTOK',
      null,
      null,
    ]);
    expect(aoa[7]).toEqual([
      null,
      null,
      'SUDAH',
      'BELUM',
      'USERNAME KOSONG',
      'SUDAH',
      'BELUM',
      'USERNAME KOSONG',
    ]);
    expect(aoa[aoa.length - 1][0]).toBe('TOTAL');

    expect(mockBookNew).toHaveBeenCalled();
    expect(mockBookAppendSheet).toHaveBeenCalled();
    expect(mockMkdir).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalled();
    expect(filePath).toBeTruthy();
    expect(fileName).toMatch(
      /Rekap_Ranking_Engagement_Tanggal_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}_\d{4}\.xlsx$/
    );
  });

  test('saveEngagementRankingExcel supports weekly period label', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-06-05T03:00:00Z'));
    try {
      await saveEngagementRankingExcel({
        clientId: 'DITBINMAS',
        roleFlag: 'ditbinmas',
        period: 'this_week',
      });
    } finally {
      jest.useRealTimers();
    }

    const lastShortcodeCall = mockGetShortcodesByDateRange.mock.calls.at(-1);
    expect(lastShortcodeCall[0]).toBe('ditbinmas');
    expect(lastShortcodeCall[1]).toBe('2024-06-03');
    expect(lastShortcodeCall[2]).toBe('2024-06-09');

    const lastPostCall = mockGetPostsByClientAndDateRange.mock.calls.at(-1);
    expect(lastPostCall[1]).toBe('2024-06-03');
    expect(lastPostCall[2]).toBe('2024-06-09');

    const aoa = mockAoAToSheet.mock.calls.at(-1)[0];
    expect(aoa[1][0]).toMatch(/Minggu ke-/);

    const savedPath = mockWriteFile.mock.calls.at(-1)[1];
    expect(savedPath).toContain("Minggu_");
  });

  test('collectEngagementRanking rejects for non directorate client', async () => {
    mockFindClientById.mockResolvedValueOnce({
      nama: 'Polres A',
      client_type: 'org',
    });

    await expect(collectEngagementRanking('POLRES_A')).rejects.toThrow(
      /direktorat/i
    );
  });
});
