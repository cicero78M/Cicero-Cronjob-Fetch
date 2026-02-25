import { jest } from '@jest/globals';

const mockScheduleCronJob = jest.fn();
const mockFetchInsta = jest.fn();
const mockFetchLikes = jest.fn();
const mockFetchTiktok = jest.fn();
const mockFetchKomentarTiktokBatch = jest.fn();
const mockGetInstaPostCount = jest.fn();
const mockGetTiktokPostCount = jest.fn();
const mockDetectChanges = jest.fn();
const mockHasNotableChanges = jest.fn();
const mockEnqueueTugasNotification = jest.fn();
const mockBuildChangeSummary = jest.fn();
const mockSendTelegramLog = jest.fn();
const mockUpsertSchedulerState = jest.fn();

jest.unstable_mockModule('../src/utils/cronScheduler.js', () => ({
  scheduleCronJob: mockScheduleCronJob,
}));

jest.unstable_mockModule('../src/model/clientModel.js', () => ({
  findAllActiveClientsWithSosmed: jest.fn(),
}));

jest.unstable_mockModule('../src/service/postCountService.js', () => ({
  getInstaPostCount: mockGetInstaPostCount,
  getTiktokPostCount: mockGetTiktokPostCount,
}));

jest.unstable_mockModule('../src/handler/fetchpost/instaFetchPost.js', () => ({
  fetchAndStoreInstaContent: mockFetchInsta,
}));

jest.unstable_mockModule('../src/handler/fetchengagement/fetchLikesInstagram.js', () => ({
  handleFetchLikesInstagram: mockFetchLikes,
}));

jest.unstable_mockModule('../src/handler/fetchpost/tiktokFetchPost.js', () => ({
  fetchAndStoreTiktokContent: mockFetchTiktok,
}));

jest.unstable_mockModule('../src/handler/fetchengagement/fetchCommentTiktok.js', () => ({
  handleFetchKomentarTiktokBatch: mockFetchKomentarTiktokBatch,
}));

jest.unstable_mockModule('../src/service/tugasChangeDetector.js', () => ({
  detectChanges: mockDetectChanges,
  hasNotableChanges: mockHasNotableChanges,
}));

jest.unstable_mockModule('../src/service/tugasNotificationService.js', () => ({
  enqueueTugasNotification: mockEnqueueTugasNotification,
  buildChangeSummary: mockBuildChangeSummary,
}));

jest.unstable_mockModule('../src/service/telegramService.js', () => ({
  sendTelegramLog: mockSendTelegramLog,
  sendTelegramError: jest.fn(),
}));

jest.unstable_mockModule('../src/service/distributedLockService.js', () => ({
  acquireDistributedLock: jest.fn(),
}));

jest.unstable_mockModule('../src/model/waNotificationReminderStateModel.js', () => ({
  getSchedulerStateMapByClientIds: jest.fn(),
  upsertSchedulerState: mockUpsertSchedulerState,
}));

let processClient;
let shouldFetchPostsForClient;
let shouldFetchPostsForClientAtJakartaParts;
let resolveClientFetchSegment;

