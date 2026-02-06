import { jest } from '@jest/globals';

const mockAbsensiRegistrasiDashboardDirektorat = jest.fn();
const mockSafeSendMessage = jest.fn();
const mockFormatNama = jest.fn();
const mockNormalizeUserId = jest.fn();
const mockGetGreeting = jest.fn();
const mockFormatToWhatsAppId = jest.fn();
const mockFormatUserData = jest.fn();
const mockFormatComplaintIssue = jest.fn();
const mockFetchInstagramInfo = jest.fn();
const mockFetchInstagramPosts = jest.fn();
const mockFetchInstagramProfile = jest.fn();
const mockFetchTiktokProfile = jest.fn();
const mockFetchTiktokPosts = jest.fn();
const mockFetchTiktokPostsBySecUid = jest.fn();
const mockFetchTiktokInfo = jest.fn();
const mockFetchTiktokPostDetail = jest.fn();
const mockFetchTiktokCommentsPage = jest.fn();
const mockFetchAllTiktokComments = jest.fn();
const mockHasUserLikedBetween = jest.fn();
const mockHasUserCommentedBetween = jest.fn();
const mockSendComplaintEmail = jest.fn();
const mockNormalizeEmail = jest.fn();

jest.unstable_mockModule('../src/handler/fetchabsensi/dashboard/absensiRegistrasiDashboardDirektorat.js', () => ({
  absensiRegistrasiDashboardDirektorat: mockAbsensiRegistrasiDashboardDirektorat,
}));

jest.unstable_mockModule('../src/utils/utilsHelper.js', () => ({
  formatClientInfo: jest.fn(),
  groupByDivision: jest.fn(),
  sortDivisionKeys: jest.fn(),
  sortTitleKeys: jest.fn(),
  normalizeKomentarArr: jest.fn(),
  extractInstagramShortcode: jest.fn(),
  formatNama: mockFormatNama,
  normalizeUserId: mockNormalizeUserId,
  normalizeEmail: mockNormalizeEmail,
  getGreeting: mockGetGreeting,
  formatUserData: mockFormatUserData,
  formatComplaintIssue: mockFormatComplaintIssue,
}));

jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  getAdminWANumbers: jest.fn(),
  getAdminWAIds: jest.fn(),
  sendWAFile: jest.fn(),
  formatToWhatsAppId: mockFormatToWhatsAppId,
  safeSendMessage: mockSafeSendMessage,
  sendWithClientFallback: jest.fn(),
  isAdminWhatsApp: jest.fn(),
  formatClientData: jest.fn(),
  isUnsupportedVersionError: jest.fn(),
  sendWAReport: jest.fn(),
}));

jest.unstable_mockModule('../src/service/waService.js', () => ({
  default: {},
  waGatewayClient: {},
  waUserClient: {},
  waitForWaReady: jest.fn(),
}));

jest.unstable_mockModule('../src/service/emailService.js', () => ({
  sendComplaintEmail: mockSendComplaintEmail,
  sendOtpEmail: jest.fn(),
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
  extractUsernamesFromComments: jest.fn(),
  normalizeUsername: jest.fn(),
  collectKomentarRecap: jest.fn(),
  absensiKomentarDitbinmasSimple: jest.fn(),
  lapharTiktokDitbinmas: jest.fn(),
}));
jest.unstable_mockModule('../src/service/instaRapidService.js', () => ({
  fetchInstagramInfo: mockFetchInstagramInfo,
  fetchInstagramPosts: mockFetchInstagramPosts,
  fetchInstagramProfile: mockFetchInstagramProfile,
  fetchInstagramPostsByMonthToken: jest.fn(),
  fetchInstagramPostsByMonth: jest.fn(),
  fetchInstagramPostsPageToken: jest.fn(),
  fetchInstagramPostsPage: jest.fn(),
  fetchAllInstagramComments: jest.fn(),
  fetchAllInstagramLikes: jest.fn(),
  fetchAllInstagramLikesItems: jest.fn(),
  fetchInstagramHashtag: jest.fn(),
  fetchInstagramLikesPage: jest.fn(),
  fetchInstagramLikesPageRetry: jest.fn(),
  fetchInstagramPostInfo: jest.fn(),
}));
jest.unstable_mockModule('../src/service/tiktokRapidService.js', () => ({
  fetchTiktokProfile: mockFetchTiktokProfile,
  fetchTiktokPosts: mockFetchTiktokPosts,
  fetchTiktokPostsBySecUid: mockFetchTiktokPostsBySecUid,
  fetchTiktokInfo: mockFetchTiktokInfo,
  fetchTiktokPostDetail: mockFetchTiktokPostDetail,
  fetchTiktokCommentsPage: mockFetchTiktokCommentsPage,
  fetchAllTiktokComments: mockFetchAllTiktokComments,
}));
jest.unstable_mockModule('../src/model/instaLikeModel.js', () => ({
  hasUserLikedBetween: mockHasUserLikedBetween,
  upsertInstaLike: jest.fn(),
  getLikeUsernamesByShortcode: jest.fn(),
  deleteInstaLikeByShortcode: jest.fn(),
  getAllShortcodesToday: jest.fn(),
  getLikesByShortcode: jest.fn(),
  saveLikeSnapshotAudit: jest.fn(),
  getLatestLikeAuditByWindow: jest.fn(),
  getRekapLikesByClient: jest.fn(),
}));
jest.unstable_mockModule('../src/model/tiktokCommentModel.js', () => ({
  hasUserCommentedBetween: mockHasUserCommentedBetween,
  deleteCommentsByVideoId: jest.fn(),
  upsertTiktokComments: jest.fn(),
  getCommentsByVideoId: jest.fn(),
  saveCommentSnapshotAudit: jest.fn(),
  getLatestCommentAuditByWindow: jest.fn(),
  getRekapKomentarByClient: jest.fn(),
}));

