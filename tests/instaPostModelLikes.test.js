import { jest } from '@jest/globals';

const mockQuery = jest.fn();
jest.unstable_mockModule('../src/repository/db.js', () => ({
  query: mockQuery,
}));

let getPostsTodayByClient;

beforeAll(async () => {
  ({ getPostsTodayByClient } = await import('../src/model/instaPostModel.js'));
});

beforeEach(() => {
  mockQuery.mockReset();
});

test('getPostsTodayByClient pulls like_count from insta_like json array', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });

  await getPostsTodayByClient('C1');

  expect(mockQuery).toHaveBeenCalledTimes(1);
  const sql = mockQuery.mock.calls[0][0];
  expect(sql).toContain('LEFT JOIN insta_like il ON il.shortcode = p.shortcode');
  expect(sql).toContain('jsonb_array_length(il.likes)');
  expect(sql).toContain('AS like_count');
});
