import { getUsersByClient } from "../model/userModel.js";
import { findAllOrgClients } from "../model/clientModel.js";
import { formatNama } from "../utils/utilsHelper.js";

const DITBINMAS_CLIENT_ID = "DITBINMAS";
const TARGET_ROLE = "ditbinmas";
const PANGKAT_ORDER = [
  "KOMISARIS BESAR POLISI",
  "AKBP",
  "KOMPOL",
  "AKP",
  "IPTU",
  "IPDA",
  "AIPTU",
  "AIPDA",
  "BRIPKA",
  "BRIGPOL",
  "BRIGADIR",
  "BRIGADIR POLISI",
  "BRIPTU",
  "BRIPDA",
];

const REGION_KEYWORDS = [
  "POLRES",
  "POLDA",
  "POLRESTA",
  "POLTABES",
  "POLSEK",
  "KOTA",
  "KAB",
  "KABUPATEN",
  "RESORT",
  "WILAYAH",
];
const REGION_REGEX = new RegExp(`\\b(${REGION_KEYWORDS.join("|")})\\b`, "g");
const KASAT_BINMAS_REGEX = /^KASAT\s*BINMAS\b/;

function rankWeight(rank) {
  const idx = PANGKAT_ORDER.indexOf(String(rank || "").toUpperCase());
  return idx === -1 ? PANGKAT_ORDER.length : idx;
}

function sanitizeJabatanText(jabatan = "") {
  if (!jabatan) {
    return "";
  }

  return jabatan
    .toString()
    .replace(/[.,/:;\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .toUpperCase()
    .replace(REGION_REGEX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesKasatBinmasJabatan(jabatan) {
  const sanitized = sanitizeJabatanText(jabatan);
  if (!sanitized) {
    return false;
  }

  const normalized = sanitized.replace(/\s+/g, " ");
  if (!normalized.startsWith("KASAT")) {
    return false;
  }

  return KASAT_BINMAS_REGEX.test(normalized);
}

function formatAccountStatus(user) {
  const ig = user?.insta ? "✅" : "❌";
  const tiktok = user?.tiktok ? "✅" : "❌";
  return `IG ${ig} | TT ${tiktok}`;
}

function normalizeKey(value) {
  return (value || "").toString().trim().toUpperCase();
}

function mapOrgClients(clients) {
  return (clients || [])
    .map((client) => {
      const client_id = normalizeKey(client?.client_id);
      const nama = normalizeKey(client?.nama);
      return {
        client_id,
        nama,
        rawId: client?.client_id,
        rawNama: client?.nama,
      };
    })
    .filter((client) => client.client_id || client.nama);
}

function buildDetectedPolresSet(kasatkers) {
  const detected = new Set();

  (kasatkers || []).forEach((user) => {
    const polresId = normalizeKey(user?.client_id || user?.clientId);
    const polresName = normalizeKey(user?.client_name || user?.clientName);
    [polresId, polresName].forEach((key) => {
      if (key) {
        detected.add(key);
      }
    });
  });

  return detected;
}

function getMissingPolres(orgClients, detectedPolresSet) {
  return (orgClients || []).filter((client) => {
    const keys = [client.client_id, client.nama].filter(Boolean);
    return keys.every((key) => !detectedPolresSet.has(key));
  });
}

function formatMissingPolresSection(orgClients, missingPolres) {
  const lines = ["🚧 Polres tanpa Kasat Binmas terdeteksi:"];

  if (!orgClients?.length) {
    lines.push("- Data client ORG tidak tersedia untuk pembanding.");
    return lines;
  }

  if (!missingPolres.length) {
    lines.push("- Tidak ada; semua Polres ORG sudah memiliki Kasat Binmas terdata.");
    return lines;
  }

  missingPolres.forEach((client) => {
    const idLabel = client.rawId || client.client_id || "(Tanpa ID)";
    const namaLabel = client.rawNama || client.nama;
    lines.push(namaLabel ? `- ${idLabel} (${namaLabel})` : `- ${idLabel}`);
  });

  return lines;
}

export async function generateKasatkerAttendanceSummary({
  clientId = DITBINMAS_CLIENT_ID,
  roleFlag,
} = {}) {
  const targetClientId = (clientId || DITBINMAS_CLIENT_ID).toUpperCase();
  const targetRole = roleFlag || TARGET_ROLE;
  const users = await getUsersByClient(targetClientId, targetRole);
  const kasatkers = (users || []).filter((user) =>
    matchesKasatBinmasJabatan(user?.jabatan)
  );

  const orgClients = mapOrgClients(await findAllOrgClients());
  const detectedPolresSet = buildDetectedPolresSet(kasatkers);
  const missingPolres = getMissingPolres(orgClients, detectedPolresSet);

  if (!kasatkers.length) {
    const totalUsers = users?.length || 0;
    const missingSection = formatMissingPolresSection(orgClients, missingPolres);
    return [
      `Dari ${totalUsers} user aktif ${targetClientId} (${targetRole}), tidak ditemukan data Kasat Binmas.`,
      ...missingSection,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const withInsta = kasatkers.filter((user) => !!user.insta).length;
  const withTiktok = kasatkers.filter((user) => !!user.tiktok).length;
  const summaryLines = [
    "📋 *Absensi Kasatker (Kasat Binmas)*",
    `Client: ${targetClientId}`,
    `Total Kasat Binmas: ${kasatkers.length}`,
    `IG terdaftar: ${withInsta}/${kasatkers.length}`,
    `TikTok terdaftar: ${withTiktok}/${kasatkers.length}`,
    "",
    ...kasatkers
      .sort((a, b) => {
        const rankDiff = rankWeight(a?.title) - rankWeight(b?.title);
        if (rankDiff !== 0) {
          return rankDiff;
        }
        const nameA = formatNama(a) || "";
        const nameB = formatNama(b) || "";
        return nameA.localeCompare(nameB, "id-ID", { sensitivity: "base" });
      })
      .map((user, idx) => {
        const polres = (user?.client_name || user?.client_id || "-").toUpperCase();
        const name = formatNama(user) || "(Tanpa Nama)";
        const status = formatAccountStatus(user);
        return `${idx + 1}. ${name} (${polres}) — ${status}`;
      }),
  ];

  summaryLines.push("", ...formatMissingPolresSection(orgClients, missingPolres));

  return summaryLines.filter(Boolean).join("\n");
}

export default { generateKasatkerAttendanceSummary };
