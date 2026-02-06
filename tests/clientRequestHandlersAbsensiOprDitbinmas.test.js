import { jest } from '@jest/globals';

const mockAbsensiLoginWeb = jest.fn();
const mockSafeSendMessage = jest.fn();

jest.unstable_mockModule('../src/handler/fetchabsensi/dashboard/absensiLoginWeb.js', () => ({
  absensiLoginWeb: mockAbsensiLoginWeb,
}));

jest.unstable_mockModule('../src/db/index.js', () => ({ query: jest.fn() }));
jest.unstable_mockModule('../src/service/linkReportExcelService.js', () => ({
  saveLinkReportExcel: jest.fn(),
}));
jest.unstable_mockModule('../src/service/googleContactsService.js', () => ({
  saveContactIfNew: jest.fn(),
  authorize: jest.fn(),
  saveGoogleContact: jest.fn(),
  searchByNumbers: jest.fn(),
}));
jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  getAdminWANumbers: jest.fn(),
  getAdminWAIds: jest.fn(),
  sendWAFile: jest.fn(),
  formatToWhatsAppId: jest.fn(),
  safeSendMessage: mockSafeSendMessage,
  sendWithClientFallback: jest.fn(),
  isAdminWhatsApp: jest.fn(),
  formatClientData: jest.fn(),
  isUnsupportedVersionError: jest.fn(),
  sendWAReport: jest.fn(),
}));
jest.unstable_mockModule('../src/model/linkReportModel.js', () => ({
  hasRecentLinkReport: jest.fn(),
  createLinkReport: jest.fn(),
  getLinkReports: jest.fn(),
  findLinkReportByShortcode: jest.fn(),
  updateLinkReport: jest.fn(),
  deleteLinkReport: jest.fn(),
  getReportsTodayByClient: jest.fn(),
  getReportsYesterdayByClient: jest.fn(),
  getReportsTodayByShortcode: jest.fn(),
  getRekapLinkByClient: jest.fn(),
  getReportsThisMonthByClient: jest.fn(),
  getReportsPrevMonthByClient: jest.fn(),
}));
jest.unstable_mockModule('../src/handler/fetchengagement/fetchLikesInstagram.js', () => ({
  handleFetchLikesInstagram: jest.fn(),
}));
jest.unstable_mockModule('../src/handler/fetchabsensi/tiktok/absensiKomentarTiktok.js', () => ({
  absensiKomentar: jest.fn(),
  absensiKomentarTiktokPerKonten: jest.fn(),
  absensiKomentarDitbinmasReport: jest.fn(),
}));

process.env.JWT_SECRET = 'test';

let clientRequestHandlers;
beforeAll(async () => {
  ({ clientRequestHandlers } = await import('../src/handler/menu/clientRequestHandlers.js'));
});

test('absensiLoginWebDitbinmas sends report and resets step', async () => {
  mockAbsensiLoginWeb.mockResolvedValue('msg');
  const session = {};
  const chatId = '123';
  const waClient = { sendMessage: jest.fn() };

  await clientRequestHandlers.absensiLoginWebDitbinmas(session, chatId, '', waClient);

  expect(mockAbsensiLoginWeb).toHaveBeenCalledWith({ mode: 'bulanan' });
  expect(waClient.sendMessage).toHaveBeenCalledWith(chatId, 'msg');
  expect(session.step).toBe('main');
});
