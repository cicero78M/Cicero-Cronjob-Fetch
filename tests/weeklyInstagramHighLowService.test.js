import { jest } from '@jest/globals';

process.env.TZ = 'Asia/Jakarta';
process.env.JWT_SECRET = 'testsecret';

const mockGetRekapLikesByClient = jest.fn();

jest.unstable_mockModule('../src/model/instaLikeModel.js', () => ({
  getRekapLikesByClient: mockGetRekapLikesByClient,
}));

jest.unstable_mockModule('../src/utils/utilsHelper.js', () => ({
  formatNama: ({ title, nama }) => [title, nama].filter(Boolean).join(' ').trim(),
}));

let generateWeeklyInstagramHighLowReport;

beforeAll(async () => {
  ({ generateWeeklyInstagramHighLowReport } = await import(
    '../src/service/weeklyInstagramHighLowService.js'
  ));
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2024-07-10T03:00:00.000Z'));
});

afterEach(() => {
  jest.useRealTimers();
});

test('generateWeeklyInstagramHighLowReport returns formatted recap with top and bottom performers', async () => {
  mockGetRekapLikesByClient.mockResolvedValue({
    rows: [
      {
        user_id: '1',
        title: 'AKP',
        nama: 'Budi',
        divisi: 'Sat Binmas',
        client_id: 'ditbinmas',
        client_name: 'Polres A',
        jumlah_like: 25,
      },
      {
        user_id: '2',
        title: 'IPTU',
        nama: 'Ani',
        divisi: 'Sat Lantas',
        client_id: 'ditbinmas',
        client_name: 'Polres A',
        jumlah_like: 15,
      },
      {
        user_id: '3',
        title: 'IPDA',
        nama: 'Candra',
        divisi: 'Sat Intelkam',
        client_id: 'ditbinmas',
        client_name: 'Polres B',
        jumlah_like: 10,
      },
      {
        user_id: '4',
        title: 'AIPTU',
        nama: 'Dedi',
        divisi: 'Sat Samapta',
        client_id: 'ditbinmas',
        client_name: 'Polres B',
        jumlah_like: 4,
      },
      {
        user_id: '5',
        title: 'BRIPKA',
        nama: 'Eko',
        divisi: 'Sat Reskrim',
        client_id: 'ditbinmas',
        client_name: 'Polres C',
        jumlah_like: 2,
      },
      {
        user_id: '6',
        title: 'BRIPTU',
        nama: 'Fajar',
        divisi: 'Sat Sabhara',
        client_id: 'ditbinmas',
        client_name: 'Polres D',
        jumlah_like: 0,
      },
      {
        user_id: '99',
        title: 'IPTU',
        nama: 'Haris',
        divisi: 'Sat Narkoba',
        client_id: 'polres_x',
        client_name: 'Polres X',
        jumlah_like: 50,
      },
    ],
    totalKonten: 32,
  });

  const message = await generateWeeklyInstagramHighLowReport('DITBINMAS', {
    roleFlag: 'ditbinmas',
  });

  expect(mockGetRekapLikesByClient).toHaveBeenCalledWith(
    'DITBINMAS',
    'harian',
    undefined,
    '2024-07-01',
    '2024-07-07',
    'ditbinmas'
  );
  expect(message).toContain('📊 *Laporan Instagram Top and Bottom*');
  expect(message).toContain('Periode: Senin, 01 Juli 2024 s.d. Minggu, 07 Juli 2024');
  expect(message).toContain('Total tugas Instagram: 32');
  expect(message).toContain('🔥 *5 Pelaksana Tertinggi*');
  expect(message).toContain('1. AKP Budi (Sat Binmas • Polres A) — 25 likes');
  expect(message).toContain('❄️ *5 Pelaksana Terendah*');
  expect(message).toContain('1. BRIPTU Fajar (Sat Sabhara • Polres D) — 0 likes');
  expect(message).not.toContain('Polres X');
});

test('generateWeeklyInstagramHighLowReport returns no data message when participants empty', async () => {
  mockGetRekapLikesByClient.mockResolvedValue({ rows: [], totalKonten: 0 });

  const message = await generateWeeklyInstagramHighLowReport('DITBINMAS', {
    roleFlag: 'ditbinmas',
  });

  expect(message).toContain('📊 *Laporan Instagram Top and Bottom*');
  expect(message).toContain('Total tugas Instagram: 0');
  expect(message).toContain(
    'Tidak ada data pelaksanaan likes Instagram pada periode tersebut.'
  );
});

test('generateWeeklyInstagramHighLowReport throws when clientId missing', async () => {
  await expect(
    generateWeeklyInstagramHighLowReport('', { roleFlag: 'ditbinmas' })
  ).rejects.toThrow(/clientId wajib diisi/i);
  expect(mockGetRekapLikesByClient).not.toHaveBeenCalled();
});

test('generateWeeklyInstagramHighLowReport throws when role is not DITBINMAS', async () => {
  await expect(
    generateWeeklyInstagramHighLowReport('DITBINMAS', { roleFlag: 'operator' })
  ).rejects.toThrow(/hanya tersedia untuk pengguna DITBINMAS/i);
  expect(mockGetRekapLikesByClient).not.toHaveBeenCalled();
});
