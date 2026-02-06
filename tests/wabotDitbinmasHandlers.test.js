import { jest } from '@jest/globals';

const mockList = jest.fn();
const mockUpdateCronJobStatus = jest.fn();

jest.unstable_mockModule('../src/service/cronJobConfigService.js', () => ({
  list: mockList,
  updateCronJobStatus: mockUpdateCronJobStatus,
}));

let handlers;

beforeAll(async () => {
  ({ wabotDitbinmasHandlers: handlers } = await import('../src/handler/menu/wabotDitbinmasHandlers.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

function createWaClient() {
  return {
    sendMessage: jest.fn().mockResolvedValue(undefined),
  };
}

test('cronConfig_menu menampilkan daftar cron job dengan status', async () => {
  const jobs = [
    { job_key: 'daily_report', display_name: 'Daily Report', is_active: true },
    { job_key: 'monthly_cleanup', display_name: 'Monthly Cleanup', is_active: false },
  ];
  mockList.mockResolvedValue(jobs);

  const session = {};
  const waClient = createWaClient();
  const chatId = '123';

  await handlers.cronConfig_menu(session, chatId, '', waClient);

  expect(mockList).toHaveBeenCalledTimes(1);
  expect(session.step).toBe('cronConfig_menu');
  expect(session.cronConfig.jobs).toEqual(jobs);
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringContaining('1️⃣ Daily Report'),
  );
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringContaining('2️⃣ Monthly Cleanup'),
  );
});

test('cronConfig_menu menerima pilihan job dan menampilkan opsi aksi', async () => {
  const jobs = [
    { job_key: 'daily_report', display_name: 'Daily Report', is_active: true },
    { job_key: 'monthly_cleanup', display_name: 'Monthly Cleanup', is_active: false },
  ];
  const session = { cronConfig: { jobs } };
  const waClient = createWaClient();
  const chatId = '123';

  await handlers.cronConfig_menu(session, chatId, '2', waClient);

  expect(mockList).not.toHaveBeenCalled();
  expect(session.step).toBe('cronConfig_jobAction');
  expect(session.cronConfig.selectedJobKey).toBe('monthly_cleanup');
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringContaining('Atur Cron Job: Monthly Cleanup'),
  );
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringContaining('1️⃣ Aktifkan cron job'),
  );
});

test('cronConfig_confirm memperbarui status cron job setelah konfirmasi', async () => {
  const jobs = [{ job_key: 'daily_report', display_name: 'Daily Report', is_active: false }];
  mockList.mockResolvedValueOnce(jobs);

  const session = {};
  const waClient = createWaClient();
  const chatId = '123';

  await handlers.cronConfig_menu(session, chatId, '', waClient);
  waClient.sendMessage.mockClear();

  await handlers.cronConfig_menu(session, chatId, '1', waClient);
  expect(session.step).toBe('cronConfig_jobAction');
  waClient.sendMessage.mockClear();

  await handlers.cronConfig_jobAction(session, chatId, '1', waClient);
  expect(session.step).toBe('cronConfig_confirm');
  expect(session.cronConfig.pendingStatus).toBe(true);
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringContaining('Anda akan mengubah status cron job'),
  );

  const updatedJob = { job_key: 'daily_report', display_name: 'Daily Report', is_active: true };
  mockUpdateCronJobStatus.mockResolvedValue(updatedJob);
  mockList.mockResolvedValueOnce([updatedJob]);
  waClient.sendMessage.mockClear();

  await handlers.cronConfig_confirm(session, chatId, 'ya', waClient);

  expect(mockUpdateCronJobStatus).toHaveBeenCalledWith('daily_report', true);
  expect(waClient.sendMessage.mock.calls[0][1]).toContain('berhasil diubah');
  expect(mockList).toHaveBeenCalledTimes(2);
  expect(session.step).toBe('cronConfig_menu');
  expect(session.cronConfig.jobs).toEqual([updatedJob]);
});

test('cronConfig_menu menangani input tidak valid', async () => {
  const jobs = [
    { job_key: 'daily_report', display_name: 'Daily Report', is_active: true },
  ];
  const session = { cronConfig: { jobs } };
  const waClient = createWaClient();
  const chatId = '123';
  mockList.mockResolvedValueOnce(jobs);

  await handlers.cronConfig_menu(session, chatId, 'abc', waClient);

  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringContaining('Pilihan tidak valid'),
  );
  expect(mockList).toHaveBeenCalledTimes(1);
});
