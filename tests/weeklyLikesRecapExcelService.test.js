import { jest } from '@jest/globals';
import { unlink } from 'fs/promises';
import XLSX from 'xlsx';
import { PRIORITY_USER_NAMES } from '../src/utils/constants.js';

process.env.TZ = 'Asia/Jakarta';

const mockGetRekapLikesByClient = jest.fn();

jest.unstable_mockModule('../src/model/instaLikeModel.js', () => ({
  getRekapLikesByClient: mockGetRekapLikesByClient,
}));

const { saveWeeklyLikesRecapExcel } = await import(
  '../src/service/weeklyLikesRecapExcelService.js'
);

test('saveWeeklyLikesRecapExcel creates formatted weekly recap', async () => {
  // Simulate early morning execution in Asia/Jakarta (00:30 local time)
  jest.useFakeTimers().setSystemTime(new Date('2024-04-06T17:30:00Z'));
  mockGetRekapLikesByClient.mockReset();
  mockGetRekapLikesByClient.mockImplementation(async (clientId, periode, tanggal) => {
    if (tanggal === '2024-04-07') {
      return {
        rows: [
          {
            client_name: 'POLRES A',
            title: 'AKP',
            nama: 'Budi',
            divisi: 'Sat A',
            jumlah_like: 2,
          },
        ],
        totalKonten: 3,
      };
    }
    return { rows: [], totalKonten: 0 };
  });

  const filePath = await saveWeeklyLikesRecapExcel('DITBINMAS');
  const requestedDates = mockGetRekapLikesByClient.mock.calls.map((call) => call[2]);
  expect(requestedDates).toEqual([
    '2024-04-01',
    '2024-04-02',
    '2024-04-03',
    '2024-04-04',
    '2024-04-05',
    '2024-04-06',
    '2024-04-07',
  ]);

  expect(filePath).not.toBeNull();
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets['POLRES A'];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  expect(aoa[0][0]).toBe('POLRES A – Rekap Engagement Instagram');
  expect(aoa[1][0]).toBe(
    'Rekap Likes Instagram Periode 01/04/2024 - 07/04/2024'
  );
  expect(aoa[2].slice(0, 4)).toEqual([
    'No',
    'Pangkat',
    'Nama',
    'Divisi / Satfung',
  ]);
  expect(aoa[3].slice(4, 7)).toEqual([
    'Jumlah Post',
    'Sudah Likes',
    'Belum Likes',
  ]);
  const lastIdx = aoa[2].length - 3;
  expect(aoa[4].slice(0, 4)).toEqual([1, 'AKP', 'Budi', 'Sat A']);
  expect(aoa[4].slice(lastIdx, lastIdx + 3)).toEqual([3, 2, 1]);

  await unlink(filePath);
  jest.useRealTimers();
});

test('saveWeeklyLikesRecapExcel returns null when no data', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2024-04-07T00:00:00Z'));
  mockGetRekapLikesByClient.mockReset();
  mockGetRekapLikesByClient.mockResolvedValue({ rows: [], totalKonten: 0 });

  const filePath = await saveWeeklyLikesRecapExcel('DITBINMAS');
  expect(filePath).toBeNull();
  jest.useRealTimers();
});

test('saveWeeklyLikesRecapExcel prioritizes configured names before totals', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2024-04-07T00:00:00Z'));
  mockGetRekapLikesByClient.mockReset();
  mockGetRekapLikesByClient.mockImplementation(async (clientId, periode, tanggal) => {
    if (tanggal === '2024-04-07') {
      return {
        rows: [
          {
            client_name: 'POLRES PRIORITAS',
            title: 'AKP',
            nama: PRIORITY_USER_NAMES[1],
            divisi: 'Sat B',
            jumlah_like: 5,
          },
          {
            client_name: 'POLRES PRIORITAS',
            title: 'AKP',
            nama: PRIORITY_USER_NAMES[0],
            divisi: 'Sat A',
            jumlah_like: 1,
          },
        ],
        totalKonten: 2,
      };
    }
    return { rows: [], totalKonten: 0 };
  });

  const filePath = await saveWeeklyLikesRecapExcel('DITBINMAS');
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets['POLRES PRIORITAS'];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  expect(aoa[4][2]).toBe(PRIORITY_USER_NAMES[0]);
  expect(aoa[5][2]).toBe(PRIORITY_USER_NAMES[1]);

  await unlink(filePath);
  jest.useRealTimers();
});

