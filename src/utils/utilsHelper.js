import { normalizeHandleValue } from "./handleNormalizer.js";

export function sortDivisionKeys(keys) {
  const order = ["BAG", "SAT", "SI", "SPKT", "POLSEK"];
  return keys.sort((a, b) => {
    const ia = order.findIndex((prefix) => a.toUpperCase().startsWith(prefix));
    const ib = order.findIndex((prefix) => b.toUpperCase().startsWith(prefix));
    return (
      (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b)
    );
  });
}

// Normalisasi user_id/NRP menjadi hanya digit tanpa spasi atau karakter lain
export function normalizeUserId(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim().replace(/[^0-9]/g, "");
}

export function normalizeClientId(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim().toUpperCase();
}

export function normalizeEmail(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim().toLowerCase();
}

export function sortTitleKeys(keys, pangkatOrder) {
  // pangkatOrder: array urut dari DB
  return keys.slice().sort((a, b) => {
    const ia = pangkatOrder.indexOf(a);
    const ib = pangkatOrder.indexOf(b);
    return (
      (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b)
    );
  });
}

export function groupByDivision(arr) {
  const divGroups = {};
  arr.forEach((u) => {
    const div = u.divisi || "-";
    if (!divGroups[div]) divGroups[div] = [];
    divGroups[div].push(u);
  });
  return divGroups;
}

export function groupUsersByDivisionStatus(users = [], options = {}) {
  const {
    totalTarget = 0,
    getCount = (u) => u.count || 0,
    hasUsername = () => true,
  } = options;
  const divisions = {};
  const summary = {
    total: 0,
    lengkap: 0,
    kurang: 0,
    belum: 0,
    noUsername: 0,
  };

  users.forEach((u) => {
    const div = u.divisi || "-";
    if (!divisions[div]) {
      divisions[div] = { lengkap: [], kurang: [], belum: [] };
    }
    summary.total += 1;
    const count = Number(getCount(u)) || 0;
    const payload = { ...u, count };
    const usernameOk = hasUsername(u);

    if (!usernameOk) {
      divisions[div].belum.push(payload);
      summary.belum += 1;
      summary.noUsername += 1;
      return;
    }

    if (totalTarget > 0 && count >= totalTarget) {
      divisions[div].lengkap.push(payload);
      summary.lengkap += 1;
      return;
    }

    if (count > 0) {
      divisions[div].kurang.push(payload);
      summary.kurang += 1;
      return;
    }

    divisions[div].belum.push(payload);
    summary.belum += 1;
  });

  return { divisions, summary };
}

export function formatNama(u) {
  return [u.title, u.nama].filter(Boolean).join(" ");
}

export function normalizeKomentarArr(arr) {
  return arr
    .map((c) => {
      if (typeof c === "string") return c.replace(/^@/, "").toLowerCase();
      if (c && typeof c === "object") {
        return (c.user?.unique_id || c.username || "")
          .replace(/^@/, "")
          .toLowerCase();
      }
      return "";
    })
    .filter(Boolean);
}

// Helper salam
export function getGreeting() {
  const now = new Date();
  const hour = now.getHours();
  if (hour >= 4 && hour < 10) return "Selamat pagi";
  if (hour >= 10 && hour < 15) return "Selamat siang";
  if (hour >= 15 && hour < 18) return "Selamat sore";
  return "Selamat malam";
}

const REGIONAL_POLDAS = {
  ACEH: "Polda Aceh",
  SUMUT: "Polda Sumatera Utara",
  SUMBAR: "Polda Sumatera Barat",
  RIAU: "Polda Riau",
  KEPRI: "Polda Kepulauan Riau",
  JAMBI: "Polda Jambi",
  BENGKULU: "Polda Bengkulu",
  SUMSEL: "Polda Sumatera Selatan",
  BABEL: "Polda Bangka Belitung",
  LAMPUNG: "Polda Lampung",
  BANTEN: "Polda Banten",
  DKI: "Polda Metro Jaya",
  METRO: "Polda Metro Jaya",
  DKI_JAKARTA: "Polda Metro Jaya",
  JABAR: "Polda Jawa Barat",
  JATENG: "Polda Jawa Tengah",
  DIY: "Polda Daerah Istimewa Yogyakarta",
  JATIM: "Polda Jawa Timur",
  BALI: "Polda Bali",
  NTB: "Polda Nusa Tenggara Barat",
  NTT: "Polda Nusa Tenggara Timur",
  KALBAR: "Polda Kalimantan Barat",
  KALTENG: "Polda Kalimantan Tengah",
  KALSEL: "Polda Kalimantan Selatan",
  KALTIM: "Polda Kalimantan Timur",
  KALTARA: "Polda Kalimantan Utara",
  SULUT: "Polda Sulawesi Utara",
  SULTENG: "Polda Sulawesi Tengah",
  SULTRA: "Polda Sulawesi Tenggara",
  SULSEL: "Polda Sulawesi Selatan",
  SULBAR: "Polda Sulawesi Barat",
  GORONTALO: "Polda Gorontalo",
  MALUKU: "Polda Maluku",
  MALUKU_UTARA: "Polda Maluku Utara",
  MALUT: "Polda Maluku Utara",
  PAPUA: "Polda Papua",
  PAPUA_BARAT: "Polda Papua Barat",
  PAPUA_BARAT_DAYA: "Polda Papua Barat Daya",
  PAPUA_SELATAN: "Polda Papua Selatan",
  PAPUA_TENGAH: "Polda Papua Tengah",
  PAPUA_PEGUNUNGAN: "Polda Papua Pegunungan",
};

