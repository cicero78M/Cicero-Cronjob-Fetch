// =======================
// IMPORTS & KONFIGURASI
// =======================
import qrcode from "qrcode-terminal";
import dotenv from "dotenv";
import { env } from "../config/env.js";

// WhatsApp client using whatsapp-web.js
import { createWwebjsClient } from "./wwebjsAdapter.js";

// Utility imports needed for messaging
import { formatToWhatsAppId } from "../utils/waHelper.js";

dotenv.config();

// Only initialize clients if not explicitly skipped
const shouldInitWhatsAppClients = process.env.WA_SERVICE_SKIP_INIT !== "true";
if (!shouldInitWhatsAppClients) {
  const isTestEnv = process.env.NODE_ENV === "test";
  const expectsMessages = process.env.WA_EXPECT_MESSAGES === "true";
  const skipInitMessage =
    "[WA] WA_SERVICE_SKIP_INIT=true; Gateway client will not be initialized.";

  if (!isTestEnv || expectsMessages) {
    const failFastMessage = `${skipInitMessage} Refusing to start because this environment is expected to send messages.`;
    console.error(failFastMessage);
    throw new Error(failFastMessage);
  }

  console.warn(skipInitMessage);
}

// =======================
// GATEWAY CLIENT SETUP
// =======================

const DEFAULT_GATEWAY_CLIENT_ID = "wa-gateway";
const rawGatewayClientId = String(env.GATEWAY_WA_CLIENT_ID || "");
const normalizedGatewayClientId = rawGatewayClientId.trim().toLowerCase();

// Validate Gateway client ID
if (!normalizedGatewayClientId) {
  throw new Error(
    "[WA] GATEWAY_WA_CLIENT_ID is required for sending social media task notifications"
  );
}

if (normalizedGatewayClientId === DEFAULT_GATEWAY_CLIENT_ID) {
  throw new Error(
    `[WA] GATEWAY_WA_CLIENT_ID is still default (${DEFAULT_GATEWAY_CLIENT_ID}); ` +
    "clientId must be unique and lowercase. Update env before running."
  );
}

console.log(`[WA] Initializing Gateway client: ${normalizedGatewayClientId}`);

// Initialize only the Gateway WhatsApp client
// Note: Using top-level await here is intentional and supported in ES modules (Node.js 14+)
// This ensures the client is initialized before any code imports this module
// The module loading is blocked until initialization completes
export let waGatewayClient = await createWwebjsClient(normalizedGatewayClientId);

// Setup readiness flag
let isGatewayReady = false;

/**
 * Wait for Gateway client to be ready
 * @param {number} timeout - Maximum time to wait in milliseconds
 * @returns {Promise<boolean>} True if ready, false if timeout
 */
export async function waitForGatewayReady(timeout = 30000) {
  if (isGatewayReady) {
    return true;
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn('[WA GATEWAY] Timeout waiting for ready state');
      resolve(false);
    }, timeout);

    waGatewayClient.once('ready', () => {
      clearTimeout(timer);
      isGatewayReady = true;
      resolve(true);
    });
  });
}

// Handle client ready event
if (waGatewayClient && shouldInitWhatsAppClients) {
  waGatewayClient.on('ready', () => {
    isGatewayReady = true;
    console.log('[WA GATEWAY] Client is ready');
  });

  waGatewayClient.on('qr', (qr) => {
    console.log('[WA GATEWAY] QR Code received. Scan with WhatsApp:');
    qrcode.generate(qr, { small: true });
  });

  waGatewayClient.on('authenticated', () => {
    console.log('[WA GATEWAY] Client authenticated');
  });

  waGatewayClient.on('auth_failure', (msg) => {
    console.error('[WA GATEWAY] Authentication failed:', msg);
  });

  waGatewayClient.on('disconnected', (reason) => {
    console.warn('[WA GATEWAY] Client disconnected:', reason);
    isGatewayReady = false;
  });
}

// =======================
// MESSAGE SENDING FUNCTIONS
// =======================

