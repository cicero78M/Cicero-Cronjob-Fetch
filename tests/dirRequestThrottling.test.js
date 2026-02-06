import { jest } from '@jest/globals';
import { MESSAGE_THROTTLE_MS } from '../src/cron/dirRequestThrottle.js';

const sendDebug = jest.fn();
const safeSendMessage = jest.fn();
const runDirRequestAction = jest.fn(() => Promise.resolve());
const findClientById = jest.fn();
const splitRecipientField = jest.fn((value) => (value ? value.split(',') : []));
const normalizeGroupId = jest.fn((value) => value);
const minPhoneDigitLength = 8;
const normalizeUserWhatsAppId = (value, minLength = minPhoneDigitLength) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length < minLength) return null;
  const normalized = digits.startsWith('62') ? digits : `62${digits.replace(/^0/, '')}`;
  return `${normalized}@c.us`;
};

const waGatewayClient = { on: jest.fn(), waitForWaReady: jest.fn(() => Promise.resolve()) };
const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function mockCommonModules({ adminIds = [] } = {}) {
  jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({ sendDebug }));
  jest.unstable_mockModule('../src/handler/menu/dirRequestHandlers.js', () => ({ runDirRequestAction }));
  jest.unstable_mockModule('../src/service/clientService.js', () => ({ findClientById }));
  jest.unstable_mockModule('../src/repository/clientContactRepository.js', () => ({ splitRecipientField }));
  jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
    safeSendMessage,
    sendWithClientFallback: jest.fn(),
    getAdminWAIds: () => adminIds,
    normalizeUserWhatsAppId,
    minPhoneDigitLength,
  }));
  jest.unstable_mockModule('../src/service/waService.js', () => ({
    default: {},
    waGatewayClient,
    waUserClient: {},
  }));
  jest.unstable_mockModule('../src/cron/cronDirRequestFetchSosmed.js', () => ({
    runCron: jest.fn(),
    normalizeGroupId,
  }));
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.resetModules();
  sendDebug.mockClear();
  safeSendMessage.mockClear();
  runDirRequestAction.mockClear();
  findClientById.mockReset();
  splitRecipientField.mockClear();
  normalizeGroupId.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

const advanceAndFlush = async (ms = MESSAGE_THROTTLE_MS) => {
  await jest.advanceTimersByTimeAsync(ms);
};

test('BIDHUMAS evening cron throttles messages between actions', async () => {
  mockCommonModules();

  findClientById.mockResolvedValue({
    client_group: '120363000000000000@g.us',
    client_super: '0812,0813',
  });

  const { runCron: runBidhumasEvening } = await import('../src/cron/cronDirRequestBidhumasEvening.js');

  const cronPromise = runBidhumasEvening();
  await flushMicrotasks();

  expect(runDirRequestAction).toHaveBeenCalledTimes(1);

  const expectedCalls = 12;
  for (let i = 2; i <= expectedCalls; i += 1) {
    await advanceAndFlush();
    expect(runDirRequestAction).toHaveBeenCalledTimes(i);
  }

  await cronPromise;
});

test('Ditbinmas recap sequence applies throttling across multi-action recipients', async () => {
  mockCommonModules();

  findClientById.mockResolvedValue({
    client_group: '120363111111111111@g.us',
    client_super: '0812',
    client_operator: '0814',
  });

  const { runDitbinmasRecapSequence } = await import('../src/cron/cronDirRequestCustomSequence.js');

  const recapPromise = runDitbinmasRecapSequence(new Date('2024-06-03T13:30:00+07:00'));
  await flushMicrotasks();

  expect(runDirRequestAction).toHaveBeenCalledTimes(1);

  const expectedCalls = 5;
  for (let i = 2; i <= expectedCalls; i += 1) {
    await advanceAndFlush();
    expect(runDirRequestAction).toHaveBeenCalledTimes(i);
  }

  await recapPromise;
});