beforeAll(async () => {
  ({
    processClient,
    shouldFetchPostsForClient,
    shouldFetchPostsForClientAtJakartaParts,
    resolveClientFetchSegment,
  } = await import('../src/cron/cronDirRequestFetchSosmed.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetInstaPostCount.mockResolvedValue(0);
  mockGetTiktokPostCount.mockResolvedValue(0);
  mockDetectChanges.mockResolvedValue({});
  mockHasNotableChanges.mockReturnValue(false);
  mockBuildChangeSummary.mockReturnValue('no changes');
  mockEnqueueTugasNotification.mockResolvedValue({ enqueuedCount: 0, duplicatedCount: 0 });
  mockUpsertSchedulerState.mockResolvedValue({});
});

test('does not refresh TikTok comments when client_tiktok_status is false', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-01-01T12:00:00.000Z')); // 19:00 WIB (valid slot)

  const schedulerStateByClient = new Map([
    ['DITBINMAS', { clientId: 'DITBINMAS', lastIgCount: 0, lastTiktokCount: 0, lastNotifiedAt: null, lastNotifiedSlot: null }],
  ]);

  await processClient(
    {
      client_id: 'ditbinmas',
      client_insta_status: true,
      client_tiktok_status: false,
    },
    {
      schedulerStateByClient,
      stateStorageHealthy: true,
    }
  );

  expect(mockFetchTiktok).not.toHaveBeenCalled();
  expect(mockFetchKomentarTiktokBatch).not.toHaveBeenCalled();
  expect(mockFetchInsta).toHaveBeenCalled();
  expect(mockFetchLikes).toHaveBeenCalled();

  jest.useRealTimers();
});

test('post-fetch slot executes Instagram post, TikTok post, Instagram likes, and TikTok comments', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-01-01T03:00:00.000Z')); // 10:00 WIB

  const schedulerStateByClient = new Map([
    ['BIDHUMAS', { clientId: 'BIDHUMAS', lastIgCount: 0, lastTiktokCount: 0, lastNotifiedAt: null, lastNotifiedSlot: null }],
  ]);

  await processClient(
    {
      client_id: 'bidhumas',
      client_type: 'direktorat',
      client_insta_status: true,
      client_tiktok_status: true,
    },
    {
      schedulerStateByClient,
      stateStorageHealthy: true,
    }
  );

  expect(mockFetchInsta).toHaveBeenCalledTimes(1);
  expect(mockFetchTiktok).toHaveBeenCalledTimes(1);
  expect(mockFetchLikes).toHaveBeenCalledTimes(1);
  expect(mockFetchKomentarTiktokBatch).toHaveBeenCalledTimes(1);

  jest.useRealTimers();
});

test('engagement still runs outside post-fetch slot', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-01-01T15:30:00.000Z')); // 22:30 WIB (outside post slot)

  const schedulerStateByClient = new Map([
    ['ORG1', { clientId: 'ORG1', lastIgCount: 0, lastTiktokCount: 0, lastNotifiedAt: null, lastNotifiedSlot: null }],
  ]);

  await processClient(
    {
      client_id: 'org1',
      client_type: 'org',
      client_insta_status: true,
      client_tiktok_status: true,
    },
    {
      schedulerStateByClient,
      stateStorageHealthy: true,
    }
  );

  expect(mockFetchInsta).not.toHaveBeenCalled();
  expect(mockFetchTiktok).not.toHaveBeenCalled();
  expect(mockFetchLikes).toHaveBeenCalledTimes(1);
  expect(mockFetchKomentarTiktokBatch).toHaveBeenCalledTimes(1);

  jest.useRealTimers();
});



