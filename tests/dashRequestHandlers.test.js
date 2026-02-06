import { jest } from '@jest/globals';

process.env.TZ = 'Asia/Jakarta';

const mockGetUsersSocialByClient = jest.fn();
const mockRekapLink = jest.fn();
const mockAbsensiLikes = jest.fn();
const mockAbsensiKomentarInstagram = jest.fn();
const mockAbsensiKomentar = jest.fn();
const mockFindClientById = jest.fn();

jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersSocialByClient: mockGetUsersSocialByClient,
}));

jest.unstable_mockModule(
  '../src/handler/fetchabsensi/link/rekapLink.js',
  () => ({ rekapLink: mockRekapLink })
);

jest.unstable_mockModule(
  '../src/handler/fetchabsensi/insta/absensiLikesInsta.js',
  () => ({ absensiLikes: mockAbsensiLikes })
);

jest.unstable_mockModule(
  '../src/handler/fetchabsensi/insta/absensiKomentarInstagram.js',
  () => ({ absensiKomentarInstagram: mockAbsensiKomentarInstagram })
);

jest.unstable_mockModule(
  '../src/handler/fetchabsensi/tiktok/absensiKomentarTiktok.js',
  () => ({
    absensiKomentar: mockAbsensiKomentar,
    absensiKomentarDitbinmasReport: jest.fn(),
  })
);

jest.unstable_mockModule('../src/service/clientService.js', () => ({
  findClientById: mockFindClientById,
}));

