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


describe('shouldFetchPostsForClient', () => {
  test('segment A clients (org/ditbinmas) stop at final slot 20:58 WIB', () => {
    const orgClient = { client_id: 'POLRESTA', client_type: 'org' };
    const ditbinmasClient = { client_id: 'DITBINMAS', client_type: 'direktorat' };

    expect(shouldFetchPostsForClient(orgClient, new Date('2026-01-01T13:58:00.000Z'))).toBe(true); // 20:58 WIB
    expect(shouldFetchPostsForClient(orgClient, new Date('2026-01-01T14:00:00.000Z'))).toBe(false); // 21:00 WIB

    expect(shouldFetchPostsForClient(ditbinmasClient, new Date('2026-01-01T13:58:00.000Z'))).toBe(true); // 20:58 WIB
    expect(shouldFetchPostsForClient(ditbinmasClient, new Date('2026-01-01T14:00:00.000Z'))).toBe(false); // 21:00 WIB
  });

  test('segment B clients (direktorat except ditbinmas) stop at final slot 21:58 WIB', () => {
    const bidhumasClient = { client_id: 'BIDHUMAS', client_type: 'direktorat' };
    const ditreskrimClient = { client_id: 'DITRESKRIM', client_type: 'direktorat' };

    expect(shouldFetchPostsForClient(bidhumasClient, new Date('2026-01-01T14:58:00.000Z'))).toBe(true); // 21:58 WIB
    expect(shouldFetchPostsForClient(bidhumasClient, new Date('2026-01-01T15:00:00.000Z'))).toBe(false); // 22:00 WIB

    expect(shouldFetchPostsForClient(ditreskrimClient, new Date('2026-01-01T14:58:00.000Z'))).toBe(true); // 21:58 WIB
    expect(shouldFetchPostsForClient(ditreskrimClient, new Date('2026-01-01T15:00:00.000Z'))).toBe(false); // 22:00 WIB
  });
});

describe('client slot segment helper', () => {
  test('resolveClientFetchSegment maps clients to expected segments', () => {
    expect(resolveClientFetchSegment({ client_id: 'DITBINMAS', client_type: 'direktorat' })).toBe('segmentA');
    expect(resolveClientFetchSegment({ client_id: 'POLRESTA', client_type: 'org' })).toBe('segmentA');
    expect(resolveClientFetchSegment({ client_id: 'BIDHUMAS', client_type: 'direktorat' })).toBe('segmentB');
  });

  test('shouldFetchPostsForClientAtJakartaParts validates boundary slots', () => {
    const segmentAClient = { client_id: 'DITBINMAS', client_type: 'direktorat' };
    const segmentBClient = { client_id: 'BIDHUMAS', client_type: 'direktorat' };

    expect(shouldFetchPostsForClientAtJakartaParts(segmentAClient, { hour: 20, minute: 58 })).toBe(true);
    expect(shouldFetchPostsForClientAtJakartaParts(segmentAClient, { hour: 21, minute: 0 })).toBe(false);

    expect(shouldFetchPostsForClientAtJakartaParts(segmentBClient, { hour: 21, minute: 58 })).toBe(true);
    expect(shouldFetchPostsForClientAtJakartaParts(segmentBClient, { hour: 22, minute: 0 })).toBe(false);
  });
});
