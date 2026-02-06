import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockExpireSubscription = jest.fn();
const mockSafeSendMessage = jest.fn();
const mockSendWithClientFallback = jest.fn();
const mockFormatToWhatsAppId = jest.fn((digits) => `${digits}@c.us`);

jest.unstable_mockModule('../src/repository/db.js', () => ({
  query: mockQuery,
}));

jest.unstable_mockModule('../src/service/dashboardSubscriptionService.js', () => ({
  expireSubscription: mockExpireSubscription,
}));

jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  safeSendMessage: mockSafeSendMessage,
  sendWithClientFallback: mockSendWithClientFallback,
  formatToWhatsAppId: mockFormatToWhatsAppId,
}));

jest.unstable_mockModule('../src/service/waService.js', () => ({
  default: {},
  waGatewayClient: {},
  waUserClient: {},
}));

let selectExpiredSubscriptions;
let processExpiredSubscriptions;

beforeAll(async () => {
  ({ selectExpiredSubscriptions, processExpiredSubscriptions } = await import(
    '../src/service/dashboardSubscriptionExpiryService.js'
  ));
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('selectExpiredSubscriptions returns only active rows past the reference date', () => {
  const now = new Date('2025-01-02T00:00:00Z');
  const rows = [
    { subscription_id: 'a', status: 'active', expires_at: '2025-01-01T23:59:59Z' },
    { subscription_id: 'b', status: 'active', expires_at: '2025-01-02T00:00:00Z' },
    { subscription_id: 'c', status: 'expired', expires_at: '2025-01-01T00:00:00Z' },
    { subscription_id: 'd', status: 'active', expires_at: '2025-01-03T00:00:00Z' },
    { subscription_id: 'e', status: 'active', expires_at: null },
    { subscription_id: 'f', status: 'active', expires_at: 'invalid-date' },
  ];

  const result = selectExpiredSubscriptions(rows, now);

  expect(result.map((r) => r.subscription_id)).toEqual(['a']);
});

test('processExpiredSubscriptions expires overdue entries and sends WhatsApp notifications', async () => {
  const now = new Date('2025-01-02T00:00:00Z');
  mockQuery.mockResolvedValue({
    rows: [
      {
        subscription_id: 'exp-1',
        dashboard_user_id: 'user-1',
        tier: 'pro',
        status: 'active',
        expires_at: '2025-01-01T00:00:00Z',
        whatsapp: '08123456789',
      },
      {
        subscription_id: 'active-1',
        dashboard_user_id: 'user-2',
        tier: 'basic',
        status: 'active',
        expires_at: '2025-01-03T00:00:00Z',
        whatsapp: '082233445566',
      },
    ],
  });
  mockExpireSubscription.mockResolvedValue({ subscription: { subscription_id: 'exp-1' } });
  mockSafeSendMessage.mockResolvedValue(true);
  mockSendWithClientFallback.mockResolvedValue(true);

  const result = await processExpiredSubscriptions(now);

  expect(result).toEqual({ checked: 2, expired: 1 });
  expect(mockExpireSubscription).toHaveBeenCalledTimes(1);
  expect(mockExpireSubscription).toHaveBeenCalledWith('exp-1', '2025-01-01T00:00:00Z');
  expect(mockSendWithClientFallback).toHaveBeenCalledTimes(1);
  expect(mockSendWithClientFallback).toHaveBeenCalledWith(
    expect.objectContaining({
      chatId: '08123456789@c.us',
      message: expect.any(String),
    })
  );
});