let dashRequestHandlers;
beforeAll(async () => {
  const mod = await import('../src/handler/menu/dashRequestHandlers.js');
  dashRequestHandlers = mod.dashRequestHandlers;
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('main sends menu directly when single client', async () => {
  mockFindClientById.mockResolvedValue({ nama: 'Client One' });
  const session = { role: 'user', client_ids: ['C1'] };
  const chatId = '123';
  const waClient = { sendMessage: jest.fn() };

  await dashRequestHandlers.main(session, chatId, '', waClient);

  expect(session.selectedClientId).toBe('C1');
  expect(session.step).toBe('choose_menu');
  expect(waClient.sendMessage).toHaveBeenCalled();
  const message = waClient.sendMessage.mock.calls[0][1];
  expect(message).toContain('Client: *Client One*');
});

test('main lists clients when multiple', async () => {
  mockFindClientById
    .mockResolvedValueOnce({ nama: 'Client One' })
    .mockResolvedValueOnce({ nama: 'Client Two' });
  const session = { role: 'user', client_ids: ['C1', 'C2'] };
  const waClient = { sendMessage: jest.fn() };
  const chatId = '123';

  await dashRequestHandlers.main(session, chatId, '', waClient);

  expect(session.step).toBe('choose_client');
  const msg = waClient.sendMessage.mock.calls[0][1];
  expect(msg).toContain('CLIENT ONE (C1)');
  expect(msg).toContain('CLIENT TWO (C2)');
});

test('choose_client selects client and shows menu', async () => {
  mockFindClientById
    .mockResolvedValueOnce({ nama: 'Client One' })
    .mockResolvedValueOnce({ nama: 'Client Two' })
    .mockResolvedValueOnce({ nama: 'Client Two' });
  const session = { role: 'user', client_ids: ['C1', 'C2'] };
  const waClient = { sendMessage: jest.fn() };
  const chatId = '123';

  await dashRequestHandlers.main(session, chatId, '', waClient);
  waClient.sendMessage.mockClear();

  await dashRequestHandlers.choose_client(session, chatId, '2', waClient);

  expect(session.selectedClientId).toBe('C2');
  expect(session.step).toBe('choose_menu');
  const msg = waClient.sendMessage.mock.calls[0][1];
  expect(msg).toContain('Client: *Client Two*');
});

test('choose_menu uses selected client id', async () => {
  mockGetUsersSocialByClient.mockResolvedValue([]);
  mockFindClientById.mockResolvedValue({});
  const session = {
    role: 'user',
    selectedClientId: 'C1',
    clientName: 'Client One',
  };
  const waClient = { sendMessage: jest.fn() };
  const chatId = '123';

  await dashRequestHandlers.choose_menu(session, chatId, '1', waClient);

  expect(mockGetUsersSocialByClient).toHaveBeenCalledWith('C1', null);
});

test('choose_menu forwards roleFlag to getUsersSocialByClient', async () => {
  mockGetUsersSocialByClient.mockResolvedValue([]);
  mockFindClientById.mockResolvedValue({});
  const session = {
    role: 'DITBINMAS',
    selectedClientId: 'C1',
    clientName: 'Client One',
  };
  const waClient = { sendMessage: jest.fn() };
  const chatId = '123';
  const mainSpy = jest
    .spyOn(dashRequestHandlers, 'main')
    .mockResolvedValue();

  await dashRequestHandlers.choose_menu(session, chatId, '1', waClient);

  expect(mockGetUsersSocialByClient).toHaveBeenCalledWith('C1', 'DITBINMAS');

  mainSpy.mockRestore();
});

test.each([
  ['3', mockAbsensiLikes],
  ['4', mockAbsensiKomentarInstagram],
  ['5', mockAbsensiKomentar],
])('choose_menu forwards roleFlag to rekap functions', async (choice, handlerMock) => {
  handlerMock.mockResolvedValue('ok');
  const session = {
    role: 'DITBINMAS',
    selectedClientId: 'C1',
    clientName: 'Client One',
  };
  const waClient = { sendMessage: jest.fn() };
  const chatId = '123';
  const mainSpy = jest
    .spyOn(dashRequestHandlers, 'main')
    .mockResolvedValue();

  await dashRequestHandlers.choose_menu(session, chatId, choice, waClient);

  expect(handlerMock).toHaveBeenCalledWith('C1', {
    clientFilter: 'C1',
    mode: 'all',
    roleFlag: 'DITBINMAS',
  });

  mainSpy.mockRestore();
});

test('choose_menu uses directorate id without client filter', async () => {
  mockAbsensiLikes.mockResolvedValue('ok');
  const session = {
    role: 'DITBINMAS',
    selectedClientId: 'C1',
    clientName: 'Client One',
    dir_client_id: 'DITBINMAS',
  };
  const waClient = { sendMessage: jest.fn() };
  const chatId = '123';
  const mainSpy = jest
    .spyOn(dashRequestHandlers, 'main')
    .mockResolvedValue();
  await dashRequestHandlers.choose_menu(session, chatId, '3', waClient);
  expect(mockAbsensiLikes).toHaveBeenCalledWith('DITBINMAS', {
    mode: 'all',
    roleFlag: 'DITBINMAS',
  });
  mainSpy.mockRestore();
});

test('choose_menu calls rekapLink with clientId only', async () => {
  mockRekapLink.mockResolvedValue('ok');
  const session = {
    role: 'DITBINMAS',
    selectedClientId: 'C1',
    clientName: 'Client One',
  };
  const waClient = { sendMessage: jest.fn() };
  const chatId = '123';
  const mainSpy = jest
    .spyOn(dashRequestHandlers, 'main')
    .mockResolvedValue();

  await dashRequestHandlers.choose_menu(session, chatId, '2', waClient);

  expect(mockRekapLink).toHaveBeenCalledWith('C1');

  mainSpy.mockRestore();
});

test('ask_client calls rekapLink with clientId only', async () => {
  mockRekapLink.mockResolvedValue('ok');
  const session = {
    role: 'DITBINMAS',
    pendingAction: '2',
  };
  const waClient = { sendMessage: jest.fn() };
  const chatId = '123';
  const mainSpy = jest
    .spyOn(dashRequestHandlers, 'main')
    .mockResolvedValue();

  await dashRequestHandlers.ask_client(session, chatId, 'C1', waClient);

  expect(mockRekapLink).toHaveBeenCalledWith('C1');

  mainSpy.mockRestore();
});

test('ask_client forwards session role to handlers needing role', async () => {
  mockAbsensiLikes.mockResolvedValue('ok');
  const session = {
    role: 'DITBINMAS',
    pendingAction: '3',
  };
  const waClient = { sendMessage: jest.fn() };
  const chatId = '123';
  const mainSpy = jest
    .spyOn(dashRequestHandlers, 'main')
    .mockResolvedValue();

  await dashRequestHandlers.ask_client(session, chatId, 'C1', waClient);

  expect(mockAbsensiLikes).toHaveBeenCalledWith('C1', {
    clientFilter: 'C1',
    mode: 'all',
    roleFlag: 'DITBINMAS',
  });

  mainSpy.mockRestore();
});

test('ask_client uses nested user role when session.role missing', async () => {
  mockAbsensiLikes.mockResolvedValue('ok');
  const session = {
    user: { role: 'DITBINMAS' },
    pendingAction: '3',
  };
  const waClient = { sendMessage: jest.fn() };
  const chatId = '123';
  const mainSpy = jest
    .spyOn(dashRequestHandlers, 'main')
    .mockResolvedValue();

  await dashRequestHandlers.ask_client(session, chatId, 'C1', waClient);

  expect(mockAbsensiLikes).toHaveBeenCalledWith('C1', {
    clientFilter: 'C1',
    mode: 'all',
    roleFlag: 'DITBINMAS',
  });

  mainSpy.mockRestore();
});

test('choose_dash_user lists and selects dashboard user', async () => {
  mockFindClientById
    .mockResolvedValueOnce({ nama: 'Client One' })
    .mockResolvedValueOnce({ nama: 'Client Two' })
    .mockResolvedValueOnce({ nama: 'Client Two' });
  const session = {
    dash_users: [
      { role: 'user', client_ids: ['C1'] },
      { role: 'user', client_ids: ['C2'] },
    ],
  };
  const waClient = { sendMessage: jest.fn() };
  const chatId = '123';

  await dashRequestHandlers.choose_dash_user(session, chatId, '', waClient);
  expect(waClient.sendMessage).toHaveBeenCalled();
  const listMsg = waClient.sendMessage.mock.calls[0][1];
  expect(listMsg).toContain('CLIENT ONE (C1)');
  expect(listMsg).toContain('CLIENT TWO (C2)');

  waClient.sendMessage.mockClear();
  const mainSpy = jest
    .spyOn(dashRequestHandlers, 'main')
    .mockResolvedValue();
  await dashRequestHandlers.choose_dash_user(session, chatId, '2', waClient);
  expect(session.role).toBe('user');
  expect(session.client_ids).toEqual(['C2']);
  expect(session.dir_client_id).toBeNull();
  expect(mainSpy).toHaveBeenCalled();
  mainSpy.mockRestore();
});

test('choose_menu formats directorate report header', async () => {
  mockGetUsersSocialByClient.mockReset();
  mockFindClientById.mockReset();

  jest.useFakeTimers();
  jest.setSystemTime(new Date('2025-08-20T14:28:00Z'));

  mockGetUsersSocialByClient.mockResolvedValue([]);
  mockFindClientById.mockResolvedValue({
    nama: 'DIREKTORAT BINMAS',
    client_type: 'direktorat',
  });

  const session = {
    role: 'user',
    selectedClientId: 'BINMAS',
    clientName: 'DIREKTORAT BINMAS',
  };
  const waClient = { sendMessage: jest.fn() };
  const chatId = '123';

  await dashRequestHandlers.choose_menu(session, chatId, '1', waClient);

  const msg = waClient.sendMessage.mock.calls[0][1];
  expect(mockGetUsersSocialByClient).toHaveBeenCalledWith('BINMAS', null);
  expect(msg).toBe(
    'Selamat siang,\n\nMohon ijin Komandan, melaporkan absensi update data personil DIREKTORAT BINMAS pada hari Rabu, 20 Agustus 2025, pukul 14.28 WIB, sebagai berikut:\n\nJumlah Total User : 0\nJumlah Total User Sudah Update Data : 0\nJumlah Total User Belum Update Data : 0'
  );

  jest.useRealTimers();
});

test('choose_dash_user uses role as client when directorate', async () => {
  mockFindClientById.mockResolvedValueOnce({ client_type: 'direktorat' });
  const session = {
    dash_users: [
      { role: 'DITA', client_ids: ['C1', 'C2'] },
    ],
  };
  const waClient = { sendMessage: jest.fn() };
  const chatId = '123';
  const mainSpy = jest
    .spyOn(dashRequestHandlers, 'main')
    .mockResolvedValue();
  await dashRequestHandlers.choose_dash_user(session, chatId, '1', waClient);
  expect(session.client_ids).toEqual(['C1', 'C2']);
  expect(session.dir_client_id).toBe('DITA');
  mainSpy.mockRestore();
});

test('choose_menu aggregates directorate data by client', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2025-08-20T14:28:00Z'));
  mockGetUsersSocialByClient.mockResolvedValue([
    { client_id: 'C1', insta: 'a', tiktok: 'b' },
    { client_id: 'C1', insta: null, tiktok: 'b' },
    { client_id: 'C2', insta: 'x', tiktok: 'y' },
    { client_id: 'C2', insta: null, tiktok: null },
  ]);
  mockFindClientById
    .mockResolvedValueOnce({
      nama: 'DIREKTORAT BINMAS',
      client_type: 'direktorat',
    })
    .mockResolvedValueOnce({ nama: 'Client One' })
    .mockResolvedValueOnce({ nama: 'Client Two' });

  const session = {
    role: 'BINMAS',
    selectedClientId: 'BINMAS',
    clientName: 'DIREKTORAT BINMAS',
  };
  const waClient = { sendMessage: jest.fn() };
  const chatId = '123';

  await dashRequestHandlers.choose_menu(session, chatId, '1', waClient);

  const msg = waClient.sendMessage.mock.calls[0][1];
  expect(msg).toContain('CLIENT ONE');
  expect(msg).toContain('Jumlah User: 2');
  expect(msg).toContain('Jumlah User Sudah Update: 1');
  expect(msg).toContain('Jumlah User Belum Update: 1');
  expect(msg).toContain('CLIENT TWO');
  jest.useRealTimers();
});

test('directorate report orders directorate first with numbering', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2025-08-20T14:28:00Z'));

  mockGetUsersSocialByClient.mockResolvedValue([
    { client_id: 'BINMAS', insta: null, tiktok: null },
    { client_id: 'C1', insta: 'a', tiktok: 'b' },
    { client_id: 'C1', insta: null, tiktok: 'b' },
    { client_id: 'C2', insta: 'x', tiktok: 'y' },
  ]);
  mockFindClientById
    .mockResolvedValueOnce({
      nama: 'DIREKTORAT BINMAS',
      client_type: 'direktorat',
    })
    .mockResolvedValueOnce({ nama: 'DIREKTORAT BINMAS' })
    .mockResolvedValueOnce({ nama: 'Client One' })
    .mockResolvedValueOnce({ nama: 'Client Two' });

  const session = {
    role: 'BINMAS',
    selectedClientId: 'BINMAS',
    clientName: 'DIREKTORAT BINMAS',
  };
  const waClient = { sendMessage: jest.fn() };
  const chatId = '123';

  await dashRequestHandlers.choose_menu(session, chatId, '1', waClient);

  const msg = waClient.sendMessage.mock.calls[0][1];
  expect(msg.indexOf('1. DIREKTORAT BINMAS')).toBeLessThan(
    msg.indexOf('2. CLIENT ONE')
  );
  expect(msg.indexOf('2. CLIENT ONE')).toBeLessThan(
    msg.indexOf('3. CLIENT TWO')
  );
  jest.useRealTimers();
});

