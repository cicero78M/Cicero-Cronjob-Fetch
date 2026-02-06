import { matchesKasatBinmasJabatan } from '../src/service/kasatkerAttendanceService.js';

describe('matchesKasatBinmasJabatan', () => {
  test('returns true for plain Kasat Binmas titles', () => {
    expect(matchesKasatBinmasJabatan('Kasat Binmas')).toBe(true);
    expect(matchesKasatBinmasJabatan('KASAT   BINMAS POLRES A')).toBe(true);
    expect(matchesKasatBinmasJabatan('kasatbinmas')).toBe(true);
  });

  test('rejects deputy or modified Kasat Binmas titles', () => {
    expect(matchesKasatBinmasJabatan('WA Kasat Binmas')).toBe(false);
    expect(matchesKasatBinmasJabatan('WAKASAT BINMAS')).toBe(false);
    expect(matchesKasatBinmasJabatan('PJS KASAT BINMAS')).toBe(false);
  });

  test('returns false for unrelated titles', () => {
    expect(matchesKasatBinmasJabatan('Operator')).toBe(false);
    expect(matchesKasatBinmasJabatan('Kasat Intel')).toBe(false);
    expect(matchesKasatBinmasJabatan('')).toBe(false);
  });
});
