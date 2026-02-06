import { jest } from '@jest/globals';

process.env.JWT_SECRET ||= 'test-secret-key';

const mockGetUsersByClient = jest.fn();
const mockFindUserById = jest.fn();
const mockGetRekapKomentarByClient = jest.fn();
const mockGetCommentsByVideoId = jest.fn();
const mockGetPostsTodayByClient = jest.fn();

const toJakartaDateInput = (date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(date);

jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersByClient: mockGetUsersByClient,
  findUserById: mockFindUserById,
}));

jest.unstable_mockModule('../src/model/tiktokCommentModel.js', () => ({
  getRekapKomentarByClient: mockGetRekapKomentarByClient,
  getCommentsByVideoId: mockGetCommentsByVideoId,
}));

jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({
  getPostsTodayByClient: mockGetPostsTodayByClient,
}));

let generateKasatBinmasTiktokCommentRecap;

beforeAll(async () => {
  ({ generateKasatBinmasTiktokCommentRecap } = await import(
    '../src/service/kasatBinmasTiktokCommentRecapService.js'
  ));
});

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

test('menyusun ringkasan absensi komentar TikTok untuk Kasat Binmas', async () => {
  mockGetUsersByClient.mockResolvedValue([
    {
      user_id: '1',
      nama: 'Alpha',
      title: 'AKP',
      jabatan: 'Kasat Binmas Polres A',
      client_id: 'POLRESA',
      client_name: 'Polres A',
      tiktok: '@alpha',
    },
    {
      user_id: '2',
      nama: 'Bravo',
      title: 'IPTU',
      jabatan: 'Kasat Binmas Polres B',
      client_id: 'POLRESB',
      client_name: 'Polres B',
      tiktok: '',
    },
    {
      user_id: '4',
      nama: 'Delta',
      title: 'AKP',
      jabatan: 'WA Kasat Binmas',
      client_id: 'POLRESD',
      client_name: 'Polres D',
      tiktok: '@delta',
    },
    {
      user_id: '3',
      nama: 'Charlie',
      title: 'AKP',
      jabatan: 'Kasat Intel',
      client_id: 'POLRESC',
      client_name: 'Polres C',
      tiktok: '@charlie',
    },
  ]);
  mockGetRekapKomentarByClient.mockResolvedValue([
    { user_id: '1', jumlah_komentar: 3, total_konten: 3 },
    { user_id: '2', jumlah_komentar: 0, total_konten: 3 },
  ]);

  const summary = await generateKasatBinmasTiktokCommentRecap({ period: 'daily' });

  expect(mockGetRekapKomentarByClient).toHaveBeenCalledWith(
    'DITBINMAS',
    'harian',
    expect.any(String),
    undefined,
    undefined,
    'ditbinmas'
  );
  expect(summary).toContain('📋 *Absensi Komentar TikTok Kasat Binmas*');
  expect(summary).toContain('Total konten periode: 3 video');
  expect(summary).toContain('Total Kasat Binmas: 2 pers');
  expect(summary).toContain('Lengkap: 1/2 pers');
  expect(summary).toContain('Sebagian: 0/2 pers');
  expect(summary).toContain('Belum komentar: 0/2 pers');
  expect(summary).toContain('Belum update akun TikTok: 1 pers');
  expect(summary).toMatch(/Alpha/);
  expect(summary).not.toMatch(/Charlie/);
  expect(summary).not.toMatch(/Delta/);
});

test('periode harian memakai tanggal WIB agar tidak bergeser oleh zona waktu server', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2024-03-01T18:30:00.000Z'));
  mockGetUsersByClient.mockResolvedValue([
    {
      user_id: '10',
      nama: 'Zulu',
      title: 'AKP',
      jabatan: 'Kasat Binmas',
      client_id: 'POLREZ',
      client_name: 'Polres Z',
      tiktok: '@zulu',
    },
  ]);
  mockGetRekapKomentarByClient.mockResolvedValue([
    { user_id: '10', jumlah_komentar: 1, total_konten: 1 },
  ]);

  try {
    const summary = await generateKasatBinmasTiktokCommentRecap({ period: 'daily' });

    expect(mockGetRekapKomentarByClient).toHaveBeenCalledWith(
      'DITBINMAS',
      'harian',
      '2024-03-02',
      undefined,
      undefined,
      'ditbinmas'
    );
    expect(summary).toContain('02 Maret 2024');
  } finally {
    jest.useRealTimers();
  }
});

