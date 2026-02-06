import { getNamaPriorityIndex } from '../src/utils/sqlPriority.js';
import { PRIORITY_USER_NAMES } from '../src/utils/constants.js';

describe('getNamaPriorityIndex', () => {
  test('returns zero-based index for known names regardless of case', () => {
    const target = PRIORITY_USER_NAMES[0];
    const idxUpper = getNamaPriorityIndex(target);
    const idxLower = getNamaPriorityIndex(target.toLowerCase());
    expect(idxUpper).toBe(0);
    expect(idxLower).toBe(0);
  });

  test('returns fallback index when name is not prioritized', () => {
    const fallback = getNamaPriorityIndex('Tidak Terdaftar');
    expect(fallback).toBe(PRIORITY_USER_NAMES.length);
  });

  test('trims whitespace before computing index', () => {
    const target = PRIORITY_USER_NAMES[1];
    const idx = getNamaPriorityIndex(`  ${target}\n`);
    expect(idx).toBe(1);
  });
});
