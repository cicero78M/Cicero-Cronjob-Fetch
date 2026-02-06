
// Regex untuk deteksi link IG/TikTok
export const IG_PROFILE_REGEX =
  /^https?:\/\/(www\.)?instagram\.com\/([A-Za-z0-9._]+)(?:[/?].*)?$/i;
export const TT_PROFILE_REGEX =
  /^https?:\/\/(www\.)?tiktok\.com\/@([A-Za-z0-9._]+)\/?$/i;

// Urutan prioritas satker (nama) untuk pelaporan
export const PRIORITY_USER_NAMES = [
  "POLRES LAMONGAN",
  "POLRES BOJONEGORO",
  "POLRES PROBOLINGGO",
  "POLRES NGAWI",
  "POLRES MADIUN",
  "POLRES PACITAN",
  "POLRES BONDOWOSO",
  "POLRES SITUBONDO",
  "POLRES MOJOKERTO",
  "POLRES KEDIRI",
  "POLRES KEDIRI KOTA",
  "POLRESTA MALANG KOTA",
  "POLRES MADIUN KOTA",
];

export const adminCommands = [
  "addnewclient#",
  "updateclient#",
  "removeclient#",
  "clientinfo#",
  "clientrequest",
  "advancedclientrequest",
  "transferuser#",
  "sheettransfer#",
  "thisgroup#",
  "requestinsta#",
  "requesttiktok#",
  "fetchinsta#",
  "fetchtiktok#",
  "absensilikes#",
  "absensikomentar#",
  "exception#",
  "status#",
  "grantsub#",
  "denysub#",
  "grantdashsub#",
  "denydashsub#",
  "approvedash#",
  "denydash#",
  "grantaccess#",
  "dennyaccess#",
  "denyaccess#",
  "dashrequest",
  "dirrequest",
  "savecontact",
];

export const hariIndo = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];
