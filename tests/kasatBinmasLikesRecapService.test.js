import { jest } from '@jest/globals';

let generateKasatBinmasLikesRecap;
let mockGetRekapLikesByClient;
let mockGetUsersByClient;

const extractSectionEntries = (narrative, label) => {
  const start = narrative.indexOf(label);
  if (start === -1) return [];
  const section = narrative.slice(start);
  const endBreak = section.indexOf('\n\n');
  const block = endBreak === -1 ? section : section.slice(0, endBreak);
  return block.split('\n').slice(1);
};

const KURANG_HEADER = '⚠️ *Melaksanakan Sebagian';

describe('generateKasatBinmasLikesRecap', () => {
  beforeEach(async () => {
    jest.resetModules();
    mockGetRekapLikesByClient = jest.fn();
    mockGetUsersByClient = jest.fn();

    jest.unstable_mockModule('../src/model/instaLikeModel.js', () => ({
      getRekapLikesByClient: mockGetRekapLikesByClient,
    }));
    jest.unstable_mockModule('../src/model/userModel.js', () => ({
      getUsersByClient: mockGetUsersByClient,
    }));
    jest.unstable_mockModule('../src/utils/utilsHelper.js', () => ({
      formatNama: (user) => user?.nama || '',
    }));
    ({ generateKasatBinmasLikesRecap } = await import(
      '../src/service/kasatBinmasLikesRecapService.js'
    ));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('menyusun rekap harian beserta ringkasan status', async () => {
    jest.useFakeTimers({ now: new Date('2024-05-21T03:00:00Z') });
    mockGetUsersByClient.mockResolvedValue([
      {
        user_id: '1',
        nama: 'Alpha',
        title: 'AKP',
        client_name: 'Polres A',
        jabatan: 'Kasat Binmas',
        insta: 'alpha',
      },
      {
        user_id: '2',
        nama: 'Beta',
        title: 'IPTU',
        client_name: 'Polres B',
        jabatan: 'Kasat Binmas',
        insta: 'beta',
      },
      {
        user_id: '3',
        nama: 'Gamma',
        title: 'AKBP',
        client_name: 'Polres C',
        jabatan: 'Operator',
        insta: 'gamma',
      },
      {
        user_id: '4',
        nama: 'Delta',
        title: 'AKP',
        client_name: 'Polres D',
        jabatan: 'WA Kasat Binmas',
        insta: 'delta',
      },
    ]);
    mockGetRekapLikesByClient.mockResolvedValue({
      rows: [
        { user_id: '1', jumlah_like: 3 },
        { user_id: '2', jumlah_like: 1 },
      ],
      totalKonten: 3,
    });

    const narrative = await generateKasatBinmasLikesRecap({ period: 'daily' });

    expect(mockGetUsersByClient).toHaveBeenCalledWith('DITBINMAS', 'ditbinmas');
    expect(mockGetRekapLikesByClient).toHaveBeenCalledWith(
      'DITBINMAS',
      'harian',
      '2024-05-21',
      undefined,
      undefined,
      'ditbinmas'
    );
    expect(narrative).toContain('Total konten periode ini: 3');
    expect(narrative).toContain('✅ Lengkap: 1 pers');
    expect(narrative).toContain('⚠️ Sebagian: 1 pers');
    expect(narrative).toMatch(/Alpha.*3\/3/);
    expect(narrative).not.toMatch(/Delta/);
  });

  test('menghasilkan pesan ketika tidak ada Kasat Binmas', async () => {
    mockGetUsersByClient.mockResolvedValue([{ user_id: '1', jabatan: 'Operator' }]);

    const narrative = await generateKasatBinmasLikesRecap();

    expect(narrative).toContain('tidak ditemukan data Kasat Binmas');
    expect(mockGetRekapLikesByClient).not.toHaveBeenCalled();
  });

  test('menghasilkan pesan khusus ketika tidak ada konten', async () => {
    jest.useFakeTimers({ now: new Date('2024-05-22T03:00:00Z') });
    mockGetUsersByClient.mockResolvedValue([
      { user_id: '1', jabatan: 'Kasat Binmas', nama: 'Alpha', insta: 'alpha' },
    ]);
    mockGetRekapLikesByClient.mockResolvedValue({ rows: [], totalKonten: 0 });

    const narrative = await generateKasatBinmasLikesRecap({ period: 'daily' });

    expect(narrative).toContain('Belum ada konten Instagram Ditbinmas');
  });

  test('mengurutkan daftar berdasarkan jumlah like lalu pangkat dan nama untuk rekap harian', async () => {
    jest.useFakeTimers({ now: new Date('2024-05-23T03:00:00Z') });
    mockGetUsersByClient.mockResolvedValue([
      {
        user_id: '1',
        nama: 'Alpha',
        title: 'IPTU',
        client_name: 'Polres A',
        jabatan: 'Kasat Binmas',
        insta: 'alpha',
      },
      {
        user_id: '2',
        nama: 'Bravo',
        title: 'AKP',
        client_name: 'Polres B',
        jabatan: 'Kasat Binmas',
        insta: 'bravo',
      },
      {
        user_id: '3',
        nama: 'Charlie',
        title: 'AKP',
        client_name: 'Polres C',
        jabatan: 'Kasat Binmas',
        insta: 'charlie',
      },
    ]);
    mockGetRekapLikesByClient.mockResolvedValue({
      rows: [
        { user_id: '1', jumlah_like: 2 },
        { user_id: '2', jumlah_like: 4 },
        { user_id: '3', jumlah_like: 4 },
      ],
      totalKonten: 5,
    });

    const narrative = await generateKasatBinmasLikesRecap({ period: 'daily' });

    const kurangEntries = extractSectionEntries(narrative, KURANG_HEADER);
    expect(kurangEntries).toHaveLength(3);
    expect(kurangEntries[0]).toMatch(/^\s*1\. Bravo \(POLRES B\).*4\/5 konten/);
    expect(kurangEntries[1]).toMatch(/^\s*2\. Charlie \(POLRES C\).*4\/5 konten/);
    expect(kurangEntries[2]).toMatch(/^\s*3\. Alpha \(POLRES A\).*2\/5 konten/);
  });

  test('mengirimkan parameter rentang Senin-Minggu untuk rekap mingguan', async () => {
    jest.useFakeTimers({ now: new Date('2024-05-22T10:00:00Z') });
    mockGetUsersByClient.mockResolvedValue([
      { user_id: '1', jabatan: 'Kasat Binmas', nama: 'Alpha', insta: 'alpha' },
    ]);
    mockGetRekapLikesByClient.mockResolvedValue({
      rows: [{ user_id: '1', jumlah_like: 2 }],
      totalKonten: 2,
    });

    await generateKasatBinmasLikesRecap({ period: 'weekly' });

    expect(mockGetRekapLikesByClient).toHaveBeenCalledWith(
      'DITBINMAS',
      'harian',
      undefined,
      '2024-05-20',
      '2024-05-26',
      'ditbinmas'
    );
  });

  test('menggunakan urutan yang sama untuk rekap mingguan', async () => {
    jest.useFakeTimers({ now: new Date('2024-05-24T03:00:00Z') });
    mockGetUsersByClient.mockResolvedValue([
      {
        user_id: '1',
        nama: 'Alpha',
        title: 'IPTU',
        client_name: 'Polres A',
        jabatan: 'Kasat Binmas',
        insta: 'alpha',
      },
      {
        user_id: '2',
        nama: 'Bravo',
        title: 'AKP',
        client_name: 'Polres B',
        jabatan: 'Kasat Binmas',
        insta: 'bravo',
      },
      {
        user_id: '3',
        nama: 'Charlie',
        title: 'AKP',
        client_name: 'Polres C',
        jabatan: 'Kasat Binmas',
        insta: 'charlie',
      },
    ]);
    mockGetRekapLikesByClient.mockResolvedValue({
      rows: [
        { user_id: '1', jumlah_like: 2 },
        { user_id: '2', jumlah_like: 4 },
        { user_id: '3', jumlah_like: 4 },
      ],
      totalKonten: 5,
    });

    const narrative = await generateKasatBinmasLikesRecap({ period: 'weekly' });

    const kurangEntries = extractSectionEntries(narrative, KURANG_HEADER);
    expect(kurangEntries[0]).toMatch(/^\s*1\. Bravo \(POLRES B\)/);
    expect(kurangEntries[1]).toMatch(/^\s*2\. Charlie \(POLRES C\)/);
    expect(kurangEntries[2]).toMatch(/^\s*3\. Alpha \(POLRES A\)/);
  });

  test('menggunakan urutan yang sama untuk rekap bulanan', async () => {
    jest.useFakeTimers({ now: new Date('2024-05-25T03:00:00Z') });
    mockGetUsersByClient.mockResolvedValue([
      {
        user_id: '1',
        nama: 'Alpha',
        title: 'IPTU',
        client_name: 'Polres A',
        jabatan: 'Kasat Binmas',
        insta: 'alpha',
      },
      {
        user_id: '2',
        nama: 'Bravo',
        title: 'AKP',
        client_name: 'Polres B',
        jabatan: 'Kasat Binmas',
        insta: 'bravo',
      },
      {
        user_id: '3',
        nama: 'Charlie',
        title: 'AKP',
        client_name: 'Polres C',
        jabatan: 'Kasat Binmas',
        insta: 'charlie',
      },
    ]);
    mockGetRekapLikesByClient.mockResolvedValue({
      rows: [
        { user_id: '1', jumlah_like: 2 },
        { user_id: '2', jumlah_like: 4 },
        { user_id: '3', jumlah_like: 4 },
      ],
      totalKonten: 5,
    });

    const narrative = await generateKasatBinmasLikesRecap({ period: 'monthly' });

    const kurangEntries = extractSectionEntries(narrative, KURANG_HEADER);
    expect(kurangEntries[0]).toMatch(/^\s*1\. Bravo \(POLRES B\)/);
    expect(kurangEntries[1]).toMatch(/^\s*2\. Charlie \(POLRES C\)/);
    expect(kurangEntries[2]).toMatch(/^\s*3\. Alpha \(POLRES A\)/);
  });
});
