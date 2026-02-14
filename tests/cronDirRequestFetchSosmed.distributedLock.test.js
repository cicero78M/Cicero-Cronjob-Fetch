import { jest } from '@jest/globals';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const mockScheduleCronJob = jest.fn();
const mockFindAllActiveClientsWithSosmed = jest.fn();
const mockAcquireDistributedLock = jest.fn();

jest.unstable_mockModule('../src/utils/cronScheduler.js', () => ({
  scheduleCronJob: mockScheduleCronJob,
}));

jest.unstable_mockModule('../src/model/clientModel.js', () => ({
  findAllActiveClientsWithSosmed: mockFindAllActiveClientsWithSosmed,
}));

jest.unstable_mockModule('../src/service/distributedLockService.js', () => ({
  acquireDistributedLock: mockAcquireDistributedLock,
}));

jest.unstable_mockModule('../src/service/postCountService.js', () => ({
  getInstaPostCount: jest.fn(),
  getTiktokPostCount: jest.fn(),
}));

jest.unstable_mockModule('../src/handler/fetchpost/instaFetchPost.js', () => ({
  fetchAndStoreInstaContent: jest.fn(),
}));

jest.unstable_mockModule('../src/handler/fetchengagement/fetchLikesInstagram.js', () => ({
  handleFetchLikesInstagram: jest.fn(),
}));

jest.unstable_mockModule('../src/handler/fetchpost/tiktokFetchPost.js', () => ({
  fetchAndStoreTiktokContent: jest.fn(),
}));

jest.unstable_mockModule('../src/handler/fetchengagement/fetchCommentTiktok.js', () => ({
  handleFetchKomentarTiktokBatch: jest.fn(),
}));

jest.unstable_mockModule('../src/service/tugasChangeDetector.js', () => ({
  detectChanges: jest.fn(),
  hasNotableChanges: jest.fn(),
}));

jest.unstable_mockModule('../src/service/tugasNotificationService.js', () => ({
  enqueueTugasNotification: jest.fn(),
  buildChangeSummary: jest.fn(),
}));

jest.unstable_mockModule('../src/service/telegramService.js', () => ({
  sendTelegramLog: jest.fn(),
  sendTelegramError: jest.fn(),
}));

let runCron;

beforeAll(async () => {
  ({ runCron } = await import('../src/cron/cronDirRequestFetchSosmed.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('runCron skips processing when distributed lock is held by another instance', async () => {
  mockAcquireDistributedLock.mockResolvedValue({
    acquired: false,
    reason: 'lock_held',
    release: jest.fn(),
  });

  await runCron();

  expect(mockAcquireDistributedLock).toHaveBeenCalledWith({
    key: 'cron:dirfetch:sosmed',
    ttlSeconds: 2100,
  });
  expect(mockFindAllActiveClientsWithSosmed).not.toHaveBeenCalled();
});

test('runCron releases distributed lock when local in-flight guard skips execution', async () => {
  const release = jest.fn().mockResolvedValue();
  let unblockFirstRun;

  mockAcquireDistributedLock
    .mockResolvedValueOnce({
      acquired: true,
      release,
    })
    .mockResolvedValueOnce({
      acquired: true,
      release,
    });

  mockFindAllActiveClientsWithSosmed.mockImplementationOnce(
    () => new Promise((resolve) => {
      unblockFirstRun = resolve;
    })
  );

  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

  const firstRunPromise = runCron();
  await Promise.resolve();

  await runCron();

  unblockFirstRun([]);
  await firstRunPromise;

  expect(release).toHaveBeenCalledTimes(2);
  const allLogs = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
  expect(allLogs).toContain('action=inFlight | result=queued');
  expect(allLogs).toContain('action=lock_released | result=released');

  logSpy.mockRestore();
});
