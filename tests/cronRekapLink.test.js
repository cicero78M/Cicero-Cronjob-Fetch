import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockAbsensiLink = jest.fn();
const mockSendMessage = jest.fn();
const mockSendDebug = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/handler/fetchabsensi/link/absensiLinkAmplifikasi.js', () => ({
  absensiLink: mockAbsensiLink,
}));
jest.unstable_mockModule('../src/service/waService.js', () => ({
  default: { sendMessage: mockSendMessage },
}));
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
  sendDebug: mockSendDebug,
}));

let getActiveClients, runCron;

beforeAll(async () => {
  ({ getActiveClients, runCron } = await import('../src/cron/cronRekapLink.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ADMIN_WHATSAPP = '';
});

test('getActiveClients filters org clients', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });

  await getActiveClients();

  expect(mockQuery).toHaveBeenCalledTimes(1);
  expect(mockQuery.mock.calls[0][0]).toMatch(/LOWER\(client_type\)='org'/i);
});

test('runCron passes operator role to absensiLink', async () => {
  mockQuery.mockResolvedValueOnce({
    rows: [
      {
        client_id: 'ORG1',
        nama: 'Org 1',
        client_operator: '123',
        client_super: null,
        client_group: null,
      },
    ],
  });
  mockAbsensiLink.mockResolvedValueOnce('report');

  await runCron();

  expect(mockAbsensiLink).toHaveBeenCalledWith('ORG1', { roleFlag: 'operator' });
  expect(mockSendMessage).toHaveBeenCalledWith('123@c.us', 'report');
});
