import { query } from "../../../db/index.js";
import { hariIndo } from "../../../utils/constants.js";
import { getGreeting } from "../../../utils/utilsHelper.js";

function normalizeDirectorateId(clientId) {
  return String(clientId || "").trim().toUpperCase() || "DITBINMAS";
}

export async function absensiRegistrasiDashboardDirektorat(clientId = "DITBINMAS") {
  const directorateId = normalizeDirectorateId(clientId);
  const roleName = directorateId.toLowerCase();

  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });
  const salam = getGreeting();

  const { rows: clients } = await query(
    `SELECT client_id, nama FROM clients
     WHERE client_status = true AND (LOWER(client_type) = 'org' OR UPPER(client_id) = $1)
     ORDER BY nama`,
    [directorateId]
  );

  const { rows: registeredRows } = await query(
    `SELECT duc.client_id, COUNT(*) AS operator
     FROM dashboard_user du
     JOIN roles r ON du.role_id = r.role_id
     JOIN dashboard_user_clients duc ON du.dashboard_user_id = duc.dashboard_user_id
     JOIN clients c ON c.client_id = duc.client_id
     WHERE LOWER(r.role_name) = $1 AND du.status = true
       AND (LOWER(c.client_type) = 'org' OR UPPER(c.client_id) = $2)
     GROUP BY duc.client_id`,
    [roleName, directorateId]
  );

  const countMap = new Map(
    registeredRows.map((r) => [r.client_id.toUpperCase(), Number(r.operator)])
  );

  const directorateName =
    clients.find((c) => c.client_id?.toUpperCase() === directorateId)?.nama ||
    directorateId;
  const directorateCount = countMap.get(directorateId) || 0;

  const sudah = [];
  const belum = [];
  clients
    .filter((client) => client.client_id?.toUpperCase() !== directorateId)
    .forEach((client) => {
      const id = client.client_id.toUpperCase();
      const count = countMap.get(id) || 0;
      if (count > 0) {
        sudah.push(`${client.nama.toUpperCase()} : ${count} Operator`);
      } else {
        belum.push(client.nama.toUpperCase());
      }
    });

  let msg = `${salam}\n\n`;
  msg += `Mohon Ijin Komandan,\n\n`;
  msg += `📋 Rekap Registrasi User dashboard Cicero ${directorateName.toUpperCase()} :\n`;
  msg += `${hari}, ${tanggal}\n`;
  msg += `Jam: ${jam}\n\n`;
  msg += `Absensi Registrasi User Direktorat dan Polres :\n\n`;
  msg += `${directorateName.toUpperCase()} : ${directorateCount} Operator\n\n`;
  msg += `Sudah : ${sudah.length} Polres\n`;
  msg += sudah.length ? sudah.map((n) => `- ${n}`).join("\n") : "-";
  msg += `\nBelum : ${belum.length} Polres\n`;
  msg += belum.length ? belum.map((n) => `- ${n}`).join("\n") : "-";
  return msg.trim();
}

export { absensiRegistrasiDashboardDirektorat as absensiRegistrasiDashboardDitbinmas };
