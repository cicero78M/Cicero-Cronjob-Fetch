import { jest } from '@jest/globals';

const mockScheduleCronJob = jest.fn();
const mockProcessExpiredSubscriptions = jest.fn();

jest.unstable_mockModule('../src/utils/cronScheduler.js', () => ({
  scheduleCronJob: mockScheduleCronJob,
}));

jest.unstable_mockModule('../src/service/dashboardSubscriptionExpiryService.js', () => ({
  processExpiredSubscriptions: mockProcessExpiredSubscriptions,
}));

let JOB_KEY;
let runCron;

beforeAll(async () => {
  ({ JOB_KEY, runCron } = await import('../src/cron/cronDashboardSubscriptionExpiry.js'));
});

test('registers the dashboard subscription expiry cron schedule', () => {
  expect(mockScheduleCronJob).toHaveBeenCalledWith(
    JOB_KEY,
    '*/30 * * * *',
    expect.any(Function),
    { timezone: 'Asia/Jakarta' },
  );
});

test('runCron delegates to processExpiredSubscriptions', async () => {
  mockProcessExpiredSubscriptions.mockClear();
  mockProcessExpiredSubscriptions.mockResolvedValue({ checked: 2, expired: 1 });

  await runCron();

  expect(mockProcessExpiredSubscriptions).toHaveBeenCalledTimes(1);
});
