import { jest } from '@jest/globals';

const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
};
const errorSink = jest.fn();
console.error = errorSink;

const { isLibsignalDecryptNoise } = await import('../src/utils/logger.js');

afterAll(() => {
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
});

test('recognizes only verbose libsignal future-counter errors', () => {
  expect(
    isLibsignalDecryptNoise(['Failed to decrypt message with any known session...'])
  ).toBe(true);
  expect(
    isLibsignalDecryptNoise([
      'Session error:SessionError: Over 2000 messages into the future!',
      'stack',
    ])
  ).toBe(true);
  expect(isLibsignalDecryptNoise(['sendMessage failed: connection closed'])).toBe(false);
  expect(isLibsignalDecryptNoise(['Bad MAC'])).toBe(false);
});

test('collapses verbose libsignal output into one concise summary', () => {
  errorSink.mockClear();

  console.error('Failed to decrypt message with any known session...');
  console.error(
    'Session error:SessionError: Over 2000 messages into the future!',
    'verbose stack'
  );

  const signalSummaries = errorSink.mock.calls.filter((call) =>
    call.some((part) => String(part).includes('[BAILEYS][SIGNAL]'))
  );
  expect(signalSummaries).toHaveLength(1);
  expect(signalSummaries[0].join(' ')).not.toContain('verbose stack');

});
