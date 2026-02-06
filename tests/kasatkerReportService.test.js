import { jest } from '@jest/globals';

const mockCollectEngagementRanking = jest.fn();

jest.unstable_mockModule('../src/service/engagementRankingExcelService.js', () => ({
  collectEngagementRanking: mockCollectEngagementRanking,
}));

let generateKasatkerReport;

describe('generateKasatkerReport', () => {
  beforeAll(async () => {
    ({ generateKasatkerReport } = await import('../src/service/kasatkerReportService.js'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCollectEngagementRanking.mockResolvedValue({
      clientId: 'ditbinmas',
      clientName: 'DIT BINMAS',
      entries: [
        { cid: 'ditbinmas', name: 'Direktorat Binmas', score: 1 },
        { cid: 'polres_a', name: 'Polres A', score: 0.95 },
        { cid: 'polres_b', name: 'Polres B', score: 0.7 },
        { cid: 'polres_c', name: 'Polres C', score: 0 },
      ],
      periodInfo: { period: 'today', label: 'Hari, Tanggal: Senin, 01 Januari 2025' },
    });
  });

  test('menyusun narasi kasatker dengan kategori kepatuhan dan catatan pelaksanaan', async () => {
    const narrative = await generateKasatkerReport({
      clientId: 'DITBINMAS',
      roleFlag: 'ditbinmas',
      period: 'today',
    });

    expect(mockCollectEngagementRanking).toHaveBeenCalledWith('DITBINMAS', 'ditbinmas', {
      period: 'today',
      startDate: undefined,
      endDate: undefined,
    });

    expect(narrative).toContain('*KEPADA YTH.*');
    expect(narrative).toContain('KASAT BINMAS POLRES JAJARAN POLDA JAWA TIMUR');
    expect(narrative).toContain('*KRITERIA KEPATUHAN*');
    expect(narrative).toContain('*KEPATUHAN AKTIF* (1 Satker)');
    expect(narrative).toMatch(/POLRES A : 95%/);
    expect(narrative).toContain('*KEPATUHAN SEDANG* (1 Satker)');
    expect(narrative).toMatch(/POLRES B : 70%/);
    expect(narrative).toContain('*KEPATUHAN RENDAH* (1 Satker)');
    expect(narrative).toMatch(/POLRES C : 0% \(Belum ada pelaksanaan\)/);
    expect(narrative).toContain('https://chat.whatsapp.com/Hga2FkPQOw5BuZW7nSFYV1');
  });

  test('tetap menampilkan satker yang berasal dari data user', async () => {
    mockCollectEngagementRanking.mockResolvedValueOnce({
      clientId: 'ditbinmas',
      clientName: 'DIT BINMAS',
      entries: [
        { cid: 'ditbinmas', name: 'Direktorat Binmas', score: 0.75 },
        { cid: 'polres_shadow', name: 'Polres Shadow', score: 0.5 },
      ],
      periodInfo: { period: 'today', label: 'Hari, Tanggal: Senin, 01 Januari 2025' },
    });

    const narrative = await generateKasatkerReport({
      clientId: 'DITBINMAS',
      roleFlag: 'ditbinmas',
      period: 'today',
    });

    expect(narrative).toContain('*KEPATUHAN SEDANG* (1 Satker)');
    expect(narrative).toMatch(/POLRES SHADOW : 50%/);
  });
});
