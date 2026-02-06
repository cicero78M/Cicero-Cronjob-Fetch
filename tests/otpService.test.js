import { jest } from '@jest/globals';

const store = new Map();
const mockRedis = {
  set: jest.fn(async (key, value, opts) => {
    const expiresAt = opts?.EX ? Date.now() + opts.EX * 1000 : null;
    store.set(key, { value, expiresAt });
  }),
  get: jest.fn(async (key) => {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      store.delete(key);
      return null;
    }
    return entry.value;
  }),
  del: jest.fn(async (key) => {
    store.delete(key);
  }),
  ttl: jest.fn(async () => 300),
};

jest.unstable_mockModule('../src/config/redis.js', () => ({
  default: mockRedis,
}));

const {
  generateOtp,
  verifyOtp,
  isVerified,
  clearVerification,
  refreshVerification,
} = await import('../src/service/otpService.js');

describe('otpService', () => {
  beforeEach(() => {
    store.clear();
    jest.clearAllMocks();
  });

  test('generateOtp and verifyOtp flow', async () => {
    const otp = await generateOtp('u1', 'user@example.com');
    expect(otp).toHaveLength(6);
    expect(await verifyOtp('u1', 'user@example.com', '000000')).toBe(false);
    expect(await verifyOtp('u1', 'user@example.com', otp)).toBe(true);
    expect(await isVerified('u1', 'user@example.com')).toBe(true);
    await clearVerification('u1');
    expect(await isVerified('u1', 'user@example.com')).toBe(false);
  });

  test('refreshVerification keeps verification alive', async () => {
    await refreshVerification('u1', 'user@example.com');
    const first = store.get('verified:1');
    expect(first).toBeDefined();
    expect(first.value).toBe('user@example.com');
    const shortenedExpiry = Date.now() + 1000;
    store.set('verified:1', {
      value: first.value,
      expiresAt: shortenedExpiry,
    });
    await refreshVerification('u1');
    const refreshed = store.get('verified:1');
    expect(refreshed?.value).toBe('user@example.com');
    expect(refreshed?.expiresAt).toBeGreaterThan(shortenedExpiry);
  });

  test('nrp handled consistently for strings and numbers', async () => {
    const otp = await generateOtp(1, 'user@example.com');
    expect(await verifyOtp('1', 'user@example.com', otp)).toBe(true);
    expect(await isVerified(1, 'user@example.com')).toBe(true);
    await clearVerification('1');
  });

  test('blocks after max attempts', async () => {
    const otp = await generateOtp('2', 'user2@example.com');
    for (let i = 0; i < 3; i++) {
      const res = await verifyOtp('2', 'user2@example.com', '000000');
      expect(res).toBe(false);
    }
    const blocked = await verifyOtp('2', 'user2@example.com', otp);
    expect(blocked).toBe(false);
  });
});