test('choose_menu formats org report with separate sections', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2025-08-21T05:38:00Z'));

  mockGetUsersSocialByClient.mockResolvedValue([
    { divisi: 'BINMAS', title: 'BRIPKA', nama: 'RIZQA FP', insta: 'a', tiktok: 'b' },
    { divisi: 'BINMAS', title: 'BRIPKA', nama: 'RIZQI ALFA', insta: null, tiktok: null },
  ]);
  mockFindClientById.mockResolvedValue({
    nama: 'POLRES BOJONEGORO',
    client_type: 'org',
  });

  const session = {
    role: 'user',
    selectedClientId: 'POLRES',
    clientName: 'POLRES BOJONEGORO',
  };
  const waClient = { sendMessage: jest.fn() };
  const chatId = '123';

  await dashRequestHandlers.choose_menu(session, chatId, '1', waClient);

  const msg = waClient.sendMessage.mock.calls[0][1];
  expect(msg).toContain('Sudah Lengkap :');
  expect(msg).toContain('Belum Lengkap:');
  expect(msg).toContain('BINMAS (1)');
  expect(msg).toContain('BRIPKA RIZQA FP');
  expect(msg).toContain('BRIPKA RIZQI ALFA, Instagram kosong, TikTok kosong');

  jest.useRealTimers();
});

