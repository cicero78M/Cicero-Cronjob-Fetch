import { jest } from '@jest/globals';
import { unlink } from 'fs/promises';
import XLSX from 'xlsx';

process.env.TZ = 'Asia/Jakarta';

let mockGetRekapLikesByClient;
let mockGetUsersByClient;
let mockMatchesKasatBinmasJabatan;
let generateKasatBinmasLikesRecapExcel;

function readSheet(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets.Rekap;
  return XLSX.utils.sheet_to_json(sheet, { header: 1 });
}

describe('generateKasatBinmasLikesRecapExcel', () => {
  beforeEach(async () => {
    jest.resetModules();
    mockGetRekapLikesByClient = jest.fn();
    mockGetUsersByClient = jest.fn();
    mockMatchesKasatBinmasJabatan = jest.fn().mockReturnValue(true);

    jest.unstable_mockModule('../src/model/instaLikeModel.js', () => ({
      getRekapLikesByClient: mockGetRekapLikesByClient,
    }));
    jest.unstable_mockModule('../src/model/userModel.js', () => ({
      getUsersByClient: mockGetUsersByClient,
    }));
    jest.unstable_mockModule('../src/utils/utilsHelper.js', () => ({
      formatNama: (user) =>
        [user?.title, user?.nama].filter(Boolean).join(' ').trim(),
    }));
    jest.unstable_mockModule('../src/service/kasatkerAttendanceService.js', () => ({
      matchesKasatBinmasJabatan: mockMatchesKasatBinmasJabatan,
    }));

    ({ generateKasatBinmasLikesRecapExcel } = await import(
      '../src/service/kasatBinmasLikesRecapExcelService.js'
    ));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('menyusun urutan berdasarkan total likes lalu pangkat dan nama', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-05-22T01:00:00Z'));
    mockMatchesKasatBinmasJabatan.mockImplementation((jabatan) =>
      String(jabatan || '').toLowerCase().includes('kasat binmas')
    );
    mockGetUsersByClient.mockResolvedValue([
      {
        user_id: '1',
        nama: 'Alpha',
        title: 'AKP',
        client_name: 'Polres A',
        jabatan: 'Kasat Binmas',
      },
      {
        user_id: '2',
        nama: 'Bravo',
        title: 'IPTU',
        client_name: 'Polres B',
        jabatan: 'Kasat Binmas',
      },
      {
        user_id: '3',
        nama: 'Charlie',
        title: 'AKP',
        client_name: 'Polres C',
        jabatan: 'Waka Kasat Binmas',
      },
    ]);
    mockGetRekapLikesByClient.mockResolvedValue({
      rows: [
        { user_id: '1', jumlah_like: 3 },
        { user_id: '2', jumlah_like: 7 },
        { user_id: '3', jumlah_like: 7 },
      ],
      totalKonten: 4,
    });

    const { filePath } = await generateKasatBinmasLikesRecapExcel({
      period: 'daily',
    });
    const aoa = readSheet(filePath);

    expect(aoa[0][0]).toBe('Rekap Likes Instagram Kasat Binmas (Excel)');
    expect(aoa[1][0]).toBe('Periode: Rabu, 22 Mei 2024');
    expect(aoa[3]).toEqual(['Polres', 'Pangkat dan Nama', 'Total Likes']);

    const dataRows = aoa.slice(4).filter((row) => row && row.length);
    expect(dataRows.map((row) => row[1])).toEqual([
      'AKP Charlie',
      'IPTU Bravo',
      'AKP Alpha',
    ]);
    expect(dataRows.map((row) => row[2])).toEqual([7, 7, 3]);

    await unlink(filePath);
  });

  test('membangun label periode mingguan dengan rentang Senin-Minggu', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-05-23T03:00:00Z'));
    mockGetUsersByClient.mockResolvedValue([
      {
        user_id: '1',
        nama: 'Alpha',
        title: 'AKP',
        client_name: 'Polres A',
        jabatan: 'Kasat Binmas',
      },
    ]);
    mockGetRekapLikesByClient.mockResolvedValue({ rows: [], totalKonten: 0 });

    const { filePath } = await generateKasatBinmasLikesRecapExcel({
      period: 'weekly',
    });
    const aoa = readSheet(filePath);

    expect(aoa[1][0]).toBe(
      'Periode: Senin, 20 Mei 2024 s.d. Minggu, 26 Mei 2024'
    );
    await unlink(filePath);
  });

  test('melempar error ketika tidak ada Kasat Binmas ditemukan', async () => {
    mockMatchesKasatBinmasJabatan.mockReturnValue(false);
    mockGetUsersByClient.mockResolvedValue([
      { user_id: '1', nama: 'Alpha', jabatan: 'Operator' },
    ]);

    await expect(generateKasatBinmasLikesRecapExcel()).rejects.toThrow(
      'tidak ditemukan data Kasat Binmas'
    );
  });
});
