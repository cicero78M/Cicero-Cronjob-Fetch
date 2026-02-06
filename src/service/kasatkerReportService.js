import { collectEngagementRanking } from './engagementRankingExcelService.js';

const CATEGORY_RULES = [
  { key: 'aktif', label: '\n*KEPATUHAN AKTIF*', threshold: 90 },
  { key: 'sedang', label: '\n*KEPATUHAN SEDANG*', threshold: 50 },
  { key: 'rendah', label: '\n*KEPATUHAN RENDAH*', threshold: 0 },
];

const WA_FOLLOW_UP_LINK =
  'https://chat.whatsapp.com/Hga2FkPQOw5BuZW7nSFYV1';

function toPercentLabel(value) {
  const pct = Number.isFinite(value) ? Math.max(0, value) : 0;
  const rounded = Math.round(pct * 10) / 10;
  const formatted = Number.isInteger(rounded)
    ? rounded.toString()
    : rounded.toFixed(1);
  return `${formatted}%`;
}

function categorizeCompliance(compliancePct) {
  if (compliancePct >= CATEGORY_RULES[0].threshold) {
    return CATEGORY_RULES[0];
  }
  if (compliancePct >= CATEGORY_RULES[1].threshold) {
    return CATEGORY_RULES[1];
  }
  return CATEGORY_RULES[2];
}

function buildCategorySections(grouped) {
  return CATEGORY_RULES.map((rule) => {
    const entries = grouped[rule.key] || [];
    const title = `${rule.label} (${entries.length} Satker)`;
    if (!entries.length) {
      return `${title}\n-`; // menunjukkan tidak ada satker dalam kategori ini
    }

    const lines = entries.map((entry, idx) => {
      const note = entry.hasNoActivity ? ' (Belum ada pelaksanaan)' : '';
      return `${idx + 1}. ${entry.name} : ${entry.complianceLabel}${note}`;
    });

    return `${title}\n${lines.join('\n')}`;
  });
}

export async function generateKasatkerReport({
  clientId,
  roleFlag = null,
  period = 'today',
  startDate,
  endDate,
} = {}) {
  const {
    clientId: normalizedClientId,
    clientName,
    entries,
    periodInfo,
  } = await collectEngagementRanking(clientId, roleFlag, {
    period,
    startDate,
    endDate,
  });

  const periodLabel = periodInfo?.label || `Periode ${periodInfo?.period || period}`;

  const satkerEntries = (entries || []).filter(
    (entry) => entry?.cid !== normalizedClientId
  );
  const targetEntries = satkerEntries.length ? satkerEntries : entries || [];

  if (!targetEntries.length) {
    throw new Error('Tidak ada data satker untuk disusun.');
  }

  const grouped = targetEntries.reduce(
    (acc, entry) => {
      if (!entry || typeof entry !== 'object') {
        return acc;
      }
      const compliancePct = Number.isFinite(entry.score)
        ? Math.max(0, Math.min(1, entry.score)) * 100
        : 0;
      const category = categorizeCompliance(compliancePct);
      const item = {
        name: (entry.name || entry.cid || '').toUpperCase(),
        complianceValue: compliancePct,
        complianceLabel: toPercentLabel(compliancePct),
        hasNoActivity: compliancePct === 0,
      };
      if (!acc[category.key]) {
        acc[category.key] = [];
      }
      acc[category.key].push(item);
      return acc;
    },
    { aktif: [], sedang: [], rendah: [] }
  );

  Object.values(grouped).forEach((list) => {
    list.sort(
      (a, b) =>
        b.complianceValue - a.complianceValue || a.name.localeCompare(b.name, 'id-ID', { sensitivity: 'base' })
    );
  });

  const sections = buildCategorySections(grouped);

  const now = new Date();
  const tanggal = now.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const jam = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const headerLines = [
    '*KEPADA YTH.*',
    'KASAT BINMAS POLRES JAJARAN POLDA JAWA TIMUR',
    '',
    '*DARI :*',
    'KASUBDIT BHABINKAMTIBMAS',
    '',
    '*TEMBUSAN :*',
    '• DIR BINMAS',
    '• PJU DIT BINMAS',
    '',
    '*Laporan kepatuhan pelaksanaan _Likes_ dan _Komentar_ Media Sosial.*',
    `Periode ${periodLabel}.`,
    '',
    'Dalam rangka monitoring kepatuhan pelaksanaan tugas likes dan komentar terhadap konten akun resmi Direktorat Binmas Polda Jawa Timur melalui aplikasi Cicero, berikut disampaikan hasil rekapitulasi tingkat kepatuhan personel per Polres.',
    '',
    '*KRITERIA KEPATUHAN* - Persentase personel yang melaksanakan tugas _Likes_ dan _Komentar_',
    '',
    '• *AKTIF* : Personil yang sudah melaksanakan ≥ 90%',
    '• *SEDANG* : Personil yang sudah melaksanakan 50% - 89.9%',
    '• *RENDAH* : Personil yang sudah melaksanakan < 50%',
    '',
    '*REKAP KEPATUHAN PER KATEGORI*',
  ];

  const followUpLines = [
    '',
    '*ARAHAN TINDAK LANJUT*',
    '✅ Kepada Kasat Binmas dengan kategori Aktif.',
    'Disampaikan terima kasih dan apresiasi atas kinerja yang konsisten dalam memastikan seluruh personel melaksanakan tugas likes dan komentar dengan baikk. Diharapkan agar tingkat kepatuhan tersebut dapat dipertahankan dan menjadi contoh bagi satuan lainnya.',
    '',
    '⚠️ Kepada Kasat Binmas dengan kategori Rendah.',
    'Diharapkan segera melakukan langkah-langkah perbaikan sebagai berikut:',
    '- Memanggil operator atau staf pengelola media sosial untuk aktif mengikuti arahan dari sistem Cicero melalui grup WhatsApp Manajemen Sosmed Ditbinmas, tautan: https://chat.whatsapp.com/Hga2FkPQOw5BuZW7nSFYV1',
    '- Menginstruksikan operator agar setiap hari membagikan (share) daftar konten yang wajib di-like dan di-comment oleh jajaran Binmas.',
    '- Mendorong seluruh staf Binmas, jajaran Binmas dan personel Bhabinkamtibmas untuk aktif berinteraksi (like dan comment) pada setiap konten resmi yang diunggah oleh Direktorat Binmas.',
    '',
    'Terima kasih atas perhatian dan kerja samanya.',
  ];

  return [
    ...headerLines,
    ...sections,
    ...followUpLines,
  ]
    .filter((line) => line !== undefined && line !== null)
    .join('\n')
    .trim();
}

export default {
  generateKasatkerReport,
};
