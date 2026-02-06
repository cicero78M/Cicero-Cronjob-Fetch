import { jest } from '@jest/globals';

const scheduleCronJob = jest.fn((jobKey, cronExpression, handler, options) => {
  scheduledJobs.push({ jobKey, cronExpression, handler, options });
  return { jobKey, cronExpression, handler };
});

const waGatewayClient = {};

const originalJestWorkerId = process.env.JEST_WORKER_ID;
let scheduledJobs = [];

afterAll(() => {
  process.env.JEST_WORKER_ID = originalJestWorkerId;
});

beforeEach(() => {
  jest.resetModules();
  scheduledJobs = [];
  scheduleCronJob.mockClear();
  process.env.JEST_WORKER_ID = undefined;
});

async function loadModules() {
  jest.unstable_mockModule('../src/config/env.js', () => ({
    env: { ENABLE_DIRREQUEST_GROUP: true },
  }));

  jest.unstable_mockModule('../src/utils/cronScheduler.js', () => ({
    scheduleCronJob,
  }));

  jest.unstable_mockModule('../src/cron/cronWaNotificationReminder.js', () => ({
    runCron: jest.fn(),
    JOB_KEY: 'reminder-job',
  }));

  jest.unstable_mockModule('../src/cron/cronDirRequestSatbinmasOfficialMedia.js', () => ({
    runCron: jest.fn(),
    JOB_KEY: 'satbinmas-job',
  }));

  jest.unstable_mockModule('../src/cron/cronDirRequestBidhumasEvening.js', () => ({
    runCron: jest.fn(),
    JOB_KEY: 'bidhumas-evening-job',
  }));

  const dirRequest = await import('../src/cron/dirRequest/index.js');

  return {
    registerDirRequestCrons: dirRequest.registerDirRequestCrons,
  };
}

test('registerDirRequestCrons schedules reminder, satbinmas, and bidhumas jobs', async () => {
  const { registerDirRequestCrons } = await loadModules();

  registerDirRequestCrons(waGatewayClient);

  const scheduleMap = scheduledJobs.reduce((acc, job) => {
    acc[job.jobKey] = acc[job.jobKey] ? [...acc[job.jobKey], job.cronExpression] : [job.cronExpression];
    return acc;
  }, {});

  expect(scheduleMap).toEqual({
    'reminder-job': ['10 16 * * *', '40 16 * * *', '10 17 * * *', '40 17 * * *'],
    'satbinmas-job': ['5 23 * * *'],
    'bidhumas-evening-job': ['30 20 * * *', '00 22 * * *'],
  });
});
