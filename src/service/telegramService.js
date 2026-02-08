// src/service/telegramService.js
/**
 * WhatsApp Log Service (migrated from Telegram)
 * Handles sending log messages and system notifications via WhatsApp using Baileys
 * This replaces the old Telegram log message functionality
 */

import dotenv from 'dotenv';
import qrcode from 'qrcode-terminal';
import { createBaileysClient } from './baileysAdapter.js';
import { getAdminWhatsAppList } from '../utils/waHelper.js';

dotenv.config();

const MAX_STACK_TRACE_LENGTH = 500;
const LOG_CLIENT_ID = 'wa-log-admin';

// Get admin WhatsApp numbers from environment
const ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP || '';
const LOG_ENABLED = Boolean(ADMIN_WHATSAPP);

let waLogClient = null;
let isLogClientReady = false;
let logNotConfiguredWarningShown = false;

/**
 * Log "Log client not configured" warning only once
 * @param {string} context - Context identifier (LOG, ERROR, CRON REPORT)
 */
function logConfigWarningOnce(context) {
  if (!logNotConfiguredWarningShown) {
    console.warn(`[WA LOG ${context}] Skipping WhatsApp log send: ADMIN_WHATSAPP not configured`);
    logNotConfiguredWarningShown = true;
  }
}

/**
 * Initialize WhatsApp log client
 */
async function initializeWhatsAppLogClient() {
  if (!LOG_ENABLED) {
    console.warn('[WA LOG] Log client disabled: ADMIN_WHATSAPP not configured');
    return null;
  }

  try {
    waLogClient = await createBaileysClient(LOG_CLIENT_ID);
    
    // Register event handlers
    waLogClient.on('ready', () => {
      isLogClientReady = true;
      console.log('[WA LOG] Client is ready');
    });

    waLogClient.on('qr', (qr) => {
      console.log('[WA LOG] QR Code received. Scan with WhatsApp:');
      qrcode.generate(qr, { small: true });
    });

    waLogClient.on('authenticated', () => {
      console.log('[WA LOG] Client authenticated');
    });

    waLogClient.on('auth_failure', (msg) => {
      console.error('[WA LOG] Authentication failed:', msg);
    });

    waLogClient.on('disconnected', (reason) => {
      console.warn('[WA LOG] Client disconnected:', reason);
      isLogClientReady = false;
    });

    // Connect the client
    console.log(`[WA LOG] Connecting client: ${LOG_CLIENT_ID}`);
    await waLogClient.connect();
    console.log(`[WA LOG] Connection initiated for: ${LOG_CLIENT_ID}`);
    
    return waLogClient;
  } catch (error) {
    console.error('[WA LOG] Failed to initialize client:', error.message);
    return null;
  }
}

// Initialize log client on module load
const initPromise = initializeWhatsAppLogClient();

/**
 * Wait for log client to be ready
 * @param {number} timeout - Maximum time to wait in milliseconds
 * @returns {Promise<boolean>} True if ready, false if timeout
 */
async function waitForLogClientReady(timeout = 30000) {
  // Wait for initialization to complete first
  if (!waLogClient) {
    await initPromise;
  }
  
  // Check if already ready after initialization
  if (isLogClientReady) {
    return true;
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn('[WA LOG] Timeout waiting for ready state');
      resolve(false);
    }, timeout);

    if (waLogClient) {
      waLogClient.once('ready', () => {
        clearTimeout(timer);
        isLogClientReady = true;
        resolve(true);
      });
      
      // Check again after listener is registered to avoid race condition
      if (isLogClientReady) {
        clearTimeout(timer);
        resolve(true);
      }
    } else {
      clearTimeout(timer);
      resolve(false);
    }
  });
}

/**
 * Send a text message to WhatsApp admin numbers
 * NOTE: Function name kept as 'sendTelegramMessage' for backward compatibility
 * After migration from Telegram to WhatsApp, existing code imports remain unchanged
 * @param {string} message - The message to send
 * @param {object} options - Additional options (optional)
 * @returns {Promise<boolean>} Success status
 */
