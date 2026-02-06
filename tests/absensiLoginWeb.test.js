import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetWebLoginCountsByActor = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/model/loginLogModel.js', () => ({
  getWebLoginCountsByActor: mockGetWebLoginCountsByActor,
}));

const { absensiLoginWeb } = await import('../src/handler/fetchabsensi/dashboard/absensiLoginWeb.js');

beforeEach(() => {
  jest.clearAllMocks();
});

test('builds recap message with dashboard and penmas users', async () => {
  const startTime = new Date('2025-05-05T00:00:00Z');
  const endTime = new Date('2025-05-11T23:59:59.999Z');

  mockGetWebLoginCountsByActor.mockResolvedValue([
    { actor_id: 'dash-1', login_count: '2' },
    { actor_id: 'pen-1', login_count: '1' },
  ]);

  mockQuery.mockImplementation((sql, params) => {
    if (sql.includes('FROM dashboard_user')) {
      expect(params[0]).toEqual(['dash-1', 'pen-1']);
      return { rows: [{ actor_id: 'dash-1', username: 'alice', role: 'admin' }] };
    }
    if (sql.includes('FROM penmas_user')) {
      expect(params[0]).toEqual(['dash-1', 'pen-1']);
      return { rows: [{ actor_id: 'pen-1', username: 'budi', role: 'operator' }] };
    }
    return { rows: [] };
  });

  const message = await absensiLoginWeb({ mode: 'mingguan', startTime, endTime });

  const startLabel = startTime.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
  const endLabel = endTime.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });

  expect(mockGetWebLoginCountsByActor).toHaveBeenCalledWith({ startTime, endTime });
  expect(message).toContain('Mingguan');
  expect(message).toContain(`Periode: ${startLabel} - ${endLabel}`);
  expect(message).toContain('Total hadir: 2 user (3 login)');
  expect(message).toMatch(/1\. alice \(dashboard - ADMIN\) — 2 kali/);
  expect(message).toMatch(/2\. budi \(penmas - OPERATOR\) — 1 kali/);
});

test('builds monthly recap grouped by polres', async () => {
  const startTime = new Date('2025-06-15T00:00:00Z');
  const expectedStart = new Date('2025-06-01T00:00:00.000Z');
  const expectedEnd = new Date('2025-06-30T23:59:59.999Z');

  mockGetWebLoginCountsByActor.mockResolvedValue([]);

  mockQuery.mockImplementation((sql, params) => {
    if (sql.includes('FROM clients c') && sql.includes('LEFT JOIN login_log')) {
      expect(params).toEqual([expectedStart, expectedEnd]);
      return {
        rows: [
          { client_id: 'RES A', nama: 'Polres A', operator_count: 2, login_count: 15 },
          { client_id: 'RES B', nama: 'Polres B', operator_count: 1, login_count: 5 },
        ],
      };
    }
    return { rows: [] };
  });

  const message = await absensiLoginWeb({ mode: 'bulanan', startTime });

  expect(mockGetWebLoginCountsByActor).not.toHaveBeenCalled();
  expect(message).toContain('Absensi Login Web Cicero (Bulanan)');
  expect(message).toContain('Juni 2025');
  expect(message).toContain('Total login: 20');
  expect(message).toContain('Total operator aktif: 3 orang');
  expect(message).toMatch(/1\. POLRES A — 2 operator \| 15 login/);
  expect(message).toMatch(/2\. POLRES B — 1 operator \| 5 login/);
});

test('monthly recap ignores directorat clients even with login activity', async () => {
  const startTime = new Date('2025-07-10T00:00:00Z');
  const expectedStart = new Date('2025-07-01T00:00:00.000Z');
  const expectedEnd = new Date('2025-07-31T23:59:59.999Z');

  mockGetWebLoginCountsByActor.mockResolvedValue([]);

  mockQuery.mockImplementation((sql, params) => {
    if (sql.includes('FROM clients c') && sql.includes('LEFT JOIN login_log')) {
      expect(sql).toContain("WHERE LOWER(c.client_type) = 'org'");
      expect(sql).not.toMatch(/DITBINMAS/i);
      expect(params).toEqual([expectedStart, expectedEnd]);
      return {
        rows: [
          { client_id: 'RES ORG', nama: 'Polres Org', operator_count: 1, login_count: 3 },
        ],
      };
    }
    return { rows: [] };
  });

  const message = await absensiLoginWeb({ mode: 'bulanan', startTime });

  expect(message).toContain('POLRES ORG');
  expect(message).not.toMatch(/DITBINMAS/i);
});
