import { jest } from '@jest/globals';

const mockSchedule = jest.fn();
const mockGetCronJob = jest.fn();

jest.unstable_mockModule('node-cron', () => ({
  default: {
    schedule: mockSchedule,
  },
}));

jest.unstable_mockModule('../../src/service/cronJobConfigService.js', () => ({
  getCronJob: mockGetCronJob,
}));

let scheduleCronJob;

beforeAll(async () => {
  ({ scheduleCronJob } = await import('../../src/utils/cronScheduler.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  delete process.env.CRON_STATUS_LOOKUP_STRATEGY;
});

test('skips executing handler when job is inactive', async () => {
  const handler = jest.fn();
  let scheduledHandler;
  mockSchedule.mockImplementation((expr, callback) => {
    scheduledHandler = callback;
    return { stop: jest.fn() };
  });
  mockGetCronJob.mockResolvedValue({ job_key: 'job1', is_active: false });

  scheduleCronJob('job1', '* * * * *', handler);
  await scheduledHandler();

  expect(mockGetCronJob).toHaveBeenCalledWith('job1');
  expect(handler).not.toHaveBeenCalled();
});

test('executes handler when job is active', async () => {
  const handler = jest.fn().mockResolvedValue();
  let scheduledHandler;
  mockSchedule.mockImplementation((expr, callback) => {
    scheduledHandler = callback;
    return { stop: jest.fn() };
  });
  mockGetCronJob.mockResolvedValue({ job_key: 'job1', is_active: true });

  scheduleCronJob('job1', '* * * * *', handler);
  await scheduledHandler('foo');

  expect(handler).toHaveBeenCalledWith('foo');
});

test('retries status lookup once and still honors inactive flag when retry succeeds', async () => {
  const handler = jest.fn();
  let scheduledHandler;
  mockSchedule.mockImplementation((expr, callback) => {
    scheduledHandler = callback;
    return { stop: jest.fn() };
  });
  mockGetCronJob
    .mockRejectedValueOnce(new Error('temporary connection error'))
    .mockResolvedValueOnce({ job_key: 'job1', is_active: false });

  scheduleCronJob('job1', '* * * * *', handler);
  await scheduledHandler();

  expect(mockGetCronJob).toHaveBeenCalledTimes(2);
  expect(handler).not.toHaveBeenCalled();
});

test('executes handler when status lookup keeps failing', async () => {
  const handler = jest.fn();
  let scheduledHandler;
  mockSchedule.mockImplementation((expr, callback) => {
    scheduledHandler = callback;
    return { stop: jest.fn() };
  });
  mockGetCronJob.mockRejectedValue(new Error('database offline'));

  scheduleCronJob('job1', '* * * * *', handler);
  await scheduledHandler();

  expect(mockGetCronJob).toHaveBeenCalledTimes(2);
  expect(handler).toHaveBeenCalled();
});


test('skips handler when status lookup keeps failing and strategy is fail_closed', async () => {
  process.env.CRON_STATUS_LOOKUP_STRATEGY = 'fail_closed';
  const handler = jest.fn();
  let scheduledHandler;
  mockSchedule.mockImplementation((expr, callback) => {
    scheduledHandler = callback;
    return { stop: jest.fn() };
  });
  mockGetCronJob.mockRejectedValue(new Error('database offline'));

  scheduleCronJob('job1', '* * * * *', handler);
  await scheduledHandler();

  expect(mockGetCronJob).toHaveBeenCalledTimes(2);
  expect(handler).not.toHaveBeenCalled();
});

test('falls back to fail_open when strategy value is invalid', async () => {
  process.env.CRON_STATUS_LOOKUP_STRATEGY = 'unexpected';
  const handler = jest.fn();
  let scheduledHandler;
  mockSchedule.mockImplementation((expr, callback) => {
    scheduledHandler = callback;
    return { stop: jest.fn() };
  });
  mockGetCronJob.mockRejectedValue(new Error('database offline'));

  scheduleCronJob('job1', '* * * * *', handler);
  await scheduledHandler();

  expect(mockGetCronJob).toHaveBeenCalledTimes(2);
  expect(handler).toHaveBeenCalled();
});
