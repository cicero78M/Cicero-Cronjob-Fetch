import { query } from "../../../db/index.js";
import {
  getUsersWithWaByClient,
  getOperatorsByClient
} from "../../../model/userModel.js";
import { hariIndo } from "../../../utils/constants.js";
import { groupByDivision, sortDivisionKeys, getGreeting } from "../../../utils/utilsHelper.js";

async function getClientInfo(client_id) {
  const res = await query(
    "SELECT nama, client_type FROM clients WHERE client_id = $1 LIMIT 1",
    [client_id]
  );
  return {
    nama: res.rows[0]?.nama || client_id,
    clientType: res.rows[0]?.client_type?.toLowerCase() || null,
  };
}

export async function absensiRegistrasiWa(client_id, opts = {}) {
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });

  const { nama: clientNama, clientType } = await getClientInfo(client_id);
  const roleFlag = opts.roleFlag?.toLowerCase() === "operator" ? "operator" : null;
  const users = roleFlag
    ? await getOperatorsByClient(client_id)
    : clientType === "org"
      ? await getOperatorsByClient(client_id)
      : await getUsersWithWaByClient(client_id);

  const sudah = users.filter((u) => u.whatsapp && u.whatsapp.trim() !== "");
  const belum = users.filter((u) => !u.whatsapp || u.whatsapp.trim() === "");

  const mode = opts && opts.mode ? String(opts.mode).toLowerCase() : "all";
  const salam = getGreeting();
  let msg = `${salam}\n\n`;
  msg += `📋 *Absensi Registrasi WhatsApp* untuk *${clientNama}*\n`;
  msg += `Hari : ${hari}\n`;
  msg += `Tanggal : ${tanggal}\n`;
  msg += `Pukul : ${jam}\n\n`;
  msg += `Total user aktif : ${users.length}\n`;
  msg += `✅ Sudah mengisi : ${sudah.length} user\n`;
  msg += `❌ Belum mengisi : ${belum.length} user\n\n`;

  const formatList = (arr, label) => {
    msg += `${label} (${arr.length} user):\n`;
    const byDiv = groupByDivision(arr);
    sortDivisionKeys(Object.keys(byDiv)).forEach((div, idx, arrKeys) => {
      const list = byDiv[div];
      msg += `*${div}* (${list.length} user):\n`;
      msg += list
        .map((u) => `- ${u.title ? u.title + " " : ""}${u.nama}`)
        .join("\n") + "\n";
      if (idx < arrKeys.length - 1) msg += "\n";
    });
    if (Object.keys(byDiv).length === 0) msg += "-\n";
    msg += "\n";
  };

  if (mode === "all" || mode === "sudah")
    formatList(sudah, "✅ *Sudah mengisi*");
  if (mode === "all" || mode === "belum")
    formatList(belum, "❌ *Belum mengisi*");

  msg += `Terimakasih.`;
  return msg.trim();
}
