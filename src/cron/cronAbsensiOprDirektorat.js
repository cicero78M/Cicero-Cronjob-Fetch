import { absensiRegistrasiDashboardDirektorat } from '../handler/fetchabsensi/dashboard/absensiRegistrasiDashboardDirektorat.js';
import { sendWAReport, getAdminWAIds } from '../utils/waHelper.js';
import waService from '../service/waService.js';
import { findAllActiveDirektorat } from '../model/clientModel.js';

function formatDirectorateIds(clients = []) {
  return clients
    .map((client) => String(client.client_id || '').trim().toUpperCase())
    .filter(Boolean);
}

export async function runCron() {
  const directorateClients = await findAllActiveDirektorat();
  const directorateIds = formatDirectorateIds(directorateClients);
  const targets = getAdminWAIds();

  for (const dirId of directorateIds) {
    const msg = await absensiRegistrasiDashboardDirektorat(dirId);
    await sendWAReport(waService, msg, targets);
  }
}

export default { runCron };
