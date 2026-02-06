import { jest } from '@jest/globals';

const mockFindById = jest.fn();

jest.unstable_mockModule('../../src/model/clientModel.js', () => ({
  findById: mockFindById,
  findAllActiveDirektoratWithSosmed: jest.fn(),
}));

const { resolveAggregatorClient } = await import('../../src/service/aggregatorService.js');

describe('resolveAggregatorClient', () => {
  beforeEach(() => {
    mockFindById.mockReset();
  });

  test('returns BIDHUMAS org when DITSAMAPTA is requested by BIDHUMAS', async () => {
    mockFindById.mockImplementation(async (id) => {
      if (id === 'BIDHUMAS') return { client_id: 'BIDHUMAS', client_type: 'org' };
      if (id === 'DITSAMAPTA') return { client_id: 'DITSAMAPTA', client_type: 'direktorat' };
      return null;
    });

    const result = await resolveAggregatorClient('DITSAMAPTA', 'BIDHUMAS');

    expect(result).toEqual({
      client: { client_id: 'BIDHUMAS', client_type: 'org' },
      resolvedClientId: 'BIDHUMAS',
      requestedClientId: 'DITSAMAPTA',
      reason: 'bidhumas-org-override',
    });
    expect(mockFindById).toHaveBeenCalledWith('BIDHUMAS');
  });

  test('forces BIDHUMAS org resolution in a case-insensitive manner', async () => {
    mockFindById.mockImplementation(async (id) => {
      if (id === 'BIDHUMAS') return { client_id: 'BIDHUMAS', client_type: 'org' };
      if (id === 'DITSAMAPTA') return { client_id: 'DITSAMAPTA', client_type: 'direktorat' };
      return null;
    });

    const result = await resolveAggregatorClient('ditsamapta', 'bidhumas');

    expect(result?.resolvedClientId).toBe('BIDHUMAS');
    expect(result?.reason).toBe('bidhumas-org-override');
  });

  test('keeps directorate resolution for other roles', async () => {
    mockFindById.mockImplementation(async (id) => {
      if (id === 'DITLANTAS') return { client_id: 'DITLANTAS', client_type: 'direktorat' };
      if (id === 'BIDHUMAS') return { client_id: 'BIDHUMAS', client_type: 'org' };
      return null;
    });

    const result = await resolveAggregatorClient('DITLANTAS', 'BIDHUMAS');

    expect(result).toEqual({
      client: { client_id: 'DITLANTAS', client_type: 'direktorat' },
      resolvedClientId: 'DITLANTAS',
      requestedClientId: 'DITLANTAS',
      reason: 'direktorat-requested',
    });
  });

  test('maps org requests using directorate role to parent directorate', async () => {
    mockFindById.mockImplementation(async (id) => {
      if (id === 'ORG1') return { client_id: 'ORG1', client_type: 'org' };
      if (id === 'DITLANTAS') return { client_id: 'DITLANTAS', client_type: 'direktorat' };
      return null;
    });

    const result = await resolveAggregatorClient('ORG1', 'DITLANTAS');

    expect(result).toEqual({
      client: { client_id: 'DITLANTAS', client_type: 'direktorat' },
      resolvedClientId: 'DITLANTAS',
      requestedClientId: 'ORG1',
      reason: 'org-role-mapped',
    });
  });
});
