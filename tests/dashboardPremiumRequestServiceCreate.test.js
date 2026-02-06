import { jest } from '@jest/globals';

const mockWithTransaction = jest.fn();
const mockCreateRequest = jest.fn();
const mockInsertAuditEntry = jest.fn();
const mockFindLatestOpenByDashboardUserId = jest.fn();
const mockFindLatestOpenByUsername = jest.fn();
const mockFindDashboardUserById = jest.fn();

jest.unstable_mockModule('../src/repository/db.js', () => ({
  withTransaction: mockWithTransaction,
}));

jest.unstable_mockModule('../src/model/dashboardPremiumRequestModel.js', () => ({
  createRequest: mockCreateRequest,
  insertAuditEntry: mockInsertAuditEntry,
  findLatestOpenByDashboardUserId: mockFindLatestOpenByDashboardUserId,
  findLatestOpenByUsername: mockFindLatestOpenByUsername,
}));

jest.unstable_mockModule('../src/model/dashboardUserModel.js', () => ({
  findById: mockFindDashboardUserById,
}));

let createDashboardPremiumRequest;

beforeAll(async () => {
  ({ createDashboardPremiumRequest } = await import('../src/service/dashboardPremiumRequestService.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  mockWithTransaction.mockImplementation(async cb => cb({}));
  mockFindDashboardUserById.mockResolvedValue({
    dashboard_user_id: 'user-1',
    username: 'tester',
    whatsapp: '12345',
    client_ids: ['client-1'],
  });
  mockCreateRequest.mockResolvedValue({
    request_id: 'req-1',
    dashboard_user_id: 'user-1',
    client_id: 'client-1',
    status: 'pending',
  });
});

const basePayload = {
  bank_name: 'Bank A',
  account_number: '123',
  sender_name: 'Tester',
};

describe('createDashboardPremiumRequest - open request guard', () => {
  test('throws conflict when an open request exists', async () => {
    mockFindLatestOpenByDashboardUserId.mockResolvedValue({
      request_id: 'req-0',
      dashboard_user_id: 'user-1',
      status: 'pending',
      expired_at: new Date(Date.now() + 3600000).toISOString(),
    });

    await expect(
      createDashboardPremiumRequest({ dashboard_user_id: 'user-1' }, basePayload),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('masih diproses'),
    });

    expect(mockCreateRequest).not.toHaveBeenCalled();
    expect(mockInsertAuditEntry).not.toHaveBeenCalled();
  });

  test('allows creation after previous request is closed', async () => {
    mockFindLatestOpenByDashboardUserId
      .mockResolvedValueOnce({
        request_id: 'req-0',
        dashboard_user_id: 'user-1',
        status: 'confirmed',
        expired_at: new Date(Date.now() + 3600000).toISOString(),
      })
      .mockResolvedValueOnce(null);

    await expect(
      createDashboardPremiumRequest({ dashboard_user_id: 'user-1' }, basePayload),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(mockCreateRequest).not.toHaveBeenCalled();

    const request = await createDashboardPremiumRequest(
      { dashboard_user_id: 'user-1' },
      { ...basePayload, client_id: 'client-1' },
    );

    expect(request).toEqual(expect.objectContaining({ request_id: 'req-1', status: 'pending' }));
    expect(mockCreateRequest).toHaveBeenCalledTimes(1);
    expect(mockInsertAuditEntry).toHaveBeenCalledTimes(1);
  });
});
