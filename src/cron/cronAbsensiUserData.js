import { query } from '../db/index.js';
import { getUsersMissingDataByClient, getClientsByRole } from '../model/userModel.js';
import { sendWAReport, getAdminWAIds } from '../utils/waHelper.js';
import waService from '../service/waService.js';

export async function runCron() {
  await getClientsByRole('ditbinmas');
  const { rows } = await query('');
  const clients = rows.sort((a, b) => {
    if (a.client_id === 'DITBINMAS') return -1;
    if (b.client_id === 'DITBINMAS') return 1;
    return a.nama.localeCompare(b.nama);
  });
  let idx = 1;
  const parts = [];
  for (const c of clients) {
    const users = await getUsersMissingDataByClient(c.client_id);
    parts.push(`${idx}. ${c.nama}`);
    users.forEach((u) => {
      parts.push(
        `- ${u.nama} (${u.user_id}): Belum Registrasi Whatsapp, Instagram Kosong, Tiktok Kosong`
      );
    });
    idx++;
  }
  const message = parts.join('\n');
  const targets = getAdminWAIds();
  await sendWAReport(waService, message, targets);
}

export default { runCron };
