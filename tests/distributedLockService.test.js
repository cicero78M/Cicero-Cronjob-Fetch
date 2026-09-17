import { jest } from '@jest/globals';

const mockSet = jest.fn();
const mockEval = jest.fn();

jest.unstable_mockModule('../src/config/redis.js', () => ({
  default: { set: mockSet, eval: mockEval },
}));

const { acquireDistributedLock } = await import('../src/service/distributedLockService.js');

beforeEach(() => {
  mockSet.mockReset();
  mockEval.mockReset();
});

test('renews and releases only the lock owned by the caller', async () => {
  mockSet.mockResolvedValue('OK');
  mockEval.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

  const lock = await acquireDistributedLock({ key: 'test-lock', ttlSeconds: 30, ownerId: 'owner-a' });

  expect(lock.acquired).toBe(true);
  await expect(lock.extend()).resolves.toBe(true);
  await lock.release();
  expect(mockEval).toHaveBeenCalledTimes(2);
});

test('reports a lost lease when Redis rejects the owner token', async () => {
  mockSet.mockResolvedValue('OK');
  mockEval.mockResolvedValue(0);

  const lock = await acquireDistributedLock({ key: 'test-lock', ttlSeconds: 30, ownerId: 'owner-a' });

  await expect(lock.extend()).resolves.toBe(false);
});
