import { jest } from '@jest/globals';

const mockGetClientsByRole = jest.fn();
const mockGetUsersByDirektorat = jest.fn();

jest.unstable_mockModule('../src/model/instaLikeModel.js', () => ({
  getLikesByShortcode: jest.fn(),
}));

jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getClientsByRole: mockGetClientsByRole,
  getUsersByDirektorat: mockGetUsersByDirektorat,
}));

describe('groupUsersByClientDivision', () => {
  let groupUsersByClientDivision;

  beforeEach(async () => {
    jest.resetModules();
    mockGetClientsByRole.mockReset();
    mockGetUsersByDirektorat.mockReset();

    ({ groupUsersByClientDivision } = await import('../src/utils/likesHelper.js'));
  });

  test('menambahkan satker dari data user aktif ketika tidak ada filter client', async () => {
    mockGetClientsByRole.mockResolvedValue(['polres_a']);
    mockGetUsersByDirektorat.mockResolvedValue([
      { client_id: 'polres_a', status: true, divisi: 'SAT INTEL', nama: 'User A' },
      { client_id: 'polres_shadow', status: true, divisi: 'SAT BINMAS', nama: 'User Shadow' },
      { client_id: 'polres_shadow', status: false, divisi: 'SAT BINMAS', nama: 'User Inactive' },
      { client_id: null, status: true, divisi: 'BAG OPS', nama: 'User Tanpa Client' },
    ]);

    const result = await groupUsersByClientDivision('ditbinmas');

    expect(mockGetClientsByRole).toHaveBeenCalledWith('ditbinmas');
    expect(mockGetUsersByDirektorat).toHaveBeenCalledWith('ditbinmas');
    expect(result.polresIds).toEqual(['POLRES_A', 'POLRES_SHADOW']);
    expect(result.usersByClient.POLRES_A).toHaveLength(1);
    expect(result.usersByClient.POLRES_SHADOW).toHaveLength(1);
    expect(result.usersByClientDiv.POLRES_SHADOW['SAT BINMAS']).toHaveLength(1);
  });
});
