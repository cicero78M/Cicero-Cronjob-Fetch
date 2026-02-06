import { jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../src/repository/db.js', () => ({
  query: mockQuery
}));

let createRequest;
let updateRequest;
let expireOldRequests;

beforeAll(async () => {
  const mod = await import('../src/model/premiumRequestModel.js');
  createRequest = mod.createRequest;
  updateRequest = mod.updateRequest;
  expireOldRequests = mod.expireOldRequests;
});

beforeEach(() => {
  mockQuery.mockReset();
});

test('createRequest inserts row', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ request_id: 1 }] });
  const row = await createRequest({
    user_id: '1',
    sender_name: 'A',
    account_number: '123',
    bank_name: 'BCA',
    screenshot_url: 'x.png',
  });
  expect(row).toEqual({ request_id: 1 });
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO premium_request'),
    ['1', 'A', '123', 'BCA', 'x.png', 'pending', null, null]
  );
});

test('updateRequest updates row', async () => {
  mockQuery
    .mockResolvedValueOnce({
      rows: [{
        request_id: 1,
        status: 'pending',
        user_id: '1',
        sender_name: 'A',
        account_number: '123',
        bank_name: 'BCA',
        screenshot_url: 'x',
      }],
    })
    .mockResolvedValueOnce({ rows: [{ request_id: 1, status: 'approved' }] });
  const row = await updateRequest(1, { status: 'approved' });
  expect(row).toEqual({ request_id: 1, status: 'approved' });
  expect(mockQuery).toHaveBeenLastCalledWith(
    expect.stringContaining('UPDATE premium_request'),
    [1, '1', 'A', '123', 'BCA', 'x', 'approved', null]
  );
});

test('expireOldRequests runs update', async () => {
  mockQuery.mockResolvedValueOnce({});
  await expireOldRequests(3);
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('UPDATE premium_request SET status')
  );
});
