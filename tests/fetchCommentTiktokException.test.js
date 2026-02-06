import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockFetchAll = jest.fn();
const mockSendDebug = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/service/tiktokApi.js', () => ({ fetchAllTiktokComments: mockFetchAll }));
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({ sendDebug: mockSendDebug }));

let handleFetchKomentarTiktokBatch;
beforeAll(async () => {
  ({ handleFetchKomentarTiktokBatch } = await import('../src/handler/fetchengagement/fetchCommentTiktok.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('exception users are included in comment upsert', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ video_id: 'vid1' }] })
    .mockResolvedValueOnce({ rows: [{ tiktok: '@exc1' }, { tiktok: 'exc2' }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] });
  mockFetchAll.mockResolvedValueOnce([]);

  await handleFetchKomentarTiktokBatch(null, null, 'POLRES1');

  const upsertCall = mockQuery.mock.calls[3];
  const saved = JSON.parse(upsertCall[1][1]);
  expect(saved).toEqual(expect.arrayContaining(['@exc1', '@exc2']));
});

test('handler retries fetching comments before failing', async () => {
  const networkError = new Error('network down');
  mockQuery
    .mockResolvedValueOnce({ rows: [{ video_id: 'vid2' }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] });
  mockFetchAll
    .mockRejectedValueOnce(networkError)
    .mockResolvedValueOnce([]);

  jest.useFakeTimers();
  const promise = handleFetchKomentarTiktokBatch(null, null, 'POLRES2');

  await jest.advanceTimersByTimeAsync(6000);
  await promise;
  jest.useRealTimers();

  expect(mockFetchAll).toHaveBeenCalledTimes(2);
  expect(mockSendDebug).toHaveBeenCalledWith(expect.objectContaining({ tag: 'TTK COMMENT RETRY' }));
});
