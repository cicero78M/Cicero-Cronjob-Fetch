import { jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../src/repository/db.js', () => ({
  query: mockQuery,
}));

let createDetail;
let updateDetail;
let findDetailByEvent;

beforeAll(async () => {
  const mod = await import('../src/model/pressReleaseDetailModel.js');
  createDetail = mod.createDetail;
  updateDetail = mod.updateDetail;
  findDetailByEvent = mod.findDetailByEvent;
});

beforeEach(() => {
  mockQuery.mockReset();
});

test('createDetail inserts row', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ event_id: 1 }] });
  const data = { event_id: 1, judul: 'x' };
  const row = await createDetail(data);
  expect(row).toEqual({ event_id: 1 });
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO press_release_detail'),
    [
      1,
      'x',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]
  );
});

test('findDetailByEvent selects by id', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ event_id: 1 }] });
  const row = await findDetailByEvent(1);
  expect(row).toEqual({ event_id: 1 });
  expect(mockQuery).toHaveBeenCalledWith(
    'SELECT * FROM press_release_detail WHERE event_id=$1',
    [1]
  );
});

test('updateDetail updates row', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ event_id: 1 }] })
    .mockResolvedValueOnce({ rows: [{ event_id: 1, judul: 'a' }] });
  const row = await updateDetail(1, { judul: 'a' });
  expect(row).toEqual({ event_id: 1, judul: 'a' });
  expect(mockQuery).toHaveBeenLastCalledWith(
    expect.stringContaining('UPDATE press_release_detail SET'),
    [
      1,
      'a',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]
  );
});

