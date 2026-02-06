import { getUsersSocialByClient } from "../../../model/userModel.js";
import { findClientById } from "../../../service/clientService.js";
import { formatNama, getGreeting, sortDivisionKeys } from "../../../utils/utilsHelper.js";

const formatUsername = (value) => {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed : "-";
};

const buildUserLine = (user) => {
  const name = formatNama(user) || user.nama || user.user_id || "-";
  const ig = formatUsername(user.insta);
  const tiktok = formatUsername(user.tiktok);
  return `- ${name} - IG: ${ig}, TikTok: ${tiktok}`;
};

const classifyUser = (user) => {
  const hasInsta = Boolean(user.insta && String(user.insta).trim());
  const hasTiktok = Boolean(user.tiktok && String(user.tiktok).trim());

  if (hasInsta && hasTiktok) return "lengkap";
  if (hasInsta || hasTiktok) return "kurang";
  return "belum";
};

export async function absensiUpdateDataUsername(clientId, roleFlag = null) {
  const client = await findClientById(clientId);
  const users = await getUsersSocialByClient(clientId, roleFlag);
  if (!users.length) {
    return "Data absensi update data belum tersedia.";
  }

  const salam = getGreeting();
  const now = new Date();
  const hari = now.toLocaleDateString("id-ID", { weekday: "long" });
  const tanggal = now.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const jam = now.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const grouped = users.reduce((acc, user) => {
    const divisi = user.divisi || "-";
    if (!acc[divisi]) {
      acc[divisi] = { lengkap: [], kurang: [], belum: [] };
    }
    const status = classifyUser(user);
    acc[divisi][status].push(user);
    return acc;
  }, {});

  const totals = users.reduce(
    (acc, user) => {
      const status = classifyUser(user);
      acc.total += 1;
      acc[status] += 1;
      return acc;
    },
    { total: 0, lengkap: 0, kurang: 0, belum: 0 }
  );

  const sections = sortDivisionKeys(Object.keys(grouped)).map((divisi) => {
    const bucket = grouped[divisi];
    const sortedBuckets = {
      lengkap: bucket.lengkap.sort((a, b) =>
        formatNama(a).localeCompare(formatNama(b))
      ),
      kurang: bucket.kurang.sort((a, b) =>
        formatNama(a).localeCompare(formatNama(b))
      ),
      belum: bucket.belum.sort((a, b) =>
        formatNama(a).localeCompare(formatNama(b))
      ),
    };

    const buildBlock = (label, items) => {
      const list = items.length ? items.map(buildUserLine).join("\n") : "-";
      return `${label} (${items.length}):\n${list}`;
    };

    return (
      `${divisi.toUpperCase()}\n` +
      `${buildBlock("Lengkap", sortedBuckets.lengkap)}\n\n` +
      `${buildBlock("Kurang", sortedBuckets.kurang)}\n\n` +
      `${buildBlock("Belum", sortedBuckets.belum)}`
    );
  });

  const header =
    `${salam},\n\n` +
    `Mohon ijin Komandan, melaporkan absensi update data username Instagram dan TikTok personil ${(client?.nama || clientId).toUpperCase()} pada hari ${hari}, ${tanggal}, pukul ${jam} WIB, sebagai berikut:\n\n` +
    `Jumlah Total Personil : ${totals.total}\n` +
    `Jumlah Personil Lengkap : ${totals.lengkap}\n` +
    `Jumlah Personil Kurang : ${totals.kurang}\n` +
    `Jumlah Personil Belum : ${totals.belum}`;

  return `${header}\n\n${sections.join("\n\n")}`.trim();
}
