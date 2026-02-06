import { jest } from '@jest/globals';

const mockWithTransaction = jest.fn();
const mockQuery = jest.fn();
const mockFindByToken = jest.fn();
const mockUpdateRequest = jest.fn();
const mockInsertAuditEntry = jest.fn();
const mockFindLatestOpenByDashboardUserId = jest.fn();
const mockFindLatestOpenByUsername = jest.fn();
const mockCreateSubscriptionWithClient = jest.fn();

jest.unstable_mockModule('../src/repository/db.js', () => ({
  withTransaction: mockWithTransaction,
  query: mockQuery,
}));

jest.unstable_mockModule('../src/model/dashboardPremiumRequestModel.js', () => ({
  findByToken: mockFindByToken,
  updateRequest: mockUpdateRequest,
  insertAuditEntry: mockInsertAuditEntry,
  findLatestOpenByDashboardUserId: mockFindLatestOpenByDashboardUserId,
  findLatestOpenByUsername: mockFindLatestOpenByUsername,
}));

jest.unstable_mockModule('../src/service/dashboardSubscriptionService.js', () => ({
  createSubscriptionWithClient: mockCreateSubscriptionWithClient,
}));

let approveDashboardPremiumRequest;

beforeAll(async () => {
  ({ approveDashboardPremiumRequest } = await import('../src/service/dashboardPremiumRequestService.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

  mockWithTransaction.mockImplementation(async cb => cb({}));
  mockCreateSubscriptionWithClient.mockResolvedValue({
    subscription: { subscription_id: 'sub-1' },
    cache: {},
  });
  mockUpdateRequest.mockImplementation(async (id, patch) => ({ request_id: id, ...patch }));
  mockInsertAuditEntry.mockResolvedValue(true);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('approveDashboardPremiumRequest - subscription expiry resolution', () => {
  test('enforces 30-day expiry for WhatsApp approvals', async () => {
    mockFindByToken.mockResolvedValue({
      request_id: 'req-1',
      request_token: 'tok-1',
      dashboard_user_id: 'user-1',
      status: 'pending',
      subscription_expires_at: new Date('2024-03-01T00:00:00.000Z'),
    });

    const result = await approveDashboardPremiumRequest('tok-1', {
      admin_whatsapp: '62811111',
      subscription_expires_at: new Date('2024-04-01T00:00:00.000Z'),
    });

    expect(result.subscription).toEqual(expect.objectContaining({ subscription_id: 'sub-1' }));
    const expiresArg = mockCreateSubscriptionWithClient.mock.calls[0][0].expires_at;
    expect(expiresArg).toEqual(new Date('2024-01-31T00:00:00.000Z'));
    expect(expiresArg).not.toEqual(new Date('2024-03-01T00:00:00.000Z'));
  });

  test('allows custom expiry for non-WhatsApp admin context', async () => {
    const customExpiry = new Date('2024-02-10T00:00:00.000Z');
    mockFindByToken.mockResolvedValue({
      request_id: 'req-2',
      request_token: 'tok-2',
      dashboard_user_id: 'user-1',
      status: 'confirmed',
      subscription_expires_at: new Date('2024-03-05T00:00:00.000Z'),
    });

    await approveDashboardPremiumRequest('tok-2', { subscription_expires_at: customExpiry });

    const expiresArg = mockCreateSubscriptionWithClient.mock.calls[0][0].expires_at;
    expect(expiresArg).toEqual(customExpiry);
  });
});
