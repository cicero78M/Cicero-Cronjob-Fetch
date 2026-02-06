import { jest } from '@jest/globals';

const mockFetchInsta = jest.fn();
const mockFetchLikes = jest.fn();
const mockFetchTiktok = jest.fn();
const mockGenerateMsg = jest.fn();
const mockFetchKomentarTiktokBatch = jest.fn();
const mockSafeSend = jest.fn();
const mockSendWithClientFallback = jest.fn();
const mockSendDebug = jest.fn();
const mockGetInstaPostCount = jest.fn();
const mockGetTiktokPostCount = jest.fn();
const mockGetShortcodesTodayByClient = jest.fn();
const mockGetVideoIdsTodayByClient = jest.fn();
const mockFindAllActiveDirektoratWithTiktok = jest.fn();

jest.unstable_mockModule('../src/service/waService.js', () => ({
  default: {},
  waGatewayClient: {},
  waUserClient: {},
}));
jest.unstable_mockModule('../src/handler/fetchpost/instaFetchPost.js', () => ({
  fetchAndStoreInstaContent: mockFetchInsta,
}));
jest.unstable_mockModule('../src/handler/fetchengagement/fetchLikesInstagram.js', () => ({
  handleFetchLikesInstagram: mockFetchLikes,
}));
jest.unstable_mockModule('../src/handler/fetchengagement/fetchCommentTiktok.js', () => ({
  handleFetchKomentarTiktokBatch: mockFetchKomentarTiktokBatch,
}));
jest.unstable_mockModule('../src/handler/fetchpost/tiktokFetchPost.js', () => ({
  fetchAndStoreTiktokContent: mockFetchTiktok,
}));
jest.unstable_mockModule('../src/handler/fetchabsensi/sosmedTask.js', () => ({
  generateSosmedTaskMessage: mockGenerateMsg,
}));
jest.unstable_mockModule('../src/utils/waHelper.js', async () => {
  const actual = await import('../src/utils/waHelper.js');
  return {
    ...actual,
    safeSendMessage: mockSafeSend,
    sendWithClientFallback: mockSendWithClientFallback,
    getAdminWAIds: () => ['123@c.us'],
  };
});
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
  sendDebug: mockSendDebug,
}));
jest.unstable_mockModule('../src/service/postCountService.js', () => ({
  getInstaPostCount: mockGetInstaPostCount,
  getTiktokPostCount: mockGetTiktokPostCount,
}));
jest.unstable_mockModule('../src/model/instaPostModel.js', () => ({
  getShortcodesTodayByClient: mockGetShortcodesTodayByClient,
}));
jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({
  getVideoIdsTodayByClient: mockGetVideoIdsTodayByClient,
  findPostByVideoId: jest.fn(),
  deletePostByVideoId: jest.fn(),
}));
jest.unstable_mockModule('../src/model/clientModel.js', () => ({
  findAllActiveDirektoratWithTiktok: mockFindAllActiveDirektoratWithTiktok,
}));

let runCron;
let getRecipientsForClient;
let normalizeGroupId;

beforeEach(async () => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret';
  mockGenerateMsg.mockResolvedValue({
    text: 'msg',
    igCount: 1,
    tiktokCount: 1,
    state: { igShortcodes: ['ig1'], tiktokVideoIds: ['tt1'] },
  });
  mockGetInstaPostCount.mockResolvedValue(0);
  mockGetTiktokPostCount.mockResolvedValue(0);
  mockGetShortcodesTodayByClient.mockResolvedValue(['dbIg']);
  mockGetVideoIdsTodayByClient.mockResolvedValue(['dbTt']);
  mockFetchKomentarTiktokBatch.mockResolvedValue();
  mockFindAllActiveDirektoratWithTiktok.mockResolvedValue([
    {
      client_id: 'DITBINMAS',
      client_type: 'Direktorat',
      client_group: '120363419830216549@g.us',
      client_operator: '',
      client_super: '',
      client_insta_status: true,
      client_tiktok_status: true,
    },
  ]);
  ({ runCron, getRecipientsForClient, normalizeGroupId } = await import('../src/cron/cronDirRequestFetchSosmed.js'));
});

describe('normalizeGroupId', () => {
  test('accepts valid group id with suffix', () => {
    expect(normalizeGroupId('120363419830216549@g.us')).toBe('120363419830216549@g.us');
  });

  test('appends @g.us for bare id', () => {
    expect(normalizeGroupId('120363419830216549')).toBe('120363419830216549@g.us');
  });

  test('strips invite url prefix and normalizes case', () => {
    expect(normalizeGroupId('https://chat.whatsapp.com/invite/120363419830216549')).toBe(
      '120363419830216549@g.us'
    );
    expect(normalizeGroupId(' HTTPS://CHAT.WHATSAPP.COM/120363419830216549 ')).toBe(
      '120363419830216549@g.us'
    );
  });

  test('rejects non group tokens even in invite url', () => {
    expect(normalizeGroupId('https://chat.whatsapp.com/invite/ABCDEFG')).toBeNull();
    expect(normalizeGroupId('invalid-group@g.us')).toBeNull();
  });
});

