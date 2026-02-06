import { jest } from '@jest/globals';
import { unlink } from 'fs/promises';
import XLSX from 'xlsx';
import { PRIORITY_USER_NAMES } from '../src/utils/constants.js';

process.env.TZ = 'Asia/Jakarta';

const mockGetRekapKomentarByClient = jest.fn();
const mockCountPostsByClient = jest.fn();

jest.unstable_mockModule('../src/model/tiktokCommentModel.js', () => ({
  getRekapKomentarByClient: mockGetRekapKomentarByClient,
  deleteCommentsByVideoId: jest.fn(),
}));

jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({
  countPostsByClient: mockCountPostsByClient,
  findPostByVideoId: jest.fn(),
  deletePostByVideoId: jest.fn(),
}));

const { saveMonthlyCommentRecapExcel } = await import(
  '../src/service/monthlyCommentRecapExcelService.js'
);

test('saveMonthlyCommentRecapExcel creates formatted monthly recap', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2024-04-15T00:00:00Z'));

  mockGetRekapKomentarByClient.mockReset();
  mockCountPostsByClient.mockReset();
  mockGetRekapKomentarByClient.mockImplementation(async () => [
    {
      client_name: 'POLRES A',
      title: 'AKP',
      nama: 'Budi',
      divisi: 'Sat A',
      jumlah_komentar: 2,
    },
  ]);
  mockCountPostsByClient.mockImplementation(async (clientId, periode, tanggal, _s, _e, role) => {
    expect(clientId).toBe('DITBINMAS');
    expect(role).toBe('ditbinmas');
    if (tanggal === '2024-04-15') {
      return 3;
    }
    return 0;
  });

  const filePath = await saveMonthlyCommentRecapExcel('DITBINMAS');
  expect(filePath).toBeTruthy();
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets['POLRES A'];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  expect(aoa[0][0]).toBe('POLRES A – Rekap Engagement Tiktok');
  expect(aoa[1][0]).toBe(
    'Rekap Komentar Tiktok Periode 01/04/2024 - 15/04/2024'
  );
  expect(aoa[2].slice(0, 4)).toEqual([
    'No',
    'Pangkat',
    'Nama',
    'Divisi / Satfung',
  ]);
  const lastIdx = aoa[2].length - 3;
  expect(aoa[3].slice(lastIdx, lastIdx + 3)).toEqual([
    'Jumlah Post',
    'Sudah Komentar',
    'Belum Komentar',
  ]);
  expect(aoa[4].slice(0, 4)).toEqual([1, 'AKP', 'Budi', 'Sat A']);
  expect(aoa[4].slice(lastIdx, lastIdx + 3)).toEqual([3, 2, 1]);

  await unlink(filePath);
  jest.useRealTimers();
});

test('saveMonthlyCommentRecapExcel returns null when no data', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2024-04-15T00:00:00Z'));
  mockGetRekapKomentarByClient.mockReset();
  mockCountPostsByClient.mockReset();
  mockGetRekapKomentarByClient.mockResolvedValue([]);
  mockCountPostsByClient.mockResolvedValue(0);

  const filePath = await saveMonthlyCommentRecapExcel('DITBINMAS');
  expect(filePath).toBeNull();
  jest.useRealTimers();
});

test('saveMonthlyCommentRecapExcel applies name priority before totals', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2024-04-15T00:00:00Z'));
  mockGetRekapKomentarByClient.mockReset();
  mockCountPostsByClient.mockReset();
  mockGetRekapKomentarByClient.mockResolvedValue([
    {
      client_name: 'POLRES PRIORITAS',
      client_id: 'POLRESP',
      title: 'AKP',
      nama: PRIORITY_USER_NAMES[1],
      divisi: 'Sat B',
      jumlah_komentar: 10,
    },
    {
      client_name: 'POLRES PRIORITAS',
      client_id: 'POLRESP',
      title: 'AKP',
      nama: PRIORITY_USER_NAMES[0],
      divisi: 'Sat A',
      jumlah_komentar: 1,
    },
  ]);
  mockCountPostsByClient.mockResolvedValue(5);

  const filePath = await saveMonthlyCommentRecapExcel('DITBINMAS');
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets['POLRES PRIORITAS'];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  expect(aoa[4][2]).toBe(PRIORITY_USER_NAMES[0]);
  expect(aoa[5][2]).toBe(PRIORITY_USER_NAMES[1]);

  await unlink(filePath);
  jest.useRealTimers();
});

test('saveMonthlyCommentRecapExcel aggregates Ditbinmas posts for backlog', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2024-04-15T00:00:00Z'));

  mockGetRekapKomentarByClient.mockReset();
  mockCountPostsByClient.mockReset();

  const recapMap = {
    '2024-04-14': [
      {
        client_name: 'POLRES A',
        title: 'AKP',
        nama: 'Budi',
        divisi: 'Sat A',
        jumlah_komentar: 4,
      },
      {
        client_name: 'POLRES B',
        title: 'IPTU',
        nama: 'Siti',
        divisi: 'Sat B',
        jumlah_komentar: 3,
      },
    ],
    '2024-04-15': [
      {
        client_name: 'POLRES A',
        title: 'AKP',
        nama: 'Budi',
        divisi: 'Sat A',
        jumlah_komentar: 5,
      },
      {
        client_name: 'POLRES B',
        title: 'IPTU',
        nama: 'Siti',
        divisi: 'Sat B',
        jumlah_komentar: 2,
      },
    ],
  };

  mockGetRekapKomentarByClient.mockImplementation(async (_clientId, _periode, tanggal) => {
    return recapMap[tanggal] || [];
  });

  const postSeed = {
    '2024-04-14': 6,
    '2024-04-15': 8,
  };
  mockCountPostsByClient.mockImplementation(async (clientId, _periode, tanggal, _s, _e, role) => {
    expect(clientId).toBe('DITBINMAS');
    expect(role).toBe('ditbinmas');
    return postSeed[tanggal] || 0;
  });

  const filePath = await saveMonthlyCommentRecapExcel('DITBINMAS');
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets['POLRES A'];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const lastIdx = aoa[2].length - 3;
  expect(aoa[4].slice(lastIdx - 3, lastIdx)).toEqual([6, 4, 2]);
  expect(aoa[4].slice(lastIdx, lastIdx + 3)).toEqual([8, 5, 3]);

  mockCountPostsByClient.mock.calls.forEach((call) => {
    expect(call[0]).toBe('DITBINMAS');
    expect(call[5]).toBe('ditbinmas');
  });

  await unlink(filePath);
  jest.useRealTimers();
});
