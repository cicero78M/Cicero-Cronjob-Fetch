import { jest } from '@jest/globals';

const mockCreate = jest.fn();
const mockFindActiveByUser = jest.fn();
const mockExpire = jest.fn();
const mockCancel = jest.fn();
const mockRenew = jest.fn();
const mockQuery = jest.fn();

jest.unstable_mockModule('../src/model/dashboardSubscriptionModel.js', () => ({
  create: mockCreate,
  findActiveByUser: mockFindActiveByUser,
  expire: mockExpire,
  cancel: mockCancel,
  renew: mockRenew,
}));

jest.unstable_mockModule('../src/repository/db.js', () => ({
  query: mockQuery,
}));

let service;

beforeAll(async () => {
  service = await import('../src/service/dashboardSubscriptionService.js');
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('createSubscription inserts record and updates premium cache', async () => {
  mockCreate.mockResolvedValue({
    subscription_id: 'sub-1',
    dashboard_user_id: 'du-1',
    tier: 'gold',
    expires_at: '2025-01-01T00:00:00.000Z',
  });
  mockQuery
    .mockResolvedValueOnce({}) // BEGIN
    .mockResolvedValueOnce({
      rows: [
        {
          premium_status: true,
          premium_tier: 'gold',
          premium_expires_at: '2025-01-01T00:00:00.000Z',
        },
      ],
    }) // update cache
    .mockResolvedValueOnce({}); // COMMIT

  const result = await service.createSubscription({
    dashboard_user_id: 'du-1',
    tier: 'gold',
    expires_at: '2025-01-01T00:00:00.000Z',
  });

  expect(mockQuery).toHaveBeenNthCalledWith(1, 'BEGIN');
  expect(mockCreate).toHaveBeenCalledWith({
    dashboard_user_id: 'du-1',
    tier: 'gold',
    expires_at: '2025-01-01T00:00:00.000Z',
  });
  expect(mockQuery).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining('UPDATE dashboard_user'),
    ['du-1', true, 'gold', '2025-01-01T00:00:00.000Z'],
  );
  expect(mockQuery).toHaveBeenNthCalledWith(3, 'COMMIT');
  expect(result.cache.premium_status).toBe(true);
  expect(result.subscription.subscription_id).toBe('sub-1');
});

test('expireSubscription marks subscription expired and clears cache when no active record', async () => {
  mockExpire.mockResolvedValue({
    subscription_id: 'sub-2',
    dashboard_user_id: 'du-2',
    status: 'expired',
  });
  mockFindActiveByUser.mockResolvedValue(null);
  mockQuery
    .mockResolvedValueOnce({}) // BEGIN
    .mockResolvedValueOnce({
      rows: [
        {
          premium_status: false,
          premium_tier: null,
          premium_expires_at: null,
        },
      ],
    }) // update cache
    .mockResolvedValueOnce({}); // COMMIT

  const result = await service.expireSubscription('sub-2');

  expect(mockQuery).toHaveBeenNthCalledWith(1, 'BEGIN');
  expect(mockExpire).toHaveBeenCalledWith('sub-2', null);
  expect(mockFindActiveByUser).toHaveBeenCalledWith('du-2');
  expect(result.cache.premium_status).toBe(false);
  expect(mockQuery).toHaveBeenNthCalledWith(3, 'COMMIT');
});
