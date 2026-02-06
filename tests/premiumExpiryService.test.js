import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockUpdatePremiumStatus = jest.fn();

jest.unstable_mockModule('../src/repository/db.js', () => ({
  query: mockQuery,
}));

jest.unstable_mockModule('../src/model/userModel.js', () => ({
  updatePremiumStatus: mockUpdatePremiumStatus,
}));

let fetchExpiredPremiumUsers;
let processExpiredPremiumUsers;

beforeAll(async () => {
  ({ fetchExpiredPremiumUsers, processExpiredPremiumUsers } = await import(
    '../src/service/premiumExpiryService.js'
  ));
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('fetchExpiredPremiumUsers returns users past their premium_end_date', async () => {
  mockQuery.mockResolvedValue({ rows: [{ user_id: '123', premium_end_date: '2025-01-01T00:00:00Z' }] });

  const result = await fetchExpiredPremiumUsers(new Date('2025-01-02T00:00:00Z'));

  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('premium_end_date <= $1'),
    [new Date('2025-01-02T00:00:00Z')],
  );
  expect(result).toEqual([{ user_id: '123', premium_end_date: '2025-01-01T00:00:00Z' }]);
});

test('processExpiredPremiumUsers updates premium status for overdue users', async () => {
  mockQuery.mockResolvedValue({
    rows: [
      { user_id: 'exp-1', premium_end_date: '2025-01-01T00:00:00Z' },
      { user_id: 'exp-2', premium_end_date: '2025-01-01T00:00:00Z' },
    ],
  });
  mockUpdatePremiumStatus.mockResolvedValue(true);

  const result = await processExpiredPremiumUsers(new Date('2025-01-02T00:00:00Z'));

  expect(result).toEqual({ checked: 2, expired: 2 });
  expect(mockUpdatePremiumStatus).toHaveBeenCalledTimes(2);
  expect(mockUpdatePremiumStatus).toHaveBeenCalledWith('exp-1', false, null);
  expect(mockUpdatePremiumStatus).toHaveBeenCalledWith('exp-2', false, null);
});

test('processExpiredPremiumUsers continues when an update fails', async () => {
  mockQuery.mockResolvedValue({
    rows: [
      { user_id: 'exp-1', premium_end_date: '2025-01-01T00:00:00Z' },
      { user_id: 'exp-2', premium_end_date: '2025-01-01T00:00:00Z' },
    ],
  });
  mockUpdatePremiumStatus
    .mockResolvedValueOnce(true)
    .mockRejectedValueOnce(new Error('db error'));

  const result = await processExpiredPremiumUsers(new Date('2025-01-02T00:00:00Z'));

  expect(result).toEqual({ checked: 2, expired: 1 });
  expect(mockUpdatePremiumStatus).toHaveBeenCalledTimes(2);
});
