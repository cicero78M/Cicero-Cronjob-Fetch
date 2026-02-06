import { jest } from '@jest/globals';

process.env.TZ = 'Asia/Jakarta';

const mockQuery = jest.fn();
const mockFetchAllInstagramLikes = jest.fn();
const mockGetAllExceptionUsers = jest.fn();
const mockSendDebug = jest.fn();
const mockSaveLikeSnapshotAudit = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/service/instagramApi.js', () => ({
  fetchAllInstagramLikes: mockFetchAllInstagramLikes,
}));
jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getAllExceptionUsers: mockGetAllExceptionUsers,
}));
jest.unstable_mockModule('../src/model/instaLikeModel.js', () => ({
  saveLikeSnapshotAudit: mockSaveLikeSnapshotAudit,
}));
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
  sendDebug: mockSendDebug,
}));

let handleFetchLikesInstagram;

beforeAll(async () => {
  ({ handleFetchLikesInstagram } = await import('../src/handler/fetchengagement/fetchLikesInstagram.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSaveLikeSnapshotAudit.mockResolvedValue(1);
});

test('adds missing exception usernames to likes result', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ shortcode: 'sc1' }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValue({});

  mockFetchAllInstagramLikes.mockResolvedValueOnce(['user1']);
  mockGetAllExceptionUsers.mockResolvedValueOnce([{ insta: '@user2' }]);

  await handleFetchLikesInstagram(null, null, 'clientA');

  const upsertCall = mockQuery.mock.calls.find((call) =>
    call[0].includes('INSERT INTO insta_like'),
  );
  const likesJson = upsertCall[1][1];
  const likes = JSON.parse(likesJson);
  expect(likes).toEqual(expect.arrayContaining(['user1', 'user2']));
});