describe('getRecipientsForClient', () => {
  test('returns only WA group for directorate clients', () => {
    const recipients = getRecipientsForClient({
      client_id: 'bidhumas',
      client_type: 'Direktorat',
      client_group: '120363419830216549@g.us',
      client_operator: '081234567890',
      client_super: '628987654321@s.whatsapp.net',
    });

    expect(recipients).toEqual(new Set(['120363419830216549@g.us']));
  });

  test('rejects non-directorate clients and invalid groups', () => {
    const recipients = getRecipientsForClient({
      client_id: 'BIDHUMAS',
      client_type: 'fungsi',
      client_operator: '12345',
      client_super: '+62 81-23AB',
      client_group: 'invalid-group@g.us',
    });

    expect(recipients.size).toBe(0);
  });

  test('normalizes group invite links', () => {
    const recipients = getRecipientsForClient({
      client_id: 'DITBINMAS',
      client_type: 'direktorat',
      client_group: 'https://chat.whatsapp.com/invite/120363419830216549',
    });

    expect(recipients).toEqual(new Set(['120363419830216549@g.us']));
  });
});

test('runCron fetches sosmed and sends message to recipients', async () => {
  await runCron();

  expect(mockGenerateMsg).toHaveBeenCalledWith('DITBINMAS', {
    skipLikesFetch: true,
    skipTiktokFetch: true,
    previousState: { igShortcodes: ['dbIg'], tiktokVideoIds: ['dbTt'] },
  });

  expect(mockFetchInsta).toHaveBeenCalledWith(
    ['shortcode', 'caption', 'like_count', 'timestamp'],
    null,
    null,
    'DITBINMAS'
  );
  expect(mockFetchLikes).toHaveBeenCalledWith(null, null, 'DITBINMAS');
  expect(mockFetchTiktok).toHaveBeenCalledWith('DITBINMAS');
  expect(mockGenerateMsg).toHaveBeenCalled();
  const sentMessages = mockSendWithClientFallback.mock.calls.map(
    ([payload]) => [payload.chatId, payload.message]
  );
  expect(sentMessages[0][0]).toBe('123@c.us');
  expect(sentMessages[0][1]).toContain('[CRON DIRFETCH SOSMED]');
  expect(sentMessages[1]).toEqual(['120363419830216549@g.us', 'msg']);
  expect(sentMessages[2][0]).toBe('123@c.us');
  expect(sentMessages[2][1]).toContain('Laporan dikirim ke 1 penerima');
});

test('runCron skips Instagram fetch when Instagram disabled but keeps TikTok', async () => {
  mockFindAllActiveDirektoratWithTiktok.mockResolvedValueOnce([
    {
      client_id: 'DITSAMAPTA',
      client_type: 'Direktorat',
      client_group: '120363419830216549@g.us',
      client_operator: '',
      client_super: '',
      client_insta_status: false,
      client_tiktok_status: true,
    },
  ]);

  await runCron();

  expect(mockFetchInsta).not.toHaveBeenCalled();
  expect(mockFetchLikes).not.toHaveBeenCalled();
  expect(mockFetchTiktok).toHaveBeenCalledWith('DITSAMAPTA');
});

test('runCron skips sending when counts unchanged', async () => {
  mockGetShortcodesTodayByClient.mockResolvedValueOnce(['dbIg1']).mockResolvedValueOnce(['dbIg2']);
  mockGetVideoIdsTodayByClient.mockResolvedValueOnce(['dbTt1']).mockResolvedValueOnce(['dbTt2']);
  await runCron();
  mockSendWithClientFallback.mockClear();
  await runCron();
  expect(mockGenerateMsg).toHaveBeenLastCalledWith('DITBINMAS', {
    skipLikesFetch: true,
    skipTiktokFetch: true,
    previousState: { igShortcodes: ['dbIg2'], tiktokVideoIds: ['dbTt2'] },
  });
  const adminMessages = mockSendWithClientFallback.mock.calls.map(
    ([payload]) => [payload.chatId, payload.message]
  );
  expect(adminMessages).toHaveLength(2);
  expect(adminMessages[0][0]).toBe('123@c.us');
  expect(adminMessages[0][1]).toContain('Mulai cron dirrequest fetch sosmed');
  expect(adminMessages[1][1]).toContain('Tidak ada perubahan post, laporan tidak dikirim');
});
