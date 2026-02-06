import { jest } from '@jest/globals';

const sendDebug = jest.fn();
const safeSendMessage = jest.fn();
const sendWithClientFallback = jest.fn();
const runDirRequestAction = jest.fn();
const findClientById = jest.fn(async () => ({
  client_group: '120363025123456789@g.us',
  client_super: '08123456789',
  client_operator: '081987654321',
  client_status: true,
  client_type: 'direktorat',
}));
const splitRecipientField = jest.fn((value) => (value ? value.split(',') : []));
const normalizeGroupId = jest.fn((value) => value);
const runDirRequestFetchSosmed = jest.fn(async () => {});
const delayAfterSend = jest.fn(async () => {});
const minPhoneDigitLength = 8;
const normalizeUserWhatsAppId = (value, minLength = minPhoneDigitLength) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length < minLength) return null;
  const normalized = digits.startsWith('62') ? digits : `62${digits.replace(/^0/, '')}`;
  return `${normalized}@c.us`;
};

const originalExtraActions = process.env.DITSAMAPTA_EXTRA_ACTIONS;

afterAll(() => {
  process.env.DITSAMAPTA_EXTRA_ACTIONS = originalExtraActions;
});

beforeEach(() => {
  jest.resetModules();
  sendDebug.mockClear();
  safeSendMessage.mockClear();
  runDirRequestAction.mockClear();
  findClientById.mockClear();
  splitRecipientField.mockClear();
  normalizeGroupId.mockClear();
  runDirRequestFetchSosmed.mockClear();
  delayAfterSend.mockClear();
  process.env.DITSAMAPTA_EXTRA_ACTIONS = '';
});

async function loadModules() {
  jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
    sendDebug,
  }));

  jest.unstable_mockModule('../src/handler/menu/dirRequestHandlers.js', () => ({
    runDirRequestAction,
  }));

  jest.unstable_mockModule('../src/service/clientService.js', () => ({
    findClientById,
  }));

  jest.unstable_mockModule('../src/repository/clientContactRepository.js', () => ({
    splitRecipientField,
  }));

  jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
    safeSendMessage,
    sendWithClientFallback,
    getAdminWAIds: () => [],
    normalizeUserWhatsAppId,
    minPhoneDigitLength,
  }));

  jest.unstable_mockModule('../src/service/waService.js', () => ({
    default: {},
    waGatewayClient: {},
    waUserClient: {},
  }));

  jest.unstable_mockModule('../src/cron/cronDirRequestFetchSosmed.js', () => ({
    normalizeGroupId,
    runCron: runDirRequestFetchSosmed,
  }));

  jest.unstable_mockModule('../src/cron/dirRequestThrottle.js', () => ({
    delayAfterSend,
  }));

  const module = await import('../src/cron/cronDirRequestCustomSequence.js');
  return {
    runCron: module.runCron,
    runBidhumasMenuSequence: module.runBidhumasMenuSequence,
    runDitbinmasRecapAndCustomSequence: module.runDitbinmasRecapAndCustomSequence,
  };
}

test('runCron dispatches DITSAMAPTA menus including 28 and 29', async () => {
  const { runCron } = await loadModules();

  await runCron();

  expect(runDirRequestFetchSosmed).toHaveBeenCalled();

  const ditsamaptaActions = runDirRequestAction.mock.calls
    .filter(([args]) => args.clientId === 'DITSAMAPTA')
    .map(([args]) => args.action);

  expect(ditsamaptaActions).toEqual(expect.arrayContaining(['6', '9', '28', '29']));
});

test('runBidhumasMenuSequence includes recap menus 28 and 29', async () => {
  const { runBidhumasMenuSequence } = await loadModules();

  await runBidhumasMenuSequence();

  const bidhumasActions = runDirRequestAction.mock.calls
    .filter(([args]) => args.clientId === 'BIDHUMAS')
    .map(([args]) => args.action);

  expect(bidhumasActions).toEqual(expect.arrayContaining(['6', '9', '28', '29']));
});

test('runDitbinmasRecapAndCustomSequence sends Ditbinmas recap menus to super admin and operator', async () => {
  const { runDitbinmasRecapAndCustomSequence } = await loadModules();

  await runDitbinmasRecapAndCustomSequence(new Date('2024-06-03T13:30:00+07:00'));

  const ditbinmasRecapCalls = runDirRequestAction.mock.calls.filter(
    ([args]) =>
      args.clientId === 'DITBINMAS' && ['6', '9', '34', '35'].includes(String(args.action)),
  );

  expect(ditbinmasRecapCalls).toHaveLength(4);
  const recipients = new Set(ditbinmasRecapCalls.map(([args]) => args.chatId));
  expect(Array.from(recipients)).toEqual(['628123456789@c.us']);

  const operatorCalls = runDirRequestAction.mock.calls.filter(
    ([args]) => args.clientId === 'DITBINMAS' && String(args.action) === '30',
  );
  expect(operatorCalls).toHaveLength(1);
  expect(operatorCalls[0][0].chatId).toBe('6281987654321@c.us');

  expect(delayAfterSend).toHaveBeenCalledWith(10000);
});