test('periode harian tetap memakai WIB meski zona waktu server berbeda', async () => {
  const originalTZ = process.env.TZ;
  process.env.TZ = 'America/New_York';
  jest.useFakeTimers().setSystemTime(new Date('2024-06-30T17:00:00.000Z'));

  mockGetUsersByClient.mockResolvedValue([
    {
      user_id: '11',
      nama: 'Echo',
      title: 'AKP',
      jabatan: 'Kasat Binmas',
      client_id: 'POLREE',
      client_name: 'Polres E',
      tiktok: '@echo',
    },
  ]);
  mockGetRekapKomentarByClient.mockResolvedValue([
    { user_id: '11', jumlah_komentar: 2, total_konten: 2 },
  ]);

  try {
    const summary = await generateKasatBinmasTiktokCommentRecap({ period: 'daily' });

    expect(mockGetRekapKomentarByClient).toHaveBeenCalledWith(
      'DITBINMAS',
      'harian',
      '2024-07-01',
      undefined,
      undefined,
      'ditbinmas'
    );
    expect(summary).toContain('01 Juli 2024');
  } finally {
    jest.useRealTimers();
    process.env.TZ = originalTZ;
  }
});

test('periode harian memakai referenceDate untuk label dan tanggal', async () => {
  const referenceDate = new Date('2024-12-05T10:00:00.000Z');
  mockGetUsersByClient.mockResolvedValue([
    {
      user_id: '12',
      nama: 'Golf',
      title: 'AKP',
      jabatan: 'Kasat Binmas',
      client_id: 'POLREG',
      client_name: 'Polres G',
      tiktok: '@golf',
    },
  ]);
  mockGetRekapKomentarByClient.mockResolvedValue([
    { user_id: '12', jumlah_komentar: 2, total_konten: 2 },
  ]);

  const summary = await generateKasatBinmasTiktokCommentRecap({
    period: 'daily',
    referenceDate,
  });

  expect(mockGetRekapKomentarByClient).toHaveBeenCalledWith(
    'DITBINMAS',
    'harian',
    '2024-12-05',
    undefined,
    undefined,
    'ditbinmas'
  );
  expect(summary).toContain('Kamis, 05 Desember 2024');
});

test('fallback live recap memanfaatkan tanggal Jakarta ketika rekap kosong', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2024-09-10T18:30:00.000Z'));
  mockGetUsersByClient.mockResolvedValue([
    {
      user_id: '21',
      nama: 'Foxtrot',
      title: 'AKP',
      jabatan: 'Kasat Binmas',
      client_id: 'POLREF',
      client_name: 'Polres F',
      tiktok: '@foxtrot',
    },
  ]);
  mockGetRekapKomentarByClient.mockResolvedValue([]);
  mockGetPostsTodayByClient.mockResolvedValue([{ video_id: 'VID-22' }]);
  mockGetCommentsByVideoId.mockResolvedValue({
    comments: [{ username: '@foxtrot' }],
  });

  const summary = await generateKasatBinmasTiktokCommentRecap({ period: 'daily' });

  expect(mockGetPostsTodayByClient).toHaveBeenCalledWith(
    'DITBINMAS',
    toJakartaDateInput(new Date('2024-09-10T18:30:00.000Z'))
  );
  expect(summary).toContain('11 September 2024');
  expect(summary).toContain('Total konten periode: 1 video');
});

test('mengembalikan pesan ketika tidak ada Kasat Binmas', async () => {
  mockGetUsersByClient.mockResolvedValue([
    { user_id: '1', jabatan: 'Operator', tiktok: '@alpha' },
  ]);

  const summary = await generateKasatBinmasTiktokCommentRecap();

  expect(summary).toContain('tidak ditemukan data Kasat Binmas');
  expect(mockGetRekapKomentarByClient).not.toHaveBeenCalled();
});

