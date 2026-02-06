// src/cron/cronOprRequestDailyReport.js

import { scheduleCronJob } from '../utils/cronScheduler.js';
import { sendDebug } from '../middleware/debugHandler.js';
import waClient, { waitForAllMessageQueues } from '../service/waService.js';
import { findAllActiveOrgAmplifyClients } from '../model/clientModel.js';
import {
  generateDailyAmplificationReport,
  generateYesterdayAmplificationReport,
} from '../service/oprReportService.js';
import { normalizeUserWhatsAppId, minPhoneDigitLength } from '../utils/waHelper.js';

export const JOB_KEY = './src/cron/cronOprRequestDailyReport.js';
const CRON_EXPRESSION = '7 21 * * *'; // Every day at 22:30 PM Jakarta time
const CRON_OPTIONS = { timezone: 'Asia/Jakarta' };
const CRON_TAG = 'CRON OPRREQUEST DAILY REPORT';

// Delay constants (in milliseconds)
const MESSAGE_DELAY_MS = 2000; // Delay between messages to the same recipient
const CLIENT_DELAY_MS = 3000; // Delay between processing different clients

/**
 * Normalize WhatsApp ID for recipient
 */
function normalizeUserRecipient(value) {
  const normalized = normalizeUserWhatsAppId(value, minPhoneDigitLength);
  if (!normalized) {
    console.warn('[SKIP WA] invalid recipient', value);
    return null;
  }
  return normalized;
}

/**
 * Convert to WhatsApp ID format
 */
function toWAid(id) {
  if (!id || typeof id !== 'string') return null;
  const trimmed = id.trim();
  if (!trimmed) return null;
  if (trimmed.endsWith('@g.us')) return trimmed;
  return normalizeUserRecipient(trimmed);
}

/**
 * Get WhatsApp operator recipient for a client
 * Returns the client_operator WhatsApp ID
 */
function getOperatorRecipient(client) {
  if (!client.client_operator) return null;
  return toWAid(client.client_operator);
}

/**
 * Send report to operator
 */
async function sendReportToOperator(client, reportMessage) {
  const operatorWA = getOperatorRecipient(client);
  
  if (!operatorWA) {
    sendDebug({
      tag: CRON_TAG,
      msg: `[${client.client_id}] Tidak ada operator WhatsApp terdaftar`,
    });
    return false;
  }
  
  try {
    await waClient.sendMessage(operatorWA, reportMessage);
    sendDebug({
      tag: CRON_TAG,
      msg: `[${client.client_id}] Laporan berhasil dikirim ke operator ${operatorWA}`,
    });
    return true;
  } catch (err) {
    sendDebug({
      tag: CRON_TAG,
      msg: `[${client.client_id}] Gagal mengirim laporan ke operator: ${err.message}`,
    });
    return false;
  }
}

/**
 * Process daily reports for a single client
 */
async function processClientReports(client) {
  sendDebug({
    tag: CRON_TAG,
    msg: `[${client.client_id}] Memproses laporan harian untuk ${client.nama}`,
  });
  
  try {
    // Generate Laporan Tugas Rutin No 1 (Today's report)
    const todayReport = await generateDailyAmplificationReport(client.client_id);
    
    if (todayReport) {
      await sendReportToOperator(client, todayReport);
      // Add small delay between messages
      await new Promise((resolve) => setTimeout(resolve, MESSAGE_DELAY_MS));
    } else {
      sendDebug({
        tag: CRON_TAG,
        msg: `[${client.client_id}] Tidak ada data laporan hari ini`,
      });
    }
    
    // Generate Laporan Tugas Rutin No 2 (Yesterday's report)
    const yesterdayReport = await generateYesterdayAmplificationReport(client.client_id);
    
    if (yesterdayReport) {
      await sendReportToOperator(client, yesterdayReport);
    } else {
      sendDebug({
        tag: CRON_TAG,
        msg: `[${client.client_id}] Tidak ada data laporan kemarin`,
      });
    }
  } catch (err) {
    sendDebug({
      tag: CRON_TAG,
      msg: `[${client.client_id}] Gagal memproses laporan: ${err.message || err}`,
    });
  }
}

/**
 * Main cron job function
 */
export async function runCron() {
  sendDebug({
    tag: CRON_TAG,
    msg: 'Mulai cron laporan harian amplifikasi (oprrequest)',
  });
  
  try {
    // Get all active org clients with amplification enabled
    const clients = await findAllActiveOrgAmplifyClients();
    
    if (!clients.length) {
      sendDebug({
        tag: CRON_TAG,
        msg: 'Tidak ada client org aktif dengan amplifikasi aktif',
      });
      return;
    }
    
    sendDebug({
      tag: CRON_TAG,
      msg: `Ditemukan ${clients.length} client aktif dengan amplifikasi`,
    });
    
    // Process each client sequentially
    for (const client of clients) {
      await processClientReports(client);
      // Add delay between clients to avoid overwhelming WhatsApp
      await new Promise((resolve) => setTimeout(resolve, CLIENT_DELAY_MS));
    }
    
    sendDebug({
      tag: CRON_TAG,
      msg: 'Selesai memproses semua laporan harian',
    });
    
    // Wait for all message queues to be fully drained before completing
    sendDebug({
      tag: CRON_TAG,
      msg: 'Menunggu semua pesan selesai terkirim...',
    });
    await waitForAllMessageQueues();
    
    sendDebug({
      tag: CRON_TAG,
      msg: 'Semua pesan telah terkirim, cron selesai',
    });
  } catch (err) {
    sendDebug({
      tag: CRON_TAG,
      msg: `[ERROR GLOBAL] ${err.message || err}`,
    });
  }
}

scheduleCronJob(JOB_KEY, CRON_EXPRESSION, runCron, CRON_OPTIONS);

export default null;
