import { jest } from '@jest/globals';

const mockScheduleCronJob = jest.fn();
const mockSafeSendMessage = jest.fn();
const mockSendWithClientFallback = jest.fn();
const mockFormatToWhatsAppId = jest.fn((digits) => `${digits}@c.us`);
const mockGetActiveUsersWithWhatsapp = jest.fn();
const mockGetShortcodesTodayByClient = jest.fn();
const mockGetLikesByShortcode = jest.fn();
const mockGetPostsTodayByClient = jest.fn();
const mockGetCommentsByVideoId = jest.fn();
const mockFindClientById = jest.fn();
const mockNormalizeInsta = jest.fn((username) => (username || '').toLowerCase());
const mockGetReminderStateMapForDate = jest.fn();
const mockUpsertReminderState = jest.fn();
const mockDeleteReminderStateForDate = jest.fn();

jest.unstable_mockModule('../src/utils/cronScheduler.js', () => ({
  scheduleCronJob: mockScheduleCronJob,
}));

jest.unstable_mockModule('../src/service/waService.js', () => ({
  default: {},
  waGatewayClient: {},
  waUserClient: {},
}));

jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  safeSendMessage: mockSafeSendMessage,
  sendWithClientFallback: mockSendWithClientFallback,
  formatToWhatsAppId: mockFormatToWhatsAppId,
}));

jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getActiveUsersWithWhatsapp: mockGetActiveUsersWithWhatsapp,
}));

jest.unstable_mockModule('../src/model/instaPostModel.js', () => ({
  getShortcodesTodayByClient: mockGetShortcodesTodayByClient,
}));

jest.unstable_mockModule('../src/model/instaLikeModel.js', () => ({
  getLikesByShortcode: mockGetLikesByShortcode,
}));

jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({
  getPostsTodayByClient: mockGetPostsTodayByClient,
}));

jest.unstable_mockModule('../src/model/tiktokCommentModel.js', () => ({
  getCommentsByVideoId: mockGetCommentsByVideoId,
}));

jest.unstable_mockModule('../src/service/clientService.js', () => ({
  findClientById: mockFindClientById,
}));

jest.unstable_mockModule('../src/utils/likesHelper.js', () => ({
  normalizeUsername: mockNormalizeInsta,
}));

jest.unstable_mockModule('../src/model/waNotificationReminderStateModel.js', () => ({
  getReminderStateMapForDate: mockGetReminderStateMapForDate,
  upsertReminderState: mockUpsertReminderState,
  deleteReminderStateForDate: mockDeleteReminderStateForDate,
}));

let runCron;
let resetNotificationReminderState;
let reminderStateStore;

afterEach(() => {
  jest.clearAllMocks();
});

beforeAll(async () => {
  ({ runCron, resetNotificationReminderState } = await import('../src/cron/cronWaNotificationReminder.js'));
});

beforeEach(async () => {
  reminderStateStore = new Map();
  mockGetReminderStateMapForDate.mockImplementation(async () => new Map(reminderStateStore));
  mockUpsertReminderState.mockImplementation(async ({ chatId, clientId, lastStage, isComplete }) => {
    reminderStateStore.set(`${chatId}:${clientId}`, { lastStage, isComplete });
  });
  mockDeleteReminderStateForDate.mockImplementation(async () => {
    reminderStateStore.clear();
  });
  mockSafeSendMessage.mockResolvedValue(true);
  mockSendWithClientFallback.mockResolvedValue(true);

  mockGetShortcodesTodayByClient.mockResolvedValue([]);
  mockGetLikesByShortcode.mockResolvedValue([]);
  mockGetPostsTodayByClient.mockResolvedValue([]);
  mockGetCommentsByVideoId.mockResolvedValue({ comments: [] });
  mockFindClientById.mockResolvedValue({ client_tiktok: '@ditbinmas' });

  await resetNotificationReminderState();
});

