import { jest } from '@jest/globals';

import { PRIORITY_USER_NAMES } from '../../src/utils/constants.js';

const mockQuery = jest.fn();

jest.unstable_mockModule('../../src/repository/db.js', () => ({
  query: mockQuery,
}));

let getInstaFilledUsersByClient;
let getInstaEmptyUsersByClient;
let getTiktokFilledUsersByClient;
let getTiktokEmptyUsersByClient;
let getUsersWithWaByClient;
let getUsersMissingDataByClient;

beforeAll(async () => {
  ({
    getInstaFilledUsersByClient,
    getInstaEmptyUsersByClient,
    getTiktokFilledUsersByClient,
    getTiktokEmptyUsersByClient,
    getUsersWithWaByClient,
    getUsersMissingDataByClient,
  } = await import('../../src/model/userModel.js'));
});

beforeEach(() => {
  mockQuery.mockReset();
});

function buildExpectedPriorityCase(alias = 'u') {
  const upperColumn = `UPPER(COALESCE(${alias}.nama, ''))`;
  const defaultRank = PRIORITY_USER_NAMES.length + 1;
  const cases = PRIORITY_USER_NAMES.map(
    (name, index) => `WHEN ${upperColumn} = '${name.toUpperCase()}' THEN ${index + 1}`
  ).join(' ');
  return `CASE ${cases} ELSE ${defaultRank} END`;
}

const EXPECTED_CASE = buildExpectedPriorityCase('u');

describe('userModel name priority ordering', () => {
  const functionsWithDivisionOrder = [
    ['getInstaFilledUsersByClient', () => getInstaFilledUsersByClient('client-1')],
    ['getInstaEmptyUsersByClient', () => getInstaEmptyUsersByClient('client-1')],
    ['getTiktokFilledUsersByClient', () => getTiktokFilledUsersByClient('client-1')],
    ['getTiktokEmptyUsersByClient', () => getTiktokEmptyUsersByClient('client-1')],
    ['getUsersWithWaByClient', () => getUsersWithWaByClient('client-1')],
  ];

  test.each(functionsWithDivisionOrder)(
    '%s uses priority CASE ordering before division/name fallback',
    async (_, invoke) => {
      mockQuery.mockResolvedValueOnce({ rows: [{ client_type: 'regular' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await invoke();

      expect(mockQuery).toHaveBeenCalledTimes(2);
      const sql = mockQuery.mock.calls[1][0];
      expect(sql).toContain(`ORDER BY ${EXPECTED_CASE}, divisi, nama`);
      expect(sql).toContain(`ELSE ${PRIORITY_USER_NAMES.length + 1} END`);
    }
  );

  test('getUsersMissingDataByClient uses priority CASE ordering before name fallback', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ client_type: 'regular' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getUsersMissingDataByClient('client-1');

    expect(mockQuery).toHaveBeenCalledTimes(2);
    const sql = mockQuery.mock.calls[1][0];
    expect(sql).toContain(`ORDER BY ${EXPECTED_CASE}, nama`);
    expect(sql).toContain(`ELSE ${PRIORITY_USER_NAMES.length + 1} END`);
  });

  test('priority constant contains 13 names', () => {
    expect(PRIORITY_USER_NAMES).toHaveLength(13);
  });
});

