import { jest } from '@jest/globals';

const mockGetShortcodesTodayByClient = jest.fn();
const mockGetInstaPostsTodayByClient = jest.fn();
const mockGetLikesByShortcode = jest.fn();
const mockGetLatestLikeAuditByWindow = jest.fn();
const mockGetTiktokPostsToday = jest.fn();
const mockGetCommentsByVideoId = jest.fn();
const mockGetLatestCommentAuditByWindow = jest.fn();
const mockFindClientById = jest.fn();
const mockHandleFetchLikesInstagram = jest.fn();
const mockHandleFetchKomentarTiktokBatch = jest.fn();

jest.unstable_mockModule('../src/model/instaPostModel.js', () => ({
  getShortcodesTodayByClient: mockGetShortcodesTodayByClient,
  getPostsTodayByClient: mockGetInstaPostsTodayByClient,
}));
jest.unstable_mockModule('../src/model/instaLikeModel.js', () => ({
  getLikesByShortcode: mockGetLikesByShortcode,
  getLatestLikeAuditByWindow: mockGetLatestLikeAuditByWindow,
}));
jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({
  getPostsTodayByClient: mockGetTiktokPostsToday,
  findPostByVideoId: jest.fn(),
  deletePostByVideoId: jest.fn(),
}));
jest.unstable_mockModule('../src/model/tiktokCommentModel.js', () => ({
  getCommentsByVideoId: mockGetCommentsByVideoId,
  getLatestCommentAuditByWindow: mockGetLatestCommentAuditByWindow,
  deleteCommentsByVideoId: jest.fn(),
}));
jest.unstable_mockModule('../src/service/clientService.js', () => ({
  findClientById: mockFindClientById,
}));
jest.unstable_mockModule('../src/handler/fetchengagement/fetchLikesInstagram.js', () => ({
  handleFetchLikesInstagram: mockHandleFetchLikesInstagram,
}));
jest.unstable_mockModule('../src/handler/fetchengagement/fetchCommentTiktok.js', () => ({
  handleFetchKomentarTiktokBatch: mockHandleFetchKomentarTiktokBatch,
}));