function formatPoldaName(regionalId) {
  if (!regionalId) return "";
  const normalized = String(regionalId || "")
    .trim()
    .toUpperCase();
  const normalizedKey = normalized.replace(/[\s-]+/g, "_");
  return REGIONAL_POLDAS[normalizedKey] || REGIONAL_POLDAS[normalized] || "";
}

// Helper untuk formatting info client
export function formatClientInfo(client) {
  const poldaName = formatPoldaName(client.regional_id);
  const regionalLabel = client.regional_id
    ? poldaName
      ? `${client.regional_id} (${poldaName})`
      : client.regional_id
    : "-";
  const lines = [
    `Client ID       : ${client.client_id || "-"}`,
    `Nama            : ${client.nama || "-"}`,
    `Tipe            : ${client.client_type || "-"}`,
    `Status          : ${client.client_status ? "✅ Aktif" : "❌ Tidak aktif"}`,
    `Regional/Polda  : ${regionalLabel}`,
    `Instagram       : ${client.client_insta ? "@" + client.client_insta : "-"}`,
    `IG Aktif        : ${client.client_insta_status ? "✅ Aktif" : "❌ Tidak aktif"}`,
    `TikTok          : ${client.client_tiktok ? "@" + client.client_tiktok : "-"}`,
    `TikTok Aktif    : ${client.client_tiktok_status ? "✅ Aktif" : "❌ Tidak aktif"}`,
    `Amplifikasi     : ${client.client_amplify_status ? "✅ Aktif" : "❌ Tidak aktif"}`,
    `Operator WA     : ${client.client_operator || "-"}`,
    `Group WA        : ${client.client_group || "-"}`,
    `Super Admin     : ${client.client_super || "-"}`,
  ];
  return [
    "🗂️ *Informasi Client*",
    "```",
    ...lines,
    "```",
    "",
    "*Instagram Link*: " + 
      (client.client_insta
        ? `https://instagram.com/${client.client_insta}`
        : "-"),
    "*TikTok Link*: " +
      (client.client_tiktok
        ? `https://www.tiktok.com/@${client.client_tiktok}`
        : "-"),
    "*Operator WA*: " + 
      (client.client_operator
        ? `https://wa.me/${client.client_operator.replace(/\D/g, "")}`
        : "-"),
    "*Super Admin*: " +
      (client.client_super
        ? `https://wa.me/${client.client_super.replace(/\D/g, "")}`
        : "-"),
    "",
    "*TikTok secUid:*",
    "```",
    client.tiktok_secuid || "-",
    "```",
  ].join("\n");
}


export function formatUserData(user) {
  const labels = [
    ["NRP/NIP", user.user_id || "-"],
    ["Nama", user.nama || "-"],
    ["Pangkat", user.title || "-"],
    ["Satfung", user.divisi || "-"],
    ["Jabatan", user.jabatan || "-"],
    [
      "Status",
      user.status === true || user.status === "true"
        ? "✅ AKTIF"
        : "❌ NON-AKTIF",
    ],
    ["WhatsApp", user.whatsapp || "-"],
    [
      "Instagram",
      user.insta
        ? (user.insta.startsWith("@") ? user.insta : "@" + user.insta)
        : "-",
    ],
    ["TikTok", user.tiktok || "-"],
    ["Polres", user.client_id || "-"],
  ];
  const pad = Math.max(...labels.map(([label]) => label.length));
  return [
    "```",
    ...labels.map(
      ([label, value]) =>
        label.padEnd(pad) + " : " + value
    ),
    "```",
  ].join("\n");
}


function toTitleCase(value) {
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (match, p1) => p1.toUpperCase());
}

function normalizeHandle(value) {
  return normalizeHandleValue(value);
}

function normalizeSentence(value) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const capitalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

