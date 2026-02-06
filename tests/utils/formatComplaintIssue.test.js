import { formatComplaintIssue } from '../../src/utils/utilsHelper.js';

describe('formatComplaintIssue', () => {
  it('formats structured complaint messages into sections', () => {
    const raw = `Pesan Komplain\nNRP    : 75020201\nNama : Nanang Yuwono\nPolres : Mojokerto kota\nUsername IG : @ Nanang yuwono\nUsername Tiktok : @nanang30yuwono\n\nKendala\n- sudah melaksanakan Instagram belum terdata\n- sudah melaksanakan tiktok belum terdata.`;

    const formatted = formatComplaintIssue(raw);

    expect(formatted).toBe(
      [
        '*Informasi Tambahan Pelapor*',
        '• NRP/NIP: 75020201',
        '• Nama: Nanang Yuwono',
        '• Polres: Mojokerto Kota',
        '• Instagram: @nanangyuwono',
        '• TikTok: @nanang30yuwono',
        '',
        '*Rincian Kendala*',
        '1. Sudah melaksanakan Instagram belum terdata.',
        '2. Sudah melaksanakan tiktok belum terdata.',
      ].join('\n')
    );
  });

  it('returns original text when the structure is not recognized', () => {
    const raw = 'Keluhan umum tanpa format khusus';
    expect(formatComplaintIssue(raw)).toBe(raw);
  });

  it('normalizes social handles provided as profile URLs', () => {
    const raw = [
      'Pesan Komplain',
      'NRP    : 75020201',
      'Nama : Nanang Yuwono',
      'Polres : Mojokerto kota',
      'Username IG : https://instagram.com/u/Example.User/',
      'Username Tiktok : https://www.tiktok.com/@AnotherUser',
      '',
      'Kendala',
      '- Sudah melaksanakan Instagram belum terdata',
    ].join('\n');

    const formatted = formatComplaintIssue(raw);

    expect(formatted).toContain('• Instagram: @example.user');
    expect(formatted).toContain('• TikTok: @anotheruser');
  });
});
