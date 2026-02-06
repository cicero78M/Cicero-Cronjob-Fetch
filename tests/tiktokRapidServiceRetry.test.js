import { jest } from '@jest/globals';

const mockAxiosGet = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: { get: mockAxiosGet }
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || 'test-key';

let fetchTiktokCommentsPage;

beforeAll(async () => {
  ({ fetchTiktokCommentsPage } = await import('../src/service/tiktokRapidService.js'));
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
