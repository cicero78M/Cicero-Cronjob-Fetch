import { jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../../src/repository/db.js', () => ({
  query: mockQuery,
}));

let findBySuperAdmin;

beforeAll(async () => {
  ({ findBySuperAdmin } = await import('../../src/model/clientModel.js'));
});

beforeEach(() => {
  mockQuery.mockReset();
});

describe('findBySuperAdmin', () => {
  test('matches numbers within comma separated list', async () => {
    const row = {
      client_id: 'client-1',
      client_super: '628123450000, 628999888777',
    };
    mockQuery.mockResolvedValueOnce({ rows: [row] });

    const result = await findBySuperAdmin('628999888777');

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("client_super ~ ('(^|\\\\D)' || $1 || '(\\\\D|$)')");
    expect(params).toEqual(['628999888777', '08999888777']);
    expect(result).toEqual(row);
  });

  test('returns null when query yields no rows', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await findBySuperAdmin('+62 812-3456-7890');

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });
});
