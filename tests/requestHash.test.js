import { createRequestHash } from '../src/utils/requestHash.js';

describe('createRequestHash', () => {
  test('produces consistent hash for same input', () => {
    const req1 = { method: 'POST', originalUrl: '/api', body: { a: 1 } };
    const hash1 = createRequestHash(req1, 'user');
    const hash2 = createRequestHash(req1, 'user');
    expect(hash1).toBe(hash2);
  });
});
