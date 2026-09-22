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
  mockQuery.mockResolvedValue({ rows: [] });
});

test('exception users are included in comment upsert', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ client_type: 'org' }] })
    .mockResolvedValueOnce({ rows: [{ video_id: 'vid1' }] })
    .mockResolvedValueOnce({ rows: [{ tiktok: '@exc1', eligibility_reason: 'eligible' }, { tiktok: 'exc2', eligibility_reason: 'eligible' }] })
    .mockResolvedValueOnce({ rows: [] });
  mockFetchAll.mockResolvedValueOnce([]);

  await handleFetchKomentarTiktokBatch(null, null, 'POLRES1');
  const upsertCall = mockQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO tiktok_comment'));
  const saved = JSON.parse(upsertCall[1][1]);
  expect(saved).toEqual(expect.arrayContaining(['@exc1', '@exc2']));
});

test('handler retries fetching comments before failing', async () => {
  const networkError = new Error('network down');
  mockQuery
    .mockResolvedValueOnce({ rows: [{ client_type: 'org' }] })
    .mockResolvedValueOnce({ rows: [{ video_id: 'vid2' }] })
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

test('handler includes usernames from nested replies and deduplicates before upsert', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ client_type: 'org' }] })
    .mockResolvedValueOnce({ rows: [{ video_id: 'vid3' }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] });

  mockFetchAll.mockResolvedValueOnce([
    {
      user: { unique_id: 'ParentA' },
      reply_comment: {
        user: { uniqueId: 'ReplyA' },
        reply_comments: [{ user: { unique_id: 'ParentA' } }],
      },
    },
  ]);

  await handleFetchKomentarTiktokBatch(null, null, 'POLRES3');

  const upsertCall = mockQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO tiktok_comment'));
  const saved = JSON.parse(upsertCall[1][1]);
  expect(saved).toEqual(expect.arrayContaining(['@parenta', '@replya']));
  expect(saved.filter((uname) => uname === '@parenta')).toHaveLength(1);
});


test('query pengambilan video tidak memfilter source_type', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ client_type: 'org' }] })
    .mockResolvedValueOnce({ rows: [{ video_id: 'vid4' }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] });
  mockFetchAll.mockResolvedValueOnce([]);

  await handleFetchKomentarTiktokBatch(null, null, 'POLRES4');

  const [firstSql] = mockQuery.mock.calls[0];
  expect(firstSql.toLowerCase()).not.toContain('source_type');
});

test('special user adds username to remaining TikTok tasks before 18:00 after one real task', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ client_type: 'org' }] })
    .mockResolvedValueOnce({ rows: [{ video_id: 'vid-a' }, { video_id: 'vid-b' }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{
      user_id: '77030046',
      client_id: 'POLRES1',
      effective_tiktok: '@specialuser',
      effective_insta: '@specialig',
    }] });
  mockFetchAll
    .mockResolvedValueOnce([{ user: { unique_id: 'specialuser' } }])
    .mockResolvedValueOnce([]);

  await handleFetchKomentarTiktokBatch(null, null, 'POLRES1', {
    policyReferenceDate: '2026-09-22T10:00:00.000Z',
  });
  const upserts = mockQuery.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO tiktok_comment ('));
  expect(upserts).toHaveLength(2);
  expect(JSON.parse(upserts[0][1][1])).toContain('@specialuser');
  expect(JSON.parse(upserts[1][1][1])).toContain('@specialuser');
});

test('special user adds username after 18:00 when Instagram is complete', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ client_type: 'org' }] })
    .mockResolvedValueOnce({ rows: [{ video_id: 'vid-c' }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{
      user_id: '77030046',
      client_id: 'POLRES1',
      effective_tiktok: '@specialuser',
      effective_insta: '@specialig',
    }] })
    .mockResolvedValueOnce({ rows: [{ total_posts: '1', liked_posts: '1' }] });
  mockFetchAll.mockResolvedValueOnce([]);

  await handleFetchKomentarTiktokBatch(null, null, 'POLRES1', {
    policyReferenceDate: '2026-09-22T11:00:00.000Z',
  });

  const upsert = mockQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO tiktok_comment ('));
  expect(JSON.parse(upsert[1][1])).toContain('@specialuser');
});
