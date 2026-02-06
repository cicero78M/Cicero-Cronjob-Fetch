import { jest } from '@jest/globals';

let generateKasatkerAttendanceSummary;
let mockGetUsersByClient;
let mockFindAllOrgClients;

describe('generateKasatkerAttendanceSummary', () => {
  beforeEach(async () => {
    jest.resetModules();
    mockGetUsersByClient = jest.fn();
    mockFindAllOrgClients = jest.fn().mockResolvedValue([]);
    jest.unstable_mockModule('../src/model/userModel.js', () => ({
      getUsersByClient: mockGetUsersByClient,
    }));
    jest.unstable_mockModule('../src/model/clientModel.js', () => ({
      findAllOrgClients: mockFindAllOrgClients,
    }));
    ({ generateKasatkerAttendanceSummary } = await import(
      '../src/service/kasatkerAttendanceService.js'
    ));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('filters Kasat Binmas and keeps jabatan data for summary', async () => {
    mockGetUsersByClient.mockResolvedValue([
      {
        user_id: '1',
        nama: 'Alpha',
        title: 'AKP',
        divisi: 'Sat Binmas',
        client_name: 'Polres Contoh',
        jabatan: 'Kasat Binmas',
        insta: 'alpha.ig',
        tiktok: 'alpha.tt',
      },
      {
        user_id: '2',
        nama: 'Beta',
        title: 'IPTU',
        divisi: 'Sat Binmas',
        jabatan: 'Operator',
        insta: null,
        tiktok: null,
      },
    ]);

    const summary = await generateKasatkerAttendanceSummary({
      clientId: 'ditbinmas',
      roleFlag: 'custom-role',
    });

    expect(mockGetUsersByClient).toHaveBeenCalledWith('DITBINMAS', 'custom-role');
    expect(summary).toContain('Total Kasat Binmas: 1');
    expect(summary).toContain('Alpha');
    expect(summary).toContain('Client: DITBINMAS');
  });

  test('uses client_name or client_id for displayed polres info', async () => {
    mockGetUsersByClient.mockResolvedValue([
      {
        user_id: '1',
        nama: 'Gamma',
        title: 'AKP',
        divisi: 'Sat Lama',
        client_name: 'Polres Bukit',
        jabatan: 'Kasat Binmas',
        insta: null,
        tiktok: null,
      },
    ]);

    const summary = await generateKasatkerAttendanceSummary();

    expect(summary).toContain('POLRES BUKIT');
    expect(summary).not.toContain('SAT LAMA');
  });

  test('sorts Kasat Binmas by pangkat priority then name', async () => {
    mockGetUsersByClient.mockResolvedValue([
      {
        user_id: '1',
        nama: 'Zulu',
        title: 'BRIPDA',
        client_name: 'Polres C',
        jabatan: 'Kasat Binmas',
        insta: null,
        tiktok: null,
      },
      {
        user_id: '2',
        nama: 'Charlie',
        title: 'AKBP',
        client_name: 'Polres A',
        jabatan: 'Kasat Binmas',
        insta: null,
        tiktok: null,
      },
      {
        user_id: '3',
        nama: 'Alpha',
        title: 'AKP',
        client_name: 'Polres B',
        jabatan: 'Kasat Binmas',
        insta: null,
        tiktok: null,
      },
    ]);

    const summary = await generateKasatkerAttendanceSummary();
    const listLines = summary
      .split('\n')
      .filter((line) => /^\d+\.\s/.test(line.trim()));

    expect(listLines).toHaveLength(3);
    expect(listLines[0]).toContain('AKBP Charlie');
    expect(listLines[2]).toContain('BRIPDA Zulu');
  });

  test('returns fallback text when there are no Kasat Binmas', async () => {
    mockGetUsersByClient.mockResolvedValue([
      { user_id: '1', jabatan: 'Operator' },
    ]);

    const summary = await generateKasatkerAttendanceSummary({
      clientId: 'polresabc',
    });

    expect(mockGetUsersByClient).toHaveBeenCalledWith('POLRESABC', 'ditbinmas');
    expect(summary).toBe(
      'Dari 1 user aktif POLRESABC (ditbinmas), tidak ditemukan data Kasat Binmas.\n' +
        '🚧 Polres tanpa Kasat Binmas terdeteksi:\n' +
        '- Data client ORG tidak tersedia untuk pembanding.'
    );
  });

  test('lists Polres without detected Kasat Binmas based on ORG clients', async () => {
    mockFindAllOrgClients.mockResolvedValue([
      { client_id: 'POLRES A', nama: 'Polres A' },
      { client_id: 'POLRES B', nama: 'Polres B' },
      { client_id: 'POLRES C', nama: 'Polres C' },
    ]);
    mockGetUsersByClient.mockResolvedValue([
      {
        user_id: '1',
        nama: 'Delta',
        title: 'AKP',
        divisi: 'Sat Binmas',
        client_id: 'POLRES B',
        jabatan: 'Kasat Binmas',
        insta: null,
        tiktok: null,
      },
    ]);

    const summary = await generateKasatkerAttendanceSummary();
    expect(summary).toContain('🚧 Polres tanpa Kasat Binmas terdeteksi:');
    expect(summary).toContain('- POLRES A (Polres A)');
    expect(summary).toContain('- POLRES C (Polres C)');
    expect(summary).not.toContain('- POLRES B (Polres B)');
  });

  test('shows no missing Polres message when all ORG clients have Kasat Binmas detected', async () => {
    mockFindAllOrgClients.mockResolvedValue([
      { client_id: 'POLRES X', nama: 'Polres X' },
      { client_id: 'POLRES Y', nama: 'Polres Y' },
    ]);
    mockGetUsersByClient.mockResolvedValue([
      {
        user_id: '1',
        nama: 'Sierra',
        title: 'AKBP',
        client_id: 'POLRES X',
        client_name: 'Polres X',
        jabatan: 'Kasat Binmas',
        insta: null,
        tiktok: null,
      },
      {
        user_id: '2',
        nama: 'Tango',
        title: 'AKP',
        client_id: 'POLRES Y',
        client_name: 'Polres Y',
        jabatan: 'Kasat Binmas',
        insta: null,
        tiktok: null,
      },
    ]);

    const summary = await generateKasatkerAttendanceSummary();
    expect(summary).toContain(
      '- Tidak ada; semua Polres ORG sudah memiliki Kasat Binmas terdata.'
    );
  });
});
