import { jest } from '@jest/globals';

const mockUpdatePremiumStatus = jest.fn();

jest.unstable_mockModule('../src/model/userModel.js', () => ({
  findUserById: jest.fn(),
  updatePremiumStatus: mockUpdatePremiumStatus,
}));

let calculatePremiumEndDate;
let grantPremium;
let PREMIUM_ACCESS_DURATION_DAYS;

beforeAll(async () => {
  ({ calculatePremiumEndDate, grantPremium, PREMIUM_ACCESS_DURATION_DAYS } = await import(
    '../src/service/premiumService.js'
  ));
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('calculatePremiumEndDate returns a date advanced by the default duration', () => {
  const baseDate = new Date('2025-01-01T00:00:00Z');
  const result = calculatePremiumEndDate(baseDate);

  const expected = new Date('2025-01-31T00:00:00Z');
  expect(result.toISOString()).toBe(expected.toISOString());
  expect(PREMIUM_ACCESS_DURATION_DAYS).toBe(30);
});

test('grantPremium sets premium_end_date when none is provided', async () => {
  const baseNow = new Date('2025-02-10T12:00:00Z');
  jest.useFakeTimers().setSystemTime(baseNow);

  await grantPremium('user-1');

  expect(mockUpdatePremiumStatus).toHaveBeenCalledTimes(1);
  const [, , endDateArg] = mockUpdatePremiumStatus.mock.calls[0];
  expect(endDateArg.toISOString()).toBe(new Date('2025-03-12T12:00:00.000Z').toISOString());

  jest.useRealTimers();
});
