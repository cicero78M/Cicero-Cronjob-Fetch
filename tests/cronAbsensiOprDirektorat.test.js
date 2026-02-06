import { jest } from '@jest/globals';

const mockAbsensi = jest.fn();
const mockSendWAReport = jest.fn();
const mockGetAdminWAIds = jest.fn(() => ['ADMIN']);
const mockFindAllActiveDirektorat = jest.fn(() => []);

jest.unstable_mockModule('../src/handler/fetchabsensi/dashboard/absensiRegistrasiDashboardDirektorat.js', () => ({
  absensiRegistrasiDashboardDirektorat: mockAbsensi,
}));
jest.unstable_mockModule('../src/service/waService.js', () => ({ default: {} }));
jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  sendWAReport: mockSendWAReport,
  getAdminWAIds: mockGetAdminWAIds,
  sendWithClientFallback: jest.fn(),
}));
jest.unstable_mockModule('../src/model/clientModel.js', () => ({
  findAllActiveDirektorat: mockFindAllActiveDirektorat,
}));

let runCron;

beforeAll(async () => {
  ({ runCron } = await import('../src/cron/cronAbsensiOprDirektorat.js'));
});

test('runCron executes commands sequentially for active direktorats', async () => {
  mockFindAllActiveDirektorat.mockResolvedValueOnce([
    { client_id: 'dita' },
    { client_id: 'ditb ' },
  ]);
  mockAbsensi.mockResolvedValueOnce('msgA').mockResolvedValueOnce('msgB');

  await runCron();

  expect(mockFindAllActiveDirektorat).toHaveBeenCalledTimes(1);
  expect(mockAbsensi).toHaveBeenNthCalledWith(1, 'DITA');
  expect(mockAbsensi).toHaveBeenNthCalledWith(2, 'DITB');
  expect(mockSendWAReport).toHaveBeenNthCalledWith(1, {}, 'msgA', ['ADMIN']);
  expect(mockSendWAReport).toHaveBeenNthCalledWith(2, {}, 'msgB', ['ADMIN']);
});