export async function sendTelegramMessage(message, options = {}) {
  // Always log to server console first
  if (message && typeof message === 'string') {
    console.log(`[WA LOG] Attempting to send: ${message.substring(0, 200)}${message.length > 200 ? '...' : ''}`);
  } else {
    console.log(`[WA LOG] Attempting to send: [invalid message]`);
  }

  if (!LOG_ENABLED) {
    console.warn('[WA LOG] Message not sent: ADMIN_WHATSAPP not configured');
    return false;
  }

  if (!message || typeof message !== 'string') {
    console.warn('[WA LOG] Invalid message: Message must be a non-empty string');
    return false;
  }

  // Ensure client is ready
  if (!waLogClient) {
    await initPromise;
  }
  
  if (!isLogClientReady) {
    const ready = await waitForLogClientReady();
    if (!ready) {
      console.error('[WA LOG] Client not ready, cannot send message');
      return false;
    }
  }

  try {
    // Get admin WhatsApp numbers
    const adminNumbers = getAdminWhatsAppList();
    
    if (adminNumbers.length === 0) {
      console.warn('[WA LOG] No valid admin WhatsApp numbers found');
      return false;
    }

    // Send to all admin numbers
    let successCount = 0;
    for (const adminId of adminNumbers) {
      try {
        await waLogClient.sendMessage(adminId, message);
        successCount++;
      } catch (error) {
        console.error(`[WA LOG] Failed to send to ${adminId}:`, error.message);
      }
    }

    if (successCount > 0) {
      console.log(`[WA LOG] ✅ Message sent successfully to ${successCount} admin(s)`);
      return true;
    } else {
      console.error('[WA LOG] ❌ Failed to send message to any admin');
      return false;
    }
  } catch (error) {
    console.error('[WA LOG] ❌ Failed to send message:', error.message);
    return false;
  }
}

/**
 * Send a log message to WhatsApp
 * NOTE: Function name kept as 'sendTelegramLog' for backward compatibility
 * Formats the message with timestamp and severity
 * @param {string} level - Log level (INFO, WARN, ERROR)
 * @param {string} message - The log message
 * @returns {Promise<boolean>} Success status
 */
export async function sendTelegramLog(level, message) {
  const timestamp = new Date().toISOString();
  
  // Map log levels to emojis
  const emojiMap = {
    ERROR: '❌',
    WARN: '⚠️',
    INFO: 'ℹ️'
  };
  
  const emoji = emojiMap[level] || 'ℹ️';
  const formattedMessage = `${emoji} *${level}* [${timestamp}]\n${message}`;

  // Always log to server console
  console.log(`[WA LOG] ${level}: ${message}`);

  if (!LOG_ENABLED) {
    logConfigWarningOnce('LOG');
    return false;
  }

  return sendTelegramMessage(formattedMessage);
}

/**
 * Send error notification to WhatsApp
 * NOTE: Function name kept as 'sendTelegramError' for backward compatibility
 * @param {string} context - Context of the error
 * @param {Error} error - Error object
 * @returns {Promise<boolean>} Success status
 */
export async function sendTelegramError(context, error) {
  const errorMessage = error?.message || String(error);
  const truncatedStack = error?.stack ? error.stack.substring(0, MAX_STACK_TRACE_LENGTH) : '';
  const message = `❌ *ERROR in ${context}*\n${errorMessage}${truncatedStack ? `\n\`\`\`\n${truncatedStack}\n\`\`\`` : ''}`;

  // Always log to server console
  console.error(`[WA LOG ERROR] ${context}: ${errorMessage}`);
  if (truncatedStack) {
    console.error(`[WA LOG ERROR] Stack trace: ${truncatedStack}`);
  }

  if (!LOG_ENABLED) {
    logConfigWarningOnce('ERROR');
    return false;
  }

  return sendTelegramMessage(message);
}

/**
 * Send cron job report to WhatsApp
 * NOTE: Function name kept as 'sendTelegramCronReport' for backward compatibility
 * @param {string} jobName - Name of the cron job
 * @param {object} report - Report data
 * @returns {Promise<boolean>} Success status
 */
export async function sendTelegramCronReport(jobName, report) {
  const lines = [
    `📊 *Cron Job Report: ${jobName}*`,
    '',
    `Status: ${report.status || 'completed'}`,
    `Duration: ${report.duration || 'N/A'}`,
  ];

  if (report.processed) {
    lines.push(`Processed: ${report.processed}`);
  }

  if (report.errors && report.errors > 0) {
    lines.push(`Errors: ${report.errors}`);
  }

  if (report.details) {
    lines.push('', '*Details:*');
    lines.push(report.details);
  }

  const reportText = lines.join('\n');

  // Always log to server console - truncate if too long
  console.log(`[WA LOG CRON REPORT] ${jobName}`);
  const reportSummary = reportText.length > 500 ? reportText.substring(0, 500) + '...' : reportText;
  console.log(`[WA LOG CRON REPORT] ${reportSummary}`);

  if (!LOG_ENABLED) {
    logConfigWarningOnce('CRON REPORT');
    return false;
  }

  return sendTelegramMessage(reportText);
}

/**
 * Check if WhatsApp log is enabled and configured
 * NOTE: Function name kept as 'isTelegramEnabled' for backward compatibility
 * @returns {boolean} True if WhatsApp log is enabled
 */
export function isTelegramEnabled() {
  return LOG_ENABLED;
}

/**
 * Get WhatsApp log client instance (for advanced usage)
 * NOTE: Function name kept as 'getTelegramBot' for backward compatibility
 * @returns {object|null} WhatsApp client instance or null
 */
export function getTelegramBot() {
  return waLogClient;
}

export default {
  sendTelegramMessage,
  sendTelegramLog,
  sendTelegramError,
  sendTelegramCronReport,
  isTelegramEnabled,
  getTelegramBot
};
