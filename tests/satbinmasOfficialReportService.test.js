import { jest } from '@jest/globals';

const mockFetchSatbinmasOfficialMediaFromDb = jest.fn();
const mockFetchSatbinmasOfficialTiktokMediaFromDb = jest.fn();
const mockFetchTodaySatbinmasOfficialMediaForOrgClients = jest.fn();
const mockFetchTodaySatbinmasOfficialTiktokMediaForOrgClients = jest.fn();

jest.unstable_mockModule('../src/service/satbinmasOfficialMediaService.js', () => ({
  fetchSatbinmasOfficialMediaFromDb: mockFetchSatbinmasOfficialMediaFromDb,
  fetchTodaySatbinmasOfficialMediaForOrgClients: mockFetchTodaySatbinmasOfficialMediaForOrgClients,
}));

jest.unstable_mockModule('../src/service/satbinmasOfficialTiktokMediaService.js', () => ({
  fetchSatbinmasOfficialTiktokMediaFromDb: mockFetchSatbinmasOfficialTiktokMediaFromDb,
  fetchTodaySatbinmasOfficialTiktokMediaForOrgClients: mockFetchTodaySatbinmasOfficialTiktokMediaForOrgClients,
}));

let buildSatbinmasOfficialInstagramDbRecap;
let buildSatbinmasOfficialTiktokDbRecap;
let querySatbinmasOfficialInstagramSummary;
let querySatbinmasOfficialTiktokSummary;

describe('satbinmasOfficialReportService DB recaps', () => {
  beforeAll(async () => {
    ({
      buildSatbinmasOfficialInstagramDbRecap,
      buildSatbinmasOfficialTiktokDbRecap,
      querySatbinmasOfficialInstagramSummary,
      querySatbinmasOfficialTiktokSummary,
    } = await import('../src/service/satbinmasOfficialReportService.js'));
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-05-08T09:15:00Z'));
    jest.clearAllMocks();
    mockFetchSatbinmasOfficialMediaFromDb.mockResolvedValue({
      clients: [
        {
          name: 'POLRES A',
          accounts: [{ username: 'satbinmas_a', total: 2, likes: 5, comments: 1 }],
          errors: [],
        },
      ],
      totals: { clients: 1, accounts: 1, fetched: 2 },
    });
    mockFetchSatbinmasOfficialTiktokMediaFromDb.mockResolvedValue({
      clients: [
        {
          name: 'POLRES T',
          accounts: [{ username: 'satbinmas_t', total: 3, likes: 9, comments: 4 }],
          errors: [{ username: 'missing_uid', message: 'secUid TikTok belum tersinkron.' }],
        },
      ],
      totals: { clients: 1, accounts: 2, fetched: 3 },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('buildSatbinmasOfficialInstagramDbRecap formats weekly period and forwards Monday-start range', async () => {
    const recap = await buildSatbinmasOfficialInstagramDbRecap('weekly');

    const callArgs = mockFetchSatbinmasOfficialMediaFromDb.mock.calls[0][0];
    expect(callArgs.start).toBeInstanceOf(Date);
    expect(callArgs.end).toBeInstanceOf(Date);
    expect(callArgs.start.toISOString()).toContain('2024-05-06');
    expect(callArgs.end.toISOString()).toContain('2024-05-13');

    expect(recap).toContain('Rekap mingguan');
    expect(recap).toContain('POLRES A');
    expect(recap).toContain('@satbinmas_a');
    expect(recap).toContain('2 konten');
  });

  test('buildSatbinmasOfficialTiktokDbRecap uses monthly range and preserves error messages', async () => {
    jest.setSystemTime(new Date('2024-02-20T03:00:00Z'));

    const recap = await buildSatbinmasOfficialTiktokDbRecap('monthly');
    const callArgs = mockFetchSatbinmasOfficialTiktokMediaFromDb.mock.calls[0][0];

    expect(callArgs.start.toISOString()).toContain('2024-02-01');
    expect(callArgs.end.toISOString()).toContain('2024-03-01');

    expect(recap).toContain('Rekap bulanan');
    expect(recap).toContain('@satbinmas_t');
    expect(recap).toContain('3 konten');
    expect(recap).toContain('missing_uid');
    expect(recap).toContain('secUid TikTok belum tersinkron');
  });

  test('querySatbinmasOfficialInstagramSummary forwards daily range', async () => {
    await querySatbinmasOfficialInstagramSummary('daily');
    const { start, end } = mockFetchSatbinmasOfficialMediaFromDb.mock.calls[0][0];

    expect(start.toISOString()).toContain('2024-05-08');
    expect(end.toISOString()).toContain('2024-05-09');
  });

  test('querySatbinmasOfficialTiktokSummary forwards weekly range boundaries', async () => {
    await querySatbinmasOfficialTiktokSummary('weekly');
    const { start, end } = mockFetchSatbinmasOfficialTiktokMediaFromDb.mock.calls[0][0];

    expect(start.toISOString()).toContain('2024-05-06');
    expect(end.toISOString()).toContain('2024-05-13');
  });
});