/**
 * Send task notification message to WhatsApp group
 * @param {string} groupId - WhatsApp group ID
 * @param {string} message - Message text
 * @returns {Promise<boolean>} Success status
 */
export async function sendTaskNotification(groupId, message) {
  if (!waGatewayClient) {
    console.error('[WA GATEWAY] Client not initialized');
    return false;
  }

  if (!isGatewayReady) {
    const ready = await waitForGatewayReady();
    if (!ready) {
      console.error('[WA GATEWAY] Client not ready, cannot send message');
      return false;
    }
  }

  try {
    // Ensure group ID has proper format
    const formattedGroupId = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;
    
    await waGatewayClient.sendMessage(formattedGroupId, message);
    console.log(`[WA GATEWAY] Task notification sent to ${formattedGroupId}`);
    return true;
  } catch (error) {
    console.error(`[WA GATEWAY] Failed to send task notification:`, error.message);
    return false;
  }
}

/**
 * Send premium request notification
 * @param {object} client - WA client to use
 * @param {object} request - Premium request data
 * @returns {Promise<boolean>} Success status
 */
export async function sendDashboardPremiumRequestNotification(client, request) {
  if (!client || !request) {
    throw new Error("Client and request are required");
  }

  const message = buildDashboardPremiumRequestMessage(request);
  if (!message) {
    throw new Error("Failed to build premium request message");
  }

  const whatsappId = formatToWhatsAppId(request.whatsapp);
  if (!whatsappId) {
    throw new Error("Invalid WhatsApp ID in request");
  }

  try {
    await client.sendMessage(whatsappId, message);
    return true;
  } catch (error) {
    console.error('[WA GATEWAY] Failed to send premium request notification:', error.message);
    throw error;
  }
}

/**
 * Build dashboard premium request message
 * @param {object} request - Request data
 * @returns {string} Formatted message
 */
export function buildDashboardPremiumRequestMessage(request) {
  if (!request) return "";
  
  const commandUsername = request.username || request.dashboard_user_id || "unknown";
  const paymentProofStatus = request.proof_url
    ? "sudah upload bukti transfer"
    : "belum upload bukti transfer";
  const paymentProofLink = request.proof_url || "Belum upload bukti";
  const numberFormatter = new Intl.NumberFormat("id-ID");
  
  const formatCurrencyId = (value) => {
    if (value === null || value === undefined) return "-";
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return String(value);
    return `Rp ${numberFormatter.format(numeric)}`;
  };

  const lines = [
    "📢 permintaan akses premium",
    "",
    "User dashboard:",
    `- Username: ${commandUsername}`,
    `- WhatsApp: ${formatToWhatsAppId(request.whatsapp) || "-"}`,
    `- Dashboard User ID: ${request.dashboard_user_id || "-"}`,
    "",
    "Detail permintaan:",
    `- Tier: ${request.premium_tier || "-"}`,
    `- Client ID: ${request.client_id || "-"}`,
    `- Username (request): ${commandUsername}`,
    `- Dashboard User ID (request): ${request.dashboard_user_id || "-"}`,
    `- Request Token (request): ${request.request_token || "-"}`,
    `- Status Bukti Transfer: ${paymentProofStatus}`,
    "",
    "Detail transfer:",
    `- Bank: ${request.bank_name || "-"}`,
    `- Nomor Rekening: ${request.account_number || "-"}`,
    `- Nama Pengirim: ${request.sender_name || "-"}`,
    `- Jumlah Transfer: ${formatCurrencyId(request.transfer_amount)}`,
    `- Bukti Transfer: ${paymentProofLink}`,
    "",
    `Request ID: ${request.request_id || "-"}`,
    "",
    "Kirim:",
    `approve ${commandUsername}`,
    `deny ${commandUsername}`,
  ];
  
  return lines.join("\n");
}

/**
 * Check if Gateway client is ready
 * @returns {boolean} Ready status
 */
export function isGatewayClientReady() {
  return isGatewayReady;
}

// Export Gateway client as default (for backward compatibility)
export default waGatewayClient;

// Note: waClient and waUserClient are removed
// All log messages should now use Telegram instead
// Only social media task notifications use waGatewayClient
