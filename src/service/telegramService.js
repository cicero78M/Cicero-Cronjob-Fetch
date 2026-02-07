// src/service/telegramService.js
/**
 * Telegram Bot Service
 * Handles sending log messages and system notifications via Telegram
 * This replaces the old WA Bot log message functionality
 */

import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const TELEGRAM_ENABLED = Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
const MAX_STACK_TRACE_LENGTH = 500;

let telegramBot = null;

/**
 * Initialize Telegram bot
 */
function initializeTelegramBot() {
  if (!TELEGRAM_ENABLED) {
    console.warn('[TELEGRAM] Bot disabled: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured');
    return null;
  }

  try {
    telegramBot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
    console.log('[TELEGRAM] Bot initialized successfully');
    return telegramBot;
  } catch (error) {
    console.error('[TELEGRAM] Failed to initialize bot:', error.message);
    return null;
  }
}

// Initialize bot on module load
telegramBot = initializeTelegramBot();

/**
 * Send a text message to Telegram
 * @param {string} message - The message to send
 * @param {object} options - Additional options (optional)
 * @returns {Promise<boolean>} Success status
 */
export async function sendTelegramMessage(message, options = {}) {
  if (!TELEGRAM_ENABLED) {
    console.warn('[TELEGRAM] Message not sent: Bot not configured');
    return false;
  }

  if (!message || typeof message !== 'string') {
    console.warn('[TELEGRAM] Invalid message: Message must be a non-empty string');
    return false;
  }

  try {
    const messageOptions = {
      parse_mode: 'Markdown',
      ...options
    };

    await telegramBot.sendMessage(TELEGRAM_CHAT_ID, message, messageOptions);
    console.log(`[TELEGRAM] Message sent successfully: ${message.substring(0, 100)}...`);
    return true;
  } catch (error) {
    console.error('[TELEGRAM] Failed to send message:', error.message);
    return false;
  }
}

/**
 * Send a log message to Telegram
 * Formats the message with timestamp and severity
 * @param {string} level - Log level (INFO, WARN, ERROR)
 * @param {string} message - The log message
 * @returns {Promise<boolean>} Success status
 */
export async function sendTelegramLog(level, message) {
  if (!TELEGRAM_ENABLED) {
    return false;
  }

  const timestamp = new Date().toISOString();
  
  // Map log levels to emojis
  const emojiMap = {
    ERROR: '❌',
    WARN: '⚠️',
    INFO: 'ℹ️'
  };
  
  const emoji = emojiMap[level] || 'ℹ️';
  const formattedMessage = `${emoji} *${level}* [${timestamp}]\n${message}`;

  return sendTelegramMessage(formattedMessage);
}

/**
 * Send error notification to Telegram
 * @param {string} context - Context of the error
 * @param {Error} error - Error object
 * @returns {Promise<boolean>} Success status
 */
export async function sendTelegramError(context, error) {
  if (!TELEGRAM_ENABLED) {
    return false;
  }

  const errorMessage = error?.message || String(error);
  const stack = error?.stack ? `\n\`\`\`\n${error.stack.substring(0, MAX_STACK_TRACE_LENGTH)}\n\`\`\`` : '';
  const message = `❌ *ERROR in ${context}*\n${errorMessage}${stack}`;

  return sendTelegramMessage(message);
}

/**
 * Send cron job report to Telegram
 * @param {string} jobName - Name of the cron job
 * @param {object} report - Report data
 * @returns {Promise<boolean>} Success status
 */
export async function sendTelegramCronReport(jobName, report) {
  if (!TELEGRAM_ENABLED) {
    return false;
  }

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

  return sendTelegramMessage(lines.join('\n'));
}

/**
 * Check if Telegram is enabled and configured
 * @returns {boolean} True if Telegram is enabled
 */
export function isTelegramEnabled() {
  return TELEGRAM_ENABLED;
}

/**
 * Get Telegram bot instance (for advanced usage)
 * @returns {TelegramBot|null} Bot instance or null
 */
export function getTelegramBot() {
  return telegramBot;
}

export default {
  sendTelegramMessage,
  sendTelegramLog,
  sendTelegramError,
  sendTelegramCronReport,
  isTelegramEnabled,
  getTelegramBot
};
