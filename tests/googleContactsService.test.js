import { jest } from '@jest/globals';
import fs from 'fs/promises';
import { EventEmitter } from 'events';

const mockQuery = jest.fn();
const mockSearchContacts = jest.fn();
const mockCreateContact = jest.fn();

class MockOAuth2 extends EventEmitter {
  constructor() {
    super();
    this.setCredentials = jest.fn();
    this.generateAuthUrl = jest.fn();
    this.getAccessToken = jest
      .fn()
      .mockImplementation(async () => {
        this.credentials = {
          access_token: 'refreshed-token',
          refresh_token: 'refresh',
          expiry_date: Date.now() + 3600000,
        };
        return 'refreshed-token';
      });
  }
}

const mockPeople = jest.fn(() => ({
  people: { searchContacts: mockSearchContacts, createContact: mockCreateContact }
}));

jest.unstable_mockModule('../src/db/index.js', () => ({
  query: mockQuery
}));

jest.unstable_mockModule('googleapis', () => ({
  google: {
    auth: { OAuth2: MockOAuth2 },
    people: mockPeople,
  },
}));

let saveContactIfNew, authorize, setContactCacheTTL, clearContactCache;

beforeAll(async () => {
  await fs.writeFile(
    'credentials.json',
    JSON.stringify({
      installed: { client_id: 'id', client_secret: 'secret', redirect_uris: ['uri'] },
    })
  );
  await fs.writeFile(
    'token.json',
    JSON.stringify({
      access_token: 'token',
      refresh_token: 'refresh',
      expiry_date: Date.now() + 3600000,
    })
  );
  ({
    saveContactIfNew,
    authorize,
    setContactCacheTTL,
    clearContactCache,
  } = await import('../src/service/googleContactsService.js'));
});

afterAll(async () => {
  await fs.unlink('credentials.json');
  await fs.unlink('token.json');
});

beforeEach(() => {
  mockQuery.mockReset();
  mockSearchContacts.mockReset();
  mockCreateContact.mockReset();
  mockPeople.mockClear();
  clearContactCache();
  setContactCacheTTL(300000);
});

describe('saveContactIfNew', () => {
  test('skips when credentials.json missing', async () => {
    await fs.unlink('credentials.json');
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await saveContactIfNew('11111@c.us');

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockPeople).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[GOOGLE CONTACT] credentials.json not found, skipping contact save.'
    );

    warnSpy.mockRestore();
    await fs.writeFile(
      'credentials.json',
      JSON.stringify({ installed: { client_id: 'id', client_secret: 'secret', redirect_uris: ['uri'] } })
    );
  });
  test('skips when redirect_uris missing', async () => {
    await fs.writeFile(
      'credentials.json',
      JSON.stringify({ installed: { client_id: 'id', client_secret: 'secret' } })
    );
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await saveContactIfNew('22222@c.us');

    expect(mockPeople).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[GOOGLE CONTACT] redirect_uris missing in credentials.json, skipping contact save.'
    );

    warnSpy.mockRestore();
    await fs.writeFile(
      'credentials.json',
      JSON.stringify({ installed: { client_id: 'id', client_secret: 'secret', redirect_uris: ['uri'] } })
    );
  });
  test('skips existing contact', async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ phone_number: '123', resource_name: 'people/123' }],
    });
    await saveContactIfNew('12345@c.us');
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockPeople).not.toHaveBeenCalled();
  });

  test('logs error when Google API returns 403', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    mockSearchContacts
      .mockResolvedValueOnce({ data: { results: [] } })
      .mockResolvedValueOnce({ data: { results: [] } });
    mockCreateContact.mockRejectedValueOnce({
      message: 'Forbidden',
      response: { status: 403 },
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await saveContactIfNew('98765@c.us');

    expect(mockSearchContacts).toHaveBeenCalledTimes(2);
    expect(mockCreateContact).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(
      '[GOOGLE CONTACT] Failed to save contact:',
      'Forbidden',
      '(status 403)'
    );

    errorSpy.mockRestore();
  });

  test('uses Admin client name when number belongs to dashboard or operator', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [{ client_name: 'Demo' }] })
      .mockResolvedValueOnce({});
    mockSearchContacts
      .mockResolvedValueOnce({ data: { results: [] } })
      .mockResolvedValueOnce({ data: { results: [] } });
    mockCreateContact.mockResolvedValueOnce({
      data: { resourceName: 'people/88888' },
    });

    await saveContactIfNew('88888@c.us');

    expect(mockCreateContact).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          names: [{ givenName: 'Admin Demo' }],
          phoneNumbers: [{ value: '+88888' }],
        }),
      })
    );
    expect(mockQuery).toHaveBeenCalledTimes(3);
    expect(mockQuery.mock.calls[2][0]).toMatch(
      /INSERT INTO saved_contact \(phone_number, resource_name\)[\s\S]*ON CONFLICT \(phone_number\) DO UPDATE SET resource_name = EXCLUDED.resource_name/
    );
  });

  test('re-saves contact when resource_name is null', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ phone_number: '999', resource_name: null }],
      })
      .mockResolvedValueOnce({ rows: [{ nama: 'User Name' }] })
      .mockResolvedValueOnce({});
    mockSearchContacts
      .mockResolvedValueOnce({ data: { results: [] } })
      .mockResolvedValueOnce({ data: { results: [] } });
    mockCreateContact.mockResolvedValueOnce({
      data: { resourceName: 'people/999' },
    });

    await saveContactIfNew('999@c.us');

    expect(mockCreateContact).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          names: [{ givenName: 'User Name' }],
          phoneNumbers: [{ value: '+999' }],
        }),
      })
    );
    expect(mockQuery).toHaveBeenCalledTimes(3);
    expect(mockQuery.mock.calls[2][0]).toMatch(
      /INSERT INTO saved_contact \(phone_number, resource_name\)[\s\S]*ON CONFLICT \(phone_number\) DO UPDATE SET resource_name = EXCLUDED.resource_name/
    );
  });

  test('queries database only for new numbers', async () => {
    setContactCacheTTL(10000);
    mockQuery
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({});
    mockSearchContacts
      .mockResolvedValueOnce({ data: { results: [] } })
      .mockResolvedValueOnce({ data: { results: [] } });
    mockCreateContact.mockResolvedValueOnce({
      data: { resourceName: 'people/55555' },
    });

    await saveContactIfNew('55555@c.us');
    const firstCall = mockQuery.mock.calls.length;
    await saveContactIfNew('55555@c.us');

    expect(mockQuery).toHaveBeenCalledTimes(firstCall);
    expect(mockSearchContacts).toHaveBeenCalledTimes(2);
    expect(mockCreateContact).toHaveBeenCalledTimes(1);
  });
});

describe('authorize', () => {
  test('refreshes token when expired', async () => {
    await fs.writeFile(
      'token.json',
      JSON.stringify({
        access_token: 'old',
        refresh_token: 'refresh',
        expiry_date: Date.now() - 1000,
      })
    );
    const authClient = await authorize();
    expect(authClient.getAccessToken).toHaveBeenCalledTimes(1);
    const updated = JSON.parse(await fs.readFile('token.json', 'utf8'));
    expect(updated.access_token).toBe('refreshed-token');
    expect(updated.expiry_date).toBeGreaterThan(Date.now());
  });
});

