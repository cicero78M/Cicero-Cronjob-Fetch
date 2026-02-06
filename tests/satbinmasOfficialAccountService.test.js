import { jest } from '@jest/globals';

const mockFindClientById = jest.fn();
const mockFindAllOrgClients = jest.fn();
const mockFindAccountsByClient = jest.fn();
const mockFindAccountByClientAndPlatform = jest.fn();
const mockFindAccountByPlatformAndUsername = jest.fn();
const mockFindAccountById = jest.fn();
const mockUpsertAccount = jest.fn();
const mockRemoveAccount = jest.fn();

jest.unstable_mockModule('../src/model/clientModel.js', () => ({
  findById: mockFindClientById,
  findAllOrgClients: mockFindAllOrgClients,
}));

jest.unstable_mockModule('../src/model/satbinmasOfficialAccountModel.js', () => ({
  findByClientId: mockFindAccountsByClient,
  findByClientIdAndPlatform: mockFindAccountByClientAndPlatform,
  findByPlatformAndUsername: mockFindAccountByPlatformAndUsername,
  findById: mockFindAccountById,
  upsertAccount: mockUpsertAccount,
  removeById: mockRemoveAccount,
}));

let listSatbinmasOfficialAccounts;
let saveSatbinmasOfficialAccount;
let deleteSatbinmasOfficialAccount;
let getSatbinmasOfficialAttendance;

beforeAll(async () => {
  ({
    listSatbinmasOfficialAccounts,
    saveSatbinmasOfficialAccount,
    deleteSatbinmasOfficialAccount,
    getSatbinmasOfficialAttendance,
  } = await import('../src/service/satbinmasOfficialAccountService.js'));
});

beforeEach(() => {
  mockFindClientById.mockReset();
  mockFindAllOrgClients.mockReset();
  mockFindAccountsByClient.mockReset();
  mockFindAccountByClientAndPlatform.mockReset();
  mockFindAccountByPlatformAndUsername.mockReset();
  mockFindAccountById.mockReset();
  mockUpsertAccount.mockReset();
  mockRemoveAccount.mockReset();
});

test('listSatbinmasOfficialAccounts returns rows for existing client', async () => {
  mockFindClientById.mockResolvedValue({ client_id: 'POLRES01' });
  const accounts = [{ satbinmas_account_id: '1' }];
  mockFindAccountsByClient.mockResolvedValue(accounts);

  const result = await listSatbinmasOfficialAccounts('polres01');

  expect(mockFindClientById).toHaveBeenCalledWith('polres01');
  expect(mockFindAccountsByClient).toHaveBeenCalledWith('POLRES01');
  expect(result).toEqual(accounts);
});

test('listSatbinmasOfficialAccounts throws 404 when client missing', async () => {
  mockFindClientById.mockResolvedValue(null);
  await expect(listSatbinmasOfficialAccounts('unknown')).rejects.toMatchObject({
    statusCode: 404,
  });
});

test('saveSatbinmasOfficialAccount validates platform', async () => {
  mockFindClientById.mockResolvedValue({ client_id: 'POLRES01' });
  await expect(
    saveSatbinmasOfficialAccount('POLRES01', {
      username: '@satbinmas',
    })
  ).rejects.toMatchObject({ statusCode: 400 });
});

test('saveSatbinmasOfficialAccount validates username', async () => {
  mockFindClientById.mockResolvedValue({ client_id: 'POLRES01' });
  await expect(
    saveSatbinmasOfficialAccount('POLRES01', {
      platform: 'instagram',
    })
  ).rejects.toMatchObject({ statusCode: 400 });
});

test('saveSatbinmasOfficialAccount creates new row with default active flag', async () => {
  mockFindClientById.mockResolvedValue({ client_id: 'POLRES01' });
  mockFindAccountByClientAndPlatform.mockResolvedValue(null);
  mockFindAccountByPlatformAndUsername.mockResolvedValue(null);
  const account = {
    satbinmas_account_id: 'uuid-1',
    client_id: 'POLRES01',
    platform: 'instagram',
    username: '@Satbinmas',
    display_name: 'Satbinmas Kota',
    profile_url: 'https://instagram.com/satbinmas',
    is_active: true,
    is_verified: false,
  };
  mockUpsertAccount.mockResolvedValue(account);

  const result = await saveSatbinmasOfficialAccount('polres01', {
    platform: ' Instagram ',
    username: '  @Satbinmas  ',
    display_name: ' Satbinmas Kota ',
    profile_url: ' https://instagram.com/satbinmas ',
  });

  expect(mockFindAccountByClientAndPlatform).toHaveBeenCalledWith('POLRES01', 'instagram');
  expect(mockUpsertAccount).toHaveBeenCalledWith({
    client_id: 'POLRES01',
    platform: 'instagram',
    username: '@Satbinmas',
    display_name: 'Satbinmas Kota',
    profile_url: 'https://instagram.com/satbinmas',
    secUid: null,
    is_active: true,
    is_verified: false,
  });
  expect(result).toEqual({ account, created: true });
});

