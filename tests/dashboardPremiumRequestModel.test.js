import { jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../src/repository/db.js', () => ({
  query: mockQuery,
}));

let createRequest;
let updateRequest;
let findExpirable;
let markRequestsExpired;
let findLatestOpenByDashboardUserId;
let findLatestOpenByUsername;

beforeAll(async () => {
  const mod = await import('../src/model/dashboardPremiumRequestModel.js');
  createRequest = mod.createRequest;
  updateRequest = mod.updateRequest;
  findExpirable = mod.findExpirable;
  markRequestsExpired = mod.markRequestsExpired;
  findLatestOpenByDashboardUserId = mod.findLatestOpenByDashboardUserId;
  findLatestOpenByUsername = mod.findLatestOpenByUsername;
});

beforeEach(() => {
  mockQuery.mockReset();
});

test('createRequest inserts dashboard premium request row', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ request_id: 10, request_token: 'abc' }] });
  const row = await createRequest({
    dashboard_user_id: 'user-1',
    username: 'tester',
    bank_name: 'BCA',
    account_number: '12345',
    sender_name: 'Tester',
  });

  expect(row).toEqual({ request_id: 10, request_token: 'abc' });
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO dashboard_premium_request'),
    [
      'user-1',
      null,
      'tester',
      null,
      'BCA',
      '12345',
      'Tester',
      null,
      null,
      null,
      null,
      'pending',
      null,
      null,
      null,
      null,
    ],
  );
});

test('updateRequest merges existing request fields', async () => {
  mockQuery
    .mockResolvedValueOnce({
      rows: [
        {
          request_id: 11,
          dashboard_user_id: 'user-2',
          username: 'tester',
          bank_name: 'Mandiri',
          account_number: '789',
          sender_name: 'User',
          status: 'pending',
          metadata: { foo: 'bar' },
        },
      ],
    })
    .mockResolvedValueOnce({
      rows: [{ request_id: 11, status: 'confirmed', proof_url: 'proof.png' }],
    });

  const updated = await updateRequest(11, { proof_url: 'proof.png', status: 'confirmed' });

  expect(updated).toEqual({ request_id: 11, status: 'confirmed', proof_url: 'proof.png' });
  expect(mockQuery).toHaveBeenLastCalledWith(
    expect.stringContaining('UPDATE dashboard_premium_request'),
    [
      11,
      null,
      'tester',
      null,
      'Mandiri',
      '789',
      'User',
      null,
      null,
      'proof.png',
      null,
      'confirmed',
      null,
      null,
      null,
      { foo: 'bar' },
    ],
  );
});

test('findExpirable selects pending and confirmed requests by expiry timestamp', async () => {
  const now = new Date();
  mockQuery.mockResolvedValueOnce({ rows: [{ request_id: 1 }, { request_id: 2 }] });
  const rows = await findExpirable(now);
  expect(rows).toHaveLength(2);
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('status IN (\'pending\', \'confirmed\')'),
    [now],
  );
});

test('markRequestsExpired updates all provided request ids', async () => {
  const date = new Date();
  mockQuery.mockResolvedValueOnce({ rows: [{ request_id: 3, status: 'expired' }] });
  const rows = await markRequestsExpired([3], date);
  expect(rows).toEqual([{ request_id: 3, status: 'expired' }]);
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('WHERE request_id = ANY($1)'),
    [[3], date],
  );
});

test('findLatestOpenByDashboardUserId returns latest non-expired open request', async () => {
  mockQuery.mockResolvedValueOnce({
    rows: [{ request_id: 4, dashboard_user_id: 'user-x', status: 'pending' }],
  });

  const row = await findLatestOpenByDashboardUserId('user-x');

  expect(row).toEqual({ request_id: 4, dashboard_user_id: 'user-x', status: 'pending' });
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('status IN (\'pending\', \'confirmed\')'),
    ['user-x'],
  );
});

test('findLatestOpenByUsername performs case-insensitive lookup', async () => {
  mockQuery.mockResolvedValueOnce({
    rows: [{ request_id: 5, username: 'Tester', status: 'confirmed' }],
  });

  const row = await findLatestOpenByUsername('tester');

  expect(row).toEqual({ request_id: 5, username: 'Tester', status: 'confirmed' });
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('LOWER(username) = LOWER($1)'),
    ['tester'],
  );
});