process.env.COMPLAINT_RESPONSE_DELAY_MS = '0';
process.env.JWT_SECRET = 'test';

let clientRequestHandlers;

beforeAll(async () => {
  ({ clientRequestHandlers } = await import('../src/handler/menu/clientRequestHandlers.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetGreeting.mockReturnValue('Salam');
  mockFormatNama.mockReturnValue('Pelapor');
  mockNormalizeUserId.mockImplementation((value) => value.trim());
  mockFormatToWhatsAppId.mockImplementation((value) => `${value}@wa`);
  mockFormatUserData.mockReturnValue('```\nMock User\n```');
  mockFormatComplaintIssue.mockImplementation((value) => value.trim());
  mockNormalizeEmail.mockImplementation((value) =>
    value === undefined || value === null ? '' : String(value).trim().toLowerCase()
  );
  mockFetchInstagramInfo.mockResolvedValue({
    follower_count: 1234,
    following_count: 321,
    media_count: 45,
    is_private: false,
  });
  mockFetchTiktokProfile.mockResolvedValue({
    follower_count: 5678,
    following_count: 89,
    like_count: 1011,
    video_count: 12,
    username: 'username',
  });
  mockHasUserLikedBetween.mockResolvedValue(0);
  mockHasUserCommentedBetween.mockResolvedValue(0);
  mockSendComplaintEmail.mockResolvedValue();
});

test('respondComplaint_message automatically sends default response when social usernames are empty', async () => {
  const session = {};
  const chatId = 'admin-chat';
  const waClient = { sendMessage: jest.fn() };
  const userModel = {
    findUserById: jest.fn().mockResolvedValue({
      whatsapp: '08123',
      insta: '   ',
      tiktok: null,
      nama: 'Nama Lengkap',
      status: true,
    }),
  };

  const complaintMessage = `Pesan Komplain\nNRP    : 12345\n\nKendala\n- Sudah melaksanakan Instagram belum terdata.`;

  await clientRequestHandlers.respondComplaint_message(
    session,
    chatId,
    complaintMessage,
    waClient,
    null,
    userModel
  );

  expect(mockNormalizeUserId).toHaveBeenCalledWith('12345');
  expect(mockSafeSendMessage).toHaveBeenNthCalledWith(
    1,
    waClient,
    '08123@wa',
    expect.stringContaining('Tautan update data personel')
  );
  expect(mockSafeSendMessage).toHaveBeenNthCalledWith(
    2,
    waClient,
    chatId,
    expect.stringContaining('Ringkasan Respon Komplain')
  );
  expect(mockSendComplaintEmail).not.toHaveBeenCalled();
  expect(waClient.sendMessage).toHaveBeenNthCalledWith(
    1,
    chatId,
    expect.stringContaining('Data Pelapor')
  );
  expect(waClient.sendMessage).toHaveBeenNthCalledWith(
    2,
    chatId,
    expect.stringContaining('Pesan Komplain')
  );
  expect(waClient.sendMessage).toHaveBeenNthCalledWith(
    3,
    chatId,
    expect.stringContaining('Status Akun Sosial Media')
  );
  expect(waClient.sendMessage).toHaveBeenNthCalledWith(
    4,
    chatId,
    '✅ Respon komplain telah dikirim ke Pelapor (12345).'
  );
  expect(session.step).toBe('main');
  expect(session.respondComplaint).toBeUndefined();
});

test('respondComplaint_message sends activation guidance when akun tidak aktif', async () => {
  const session = {};
  const chatId = 'admin-chat';
  const waClient = { sendMessage: jest.fn() };
  const userModel = {
    findUserById: jest.fn().mockResolvedValue({
      whatsapp: '08123',
      insta: 'username',
      tiktok: 'tiktokuser',
      nama: 'Nama Lengkap',
      status: false,
    }),
  };

  const complaintMessage = `Pesan Komplain\nNRP    : 12345\n\nKendala\n- Sudah melaksanakan Instagram belum terdata.`;

  await clientRequestHandlers.respondComplaint_message(
    session,
    chatId,
    complaintMessage,
    waClient,
    null,
    userModel
  );

  expect(mockFetchInstagramInfo).not.toHaveBeenCalled();
  expect(mockFetchTiktokProfile).not.toHaveBeenCalled();
  expect(mockSafeSendMessage).toHaveBeenNthCalledWith(
    1,
    waClient,
    '08123@wa',
    expect.stringContaining('tidak aktif')
  );
  expect(mockSafeSendMessage).toHaveBeenNthCalledWith(
    2,
    waClient,
    chatId,
    expect.stringContaining('Ringkasan Respon Komplain')
  );
  expect(mockSendComplaintEmail).not.toHaveBeenCalled();
  expect(waClient.sendMessage).toHaveBeenNthCalledWith(
    1,
    chatId,
    expect.stringContaining('Data Pelapor')
  );
  expect(waClient.sendMessage).toHaveBeenNthCalledWith(
    2,
    chatId,
    expect.stringContaining('Pesan Komplain')
  );
  expect(waClient.sendMessage).toHaveBeenNthCalledWith(
    3,
    chatId,
    '✅ Respon komplain telah dikirim ke Pelapor (12345).'
  );
  expect(session.step).toBe('main');
  expect(session.respondComplaint).toBeUndefined();
});

test('respondComplaint_message falls back to email when WhatsApp is missing', async () => {
  const session = {};
  const chatId = 'admin-chat';
  const waClient = { sendMessage: jest.fn() };
  const userModel = {
    findUserById: jest.fn().mockResolvedValue({
      whatsapp: '   ',
      email: 'Pelapor@Example.com ',
      insta: '',
      tiktok: '',
      nama: 'Nama Lengkap',
      status: true,
    }),
  };

  const complaintMessage = `Pesan Komplain\nNRP    : 12345\n\nKendala\n- Sudah melaksanakan Instagram belum terdata.`;

  await clientRequestHandlers.respondComplaint_message(
    session,
    chatId,
    complaintMessage,
    waClient,
    null,
    userModel
  );

  expect(mockSendComplaintEmail).toHaveBeenCalledTimes(1);
  expect(mockSendComplaintEmail).toHaveBeenCalledWith(
    'pelapor@example.com',
    expect.stringContaining('Tindak Lanjut Laporan Cicero'),
    expect.stringContaining('Solusi/Tindak Lanjut')
  );
  expect(mockSafeSendMessage).toHaveBeenCalledTimes(1);
  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    waClient,
    chatId,
    expect.stringContaining('Ringkasan Respon Komplain')
  );
  expect(waClient.sendMessage).toHaveBeenNthCalledWith(
    1,
    chatId,
    expect.stringContaining('Data Pelapor')
  );
  expect(waClient.sendMessage).toHaveBeenNthCalledWith(
    2,
    chatId,
    expect.stringContaining('Pesan Komplain')
  );
  expect(waClient.sendMessage).toHaveBeenNthCalledWith(
    3,
    chatId,
    expect.stringContaining('Status Akun Sosial Media')
  );
  expect(waClient.sendMessage).toHaveBeenNthCalledWith(
    4,
    chatId,
    '✅ Respon komplain telah dikirim ke Pelapor (12345).'
  );
  expect(mockFormatToWhatsAppId).not.toHaveBeenCalled();
  expect(session.step).toBe('main');
  expect(session.respondComplaint).toBeUndefined();
});

test('respondComplaint_message shortcuts when Instagram like activity already recorded', async () => {
  const session = {};
  const chatId = 'admin-chat';
  const waClient = { sendMessage: jest.fn() };
  const userModel = {
    findUserById: jest.fn().mockResolvedValue({
      whatsapp: '08123',
      insta: 'RegisteredIG',
      tiktok: '',
      nama: 'Nama Lengkap',
      status: true,
      client_id: 'client01',
    }),
  };
  mockHasUserLikedBetween.mockResolvedValueOnce(4);

  const complaintMessage = `Pesan Komplain\nNRP    : 12345\n\nKendala\n- Sudah melaksanakan Instagram belum terdata.`;

  await clientRequestHandlers.respondComplaint_message(
    session,
    chatId,
    complaintMessage,
    waClient,
    null,
    userModel
  );

  expect(mockHasUserLikedBetween).toHaveBeenCalledWith(
    '@RegisteredIG',
    '2025-09-01',
    expect.any(Date),
    'client01'
  );
  expect(mockHasUserCommentedBetween).not.toHaveBeenCalled();
    expect(mockSafeSendMessage).toHaveBeenCalledWith(
      waClient,
      '08123@wa',
      expect.stringContaining('Ringkasan pengecekan')
    );
    const instagramSolution = mockSafeSendMessage.mock.calls[0][2];
    expect(instagramSolution).toContain('@RegisteredIG');
    expect(instagramSolution).toContain('Sistem Cicero tidak menemukan gangguan pencatatan');
    expect(instagramSolution).toContain('Absensi Likes Instagram');
    expect(instagramSolution).not.toContain('Amplifikasi');
    expect(instagramSolution).toContain('dashboard Cicero');
    expect(instagramSolution).toContain('tekan tombol *Refresh*');
    expect(instagramSolution.toLowerCase()).toContain('tangkapan layar');
    expect(instagramSolution.toLowerCase()).toContain('hubungi operator');
  expect(mockFetchInstagramInfo).toHaveBeenCalledTimes(1);
  expect(session.step).toBe('main');
  expect(session.respondComplaint).toBeUndefined();
});

test('respondComplaint_message shortcuts when TikTok comment activity already recorded', async () => {
  const session = {};
  const chatId = 'admin-chat';
  const waClient = { sendMessage: jest.fn() };
  const userModel = {
    findUserById: jest.fn().mockResolvedValue({
      whatsapp: '08123',
      insta: '',
      tiktok: 'TikTokUser',
      nama: 'Nama Lengkap',
      status: true,
      client_id: 'client99',
    }),
  };
  mockHasUserCommentedBetween.mockResolvedValueOnce(7);

  const complaintMessage = `Pesan Komplain\nNRP    : 12345\n\nKendala\n- Sudah melaksanakan TikTok belum terdata.`;

  await clientRequestHandlers.respondComplaint_message(
    session,
    chatId,
    complaintMessage,
    waClient,
    null,
    userModel
  );

  expect(mockHasUserCommentedBetween).toHaveBeenCalledWith(
    '@TikTokUser',
    '2025-09-01',
    expect.any(Date),
    'client99'
  );
  expect(mockHasUserLikedBetween).not.toHaveBeenCalled();
    expect(mockSafeSendMessage).toHaveBeenCalledWith(
      waClient,
      '08123@wa',
      expect.stringContaining('Ringkasan pengecekan')
    );
    const tiktokSolution = mockSafeSendMessage.mock.calls[0][2];
    expect(tiktokSolution).toContain('@TikTokUser');
    expect(tiktokSolution).toContain('Sistem Cicero tidak menemukan gangguan pencatatan');
    expect(tiktokSolution).toContain('Absensi Komentar');
    expect(tiktokSolution).toContain('dashboard Cicero');
    expect(tiktokSolution).toContain('klik *Refresh*');
  expect(tiktokSolution.toLowerCase()).toContain('tangkapan layar');
  expect(tiktokSolution.toLowerCase()).toContain('hubungi operator');
  expect(mockFetchTiktokProfile).toHaveBeenCalledTimes(1);
  expect(session.step).toBe('main');
  expect(session.respondComplaint).toBeUndefined();
});

test('respondComplaint_message parses "Rincian Kendala" and auto-resolves TikTok issue', async () => {
  const session = {};
  const chatId = 'admin-chat';
  const waClient = { sendMessage: jest.fn() };
  const userModel = {
    findUserById: jest.fn().mockResolvedValue({
      whatsapp: '08123',
      insta: '',
      tiktok: 'TikTokUser',
      nama: 'Nama Lengkap',
      status: true,
      client_id: 'client-rincian',
    }),
  };

  const complaintMessage = [
    'Pesan Komplain',
    'NRP    : 12345',
    'Nama   : Nama Lengkap',
    'Username TikTok : @TikTokUser',
    '',
    'Rincian Kendala:',
    '1) Sudah melaksanakan TikTok belum terdata di dashboard.',
  ].join('\n');

  await clientRequestHandlers.respondComplaint_message(
    session,
    chatId,
    complaintMessage,
    waClient,
    null,
    userModel
  );

  expect(waClient.sendMessage).not.toHaveBeenCalledWith(
    chatId,
    expect.stringContaining('Kendala belum memiliki solusi otomatis')
  );
  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    waClient,
    '08123@wa',
    expect.stringContaining('Solusi/Tindak Lanjut')
  );
  expect(session.step).toBe('main');
  expect(session.respondComplaint).toBeUndefined();
});

