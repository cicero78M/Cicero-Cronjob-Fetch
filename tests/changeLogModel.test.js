import { jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../src/repository/db.js', () => ({
  query: mockQuery,
}));

let getLogsByEvent;

beforeAll(async () => {
  const mod = await import('../src/model/changeLogModel.js');
  getLogsByEvent = mod.getLogsByEvent;
});

beforeEach(() => {
  mockQuery.mockReset();
});

test('getLogsByEvent joins with penmas_user', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getLogsByEvent(1);
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('JOIN penmas_user'),
    [1]
  );
});
