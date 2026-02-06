const rawSatkerDspEntries = [
  ["DIREKTORAT BINMAS", 102],
  ["POLRES LAMONGAN", 335],
  ["POLRES BOJONEGORO", 297],
  ["POLRES PROBOLINGGO", 131],
  ["POLRES NGAWI", 231],
  ["POLRES MADIUN", 193],
  ["POLRES PACITAN", 117],
  ["POLRES BONDOWOSO", 85],
  ["POLRES SITUBONDO", 80],
  ["POLRES MOJOKERTO", 248],
  ["POLRES KEDIRI", 241],
  ["POLRES KEDIRI KOTA", 120],
  ["POLRESTA MALANG KOTA", 68],
  ["POLRES MADIUN KOTA", 68],
  ["POLRES MAGETAN", 244],
  ["POLRES PONOROGO", 246],
  ["POLRES BLITAR", 183],
  ["POLRES JEMBER", 260],
  ["POLRES MOJOKERTO KOTA", 96],
  ["POLRES SUMENEP", 119],
  ["POLRES NGANJUK", 300],
  ["POLRES TULUNGAGUNG", 284],
  ["POLRES JOMBANG", 239],
  ["POLRES LUMAJANG", 95],
  ["POLRES MALANG", 45],
  ["POLRES TUBAN", 183],
  ["POLRES BLITAR KOTA", 108],
  ["POLRES GRESIK", 234],
  ["POLRES PROBOLINGGO KOTA", 56],
  ["POLRES PAMEKASAN", null],
  ["POLRESTA BANYUWANGI", 186],
  ["POLRESTABES SURABAYA", 151],
  ["POLRES PASURUAN KOTA", 68],
  ["POLRES TRENGGALEK", 171],
  ["POLRES KP3 TANJUNG PERAK", 33],
  ["POLRES PASURUAN", 165],
  ["POLRESTA SIDOARJO", 241],
  ["POLRES SAMPANG", 160],
  ["POLRES BANGKALAN", 60],
  ["POLRES BATU", 69],
];

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[_\s]+/g, " ")
    .trim()
    .toUpperCase();
}

const satkerDspMap = new Map();
for (const [label, count] of rawSatkerDspEntries) {
  const key = normalizeKey(label);
  if (!key) continue;
  satkerDspMap.set(key, typeof count === "number" ? count : null);
}

export function getSatkerDspCount(...keys) {
  for (const key of keys) {
    const normalized = normalizeKey(key);
    if (!normalized) continue;
    if (satkerDspMap.has(normalized)) {
      return satkerDspMap.get(normalized);
    }
  }
  return null;
}

export const SATKER_DSP_MAP = satkerDspMap;

export default satkerDspMap;
