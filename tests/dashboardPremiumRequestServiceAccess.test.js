import { jest } from '@jest/globals';

const findLatestOpenByDashboardUserId = jest.fn();
const findLatestOpenByUsername = jest.fn();

jest.unstable_mockModule('../src/model/dashboardPremiumRequestModel.js', () => ({
  ...jest.requireActual('../src/model/dashboardPremiumRequestModel.js'),
  findLatestOpenByDashboardUserId,
  findLatestOpenByUsername,
}));

const {
  findLatestOpenDashboardPremiumRequestByIdentifier,
} = await import('../src/service/dashboardPremiumRequestService.js');

describe('findLatestOpenDashboardPremiumRequestByIdentifier', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns null for empty identifier', async () => {
    await expect(findLatestOpenDashboardPremiumRequestByIdentifier('')).resolves.toBeNull();
    expect(findLatestOpenByDashboardUserId).not.toHaveBeenCalled();
    expect(findLatestOpenByUsername).not.toHaveBeenCalled();
  });

  test('prefers dashboard_user_id when available', async () => {
    findLatestOpenByDashboardUserId.mockResolvedValueOnce({ request_id: 10, dashboard_user_id: 'abc' });

    const result = await findLatestOpenDashboardPremiumRequestByIdentifier('abc');

    expect(result).toEqual({ request_id: 10, dashboard_user_id: 'abc' });
    expect(findLatestOpenByDashboardUserId).toHaveBeenCalledWith('abc');
    expect(findLatestOpenByUsername).not.toHaveBeenCalled();
  });

  test('falls back to username lookup', async () => {
    findLatestOpenByDashboardUserId.mockResolvedValueOnce(null);
    findLatestOpenByUsername.mockResolvedValueOnce({ request_id: 11, username: 'tester' });

    const result = await findLatestOpenDashboardPremiumRequestByIdentifier('tester');

    expect(result).toEqual({ request_id: 11, username: 'tester' });
    expect(findLatestOpenByDashboardUserId).toHaveBeenCalledWith('tester');
    expect(findLatestOpenByUsername).toHaveBeenCalledWith('tester');
  });

  test('skips dashboard_user_id lookup when identifier is not a UUID', async () => {
    findLatestOpenByUsername.mockResolvedValueOnce({ request_id: 12, username: 'not-uuid' });

    const result = await findLatestOpenDashboardPremiumRequestByIdentifier('not-uuid');

    expect(result).toEqual({ request_id: 12, username: 'not-uuid' });
    expect(findLatestOpenByDashboardUserId).not.toHaveBeenCalled();
    expect(findLatestOpenByUsername).toHaveBeenCalledWith('not-uuid');
  });
});
