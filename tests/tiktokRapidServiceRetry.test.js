import { jest } from '@jest/globals';

const mockAxiosGet = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: { get: mockAxiosGet }
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || 'test-key';

let fetchTiktokCommentsPage;
let fetchAllTiktokComments;
let fetchTiktokPosts;

beforeAll(async () => {
  ({ fetchTiktokCommentsPage, fetchAllTiktokComments, fetchTiktokPosts } = await import(
    '../src/service/tiktokRapidService.js'
  ));
});

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

test('fetchTiktokCommentsPage retries when the first attempt fails', async () => {
  const networkError = new Error('timeout');
  networkError.code = 'ETIMEDOUT';
  mockAxiosGet
    .mockRejectedValueOnce(networkError)
    .mockResolvedValueOnce({ data: { data: { comments: [{ text: 'ok' }], total: 1 } } });

  jest.useFakeTimers();
  const promise = fetchTiktokCommentsPage('video123');

  await jest.advanceTimersByTimeAsync(1000);
  const result = await promise;

  expect(mockAxiosGet).toHaveBeenCalledTimes(2);
  expect(result.comments).toEqual([{ text: 'ok' }]);
  expect(result.next_cursor).toBeNull();
});

test('fetchTiktokPosts resolves secUid and keeps the primary flow on RapidAPI', async () => {
  mockAxiosGet
    .mockResolvedValueOnce({
      data: { userInfo: { user: { secUid: 'resolved-secuid' } } }
    })
    .mockResolvedValueOnce({
      data: { itemList: [{ id: 'video-1', desc: 'post' }] }
    });

  const result = await fetchTiktokPosts('@account', 1);

  expect(result).toHaveLength(1);
  expect(mockAxiosGet).toHaveBeenCalledTimes(2);
  expect(mockAxiosGet.mock.calls[0][0]).toBe(
    'https://tiktok-api23.p.rapidapi.com/api/user/info'
  );
  expect(mockAxiosGet.mock.calls[1][0]).toBe(
    'https://tiktok-api23.p.rapidapi.com/api/user/posts'
  );
  expect(mockAxiosGet.mock.calls[1][1]).toEqual(
    expect.objectContaining({
      params: expect.objectContaining({ secUid: 'resolved-secuid' }),
      headers: expect.objectContaining({
        'X-RapidAPI-Host': 'tiktok-api23.p.rapidapi.com'
      })
    })
  );
});

test('fetchAllTiktokComments fetches replies through the web endpoint', async () => {
  mockAxiosGet
    .mockResolvedValueOnce({
      data: {
        data: {
          comments: [
            {
              cid: 'comment-1',
              reply_comment_total: 1,
              reply_comment: [],
            },
          ],
          total: 1,
        },
      },
    })
    .mockResolvedValueOnce({
      data: {
        comments: [{ cid: 'reply-1', text: 'reply' }],
        has_more: false,
      },
    });

  const result = await fetchAllTiktokComments('video-1');

  expect(result[0].reply_comment).toEqual([
    { cid: 'reply-1', text: 'reply' },
  ]);
  expect(mockAxiosGet).toHaveBeenCalledTimes(2);
  expect(mockAxiosGet.mock.calls[1][0]).toBe(
    'https://www.tiktok.com/api/comment/list/reply/'
  );
});

test('reply fetch retries transient web errors', async () => {
  const timeoutError = new Error('timeout');
  timeoutError.code = 'ETIMEDOUT';

  mockAxiosGet
    .mockResolvedValueOnce({
      data: {
        data: {
          comments: [
            {
              cid: 'comment-1',
              reply_comment_total: 1,
              reply_comment: [],
            },
          ],
          total: 1,
        },
      },
    })
    .mockRejectedValueOnce(timeoutError)
    .mockResolvedValueOnce({
      data: {
        comments: [{ cid: 'reply-1' }],
        has_more: false,
      },
    });

  jest.useFakeTimers();
  const promise = fetchAllTiktokComments('video-1');
  await jest.advanceTimersByTimeAsync(1000);
  const result = await promise;

  expect(result[0].reply_comment).toEqual([{ cid: 'reply-1' }]);
  expect(mockAxiosGet).toHaveBeenCalledTimes(3);
});
