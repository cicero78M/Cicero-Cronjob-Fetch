import { jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));

const { absensiRegistrasiDashboardDirektorat } = await import(
  '../src/handler/fetchabsensi/dashboard/absensiRegistrasiDashboardDirektorat.js'
);

test('generates directorate report with sequential operator counts', async () => {
  mockQuery.mockImplementation((sql) => {
    if (sql.includes('FROM clients')) {
      return {
        rows: [
          { client_id: 'DITA', nama: 'Dit A' },
          { client_id: 'POLRESA', nama: 'Polres A' },
          { client_id: 'POLRESB', nama: 'Polres B' },
        ],
      };
    }
    if (sql.includes('GROUP BY duc.client_id')) {
      return {
        rows: [
          { client_id: 'DITA', operator: 3 },
          { client_id: 'POLRESA', operator: 1 },
        ],
      };
    }
    return { rows: [] };
  });

  const msg = await absensiRegistrasiDashboardDirektorat('dita');

  expect(mockQuery).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining('client_status = true'),
    ['DITA']
  );
  expect(mockQuery).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining('LOWER(r.role_name) = $1'),
    ['dita', 'DITA']
  );
  expect(msg).toMatch(/DIT A : 3 Operator/);
  expect(msg).toMatch(/Sudah : 1 Polres\n- POLRES A : 1 Operator/);
  expect(msg).toMatch(/Belum : 1 Polres\n- POLRES B/);
});
