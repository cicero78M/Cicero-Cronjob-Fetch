import { jest } from '@jest/globals';

const mockQuery = jest.fn();
jest.unstable_mockModule('../src/repository/db.js', () => ({
  query: mockQuery,
}));

let findByClientId;
let getPostsByClientAndDateRange;
beforeAll(async () => {
  ({
    findByClientId,
    getPostsByClientAndDateRange,
  } = await import('../src/model/instaPostKhususModel.js'));
});

beforeEach(() => {
  mockQuery.mockReset();
});

test('findByClientId uses DISTINCT ON to avoid duplicates', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await findByClientId('c1');
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('DISTINCT ON (shortcode)'),
    ['c1']
  );
});

test('getPostsByClientAndDateRange supports days option', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getPostsByClientAndDateRange('c1', { days: 7 });
  const sql = mockQuery.mock.calls[0][0];
  expect(sql).toContain("created_at >= NOW() - INTERVAL '7 days'");
  expect(mockQuery.mock.calls[0][1]).toEqual(['c1']);
});

test('getPostsByClientAndDateRange supports start and end dates', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getPostsByClientAndDateRange('c1', {
    startDate: '2024-01-01',
    endDate: '2024-01-31',
  });
  const sql = mockQuery.mock.calls[0][0];
  expect(sql).toContain('created_at::date >= $2');
  expect(sql).toContain('created_at::date <= $3');
  expect(mockQuery.mock.calls[0][1]).toEqual([
    'c1',
    '2024-01-01',
    '2024-01-31',
  ]);
});