export function formatComplaintIssue(rawText) {
  if (!rawText) return "";
  const normalized = String(rawText).replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";
  if (!/pesan\s+komplain/i.test(normalized)) {
    return normalized;
  }

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line, idx, arr) => line !== "" || (idx > 0 && arr[idx - 1] !== ""));

  const headerIndex = lines.findIndex((line) => /pesan\s+komplain/i.test(line));
  const startIndex = headerIndex === -1 ? 0 : headerIndex + 1;
  const kendalaIndex = lines.findIndex((line) =>
    /^kendala\b/i.test(line.replace(/[:：]/g, "").trim())
  );

  const infoLines = [];
  const issueLines = [];

  const fieldHandlers = {
    nrp: {
      label: "NRP/NIP",
      transform: (value) => value.replace(/\s+/g, "").trim(),
    },
    nama: {
      label: "Nama",
      transform: (value) => toTitleCase(value),
    },
    polres: {
      label: "Polres",
      transform: (value) => toTitleCase(value),
    },
    "username ig": {
      label: "Instagram",
      transform: (value) => normalizeHandle(value),
    },
    "username instagram": {
      label: "Instagram",
      transform: (value) => normalizeHandle(value),
    },
    "username tiktok": {
      label: "TikTok",
      transform: (value) => normalizeHandle(value),
    },
  };

  const infoOrder = [
    "nrp",
    "nama",
    "polres",
    "username ig",
    "username instagram",
    "username tiktok",
  ];

  const collectedInfo = new Map();

  const endInfoIndex =
    kendalaIndex === -1 ? lines.length : Math.max(startIndex, kendalaIndex);
  for (let i = startIndex; i < endInfoIndex; i += 1) {
    const line = lines[i];
    if (!line) continue;
    const match = line.match(/^([^:：]+)[:：]\s*(.+)$/);
    if (!match) continue;
    const [, rawKey, rawValue] = match;
    const key = rawKey.replace(/\s+/g, " ").trim().toLowerCase();
    const value = rawValue.trim();
    if (!fieldHandlers[key]) continue;
    const transformed = fieldHandlers[key].transform(value).trim();
    if (!transformed) continue;
    collectedInfo.set(fieldHandlers[key].label, transformed);
  }

  const usedLabels = new Set();
  infoOrder.forEach((key) => {
    const handler = fieldHandlers[key];
    if (!handler) return;
    if (usedLabels.has(handler.label)) return;
    const value = collectedInfo.get(handler.label);
    if (value) {
      infoLines.push(`• ${handler.label}: ${value}`);
      usedLabels.add(handler.label);
    }
  });

  const issuesStart = kendalaIndex === -1 ? lines.length : kendalaIndex + 1;
  let currentIssue = "";
  for (let i = issuesStart; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) {
      if (currentIssue) {
        issueLines.push(currentIssue);
        currentIssue = "";
      }
      continue;
    }
    const bulletMatch = line.match(/^[-•●]+\s*(.+)$/);
    const numberMatch = line.match(/^\d+[).]\s*(.+)$/);
    const content = bulletMatch
      ? bulletMatch[1]
      : numberMatch
      ? numberMatch[1]
      : null;
    if (content !== null) {
      if (currentIssue) {
        issueLines.push(currentIssue);
      }
      currentIssue = content.trim();
      continue;
    }
    currentIssue = currentIssue
      ? `${currentIssue} ${line}`
      : line;
  }
  if (currentIssue) {
    issueLines.push(currentIssue);
  }

  const normalizedIssues = issueLines
    .map((issue) => normalizeSentence(issue))
    .filter(Boolean);

  if (!infoLines.length && !normalizedIssues.length) {
    return normalized;
  }

  const blocks = [];
  if (infoLines.length) {
    blocks.push(["*Informasi Tambahan Pelapor*", ...infoLines].join("\n"));
  }
  if (normalizedIssues.length) {
    const numbered = normalizedIssues.map((issue, idx) => `${idx + 1}. ${issue}`);
    blocks.push(["*Rincian Kendala*", ...numbered].join("\n"));
  }

  return blocks.join("\n\n").trim();
}


export function extractFirstUrl(text) {
  if (!text) return null;
  const match = String(text).match(/https?:\/\/\S+/);
  return match ? match[0] : null;
}

export function formatDdMmYyyy(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d)) return null;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatIsoTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const str = String(value).trim();
  // dd/mm/yyyy or dd-mm-yyyy optionally with time HH:MM
  let match = str.match(/^(\d{2})[-/](\d{2})[-/](\d{4})(?:[ T](\d{2}):(\d{2}))?$/);
  if (match) {
    const [, d, m, y, hh = '00', mm = '00'] = match;
    return `${y}-${m}-${d}T${hh}:${mm}:00Z`;
  }
  // yyyy-mm-dd or yyyy/mm/dd optionally with time
  match = str.match(/^(\d{4})[-/](\d{2})[-/](\d{2})(?:[ T](\d{2}):(\d{2}))?$/);
  if (match) {
    const [, y, m, d, hh = '00', mm = '00'] = match;
    return `${y}-${m}-${d}T${hh}:${mm}:00Z`;
  }
  const d = new Date(str);
  if (!Number.isNaN(d)) return d.toISOString();
  return null;
}

export function formatIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const str = String(value).trim();
  let match = str.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  match = str.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const d = new Date(str);
  if (!Number.isNaN(d)) return d.toISOString().slice(0, 10);
  return null;
}

export function extractInstagramShortcode(text) {
  if (!text) return null;
  const str = String(text).trim();
  const urlMatch = str.match(
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel)\/([^/?#]+)/i
  );
  let code = urlMatch ? urlMatch[1] : str.replace(/[/?#].*$/, '');
  if (/^[A-Za-z0-9_-]+$/.test(code)) return code;
  return null;
}