let generateSosmedTaskMessage;
beforeAll(async () => {
  ({ generateSosmedTaskMessage } = await import('../src/handler/fetchabsensi/sosmedTask.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetLatestLikeAuditByWindow.mockResolvedValue([]);
  mockGetLatestCommentAuditByWindow.mockResolvedValue([]);
});

test('generateSosmedTaskMessage formats message correctly', async () => {
  mockFindClientById.mockResolvedValue({ nama: 'Dit Binmas', client_tiktok: '' });
  mockGetShortcodesTodayByClient.mockResolvedValue(['abc']);
  mockGetInstaPostsTodayByClient.mockResolvedValue([
    { shortcode: 'abc', created_at: '2024-01-01T07:30:00+07:00' },
  ]);
  mockGetLikesByShortcode.mockResolvedValue(['user-a', 'user-b']);
  mockGetTiktokPostsToday.mockResolvedValue([
    { video_id: '123', created_at: '2024-01-01T08:00:00+07:00' },
  ]);
  mockGetCommentsByVideoId.mockResolvedValue({ comments: ['@user'] });
  mockHandleFetchLikesInstagram.mockResolvedValue();
  mockHandleFetchKomentarTiktokBatch.mockResolvedValue();

  const { text, igCount, tiktokCount, state } = await generateSosmedTaskMessage();

  expect(mockFindClientById).toHaveBeenCalledWith('DITBINMAS');
  expect(text).toContain('Total likes semua konten: 2');
  expect(text).toContain('Total komentar semua konten: 1');
  expect(text).toContain('https://www.tiktok.com/video/123');
  expect(text).toContain('1. [BARU] https://www.instagram.com/p/abc (upload 07:30 WIB) : 2 likes');
  expect(text).toContain('1. [BARU] https://www.tiktok.com/video/123 (upload 08:00 WIB) : 1 komentar');
  expect(igCount).toBe(1);
  expect(tiktokCount).toBe(1);
  expect(state).toEqual({ igShortcodes: ['abc'], tiktokVideoIds: ['123'] });
  expect(mockHandleFetchLikesInstagram).toHaveBeenCalledWith(
    null,
    null,
    'DITBINMAS',
    expect.objectContaining({ snapshotWindow: undefined }),
  );
  expect(mockHandleFetchKomentarTiktokBatch).toHaveBeenCalledWith(
    null,
    null,
    'DITBINMAS',
    expect.objectContaining({ snapshotWindow: undefined }),
  );
});

test('generateSosmedTaskMessage can skip internal fetches', async () => {
  mockFindClientById.mockResolvedValue({ nama: 'Dit Binmas', client_tiktok: '' });
  mockGetShortcodesTodayByClient.mockResolvedValue([]);
  mockGetInstaPostsTodayByClient.mockResolvedValue([]);
  mockGetTiktokPostsToday.mockResolvedValue([]);
  mockHandleFetchLikesInstagram.mockResolvedValue();

  await generateSosmedTaskMessage('DITBINMAS', {
    skipTiktokFetch: true,
    skipLikesFetch: true,
  });

  expect(mockGetShortcodesTodayByClient).toHaveBeenCalledWith('DITBINMAS');
  expect(mockGetInstaPostsTodayByClient).toHaveBeenCalledWith('DITBINMAS');
  expect(mockGetTiktokPostsToday).toHaveBeenCalledWith('DITBINMAS');
  expect(mockHandleFetchKomentarTiktokBatch).not.toHaveBeenCalled();
  expect(mockHandleFetchLikesInstagram).not.toHaveBeenCalled();
});

test('generateSosmedTaskMessage preserves ordering from sources', async () => {
  mockFindClientById.mockResolvedValue({ nama: 'Unit', client_tiktok: '@operator' });
  mockGetShortcodesTodayByClient.mockResolvedValue(['latest', 'earlier']);
  mockGetInstaPostsTodayByClient.mockResolvedValue([
    { shortcode: 'latest', created_at: '2024-01-01T06:00:00+07:00' },
    { shortcode: 'earlier', created_at: '2024-01-01T05:00:00+07:00' },
  ]);
  mockGetLikesByShortcode
    .mockResolvedValueOnce(['u-latest'])
    .mockResolvedValueOnce(['u-earlier-1', 'u-earlier-2']);
  mockGetTiktokPostsToday.mockResolvedValue([
    { video_id: 'vid-b', created_at: '2024-01-01T09:00:00+07:00' },
    { video_id: 'vid-a', created_at: '2024-01-01T10:00:00+07:00' },
  ]);
  mockGetCommentsByVideoId
    .mockResolvedValueOnce({ comments: ['@vid-b-1', '@vid-b-2'] })
    .mockResolvedValueOnce({ comments: ['@vid-a'] });

  const { text } = await generateSosmedTaskMessage('CLIENT', {
    skipLikesFetch: true,
    skipTiktokFetch: true,
    previousState: {
      igShortcodes: ['latest'],
      tiktokVideoIds: ['vid-b'],
    },
  });

  const igFirst = text.indexOf('https://www.instagram.com/p/latest');
  const igSecond = text.indexOf('https://www.instagram.com/p/earlier');
  expect(igFirst).toBeGreaterThan(-1);
  expect(igSecond).toBeGreaterThan(-1);
  expect(igFirst).toBeLessThan(igSecond);

  const ttFirst = text.indexOf('/@operator/video/vid-b');
  const ttSecond = text.indexOf('/@operator/video/vid-a');
  expect(ttFirst).toBeGreaterThan(-1);
  expect(ttSecond).toBeGreaterThan(-1);
  expect(ttFirst).toBeLessThan(ttSecond);

  expect(text).toContain('1. https://www.instagram.com/p/latest');
  expect(text).toContain('2. [BARU] https://www.instagram.com/p/earlier');
  expect(text).toContain('1. https://www.tiktok.com/@operator/video/vid-b');
  expect(text).toContain('2. [BARU] https://www.tiktok.com/@operator/video/vid-a');
});

test('generateSosmedTaskMessage labels new content against previous state', async () => {
  mockFindClientById.mockResolvedValue({ nama: 'Unit', client_tiktok: '@operator' });
  mockGetShortcodesTodayByClient.mockResolvedValue(['alpha', 'beta']);
  mockGetInstaPostsTodayByClient.mockResolvedValue([
    { shortcode: 'alpha', created_at: '2024-01-01T06:00:00+07:00' },
    { shortcode: 'beta', created_at: '2024-01-01T07:00:00+07:00' },
  ]);
  mockGetLikesByShortcode
    .mockResolvedValueOnce(['alpha-like'])
    .mockResolvedValueOnce(['beta-1', 'beta-2']);
  mockGetTiktokPostsToday.mockResolvedValue([
    { video_id: '111', created_at: '2024-01-01T08:00:00+07:00' },
    { video_id: '222', created_at: '2024-01-01T09:00:00+07:00' },
  ]);
  mockGetCommentsByVideoId
    .mockResolvedValueOnce({ comments: ['@existing'] })
    .mockResolvedValueOnce({ comments: ['@beta-1', '@beta-2'] });

  const { text } = await generateSosmedTaskMessage('CLIENT', {
    skipLikesFetch: true,
    skipTiktokFetch: true,
    previousState: {
      igShortcodes: ['alpha'],
      tiktokVideoIds: ['111'],
    },
  });

  expect(text).toContain('1. https://www.instagram.com/p/alpha');
  expect(text).toContain('2. [BARU] https://www.instagram.com/p/beta');
  expect(text).toContain('1. https://www.tiktok.com/@operator/video/111');
  expect(text).toContain('2. [BARU] https://www.tiktok.com/@operator/video/222');
});

test('generateSosmedTaskMessage prefers audit data and labels window when provided', async () => {
  const snapshotStart = new Date('2024-01-01T00:00:00+07:00');
  const snapshotEnd = new Date('2024-01-01T00:30:00+07:00');
  mockFindClientById.mockResolvedValue({ nama: 'Unit', client_tiktok: '' });
  mockGetShortcodesTodayByClient.mockResolvedValue(['windowed']);
  mockGetInstaPostsTodayByClient.mockResolvedValue([
    { shortcode: 'windowed', created_at: '2024-01-01T06:00:00+07:00' },
  ]);
  mockGetLatestLikeAuditByWindow.mockResolvedValue([
    { shortcode: 'windowed', usernames: ['audit_user'] },
  ]);
  mockGetLikesByShortcode.mockResolvedValue(['fallback_like']);
  mockGetTiktokPostsToday.mockResolvedValue([
    { video_id: 'vid-window', created_at: '2024-01-01T07:00:00+07:00' },
  ]);
  mockGetLatestCommentAuditByWindow.mockResolvedValue([
    { video_id: 'vid-window', usernames: ['@audit'] },
  ]);
  mockGetCommentsByVideoId.mockResolvedValue({ comments: ['@fallback'] });

  const { text } = await generateSosmedTaskMessage('CLIENT', {
    skipLikesFetch: true,
    skipTiktokFetch: true,
    snapshotWindowStart: snapshotStart,
    snapshotWindowEnd: snapshotEnd,
  });

  expect(text).toContain('Total likes semua konten: 1');
  expect(text).toContain('Total komentar semua konten: 1');
  expect(text).toContain('Data rentang 00:00–00:30 WIB');
  expect(mockGetLikesByShortcode).not.toHaveBeenCalled();
  expect(mockGetCommentsByVideoId).not.toHaveBeenCalled();
});