test('respondComplaint_message asks for manual solution when kendala tidak dikenali', async () => {
  const session = {};
  const chatId = 'admin-chat';
  const waClient = { sendMessage: jest.fn() };
  const userModel = {
    findUserById: jest.fn().mockResolvedValue({
      whatsapp: '08123',
      insta: 'username',
      tiktok: '',
      nama: 'Nama Lengkap',
      status: true,
    }),
  };

  const complaintMessage = `Pesan Komplain\nNRP    : 12345\nNama   : Nama Lengkap\nUsername IG : @username\n\nKendala\n- Mohon bantuan pengecekan data lainnya.`;

  await clientRequestHandlers.respondComplaint_message(
    session,
    chatId,
    complaintMessage,
    waClient,
    null,
    userModel
  );

  expect(mockSafeSendMessage).not.toHaveBeenCalled();
  expect(waClient.sendMessage).toHaveBeenNthCalledWith(
    1,
    chatId,
    expect.stringContaining('Data Pelapor')
  );
  expect(waClient.sendMessage).toHaveBeenNthCalledWith(
    2,
    chatId,
    expect.stringContaining('Pesan Komplain')
  );
  expect(waClient.sendMessage).toHaveBeenNthCalledWith(
    3,
    chatId,
    expect.stringContaining('Status Akun Sosial Media')
  );
  expect(waClient.sendMessage).toHaveBeenNthCalledWith(
    4,
    chatId,
    'Kendala belum memiliki solusi otomatis. Tuliskan *solusi/tindak lanjut* yang akan dikirim ke pelapor (atau ketik *batal* untuk keluar):'
  );
  expect(session.step).toBe('respondComplaint_solution');
  expect(session.respondComplaint).toMatchObject({
    nrp: '12345',
    user: expect.any(Object),
    accountStatus: expect.objectContaining({ adminMessage: expect.any(String) }),
    issue: expect.stringContaining('Pesan Komplain'),
  });
  expect(mockFetchInstagramInfo).toHaveBeenCalledWith('username');
  expect(mockFetchTiktokProfile).not.toHaveBeenCalled();
});

