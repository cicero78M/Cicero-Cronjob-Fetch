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

beforeAll(async () => {
  ({ processClient, shouldFetchPostsForClient } = await import('../src/cron/cronDirRequestFetchSosmed.js'));
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
});


describe('shouldFetchPostsForClient', () => {
  test('org and ditbinmas clients fetch posts until 20:59 WIB', () => {
    const orgClient = { client_id: 'POLRESTA', client_type: 'org' };
    const ditbinmasClient = { client_id: 'DITBINMAS', client_type: 'direktorat' };

    expect(shouldFetchPostsForClient(orgClient, new Date('2026-01-01T13:00:00.000Z'))).toBe(true); // 20:00 WIB
    expect(shouldFetchPostsForClient(orgClient, new Date('2026-01-01T14:00:00.000Z'))).toBe(false); // 21:00 WIB

    expect(shouldFetchPostsForClient(ditbinmasClient, new Date('2026-01-01T13:00:00.000Z'))).toBe(true); // 20:00 WIB
    expect(shouldFetchPostsForClient(ditbinmasClient, new Date('2026-01-01T14:00:00.000Z'))).toBe(false); // 21:00 WIB
  });

  test('bidhumas and ditintelkam clients fetch posts until 22:59 WIB', () => {
    const bidhumasClient = { client_id: 'BIDHUMAS', client_type: 'direktorat' };
    const ditintelkamClient = { client_id: 'DITINTELKAM', client_type: 'direktorat' };

    expect(shouldFetchPostsForClient(bidhumasClient, new Date('2026-01-01T15:00:00.000Z'))).toBe(true); // 22:00 WIB
    expect(shouldFetchPostsForClient(bidhumasClient, new Date('2026-01-01T16:00:00.000Z'))).toBe(false); // 23:00 WIB

    expect(shouldFetchPostsForClient(ditintelkamClient, new Date('2026-01-01T15:00:00.000Z'))).toBe(true); // 22:00 WIB
    expect(shouldFetchPostsForClient(ditintelkamClient, new Date('2026-01-01T16:00:00.000Z'))).toBe(false); // 23:00 WIB
  });
});
