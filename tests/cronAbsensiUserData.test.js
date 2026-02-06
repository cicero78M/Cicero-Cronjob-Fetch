import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetUsersMissing = jest.fn();
const mockGetClientsByRole = jest.fn();
const mockSendWAReport = jest.fn();
const mockFormatToWhatsAppId = jest.fn((no) => no);
const mockSafeSendMessage = jest.fn();
const mockGetAdminWAIds = jest.fn(() => ['ADMIN']);

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersMissingDataByClient: mockGetUsersMissing,
  getClientsByRole: mockGetClientsByRole,
}));
jest.unstable_mockModule('../src/service/waService.js', () => ({ default: {} }));
jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  formatToWhatsAppId: mockFormatToWhatsAppId,
  safeSendMessage: mockSafeSendMessage,
  sendWithClientFallback: jest.fn(),
  sendWAReport: mockSendWAReport,
  getAdminWAIds: mockGetAdminWAIds,
}));

let runCron;

beforeAll(async () => {
  ({ runCron } = await import('../src/cron/cronAbsensiUserData.js'));
});

describe('cronAbsensiUserData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('orders clients with DITBINMAS first and includes username with numbering', async () => {
    mockGetClientsByRole.mockResolvedValue(['org1', 'dir1']);
    mockQuery.mockResolvedValueOnce({
      rows: [
        { client_id: 'ORG1', nama: 'Org 1', client_operator: null, client_type: 'org' },
        { client_id: 'DIR1', nama: 'Dir 1', client_operator: null, client_type: 'direktorat' },
        { client_id: 'DITBINMAS', nama: 'DITBINMAS', client_operator: null, client_type: 'direktorat' },
      ],
    });
    mockGetUsersMissing.mockImplementation(async (cid) => {
      if (cid === 'DIR1') {
        return [{ nama: 'User D', user_id: 'UD1', insta: '', tiktok: '', whatsapp: '' }];
      }
      if (cid === 'ORG1') {
        return [{ nama: 'User O', user_id: 'UO1', insta: '', tiktok: '', whatsapp: '' }];
      }
      if (cid === 'DITBINMAS') {
        return [{ nama: 'User B', user_id: 'UB1', insta: '', tiktok: '', whatsapp: '' }];
      }
      return [];
    });

    await runCron();

    expect(mockSendWAReport).toHaveBeenCalledTimes(1);
    const message = mockSendWAReport.mock.calls[0][1];
    const ditIndex = message.indexOf('1. DITBINMAS');
    const dirIndex = message.indexOf('2. Dir 1');
    const orgIndex = message.indexOf('3. Org 1');
    expect(ditIndex).toBeGreaterThanOrEqual(0);
    expect(dirIndex).toBeGreaterThan(ditIndex);
    expect(orgIndex).toBeGreaterThan(dirIndex);
    expect(message).toContain('- User B (UB1): Belum Registrasi Whatsapp, Instagram Kosong, Tiktok Kosong');
    expect(message).toContain('- User D (UD1): Belum Registrasi Whatsapp, Instagram Kosong, Tiktok Kosong');
    expect(message).toContain('- User O (UO1): Belum Registrasi Whatsapp, Instagram Kosong, Tiktok Kosong');
  });
});
