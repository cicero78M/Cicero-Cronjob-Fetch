import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetUsersWithWaByClient = jest.fn();
const mockGetOperatorsByClient = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersWithWaByClient: mockGetUsersWithWaByClient,
  getOperatorsByClient: mockGetOperatorsByClient,
}));

let absensiRegistrasiWa;

beforeAll(async () => {
  ({ absensiRegistrasiWa } = await import('../src/handler/fetchabsensi/wa/absensiRegistrasiWa.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('uses operator role for org clients', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ nama: 'ORG A', client_type: 'ORG' }] });
  mockGetOperatorsByClient.mockResolvedValueOnce([]);

  await absensiRegistrasiWa('ORG1');

  expect(mockGetOperatorsByClient).toHaveBeenCalledWith('ORG1');
  expect(mockGetUsersWithWaByClient).not.toHaveBeenCalled();
});