test('respondComplaint_solution uses helper to send message and reset session', async () => {
  const session = {
    respondComplaint: {
      nrp: '12345',
      user: { whatsapp: '08123', nama: 'Nama Lengkap' },
      issue: 'Masalah A',
    },
  };
  const chatId = 'admin-chat';
  const waClient = { sendMessage: jest.fn() };

  await clientRequestHandlers.respondComplaint_solution(
    session,
    chatId,
    ' Solusi B ',
    waClient
  );

  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    waClient,
    '08123@wa',
    expect.stringContaining('Solusi/Tindak Lanjut')
  );
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    '✅ Respon komplain telah dikirim ke Pelapor (12345).'
  );
  expect(session.respondComplaint).toBeUndefined();
  expect(session.step).toBe('main');
});

test('respondComplaint_issue stores formatted complaint issue and prompts for solution', async () => {
  const session = {
    respondComplaint: {
      nrp: '12345',
      user: { nama: 'Nama Lengkap' },
    },
  };
  const chatId = 'admin-chat';
  const waClient = { sendMessage: jest.fn() };
  mockFormatComplaintIssue.mockReturnValue('Formatted Kendala');

  await clientRequestHandlers.respondComplaint_issue(
    session,
    chatId,
    '  Pesan Komplain ...  ',
    waClient
  );

  expect(mockFormatComplaintIssue).toHaveBeenCalledWith('Pesan Komplain ...');
  expect(session.respondComplaint.issue).toBe('Formatted Kendala');
  expect(session.step).toBe('respondComplaint_solution');
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    'Tuliskan *solusi/tindak lanjut* yang akan dikirim ke pelapor (atau ketik *batal* untuk keluar):'
  );
});
