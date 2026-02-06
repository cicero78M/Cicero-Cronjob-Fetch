import { jest } from '@jest/globals';

const mockListCronJobs = jest.fn();
const mockGetCronJob = jest.fn();
const mockUpdateCronJobStatus = jest.fn();

jest.unstable_mockModule('../src/model/cronJobConfigModel.js', () => ({
  listCronJobs: mockListCronJobs,
  getCronJob: mockGetCronJob,
  updateCronJobStatus: mockUpdateCronJobStatus,
}));

let service;

beforeAll(async () => {
  service = await import('../src/service/cronJobConfigService.js');
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('listCronJobs delegates to model', async () => {
  const rows = [{ job_key: 'job1' }];
  mockListCronJobs.mockResolvedValue(rows);

  const result = await service.listCronJobs();

  expect(mockListCronJobs).toHaveBeenCalledTimes(1);
  expect(result).toBe(rows);
});

test('getCronJob returns configuration', async () => {
  const job = { job_key: 'job1', is_active: true };
  mockGetCronJob.mockResolvedValue(job);

  const result = await service.getCronJob('job1');

  expect(mockGetCronJob).toHaveBeenCalledWith('job1');
  expect(result).toBe(job);
});

test('updateCronJobStatus throws when isActive is not boolean', async () => {
  await expect(service.updateCronJobStatus('job1', 'true')).rejects.toThrow(TypeError);
  expect(mockUpdateCronJobStatus).not.toHaveBeenCalled();
});

test('updateCronJobStatus returns updated configuration', async () => {
  const updated = { job_key: 'job1', is_active: false };
  mockUpdateCronJobStatus.mockResolvedValue(updated);

  const result = await service.updateCronJobStatus('job1', false);

  expect(mockUpdateCronJobStatus).toHaveBeenCalledWith('job1', false);
  expect(result).toBe(updated);
});

test('updateCronJobStatus throws when job not found', async () => {
  mockUpdateCronJobStatus.mockResolvedValue(null);

  await expect(service.updateCronJobStatus('job-missing', true)).rejects.toMatchObject({
    code: 'CRON_JOB_NOT_FOUND',
  });
});