test('runCron only sends reminders for DITBINMAS and BIDHUMAS users', async () => {
  mockGetActiveUsersWithWhatsapp.mockResolvedValue([
    {
      whatsapp: '081234567890',
      wa_notification_opt_in: true,
      client_id: 'DITBINMAS',
      insta: 'user1',
      tiktok: 'tt1',
      nama: 'User Binmas',
    },
    {
      whatsapp: '089876543210',
      wa_notification_opt_in: true,
      client_id: 'OTHER',
      insta: 'user2',
      tiktok: 'tt2',
      nama: 'User Other',
    },
    {
      whatsapp: '082233445566',
      wa_notification_opt_in: true,
      client_id: 'BIDHUMAS',
      insta: 'user3',
      tiktok: 'tt3',
      nama: 'User Bidhumas',
    },
    {
      whatsapp: '081234567890',
      wa_notification_opt_in: true,
      client_id: 'DITBINMAS',
      insta: 'user1',
      tiktok: 'tt1',
      nama: 'Duplicate Binmas',
    },
  ]);

  await runCron();

  expect(mockGetActiveUsersWithWhatsapp).toHaveBeenCalledTimes(1);
  expect(mockSendWithClientFallback).toHaveBeenCalledTimes(2);
  expect(mockSendWithClientFallback).toHaveBeenCalledWith(
    expect.objectContaining({ chatId: '081234567890@c.us', message: expect.any(String) })
  );
  expect(mockSendWithClientFallback).toHaveBeenCalledWith(
    expect.objectContaining({ chatId: '082233445566@c.us', message: expect.any(String) })
  );
  expect(mockGetShortcodesTodayByClient).toHaveBeenCalledWith('DITBINMAS');
  expect(mockGetShortcodesTodayByClient).toHaveBeenCalledWith('BIDHUMAS');
  expect(mockGetPostsTodayByClient).toHaveBeenCalledWith('DITBINMAS');
  expect(mockGetPostsTodayByClient).toHaveBeenCalledWith('BIDHUMAS');
  expect(mockFindClientById).toHaveBeenCalledWith('DITBINMAS');
  expect(mockFindClientById).toHaveBeenCalledWith('BIDHUMAS');
});

test('runCron sends staged follow-ups for users still incomplete', async () => {
  mockGetActiveUsersWithWhatsapp.mockResolvedValue([
    {
      whatsapp: '081234567890',
      wa_notification_opt_in: true,
      client_id: 'DITBINMAS',
      insta: 'user1',
      tiktok: 'tt1',
      nama: 'User Binmas',
    },
  ]);

  mockGetShortcodesTodayByClient.mockResolvedValue(['abc123']);
  mockGetLikesByShortcode.mockResolvedValue([]);

  await runCron();

  expect(mockSendWithClientFallback).toHaveBeenCalledTimes(1);
  expect(reminderStateStore.get('081234567890@c.us:DITBINMAS')).toEqual({
    lastStage: 'initial',
    isComplete: false,
  });

  mockSendWithClientFallback.mockClear();
  mockGetLikesByShortcode.mockResolvedValue(['user1']);

  await runCron();

  expect(mockSendWithClientFallback).toHaveBeenCalledTimes(1);
  expect(reminderStateStore.get('081234567890@c.us:DITBINMAS')).toEqual({
    lastStage: 'completed',
    isComplete: true,
  });

  mockSendWithClientFallback.mockClear();

  await runCron();

  expect(mockSendWithClientFallback).not.toHaveBeenCalled();
});

test('cron skips completed recipients but keeps following up with pending users after a restart', async () => {
  reminderStateStore.set('081234567890@c.us:DITBINMAS', { lastStage: 'completed', isComplete: true });
  reminderStateStore.set('089876543210@c.us:DITBINMAS', { lastStage: 'followup1', isComplete: false });

  mockGetActiveUsersWithWhatsapp.mockResolvedValue([
    {
      whatsapp: '081234567890',
      wa_notification_opt_in: true,
      client_id: 'DITBINMAS',
      insta: 'user1',
      tiktok: 'tt1',
      nama: 'Completed User',
    },
    {
      whatsapp: '089876543210',
      wa_notification_opt_in: true,
      client_id: 'DITBINMAS',
      insta: 'user2',
      tiktok: 'tt2',
      nama: 'Pending User',
    },
  ]);

  mockGetShortcodesTodayByClient.mockResolvedValue(['abc123']);
  mockGetLikesByShortcode.mockResolvedValue([]);

  await runCron();

  expect(mockSendWithClientFallback).toHaveBeenCalledTimes(1);
  expect(mockSendWithClientFallback).toHaveBeenCalledWith(
    expect.objectContaining({ chatId: '089876543210@c.us', message: expect.any(String) })
  );
  expect(reminderStateStore.get('089876543210@c.us:DITBINMAS')).toEqual({
    lastStage: 'followup2',
    isComplete: false,
  });
  expect(reminderStateStore.get('081234567890@c.us:DITBINMAS')).toEqual({
    lastStage: 'completed',
    isComplete: true,
  });
});
