import { jest } from '@jest/globals';

const mockAxiosGet = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: { get: mockAxiosGet },
}));

process.env.TIKTOK_RAPIDAPI_MIN_INTERVAL_MS = '0';
process.env.TIKTOK_RAPIDAPI_ENTITLEMENT_COOLDOWN_MS = '60000';

const {
  rapidApiGet,
  resetRapidApiGuardForTests,
} = await import('../src/service/rapidApiGuard.js');

beforeEach(() => {
  mockAxiosGet.mockReset();
  resetRapidApiGuardForTests();
});

test('suppresses a host after a provider entitlement error', async () => {
  const entitlementError = Object.assign(new Error('not subscribed'), {
    response: { status: 403, data: { message: 'You are not subscribed to this API.' } },
  });
  mockAxiosGet.mockRejectedValueOnce(entitlementError);

  await expect(rapidApiGet('tiktok-api23.p.rapidapi.com', 'api/user/info'))
    .rejects.toBe(entitlementError);
  await expect(rapidApiGet('tiktok-api23.p.rapidapi.com', 'api/user/info'))
    .rejects.toMatchObject({ code: 'RAPIDAPI_HOST_SUPPRESSED' });
  expect(mockAxiosGet).toHaveBeenCalledTimes(1);
});
