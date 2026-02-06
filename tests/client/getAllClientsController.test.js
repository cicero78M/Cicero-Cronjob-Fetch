import { jest } from '@jest/globals';

const mockFindAllClients = jest.fn();
const mockFindClientsByGroup = jest.fn();

jest.unstable_mockModule('../../src/service/clientService.js', () => ({
  findAllClients: mockFindAllClients,
  findClientsByGroup: mockFindClientsByGroup,
}));

const mockSendSuccess = jest.fn();

jest.unstable_mockModule('../../src/utils/response.js', () => ({
  sendSuccess: mockSendSuccess,
}));

let getAllClients;

beforeAll(async () => {
  ({ getAllClients } = await import('../../src/controller/clientController.js'));
});

afterEach(() => {
  jest.clearAllMocks();
});

test('returns all clients when no group filter is provided', async () => {
  const clients = [{ client_id: 'C1' }, { client_id: 'C2' }];
  mockFindAllClients.mockResolvedValueOnce(clients);

  const req = { query: {} };
  const res = {};
  const next = jest.fn();

  await getAllClients(req, res, next);

  expect(mockFindAllClients).toHaveBeenCalledTimes(1);
  expect(mockFindClientsByGroup).not.toHaveBeenCalled();
  expect(mockSendSuccess).toHaveBeenCalledWith(res, clients);
  expect(next).not.toHaveBeenCalled();
});

test('returns grouped clients when group filter is provided', async () => {
  const groupedClients = [{ client_id: 'G1' }];
  mockFindClientsByGroup.mockResolvedValueOnce(groupedClients);

  const req = { query: { group: 'ops' } };
  const res = {};
  const next = jest.fn();

  await getAllClients(req, res, next);

  expect(mockFindClientsByGroup).toHaveBeenCalledWith('ops');
  expect(mockFindAllClients).not.toHaveBeenCalled();
  expect(mockSendSuccess).toHaveBeenCalledWith(res, groupedClients);
  expect(next).not.toHaveBeenCalled();
});
