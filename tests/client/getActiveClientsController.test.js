import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const mockFindAllActiveClients = jest.fn();

jest.unstable_mockModule('../../src/service/clientService.js', () => ({
  findAllActiveClients: mockFindAllActiveClients,
  findAllClients: jest.fn(),
  findClientsByGroup: jest.fn(),
  findClientById: jest.fn(),
  createClient: jest.fn(),
  updateClient: jest.fn(),
  deleteClient: jest.fn(),
  getClientSummary: jest.fn(),
}));

let app;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret';
  const clientRoutes = (await import('../../src/routes/clientRoutes.js')).default;
  app = express();
  app.use(express.json());
  app.use('/api/clients', clientRoutes);
  app.use((err, req, res, _next) => {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  });
});

afterEach(() => {
  mockFindAllActiveClients.mockReset();
});

afterAll(() => {
  jest.resetModules();
});

describe('GET /api/clients/active', () => {
  test('returns only active clients', async () => {
    const activeClients = [
      { client_id: 'C1', client_status: true },
      { client_id: 'C2', client_status: true },
    ];
    mockFindAllActiveClients.mockResolvedValueOnce(activeClients);

    const res = await request(app).get('/api/clients/active');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: activeClients });
    expect(mockFindAllActiveClients).toHaveBeenCalledTimes(1);
  });

  test('propagates service errors to error handler', async () => {
    const error = new Error('database down');
    mockFindAllActiveClients.mockRejectedValueOnce(error);

    const res = await request(app).get('/api/clients/active');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'Internal Server Error' });
    expect(mockFindAllActiveClients).toHaveBeenCalledTimes(1);
  });
});