test('saveSatbinmasOfficialAccount keeps existing values when not provided', async () => {
  mockFindClientById.mockResolvedValue({ client_id: 'POLRES01' });
  mockFindAccountByClientAndPlatform.mockResolvedValue({
    satbinmas_account_id: 'existing-uuid',
    is_active: false,
    is_verified: true,
    display_name: 'Existing Name',
    profile_url: 'https://existing',
    secUid: 'existing-secuid',
  });
  mockFindAccountByPlatformAndUsername.mockResolvedValue({
    satbinmas_account_id: 'existing-uuid',
  });
  const account = {
    satbinmas_account_id: 'uuid-2',
    client_id: 'POLRES01',
    platform: 'instagram',
    username: '@Satbinmas',
    display_name: 'Existing Name',
    profile_url: 'https://existing',
    secUid: 'existing-secuid',
    is_active: false,
    is_verified: true,
  };
  mockUpsertAccount.mockResolvedValue(account);

  const result = await saveSatbinmasOfficialAccount('POLRES01', {
    platform: 'instagram',
    username: '@Satbinmas',
  });

  expect(mockUpsertAccount).toHaveBeenCalledWith({
    client_id: 'POLRES01',
    platform: 'instagram',
    username: '@Satbinmas',
    display_name: 'Existing Name',
    profile_url: 'https://existing',
    secUid: 'existing-secuid',
    is_active: false,
    is_verified: true,
  });
  expect(result).toEqual({ account, created: false });
});

test('saveSatbinmasOfficialAccount validates boolean values', async () => {
  mockFindClientById.mockResolvedValue({ client_id: 'POLRES01' });
  mockFindAccountByClientAndPlatform.mockResolvedValue(null);
  mockFindAccountByPlatformAndUsername.mockResolvedValue(null);

  await expect(
    saveSatbinmasOfficialAccount('POLRES01', {
      platform: 'instagram',
      username: '@Satbinmas',
      is_active: 'maybe',
    })
  ).rejects.toMatchObject({ statusCode: 400 });
});

test('saveSatbinmasOfficialAccount parses boolean strings', async () => {
  mockFindClientById.mockResolvedValue({ client_id: 'POLRES01' });
  mockFindAccountByClientAndPlatform.mockResolvedValue({
    satbinmas_account_id: 'existing-uuid',
    is_active: false,
    is_verified: false,
  });
  mockFindAccountByPlatformAndUsername.mockResolvedValue({
    satbinmas_account_id: 'existing-uuid',
  });
  const account = {
    satbinmas_account_id: 'uuid-3',
    client_id: 'POLRES01',
    platform: 'tiktok',
    username: '@sat',
    is_active: true,
    is_verified: true,
  };
  mockUpsertAccount.mockResolvedValue(account);

  const result = await saveSatbinmasOfficialAccount('POLRES01', {
    platform: 'TIKTOK',
    username: '@sat',
    is_active: 'yes',
    is_verified: 'true',
    secUid: 'SEC-123',
  });

  expect(mockUpsertAccount).toHaveBeenCalledWith({
    client_id: 'POLRES01',
    platform: 'tiktok',
    username: '@sat',
    display_name: null,
    profile_url: null,
    secUid: 'SEC-123',
    is_active: true,
    is_verified: true,
  });
  expect(result).toEqual({ account, created: false });
});

test('saveSatbinmasOfficialAccount defaults is_verified to false when new value missing', async () => {
  mockFindClientById.mockResolvedValue({ client_id: 'POLRES01' });
  mockFindAccountByClientAndPlatform.mockResolvedValue(null);
  mockFindAccountByPlatformAndUsername.mockResolvedValue(null);
  const account = {
    satbinmas_account_id: 'uuid-6',
    client_id: 'POLRES01',
    platform: 'instagram',
    username: '@sat',
    is_active: true,
    is_verified: false,
  };
  mockUpsertAccount.mockResolvedValue(account);

  const result = await saveSatbinmasOfficialAccount('POLRES01', {
    platform: 'instagram',
    username: '@sat',
  });

  expect(mockUpsertAccount).toHaveBeenCalledWith({
    client_id: 'POLRES01',
    platform: 'instagram',
    username: '@sat',
    display_name: null,
    profile_url: null,
    secUid: null,
    is_active: true,
    is_verified: false,
  });
  expect(result).toEqual({ account, created: true });
});

