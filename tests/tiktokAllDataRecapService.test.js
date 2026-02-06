import { jest } from '@jest/globals';
import { unlink } from 'fs/promises';
import XLSX from 'xlsx';

const mockGetRekapKomentarByClient = jest.fn();

jest.unstable_mockModule('../src/model/tiktokCommentModel.js', () => ({
  getRekapKomentarByClient: mockGetRekapKomentarByClient,
}));

const {
  buildMonthRange,
  generateTiktokAllDataRecap,
} = await import('../src/service/tiktokAllDataRecapService.js');

test('buildMonthRange starts from previous September before September', () => {
  const months = buildMonthRange(new Date('2024-02-10T00:00:00Z'));
  expect(months[0]).toEqual({ key: '2023-09', label: 'September 2023' });
  expect(months.at(-1)).toEqual({ key: '2024-02', label: 'Februari 2024' });
});

test('generateTiktokAllDataRecap aggregates, sorts, and appends totals', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2024-12-15T00:00:00Z'));
  try {
    const monthlyData = {
      '2024-09': [{ client_name: 'POLRES B', jumlah_komentar: 5 }],
      '2024-10': [{ client_name: 'POLRES A', jumlah_komentar: 2 }],
      '2024-11': [
        { client_name: 'POLRES B', jumlah_komentar: 3 },
        { client_name: 'POLRES A', jumlah_komentar: 7 },
      ],
      '2024-12': [{ client_name: 'POLRES A', jumlah_komentar: '4' }],
    };

    mockGetRekapKomentarByClient.mockImplementation(async (_clientId, _periode, monthKey) => {
      return monthlyData[monthKey] || [];
    });

    const { filePath, months } = await generateTiktokAllDataRecap({
      clientId: 'DITBINMAS',
      clientName: 'Ditbinmas',
    });

    expect(months[0]).toBe('2024-09');
    expect(months.at(-1)).toBe('2024-12');

    const wb = XLSX.readFile(filePath);
    const sheet = wb.Sheets['TikTok All Data'];
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    expect(aoa[2][0]).toBe('Polres');
    expect(aoa[2].at(-1)).toBe('Total');

    const dataRows = aoa.slice(3, -1);
    expect(dataRows[0][0]).toBe('POLRES A'); // highest total first
    expect(dataRows[0].at(-1)).toBe(13);
    expect(dataRows[1][0]).toBe('POLRES B');
    expect(dataRows[1].at(-1)).toBe(8);

    const totalRow = aoa.at(-1);
    expect(totalRow[0]).toBe('TOTAL');
    expect(totalRow.slice(1)).toEqual([5, 2, 10, 4, 21]);

    await unlink(filePath);
  } finally {
    jest.useRealTimers();
  }
});

test('generateTiktokAllDataRecap throws when no data found', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2024-10-05T00:00:00Z'));
  try {
    mockGetRekapKomentarByClient.mockResolvedValue([]);

    await expect(
      generateTiktokAllDataRecap({ clientId: 'DITBINMAS' })
    ).rejects.toThrow('Tidak ada data komentar TikTok');
  } finally {
    jest.useRealTimers();
  }
});
