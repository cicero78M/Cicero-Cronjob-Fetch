import { jest } from '@jest/globals';

const mockGetClientContactsById = jest.fn();

jest.unstable_mockModule('../src/repository/clientContactRepository.js', () => ({
  getClientContactsById: mockGetClientContactsById,
}));

jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  formatToWhatsAppId: (nohp) => `${nohp}@c.us`,
  getAdminWAIds: () => ['admin@c.us'],
}));

let buildClientRecipientSet;
let normalizeRecipient;

beforeAll(async () => {
  ({ buildClientRecipientSet, normalizeRecipient } = await import('../src/utils/recipientHelper.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('normalizeRecipient keeps group IDs and formats phone numbers', () => {
  expect(normalizeRecipient('120@g.us')).toBe('120@g.us');
  expect(normalizeRecipient('08123-456')).toBe('08123456@c.us');
  expect(normalizeRecipient('')).toBeNull();
  expect(normalizeRecipient(null)).toBeNull();
});

test('buildClientRecipientSet merges admin, super admin, operator, and group', async () => {
  mockGetClientContactsById.mockResolvedValue({
    clientSuper: ['0812-34'],
    clientOperator: ['62000'],
    clientGroup: ['120@g.us'],
  });

  const { recipients, hasClientRecipients } = await buildClientRecipientSet('DITBINMAS');

  expect(hasClientRecipients).toBe(true);
  expect(Array.from(recipients)).toEqual([
    'admin@c.us',
    '081234@c.us',
    '62000@c.us',
    '120@g.us',
  ]);
});

test('buildClientRecipientSet can target only group recipients', async () => {
  mockGetClientContactsById.mockResolvedValue({
    clientSuper: ['0812-34'],
    clientOperator: ['62000'],
    clientGroup: ['120@g.us'],
  });

  const { recipients, hasClientRecipients } = await buildClientRecipientSet('DITBINMAS', {
    includeAdmins: false,
    includeSuper: false,
    includeOperator: false,
    includeGroup: true,
  });

  expect(hasClientRecipients).toBe(true);
  expect(Array.from(recipients)).toEqual(['120@g.us']);
});
