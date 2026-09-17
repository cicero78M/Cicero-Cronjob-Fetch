import { jest } from '@jest/globals';

jest.unstable_mockModule('../src/config/env.js', () => ({
  env: { HTTP_REQUEST_TIMEOUT_MS: 45000 },
}));

const { withAxiosTimeout, withFetchTimeout } = await import('../src/utils/httpTimeout.js');

test('withAxiosTimeout applies the bounded default and preserves an explicit timeout', () => {
  expect(withAxiosTimeout({ headers: { Accept: 'application/json' } })).toMatchObject({
    timeout: 45000,
    headers: { Accept: 'application/json' },
  });
  expect(withAxiosTimeout({ timeout: 1200 }).timeout).toBe(1200);
});

test('withFetchTimeout adds an abort signal and preserves a caller signal', () => {
  const bounded = withFetchTimeout({ method: 'GET' });
  expect(bounded.signal).toBeDefined();

  const controller = new AbortController();
  expect(withFetchTimeout({ signal: controller.signal }).signal).toBe(controller.signal);
});