describe('shouldFetchPostsForClient', () => {
  test('DITBINMAS follows 11:00-20:00 WIB post fetch window', () => {
    const orgClient = { client_id: 'POLRESTA', client_type: 'org' };
    const ditbinmasClient = { client_id: 'DITBINMAS', client_type: 'direktorat' };

    expect(shouldFetchPostsForClient(ditbinmasClient, new Date('2026-01-01T03:30:00.000Z'))).toBe(false); // 10:30 WIB
    expect(shouldFetchPostsForClient(ditbinmasClient, new Date('2026-01-01T04:00:00.000Z'))).toBe(true); // 11:00 WIB
    expect(shouldFetchPostsForClient(ditbinmasClient, new Date('2026-01-01T13:00:00.000Z'))).toBe(true); // 20:00 WIB
    expect(shouldFetchPostsForClient(ditbinmasClient, new Date('2026-01-01T13:30:00.000Z'))).toBe(false); // 20:30 WIB

    expect(shouldFetchPostsForClient(orgClient, new Date('2026-01-01T00:00:00.000Z'))).toBe(true); // 07:00 WIB
    expect(shouldFetchPostsForClient(orgClient, new Date('2026-01-01T13:00:00.000Z'))).toBe(true); // 20:00 WIB
    expect(shouldFetchPostsForClient(orgClient, new Date('2026-01-01T13:30:00.000Z'))).toBe(false); // 20:30 WIB
  });

  test('BIDHUMAS and DITINTELKAM follow 10:00-21:00 WIB post fetch window', () => {
    const bidhumasClient = { client_id: 'BIDHUMAS', client_type: 'direktorat' };
    const ditintelkamClient = { client_id: 'DITINTELKAM', client_type: 'direktorat' };

    expect(shouldFetchPostsForClient(bidhumasClient, new Date('2026-01-01T02:30:00.000Z'))).toBe(false); // 09:30 WIB
    expect(shouldFetchPostsForClient(bidhumasClient, new Date('2026-01-01T03:00:00.000Z'))).toBe(true); // 10:00 WIB
    expect(shouldFetchPostsForClient(bidhumasClient, new Date('2026-01-01T14:00:00.000Z'))).toBe(true); // 21:00 WIB
    expect(shouldFetchPostsForClient(bidhumasClient, new Date('2026-01-01T14:30:00.000Z'))).toBe(false); // 21:30 WIB

    expect(shouldFetchPostsForClient(ditintelkamClient, new Date('2026-01-01T03:00:00.000Z'))).toBe(true); // 10:00 WIB
    expect(shouldFetchPostsForClient(ditintelkamClient, new Date('2026-01-01T14:00:00.000Z'))).toBe(true); // 21:00 WIB
    expect(shouldFetchPostsForClient(ditintelkamClient, new Date('2026-01-01T14:30:00.000Z'))).toBe(false); // 21:30 WIB
  });
});

describe('client slot segment helper', () => {
  test('resolveClientFetchSegment maps clients to expected segments', () => {
    expect(resolveClientFetchSegment({ client_id: 'DITBINMAS', client_type: 'direktorat' }).key).toBe('ditbinmas');
    expect(resolveClientFetchSegment({ client_id: 'POLRESTA', client_type: 'org' }).key).toBe('org');
    expect(resolveClientFetchSegment({ client_id: 'BIDHUMAS', client_type: 'direktorat' }).key).toBe('bidhumas');
    expect(resolveClientFetchSegment({ client_id: 'DITINTELKAM', client_type: 'direktorat' }).key).toBe('ditintelkam');
  });

  test('shouldFetchPostsForClientAtJakartaParts validates boundary slots', () => {
    const ditbinmasClient = { client_id: 'DITBINMAS', client_type: 'direktorat' };
    const bidhumasClient = { client_id: 'BIDHUMAS', client_type: 'direktorat' };
    const orgClient = { client_id: 'POLRESTA', client_type: 'org' };

    expect(shouldFetchPostsForClientAtJakartaParts(ditbinmasClient, { hour: 11, minute: 0 })).toBe(true);
    expect(shouldFetchPostsForClientAtJakartaParts(ditbinmasClient, { hour: 11, minute: 30 })).toBe(true);
    expect(shouldFetchPostsForClientAtJakartaParts(ditbinmasClient, { hour: 20, minute: 0 })).toBe(true);
    expect(shouldFetchPostsForClientAtJakartaParts(ditbinmasClient, { hour: 20, minute: 30 })).toBe(false);

    expect(shouldFetchPostsForClientAtJakartaParts(bidhumasClient, { hour: 10, minute: 0 })).toBe(true);
    expect(shouldFetchPostsForClientAtJakartaParts(bidhumasClient, { hour: 21, minute: 0 })).toBe(true);
    expect(shouldFetchPostsForClientAtJakartaParts(bidhumasClient, { hour: 21, minute: 30 })).toBe(false);

    expect(shouldFetchPostsForClientAtJakartaParts(orgClient, { hour: 7, minute: 0 })).toBe(true);
    expect(shouldFetchPostsForClientAtJakartaParts(orgClient, { hour: 20, minute: 0 })).toBe(true);
    expect(shouldFetchPostsForClientAtJakartaParts(orgClient, { hour: 20, minute: 30 })).toBe(false);
  });
});
