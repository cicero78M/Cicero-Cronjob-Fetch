import { jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../src/repository/db.js', () => ({ query: mockQuery }));

const { getWebLoginCountsByActor } = await import('../src/model/loginLogModel.js');

beforeEach(() => {
  jest.clearAllMocks();
});

test('filters web logins by date range and groups by actor', async () => {
  const startTime = new Date('2025-05-01T00:00:00Z');
  const endTime = new Date('2025-05-02T23:59:59Z');

  mockQuery.mockResolvedValue({
    rows: [
      {
        actor_id: 'user-1',
        login_count: '3',
        first_login: '2025-05-01T01:00:00Z',
        last_login: '2025-05-02T03:00:00Z',
      },
    ],
  });

  const rows = await getWebLoginCountsByActor({ startTime, endTime });

  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('JOIN org_actors'),
    ['web', startTime, endTime]
  );
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining("WHERE LOWER(c.client_type) = 'org'"),
    ['web', startTime, endTime]
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ actor_id: 'user-1', login_count: 3 });
  expect(rows[0].first_login).toBeInstanceOf(Date);
  expect(rows[0].last_login).toBeInstanceOf(Date);
});