test('saveSatbinmasOfficialAccount rejects duplicate username on platform across clients', async () => {
  mockFindClientById.mockResolvedValue({ client_id: 'POLRES01' });
  mockFindAccountByClientAndPlatform.mockResolvedValue(null);
  mockFindAccountByPlatformAndUsername.mockResolvedValue({
    satbinmas_account_id: 'other-uuid',
    client_id: 'OTHER',
  });

  await expect(
    saveSatbinmasOfficialAccount('POLRES01', {
      platform: 'instagram',
      username: '@satbinmas',
    })
  ).rejects.toMatchObject({ statusCode: 409 });
  expect(mockUpsertAccount).not.toHaveBeenCalled();
});

test('saveSatbinmasOfficialAccount maps database unique errors to 409', async () => {
  mockFindClientById.mockResolvedValue({ client_id: 'POLRES01' });
  mockFindAccountByClientAndPlatform.mockResolvedValue(null);
  mockFindAccountByPlatformAndUsername.mockResolvedValue(null);
  mockUpsertAccount.mockRejectedValue({ code: '23505' });

  await expect(
    saveSatbinmasOfficialAccount('POLRES01', {
      platform: 'tiktok',
      username: '@satbinmas',
    })
  ).rejects.toMatchObject({ statusCode: 409 });
});

test('deleteSatbinmasOfficialAccount validates account id', async () => {
  await expect(deleteSatbinmasOfficialAccount('POLRES01')).rejects.toMatchObject({
    statusCode: 400,
  });
});

test('deleteSatbinmasOfficialAccount checks client existence', async () => {
  mockFindClientById.mockResolvedValue(null);
  await expect(
    deleteSatbinmasOfficialAccount('POLRES01', 'uuid-1')
  ).rejects.toMatchObject({ statusCode: 404 });
});

test('deleteSatbinmasOfficialAccount checks account ownership', async () => {
  mockFindClientById.mockResolvedValue({ client_id: 'POLRES01' });
  mockFindAccountById.mockResolvedValue({ client_id: 'OTHER' });

  await expect(
    deleteSatbinmasOfficialAccount('POLRES01', 'uuid-1')
  ).rejects.toMatchObject({ statusCode: 404 });
});

test('deleteSatbinmasOfficialAccount removes and returns row', async () => {
  mockFindClientById.mockResolvedValue({ client_id: 'POLRES01' });
  const deleted = {
    satbinmas_account_id: 'uuid-5',
    client_id: 'POLRES01',
    platform: 'instagram',
    username: '@sat',
    is_active: true,
  };
  mockFindAccountById.mockResolvedValue({ client_id: 'POLRES01' });
  mockRemoveAccount.mockResolvedValue(deleted);

  const result = await deleteSatbinmasOfficialAccount('POLRES01', 'uuid-5');

  expect(mockRemoveAccount).toHaveBeenCalledWith('uuid-5');
  expect(result).toEqual(deleted);
});

test('getSatbinmasOfficialAttendance summarizes ORG clients', async () => {
  mockFindAllOrgClients.mockResolvedValue([
    { client_id: 'POLRES01', nama: 'Polres Satu' },
    { client_id: 'POLRES02', nama: 'Polres Dua' },
  ]);

  mockFindAccountsByClient.mockImplementation(async (clientId) => {
    if (clientId === 'POLRES01') {
      return [
        { platform: 'instagram', username: 'sat1', is_active: true },
        { platform: 'tiktok', username: 'sat1_tiktok', is_active: true },
      ];
    }
    return [
      { platform: 'instagram', username: '', is_active: true },
      { platform: 'tiktok', username: 'inactive', is_active: false },
    ];
  });

  const result = await getSatbinmasOfficialAttendance();

  expect(mockFindAllOrgClients).toHaveBeenCalled();
  expect(mockFindAccountsByClient).toHaveBeenCalledTimes(2);
  expect(mockFindAccountsByClient).toHaveBeenCalledWith('POLRES01');
  expect(mockFindAccountsByClient).toHaveBeenCalledWith('POLRES02');
  expect(result).toEqual([
    {
      client_id: 'POLRES01',
      nama: 'Polres Satu',
      instagram: true,
      tiktok: true,
    },
    {
      client_id: 'POLRES02',
      nama: 'Polres Dua',
      instagram: false,
      tiktok: false,
    },
  ]);
});

test('getSatbinmasOfficialAttendance handles empty org roster', async () => {
  mockFindAllOrgClients.mockResolvedValue([]);

  const result = await getSatbinmasOfficialAttendance();

  expect(result).toEqual([]);
  expect(mockFindAccountsByClient).not.toHaveBeenCalled();
});