test('mengirim parameter minggu Senin-Minggu untuk period weekly', async () => {
  mockGetUsersByClient.mockResolvedValue([
    {
      user_id: '1',
      jabatan: 'Kasat Binmas',
      nama: 'Alpha',
      title: 'AKP',
      client_id: 'POLRESA',
      client_name: 'Polres A',
      tiktok: '@alpha',
    },
  ]);
  mockGetRekapKomentarByClient.mockResolvedValue([
    { user_id: '1', jumlah_komentar: 1, total_konten: 1 },
  ]);

  const summary = await generateKasatBinmasTiktokCommentRecap({ period: 'weekly' });

  expect(summary).toContain('Periode:');
  expect(mockGetRekapKomentarByClient).toHaveBeenCalledWith(
    'DITBINMAS',
    'mingguan',
    expect.any(String),
    expect.any(String),
    expect.any(String),
    'ditbinmas'
  );
});

test('periode mingguan mengikuti referenceDate lintas tahun', async () => {
  const referenceDate = new Date('2025-01-01T03:00:00.000Z');
  mockGetUsersByClient.mockResolvedValue([
    {
      user_id: '22',
      jabatan: 'Kasat Binmas',
      nama: 'Hotel',
      title: 'AKP',
      client_id: 'POLREH',
      client_name: 'Polres H',
      tiktok: '@hotel',
    },
  ]);
  mockGetRekapKomentarByClient.mockResolvedValue([
    { user_id: '22', jumlah_komentar: 1, total_konten: 1 },
  ]);

  const summary = await generateKasatBinmasTiktokCommentRecap({
    period: 'weekly',
    referenceDate,
  });

  expect(mockGetRekapKomentarByClient).toHaveBeenCalledWith(
    'DITBINMAS',
    'mingguan',
    expect.any(String),
    '2024-12-30',
    '2025-01-05',
    'ditbinmas'
  );
  expect(summary).toContain('30 Desember 2024');
  expect(summary).toContain('05 Januari 2025');
});

test('periode mingguan mengikuti Senin–Minggu WIB di zona waktu server lain', async () => {
  const originalTZ = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  jest.useFakeTimers().setSystemTime(new Date('2024-07-06T18:00:00.000Z'));

  mockGetUsersByClient.mockResolvedValue([
    {
      user_id: '21',
      jabatan: 'Kasat Binmas',
      nama: 'Foxtrot',
      title: 'AKP',
      client_id: 'POLREF',
      client_name: 'Polres F',
      tiktok: '@foxtrot',
    },
  ]);
  mockGetRekapKomentarByClient.mockResolvedValue([
    { user_id: '21', jumlah_komentar: 3, total_konten: 3 },
  ]);

  try {
    await generateKasatBinmasTiktokCommentRecap({ period: 'weekly' });

    expect(mockGetRekapKomentarByClient).toHaveBeenCalledWith(
      'DITBINMAS',
      'mingguan',
      expect.any(String),
      '2024-07-01',
      '2024-07-07',
      'ditbinmas'
    );
  } finally {
    jest.useRealTimers();
    process.env.TZ = originalTZ;
  }
});

test('periode bulanan memakai referenceDate untuk label bulan dan tahun', async () => {
  const referenceDate = new Date('2024-12-05T10:00:00.000Z');
  mockGetUsersByClient.mockResolvedValue([
    {
      user_id: '23',
      jabatan: 'Kasat Binmas',
      nama: 'India',
      title: 'AKP',
      client_id: 'POLREI',
      client_name: 'Polres I',
      tiktok: '@india',
    },
  ]);
  mockGetRekapKomentarByClient.mockResolvedValue([
    { user_id: '23', jumlah_komentar: 4, total_konten: 4 },
  ]);

  const summary = await generateKasatBinmasTiktokCommentRecap({
    period: 'monthly',
    referenceDate,
  });

  expect(mockGetRekapKomentarByClient).toHaveBeenCalledWith(
    'DITBINMAS',
    'bulanan',
    '2024-12',
    undefined,
    undefined,
    'ditbinmas'
  );
  expect(summary).toContain('Bulan Desember 2024');
});
