import { scheduleCronJob } from '../utils/cronScheduler.js';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import waClient from '../service/waService.js';
import { sendDebug } from '../middleware/debugHandler.js';
import { saveLinkReportExcel } from '../service/linkReportExcelService.js';
import { formatToWhatsAppId, sendWAFile } from '../utils/waHelper.js';
import { getReportsThisMonthByClient } from '../model/linkReportModel.js';

dotenv.config();

async function getActiveClients() {
  const { query } = await import('../db/index.js');
  const res = await query(
    `SELECT client_id, nama, client_operator
       FROM clients
       WHERE client_status=true AND client_amplify_status=true
       ORDER BY client_id`
  );
  return res.rows;
}

function getJakartaDate() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
}

function isLastDayOfMonth() {
  const now = getJakartaDate();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  return tomorrow.getDate() === 1;
}

const JOB_KEY = './src/cron/cronAmplifyLinkMonthly.js';

scheduleCronJob(
  JOB_KEY,
  '0 23 28-31 * *',
  async () => {
    if (!isLastDayOfMonth()) return;
    sendDebug({ tag: 'CRON AMPLIFY', msg: 'Mulai rekap link bulanan' });
    try {
      const clients = await getActiveClients();
      for (const client of clients) {
        try {
          const rows = await getReportsThisMonthByClient(client.client_id);
          const monthName = getJakartaDate().toLocaleString('id-ID', {
            month: 'long',
            timeZone: 'Asia/Jakarta'
          });
          const filePath = await saveLinkReportExcel(
            rows,
            client.client_id,
            monthName
          );
          const buffer = await fs.readFile(filePath);
          const target = client.client_operator
            ? formatToWhatsAppId(client.client_operator)
            : null;
          if (target) {
            await sendWAFile(waClient, buffer, path.basename(filePath), target);
            sendDebug({
              tag: 'CRON AMPLIFY',
              msg: `[${client.client_id}] File dikirim ke operator`
            });
          } else {
            sendDebug({
              tag: 'CRON AMPLIFY',
              msg: `[${client.client_id}] Nomor operator tidak valid`
            });
          }
          await fs.unlink(filePath).catch(() => {});
        } catch (err) {
          sendDebug({
            tag: 'CRON AMPLIFY',
            msg: `[${client.client_id}] ERROR: ${err.message}`
          });
        }
      }
    } catch (err) {
      sendDebug({ tag: 'CRON AMPLIFY', msg: `[ERROR GLOBAL] ${err.message || err}` });
    }
  },
  { timezone: 'Asia/Jakarta' }
);

export default null;
