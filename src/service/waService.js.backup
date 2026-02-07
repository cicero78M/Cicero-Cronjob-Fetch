// =======================
// IMPORTS & KONFIGURASI
// =======================
import qrcode from "qrcode-terminal";
import PQueue from "p-queue";
import dotenv from "dotenv";
import fs from "fs";
import os from "os";
import path from "path";
import { env } from "../config/env.js";

// WhatsApp client using whatsapp-web.js
import { createWwebjsClient } from "./wwebjsAdapter.js";
import { handleIncoming } from "./waEventAggregator.js";
import {
  logWaServiceDiagnostics,
  checkMessageListenersAttached,
} from "../utils/waDiagnostics.js";

// Utility imports needed for messaging
import {
  formatToWhatsAppId,
  isUnsupportedVersionError,
  safeSendMessage,
  getAdminWAIds,
} from "../utils/waHelper.js";

dotenv.config();

const messageQueues = new WeakMap();

const shouldInitWhatsAppClients = process.env.WA_SERVICE_SKIP_INIT !== "true";
if (!shouldInitWhatsAppClients) {
  const isTestEnv = process.env.NODE_ENV === "test";
  const expectsMessages = process.env.WA_EXPECT_MESSAGES === "true";
  const skipInitMessage =
    "[WA] WA_SERVICE_SKIP_INIT=true; message listeners will not be attached and the bot will not receive chats.";

  if (!isTestEnv || expectsMessages) {
    const failFastMessage = `${skipInitMessage} Refusing to start because this environment is expected to receive messages.`;
    console.error(failFastMessage);
    throw new Error(failFastMessage);
  }

  console.warn(skipInitMessage);
}

// Fixed delay to ensure consistent 3-second response timing
const responseDelayMs = 3000;

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

// Dashboard premium request message builder (used by cronjobs)
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
  await client.sendMessage(whatsappId, message);
}

// =======================
// INISIALISASI CLIENT WA
// =======================

const DEFAULT_AUTH_DATA_PARENT_DIR = ".cicero";
const DEFAULT_AUTH_DATA_DIR = "wwebjs_auth";
const defaultUserClientId = "wa-userrequest";
const defaultGatewayClientId = "wa-gateway";
const rawUserClientId = String(env.USER_WA_CLIENT_ID || "");
const rawGatewayClientId = String(env.GATEWAY_WA_CLIENT_ID || "");
const normalizedUserClientId = rawUserClientId.trim();
const normalizedUserClientIdLower = normalizedUserClientId.toLowerCase();
const trimmedGatewayClientId = rawGatewayClientId.trim();
const normalizedGatewayClientId = trimmedGatewayClientId.toLowerCase();
const resolvedGatewayClientId = normalizedGatewayClientId || undefined;

const resolveAuthDataPath = () => {
  const configuredPath = String(process.env.WA_AUTH_DATA_PATH || "").trim();
  if (configuredPath) {
    return path.resolve(configuredPath);
  }
  const homeDir = os.homedir?.();
  const baseDir = homeDir || process.cwd();
  return path.resolve(
    path.join(baseDir, DEFAULT_AUTH_DATA_PARENT_DIR, DEFAULT_AUTH_DATA_DIR)
  );
};

const findSessionCaseMismatch = (authDataPath, clientId) => {
  if (!authDataPath || !clientId) {
    return null;
  }
  try {
    const entries = fs.readdirSync(authDataPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (!entry.name.startsWith("session-")) {
        continue;
      }
      const existingClientId = entry.name.slice("session-".length);
      if (
        existingClientId &&
        existingClientId.toLowerCase() === clientId &&
        existingClientId !== clientId
      ) {
        return path.join(authDataPath, entry.name);
      }
    }
  } catch (err) {
    console.warn(
      `[WA] Gagal memeriksa folder session di ${authDataPath}:`,
      err?.message || err
    );
  }
  return null;
};

const throwClientIdError = (message) => {
  throw new Error(`[WA] ${message}`);
};

const ensureUserClientIdConsistency = () => {
  const authDataPath = resolveAuthDataPath();
  if (!normalizedUserClientIdLower) {
    throwClientIdError(
      "USER_WA_CLIENT_ID kosong; set nilai unik lowercase (contoh: wa-userrequest-prod)."
    );
  }
  if (
    normalizedUserClientId &&
    normalizedUserClientIdLower &&
    normalizedUserClientId !== normalizedUserClientIdLower
  ) {
    const sessionPath = findSessionCaseMismatch(
      authDataPath,
      normalizedUserClientIdLower
    );
    const sessionHint = sessionPath
      ? ` Ditemukan session berbeda di ${sessionPath}.`
      : "";
    throwClientIdError(
      `USER_WA_CLIENT_ID harus lowercase. Nilai "${normalizedUserClientId}" tidak konsisten.${sessionHint} ` +
        "Perbarui env/folder session agar cocok sebelum menjalankan proses."
    );
  }
  if (normalizedUserClientIdLower === defaultUserClientId) {
    throwClientIdError(
      `USER_WA_CLIENT_ID masih default (${defaultUserClientId}); clientId harus unik dan lowercase. ` +
        `Perbarui env dan bersihkan session lama di ${authDataPath}.`
    );
  }
  const mismatchedSessionPath = findSessionCaseMismatch(
    authDataPath,
    normalizedUserClientIdLower
  );
  if (mismatchedSessionPath) {
    throwClientIdError(
      `Folder session "${path.basename(mismatchedSessionPath)}" tidak konsisten dengan ` +
        `USER_WA_CLIENT_ID="${normalizedUserClientIdLower}". Rename atau hapus session lama di ` +
        `${mismatchedSessionPath} agar konsisten.`
    );
  }
};

const ensureGatewayClientIdConsistency = () => {
  const authDataPath = resolveAuthDataPath();
  if (
    trimmedGatewayClientId &&
    normalizedGatewayClientId &&
    trimmedGatewayClientId !== normalizedGatewayClientId
  ) {
    const sessionPath = findSessionCaseMismatch(
      authDataPath,
      normalizedGatewayClientId
    );
    const sessionHint = sessionPath
      ? ` Ditemukan session berbeda di ${sessionPath}.`
      : "";
    throwClientIdError(
      `GATEWAY_WA_CLIENT_ID harus lowercase. Nilai "${trimmedGatewayClientId}" tidak konsisten.${sessionHint} ` +
        "Perbarui env/folder session agar cocok sebelum menjalankan proses."
    );
  }
  if (normalizedGatewayClientId === defaultGatewayClientId) {
    throwClientIdError(
      `GATEWAY_WA_CLIENT_ID masih default (${defaultGatewayClientId}); clientId harus unik dan lowercase. ` +
        `Perbarui env dan bersihkan session lama di ${authDataPath}.`
    );
  }
  const mismatchedSessionPath = findSessionCaseMismatch(
    authDataPath,
    normalizedGatewayClientId
  );
  if (mismatchedSessionPath) {
    throwClientIdError(
      `Folder session "${path.basename(mismatchedSessionPath)}" tidak konsisten dengan ` +
        `GATEWAY_WA_CLIENT_ID="${normalizedGatewayClientId}". Rename atau hapus session lama di ` +
        `${mismatchedSessionPath} agar konsisten.`
    );
  }
};

const ensureClientIdUniqueness = () => {
  if (normalizedUserClientIdLower === normalizedGatewayClientId) {
    throwClientIdError(
      `USER_WA_CLIENT_ID dan GATEWAY_WA_CLIENT_ID sama (${normalizedGatewayClientId}); ` +
        "clientId harus unik. Perbarui env sebelum menjalankan proses."
    );
  }
};

ensureUserClientIdConsistency();
ensureGatewayClientIdConsistency();
ensureClientIdUniqueness();

// Initialize WhatsApp client via whatsapp-web.js
export let waClient = await createWwebjsClient();
export let waUserClient = await createWwebjsClient(env.USER_WA_CLIENT_ID);
export let waGatewayClient = await createWwebjsClient(resolvedGatewayClientId);

const logClientIdIssue = (envVar, issueMessage) => {
  console.error(`[WA] ${envVar} ${issueMessage}; clientId harus unik.`);
};

if (!normalizedUserClientId) {
  logClientIdIssue("USER_WA_CLIENT_ID", "kosong");
}
if (!normalizedGatewayClientId) {
  logClientIdIssue("GATEWAY_WA_CLIENT_ID", "kosong");
}
if (normalizedUserClientId === defaultUserClientId) {
  logClientIdIssue(
    "USER_WA_CLIENT_ID",
    `masih default (${defaultUserClientId})`
  );
}
if (normalizedGatewayClientId === defaultGatewayClientId) {
  logClientIdIssue(
    "GATEWAY_WA_CLIENT_ID",
    `masih default (${defaultGatewayClientId})`
  );
}
if (
  normalizedUserClientId &&
  normalizedGatewayClientId &&
  normalizedUserClientId === normalizedGatewayClientId
) {
  console.error(
    `[WA] USER_WA_CLIENT_ID dan GATEWAY_WA_CLIENT_ID sama (${normalizedUserClientId}); ` +
      "clientId harus unik."
  );
}

// =======================
// CLIENT READINESS MANAGEMENT
// =======================

const clientReadiness = new Map();
const adminNotificationQueue = [];
const authenticatedReadyFallbackTimers = new Map();
const authenticatedReadyTimeoutMs = Number.isNaN(
  Number(process.env.WA_AUTH_READY_TIMEOUT_MS)
)
  ? 45000
  : Number(process.env.WA_AUTH_READY_TIMEOUT_MS);
const fallbackReadyCheckDelayMs = Number.isNaN(
  Number(process.env.WA_FALLBACK_READY_DELAY_MS)
)
  ? 60000
  : Number(process.env.WA_FALLBACK_READY_DELAY_MS);
const fallbackReadyCooldownMs = Number.isNaN(
  Number(process.env.WA_FALLBACK_READY_COOLDOWN_MS)
)
  ? 300000
  : Math.max(0, Number(process.env.WA_FALLBACK_READY_COOLDOWN_MS));
const defaultReadyTimeoutMs = Number.isNaN(
  Number(process.env.WA_READY_TIMEOUT_MS)
)
  ? Math.max(authenticatedReadyTimeoutMs, fallbackReadyCheckDelayMs + 5000)
  : Number(process.env.WA_READY_TIMEOUT_MS);
const gatewayReadyTimeoutMs = Number.isNaN(
  Number(process.env.WA_GATEWAY_READY_TIMEOUT_MS)
)
  ? defaultReadyTimeoutMs + fallbackReadyCheckDelayMs
  : Number(process.env.WA_GATEWAY_READY_TIMEOUT_MS);
const fallbackStateRetryCounts = new WeakMap();
const fallbackReinitCounts = new WeakMap();
const maxFallbackStateRetries = 3;
const maxFallbackReinitAttempts = 2;
const maxUnknownStateEscalationRetries = 2;
const fallbackStateRetryMinDelayMs = 15000;
const fallbackStateRetryMaxDelayMs = 30000;
const connectInFlightWarnMs = Number.isNaN(
  Number(process.env.WA_CONNECT_INFLIGHT_WARN_MS)
)
  ? 120000
  : Number(process.env.WA_CONNECT_INFLIGHT_WARN_MS);
const connectInFlightReinitMs = Number.isNaN(
  Number(process.env.WA_CONNECT_INFLIGHT_REINIT_MS)
)
  ? 300000
  : Number(process.env.WA_CONNECT_INFLIGHT_REINIT_MS);
const hardInitRetryCounts = new WeakMap();
const maxHardInitRetries = 3;
const hardInitRetryBaseDelayMs = 120000;
const hardInitRetryMaxDelayMs = 900000;
const qrAwaitingReinitGraceMs = 120000;
const logoutDisconnectReasons = new Set([
  "LOGGED_OUT",
  "UNPAIRED",
  "CONFLICT",
  "UNPAIRED_IDLE",
]);
const disconnectChangeStates = new Set([
  "DISCONNECTED",
  "UNPAIRED",
  "UNPAIRED_IDLE",
  "CONFLICT",
  "LOGGED_OUT",
  "CLOSE",
]);
const authSessionIgnoreEntries = new Set([
  "SingletonLock",
  "SingletonCookie",
  "SingletonSocket",
]);

function getFallbackStateRetryDelayMs() {
  const jitterRange = fallbackStateRetryMaxDelayMs - fallbackStateRetryMinDelayMs;
  return (
    fallbackStateRetryMinDelayMs + Math.floor(Math.random() * jitterRange)
  );
}

function getHardInitRetryDelayMs(attempt) {
  const baseDelay = hardInitRetryBaseDelayMs * 2 ** Math.max(0, attempt - 1);
  const cappedDelay = Math.min(baseDelay, hardInitRetryMaxDelayMs);
  const jitter = Math.floor(Math.random() * 0.2 * cappedDelay);
  return cappedDelay + jitter;
}

function formatConnectDurationMs(durationMs) {
  const seconds = Math.round(durationMs / 1000);
  return `${durationMs}ms (${seconds}s)`;
}

function hasRecentQrScan(state, graceMs = qrAwaitingReinitGraceMs) {
  if (!state?.lastQrAt) {
    return false;
  }
  const elapsedMs = Date.now() - state.lastQrAt;
  return elapsedMs >= 0 && elapsedMs <= graceMs;
}

function getClientReadyTimeoutMs(client) {
  const clientOverride = client?.readyTimeoutMs;
  if (typeof clientOverride === "number" && !Number.isNaN(clientOverride)) {
    return clientOverride;
  }
  if (client === waGatewayClient) {
    return gatewayReadyTimeoutMs;
  }
  return defaultReadyTimeoutMs;
}

function getClientReadinessState(client, label = "WA") {
  if (!clientReadiness.has(client)) {
    clientReadiness.set(client, {
      label,
      ready: false,
      pendingMessages: [],
      readyResolvers: [],
      awaitingQrScan: false,
      lastDisconnectReason: null,
      lastAuthFailureAt: null,
      lastAuthFailureMessage: null,
      lastQrAt: null,
      lastQrPayloadSeen: null,
      unknownStateRetryCount: 0,
      fallbackCheckCompleted: false,
      fallbackCheckInFlight: false,
    });
  }
  return clientReadiness.get(client);
}

function normalizeDisconnectReason(reason) {
  return String(reason || "").trim().toUpperCase();
}

function isLogoutDisconnectReason(reason) {
  const normalizedReason = normalizeDisconnectReason(reason);
  return logoutDisconnectReasons.has(normalizedReason);
}

function hasAuthFailureIndicator(state) {
  return (
    isLogoutDisconnectReason(state?.lastDisconnectReason) ||
    Boolean(state?.lastAuthFailureAt)
  );
}

function hasPersistedAuthSession(sessionPath) {
  if (!sessionPath) {
    return false;
  }
  try {
    if (!fs.existsSync(sessionPath)) {
      return false;
    }
    const entries = fs.readdirSync(sessionPath, { withFileTypes: true });
    return entries.some(
      (entry) => !authSessionIgnoreEntries.has(entry.name)
    );
  } catch (err) {
    console.warn(
      `[WA] Gagal memeriksa isi session di ${sessionPath}:`,
      err?.message || err
    );
    return false;
  }
}

function clearLogoutAwaitingQr(client) {
  const state = getClientReadinessState(client);
  if (state.awaitingQrScan || state.lastDisconnectReason) {
    state.awaitingQrScan = false;
    state.lastDisconnectReason = null;
  }
}

function resetFallbackReadyState(client) {
  const state = getClientReadinessState(client);
  state.fallbackCheckCompleted = false;
  state.fallbackCheckInFlight = false;
}

function markFallbackCheckCompleted(client) {
  const state = getClientReadinessState(client);
  state.fallbackCheckCompleted = true;
  state.fallbackCheckInFlight = false;
}

function clearAuthenticatedFallbackTimer(client) {
  const timer = authenticatedReadyFallbackTimers.get(client);
  if (timer) {
    clearTimeout(timer);
    authenticatedReadyFallbackTimers.delete(client);
  }
}

async function inferClientReadyState(client, label, contextLabel) {
  const state = getClientReadinessState(client, label);
  if (state.ready) {
    return true;
  }
  let readySource = null;
  if (typeof client?.isReady === "function") {
    try {
      if ((await client.isReady()) === true) {
        readySource = "isReady";
      }
    } catch (error) {
      console.warn(
        `[${state.label}] isReady check failed: ${error?.message || error}`
      );
    }
  }
  if (!readySource && typeof client?.getState === "function") {
    try {
      const clientState = await client.getState();
      if (clientState === "CONNECTED" || clientState === "open") {
        readySource = `getState:${clientState}`;
      }
    } catch (error) {
      console.warn(
        `[${state.label}] getState check failed: ${error?.message || error}`
      );
    }
  }
  if (readySource) {
    const contextInfo = contextLabel ? ` during ${contextLabel}` : "";
    console.warn(
      `[${state.label}] Readiness inferred via ${readySource}${contextInfo}; marking ready.`
    );
    markClientReady(client, readySource);
    return true;
  }
  return false;
}

function scheduleAuthenticatedReadyFallback(client, label) {
  clearAuthenticatedFallbackTimer(client);
  const { label: stateLabel } = getClientReadinessState(client, label);
  const timeoutMs = authenticatedReadyTimeoutMs;
  authenticatedReadyFallbackTimers.set(
    client,
    setTimeout(async () => {
      const state = getClientReadinessState(client, stateLabel);
      if (state.ready) {
        return;
      }
      console.warn(
        `[${stateLabel}] Authenticated but no ready event after ${timeoutMs}ms`
      );
      if (client?.isReady) {
        try {
          const isReady = (await client.isReady()) === true;
          if (isReady) {
            console.warn(
              `[${stateLabel}] isReady=true after authenticated timeout; waiting for ready event`
            );
          }
        } catch (error) {
          console.warn(
            `[${stateLabel}] isReady check failed after authenticated timeout: ${error?.message}`
          );
        }
      }
      if (client?.getState) {
        try {
          const currentState = await client.getState();
          console.warn(
            `[${stateLabel}] getState after authenticated timeout: ${currentState}`
          );
        } catch (error) {
          console.warn(
            `[${stateLabel}] getState failed after authenticated timeout: ${error?.message}`
          );
        }
      }
      if (typeof client?.connect === "function") {
        console.warn(
          `[${stateLabel}] Reinitializing client after authenticated timeout`
        );
        reconnectClient(client).catch((err) => {
          console.error(
            `[${stateLabel}] Reinit failed after authenticated timeout: ${err?.message}`
          );
        });
      } else {
        console.warn(
          `[${stateLabel}] connect not available; unable to reinit after authenticated timeout`
        );
      }
    }, timeoutMs)
  );
}

function registerClientReadiness(client, label) {
  getClientReadinessState(client, label);
}

const missingChromeRemediationHint =
  "Install Google Chrome or Chromium, atau set WA_PUPPETEER_EXECUTABLE_PATH untuk menggunakan Chrome yang sudah terinstall.";

function hasChromeExecutable(client) {
  const DEFAULT_EXECUTABLE_PATH = "default";
  const executablePath =
    typeof client?.getPuppeteerExecutablePath === "function"
      ? client.getPuppeteerExecutablePath()
      : client?.puppeteerExecutablePath;
  if (!executablePath || executablePath === DEFAULT_EXECUTABLE_PATH) {
    return false;
  }
  try {
    return fs.existsSync(executablePath);
  } catch {
    return false;
  }
}

function isFatalMissingChrome(client) {
  const fatalError = client?.fatalInitError;
  if (fatalError?.type === "missing-chrome") {
    return !hasChromeExecutable(client);
  }
  return false;
}

function getInitReadinessIssue({ label, client }) {
  const readinessState = getClientReadinessState(client, label);
  const fatalInitError = client?.fatalInitError || null;
  const missingChrome =
    isFatalMissingChrome(client) || fatalInitError?.type === "missing-chrome";
  const awaitingQrScan = Boolean(readinessState?.awaitingQrScan);
  const authFailure = Boolean(readinessState?.lastAuthFailureAt);
  const hasReadyState = Boolean(readinessState?.ready);

  if (!missingChrome && !fatalInitError && hasReadyState) {
    return null;
  }

  if (missingChrome) {
    return {
      label,
      reason: "missing-chrome",
      detail: fatalInitError?.error?.message || "Chrome executable not found",
      remediation: missingChromeRemediationHint,
    };
  }

  if (authFailure) {
    return {
      label,
      reason: "auth-failure",
      detail:
        readinessState?.lastAuthFailureMessage ||
        "WhatsApp auth failure detected",
      remediation:
        "Pastikan WA_AUTH_DATA_PATH benar, hapus sesi auth yang rusak, lalu scan QR ulang.",
    };
  }

  if (awaitingQrScan) {
    return {
      label,
      reason: "awaiting-qr",
      detail:
        readinessState?.lastDisconnectReason ||
        "Awaiting QR scan for WhatsApp client",
      remediation: "Scan QR terbaru pada log/terminal agar sesi tersambung.",
    };
  }

  if (fatalInitError) {
    return {
      label,
      reason: fatalInitError.type || "fatal-init",
      detail: fatalInitError.error?.message || "Fatal WhatsApp init error",
      remediation:
        "Periksa konfigurasi WhatsApp (WA_WEB_VERSION*, WA_AUTH_DATA_PATH) dan ulangi init.",
    };
  }

  return {
    label,
    reason: "not-ready",
    detail: "WhatsApp client belum siap setelah inisialisasi",
    remediation: "Cek log init, koneksi jaringan, lalu restart jika perlu.",
  };
}

function getListenerCount(client, eventName) {
  if (typeof client?.listenerCount !== "function") {
    return null;
  }
  return client.listenerCount(eventName);
}

export function getWaReadinessSummary() {
  const clients = [
    { label: "WA", client: waClient },
    { label: "WA-USER", client: waUserClient },
    { label: "WA-GATEWAY", client: waGatewayClient },
  ];
  const formatTimestamp = (value) =>
    value ? new Date(value).toISOString() : null;
  return {
    shouldInitWhatsAppClients,
    clients: clients.map(({ label, client }) => {
      const state = getClientReadinessState(client, label);
      const DEFAULT_EXECUTABLE_PATH = "default";
      const puppeteerExecutablePath =
        typeof client?.getPuppeteerExecutablePath === "function"
          ? client.getPuppeteerExecutablePath()
          : client?.puppeteerExecutablePath || DEFAULT_EXECUTABLE_PATH;
      const fatalError = client?.fatalInitError || null;
      return {
        label,
        clientId: client?.clientId || null,
        sessionPath: client?.sessionPath || null,
        puppeteerExecutablePath,
        ready: state.ready,
        awaitingQrScan: state.awaitingQrScan,
        lastDisconnectReason: state.lastDisconnectReason || null,
        lastAuthFailureAt: formatTimestamp(state.lastAuthFailureAt),
        lastAuthFailureMessage: state.lastAuthFailureMessage || null,
        lastQrAt: formatTimestamp(state.lastQrAt),
        fallbackCheckCompleted: state.fallbackCheckCompleted,
        messageListenerCount: getListenerCount(client, "message"),
        messageCreateListenerCount: getListenerCount(client, "message_create"),
        fatalInitError: fatalError
          ? {
              type: fatalError.type,
              message: fatalError.error?.message || null,
            }
          : null,
      };
    }),
  };
}

function flushPendingMessages(client) {
  const state = getClientReadinessState(client);
  if (state.pendingMessages.length) {
    console.log(
      `[${state.label}] Processing ${state.pendingMessages.length} deferred message(s)`
    );
    state.pendingMessages.splice(0).forEach((pending) => {
      console.log(
        `[${state.label}] Deferred message from ${pending?.from || "unknown"} discarded (no handler in cronjob-only mode)`
      );
    });
  }
}

function markClientReady(client, source = "ready-event") {
  const state = getClientReadinessState(client);
  if (state.ready) {
    return;
  }
  state.ready = true;
  state.awaitingQrScan = false;
  state.lastDisconnectReason = null;
  if (state.lastAuthFailureAt) {
    state.lastAuthFailureAt = null;
    state.lastAuthFailureMessage = null;
  }
  console.log(`[${state.label}] Client ready (source: ${source})`);
  clearAuthenticatedFallbackTimer(client);
  markFallbackCheckCompleted(client);
  for (const resolve of state.readyResolvers) {
    resolve();
  }
  state.readyResolvers = [];
  flushPendingMessages(client);
  if (client === waClient) {
    flushAdminNotificationQueue();
  }
}

export function queueAdminNotification(message) {
  adminNotificationQueue.push(message);
}

export function flushAdminNotificationQueue() {
  if (!adminNotificationQueue.length) return;
  console.log(
    `[WA] Sending ${adminNotificationQueue.length} queued admin notification(s)`
  );
  adminNotificationQueue.splice(0).forEach((msg) => {
    for (const wa of getAdminWAIds()) {
      safeSendMessage(waClient, wa, msg);
    }
  });
}

async function waitForClientReady(client, timeoutMs = null) {
  const state = getClientReadinessState(client);
  if (state.ready) {
    return;
  }
  if (await inferClientReadyState(client, state.label, "pre-wait")) {
    return;
  }
  if (isFatalMissingChrome(client)) {
    throw new Error(
      `[${state.label}] Cannot wait for client ready: Chrome executable not found. ${missingChromeRemediationHint}`
    );
  }
  const effectiveTimeoutMs = timeoutMs || getClientReadyTimeoutMs(client);
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const index = state.readyResolvers.indexOf(resolve);
      if (index >= 0) {
        state.readyResolvers.splice(index, 1);
      }
      reject(
        new Error(
          `[${state.label}] WhatsApp client not ready after ${effectiveTimeoutMs}ms`
        )
      );
    }, effectiveTimeoutMs);
    state.readyResolvers.push(() => {
      clearTimeout(timeoutId);
      resolve();
    });
  });
}

export function waitForWaReady(timeoutMs) {
  return waitForClientReady(waClient, timeoutMs);
}

// Expose readiness helper for consumers like safeSendMessage
waClient.waitForWaReady = () => waitForClientReady(waClient);
waUserClient.waitForWaReady = () => waitForClientReady(waUserClient);
waGatewayClient.waitForWaReady = () => waitForClientReady(waGatewayClient);

// Ensure all message sends wait until client is ready
function wrapSendMessage(client) {
  const original = client.sendMessage;
  client._originalSendMessage = original;
  let queueForClient = messageQueues.get(client);
  if (!queueForClient) {
    queueForClient = new PQueue({ concurrency: 1 });
    messageQueues.set(client, queueForClient);
  }

  async function sendWithRetry(args, attempt = 0) {
    const waitFn =
      typeof client.waitForWaReady === "function"
        ? client.waitForWaReady
        : () => waitForClientReady(client);

    await waitFn().catch(() => {
      console.warn("[WA] sendMessage called before ready");
      throw new Error("WhatsApp client not ready");
    });
    try {
      return await original.apply(client, args);
    } catch (err) {
      const isRateLimit = err?.data === 429 || err?.message === "rate-overlimit";
      if (!isRateLimit || attempt >= 4) throw err;
      const baseDelay = 2 ** attempt * 800;
      const jitter = Math.floor(Math.random() * 0.2 * baseDelay);
      await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
      return sendWithRetry(args, attempt + 1);
    }
  }

  client.sendMessage = (...args) => {
    return queueForClient.add(() => sendWithRetry(args), {
      delay: responseDelayMs,
    });
  };
}
wrapSendMessage(waClient);
wrapSendMessage(waUserClient);
wrapSendMessage(waGatewayClient);

/**
 * Wait for all WhatsApp client message queues to be idle (empty and no pending tasks)
 * This ensures all messages have been sent before the caller continues
 */
export async function waitForAllMessageQueues() {
  const clients = [waClient, waUserClient, waGatewayClient];
  const idlePromises = [];
  
  for (const client of clients) {
    const queue = messageQueues.get(client);
    if (queue) {
      idlePromises.push(queue.onIdle());
    }
  }
  
  await Promise.all(idlePromises);
}

export function sendGatewayMessage(jid, text) {
  if (!waGatewayClient) {
    throw new Error("[WA-GATEWAY] Gateway client not initialized for automated notifications");
  }
  return waGatewayClient.sendMessage(jid, text);
}

// =======================
// CLIENT INITIALIZATION & RECONNECTION
// =======================

async function reconnectClient(client) {
  const state = getClientReadinessState(client);
  console.log(`[${state.label}] Attempting to reconnect client`);
  resetFallbackReadyState(client);
  if (typeof client?.connect !== "function") {
    console.warn(`[${state.label}] connect method not available`);
    return;
  }
  try {
    await client.connect();
    console.log(`[${state.label}] Client reconnected successfully`);
  } catch (err) {
    console.error(
      `[${state.label}] Reconnect failed: ${err?.message || err}`
    );
    throw err;
  }
}

async function reinitializeClient(client, options = {}) {
  const state = getClientReadinessState(client);
  const { clearAuthSession = false, trigger = "unknown", reason = "" } = options;
  
  console.log(
    `[${state.label}] Reinitializing client (trigger: ${trigger}, reason: ${reason}, clearAuthSession: ${clearAuthSession})`
  );
  
  if (typeof client?.reinitialize !== "function") {
    console.warn(`[${state.label}] reinitialize method not available`);
    return;
  }
  
  try {
    resetFallbackReadyState(client);
    await client.reinitialize({ clearAuthSession });
    console.log(`[${state.label}] Client reinitialized successfully`);
  } catch (err) {
    console.error(
      `[${state.label}] Reinitialize failed: ${err?.message || err}`
    );
    throw err;
  }
}

if (shouldInitWhatsAppClients) {
  const clientsToInit = [
    { label: "WA", client: waClient },
    { label: "WA-USER", client: waUserClient },
    { label: "WA-GATEWAY", client: waGatewayClient },
  ];

  clientsToInit.forEach(({ label, client }) => {
    registerClientReadiness(client, label);
  });

  const initPromises = clientsToInit.map(async ({ label, client }) => {
    const state = getClientReadinessState(client, label);

    client.on("qr", (qr) => {
      const qrWithLabel = `\n========== ${label} ==========\n${qr}\n${"=".repeat(label.length + 22)}`;
      console.log(`[${label}] QR Code received; scan dengan WhatsApp:`);
      qrcode.generate(qrWithLabel, { small: true });
      state.lastQrAt = Date.now();
      state.lastQrPayloadSeen = qr;
      state.awaitingQrScan = true;
      resetFallbackReadyState(client);
      clearAuthenticatedFallbackTimer(client);
    });

    client.on("authenticated", () => {
      console.log(`[${label}] Authenticated`);
      clearLogoutAwaitingQr(client);
      scheduleAuthenticatedReadyFallback(client, label);
    });

    client.on("auth_failure", (msg) => {
      console.error(`[${label}] Authentication failure: ${msg}`);
      state.lastAuthFailureAt = Date.now();
      state.lastAuthFailureMessage = String(msg || "auth_failure");
      clearAuthenticatedFallbackTimer(client);
    });

    client.on("ready", async () => {
      console.log(`[${label}] WhatsApp client ready`);
      markClientReady(client, "ready-event");
      try {
        await inferClientReadyState(client, label, "ready-event");
      } catch (err) {
        console.warn(
          `[${label}] Failed to infer ready state on ready event: ${err?.message}`
        );
      }
    });

    client.on("disconnected", (reason) => {
      const normalizedReason = normalizeDisconnectReason(reason);
      console.warn(`[${label}] Disconnected: ${normalizedReason}`);
      state.ready = false;
      state.lastDisconnectReason = normalizedReason;
      
      if (isLogoutDisconnectReason(normalizedReason)) {
        console.warn(
          `[${label}] Logout-style disconnect (${normalizedReason}); awaiting QR scan`
        );
        state.awaitingQrScan = true;
        state.lastAuthFailureAt = Date.now();
        state.lastAuthFailureMessage = `disconnect:${normalizedReason}`;
      }
      
      resetFallbackReadyState(client);
      clearAuthenticatedFallbackTimer(client);
    });

    client.on("change_state", (newState) => {
      const normalizedState = String(newState || "").toUpperCase();
      console.log(`[${label}] State changed: ${normalizedState}`);
      
      if (disconnectChangeStates.has(normalizedState)) {
        state.ready = false;
        state.lastDisconnectReason = normalizedState;
        
        if (isLogoutDisconnectReason(normalizedState)) {
          console.warn(
            `[${label}] Logout-style state (${normalizedState}); awaiting QR scan`
          );
          state.awaitingQrScan = true;
          state.lastAuthFailureAt = Date.now();
          state.lastAuthFailureMessage = `change_state:${normalizedState}`;
        }
      }
    });

    try {
      console.log(`[${label}] Initializing WhatsApp client...`);
      await client.initialize();
    } catch (err) {
      const isUnsupportedVersion = isUnsupportedVersionError(err);
      if (isUnsupportedVersion) {
        console.error(
          `[${label}] Fatal: Unsupported WhatsApp Web version. Update WA_WEB_VERSION_CACHE_TYPE or WA_WEB_VERSION.`
        );
        client.fatalInitError = {
          type: "unsupported-version",
          error: err,
        };
      } else {
        console.error(`[${label}] Init error: ${err?.message || err}`);
        client.fatalInitError = {
          type: "init-error",
          error: err,
        };
      }
    }
  });

  const scheduleFallbackReadyCheck = (
    client,
    delayMs = fallbackReadyCheckDelayMs
  ) => {
    const readinessState = getClientReadinessState(client);
    if (readinessState.fallbackCheckCompleted) {
      return;
    }
    if (readinessState.fallbackCheckInFlight) {
      return;
    }
    readinessState.fallbackCheckInFlight = true;
    const isConnectInFlight = () =>
      typeof client?.getConnectPromise === "function" &&
      Boolean(client.getConnectPromise());
    const getConnectInFlightDurationMs = () => {
      if (typeof client?.getConnectStartedAt !== "function") {
        return null;
      }
      const startedAt = client.getConnectStartedAt();
      if (!startedAt) {
        return null;
      }
      const durationMs = Date.now() - startedAt;
      return durationMs >= 0 ? durationMs : null;
    };
    const formatFallbackReadyContext = (
      readinessState,
      connectInFlight,
      connectInFlightDurationMs = null
    ) => {
      const clientId = client?.clientId || "unknown";
      const sessionPath = client?.sessionPath || "unknown";
      const awaitingQrScan = readinessState?.awaitingQrScan ? "true" : "false";
      const lastDisconnectReason = readinessState?.lastDisconnectReason || "none";
      const lastAuthFailureAt = readinessState?.lastAuthFailureAt
        ? new Date(readinessState.lastAuthFailureAt).toISOString()
        : "none";
      const lastQrAt = readinessState?.lastQrAt
        ? new Date(readinessState.lastQrAt).toISOString()
        : "none";
      const connectInFlightLabel = connectInFlight ? "true" : "false";
      const connectInFlightDuration =
        connectInFlightDurationMs !== null
          ? formatConnectDurationMs(connectInFlightDurationMs)
          : "n/a";
      return (
        `clientId=${clientId} ` +
        `connectInFlight=${connectInFlightLabel} ` +
        `connectInFlightDuration=${connectInFlightDuration} ` +
        `awaitingQrScan=${awaitingQrScan} ` +
        `lastDisconnectReason=${lastDisconnectReason} ` +
        `lastAuthFailureAt=${lastAuthFailureAt} ` +
        `lastQrAt=${lastQrAt} ` +
        `sessionPath=${sessionPath}`
      );
    };
    const scheduleFallbackCooldown = (cooldownMs) => {
      setTimeout(() => {
        fallbackReinitCounts.set(client, 0);
        fallbackStateRetryCounts.set(client, 0);
        const readinessState = getClientReadinessState(client);
        readinessState.unknownStateRetryCount = 0;
        scheduleFallbackReadyCheck(client, delayMs);
      }, cooldownMs);
    };
    setTimeout(async () => {
      const state = getClientReadinessState(client);
      state.fallbackCheckInFlight = false;
      if (state.fallbackCheckCompleted) {
        return;
      }
      if (state.ready) {
        markFallbackCheckCompleted(client);
        return;
      }
      const { label } = state;
      const connectInFlightDurationMs = getConnectInFlightDurationMs();
      if (isConnectInFlight()) {
        if (
          connectInFlightDurationMs !== null &&
          connectInFlightDurationMs >= connectInFlightWarnMs
        ) {
          console.warn(
            `[${label}] connect in progress for ${formatConnectDurationMs(
              connectInFlightDurationMs
            )}; ${formatFallbackReadyContext(
              state,
              true,
              connectInFlightDurationMs
            )}`
          );
        }
        if (
          connectInFlightDurationMs !== null &&
          connectInFlightDurationMs >= connectInFlightReinitMs
        ) {
          if (state.awaitingQrScan && hasRecentQrScan(state)) {
            console.warn(
              `[${label}] QR baru muncul; reinit ditunda; ${formatFallbackReadyContext(
                state,
                true,
                connectInFlightDurationMs
              )}`
            );
            scheduleFallbackReadyCheck(client, delayMs);
            return;
          }
          if (typeof client?.reinitialize === "function") {
            console.warn(
              `[${label}] connect in progress for ${formatConnectDurationMs(
                connectInFlightDurationMs
              )}; triggering reinit.`
            );
            reinitializeClient(client, {
                trigger: "connect-inflight-timeout",
                reason: `connect in progress for ${formatConnectDurationMs(
                  connectInFlightDurationMs
                )}`,
              })
              .catch((err) => {
                console.error(
                  `[${label}] Reinit failed after connect in-flight timeout: ${err?.message}`
                );
              });
          } else {
            console.warn(
              `[${label}] connect in progress for ${formatConnectDurationMs(
                connectInFlightDurationMs
              )}; reinit unavailable.`
            );
          }
          scheduleFallbackReadyCheck(client, delayMs);
          return;
        }
        console.log(
          `[${label}] fallback readiness skipped; connect in progress; ${formatFallbackReadyContext(
            state,
            true,
            connectInFlightDurationMs
          )}`
        );
        scheduleFallbackReadyCheck(client, delayMs);
        return;
      }
      if (isFatalMissingChrome(client)) {
        console.warn(
          `[${label}] Missing Chrome executable; skipping fallback readiness until Chrome is installed.`
        );
        return;
      }
      if (state.awaitingQrScan) {
        const reasonLabel = state.lastDisconnectReason || "LOGOUT";
        console.warn(
          `[${label}] Awaiting QR scan after ${reasonLabel}; skipping fallback readiness`
        );
        scheduleFallbackReadyCheck(client, delayMs);
        return;
      }
      if (typeof client?.isReady === "function") {
        try {
          const isReady = (await client.isReady()) === true;
          if (isReady) {
            console.log(
              `[${label}] fallback isReady indicates ready; awaiting ready event`
            );
            fallbackStateRetryCounts.set(client, 0);
            fallbackReinitCounts.set(client, 0);
            state.unknownStateRetryCount = 0;
            markFallbackCheckCompleted(client);
            return;
          }
          if (client?.info !== undefined) {
            console.warn(
              `[${label}] fallback readiness deferred; isReady=false while client.info is present`
            );
          }
        } catch (error) {
          console.warn(
            `[${label}] fallback isReady check failed: ${error?.message}`
          );
          if (client?.info !== undefined) {
            console.warn(
              `[${label}] fallback readiness deferred; client.info present but isReady errored`
            );
          }
        }
      } else if (client?.info !== undefined) {
        console.warn(
          `[${label}] fallback readiness deferred; client.info present but isReady not available`
        );
      }
      if (typeof client?.getState !== "function") {
        console.log(
          `[${label}] getState not available for fallback readiness; deferring readiness`
        );
        scheduleFallbackReadyCheck(client, delayMs);
        return;
      }
      try {
        const currentState = await client.getState();
        const normalizedState =
          currentState === null || currentState === undefined
            ? "unknown"
            : currentState;
        const normalizedStateLower =
          normalizedState === "unknown"
            ? "unknown"
            : String(normalizedState).toLowerCase();
        console.log(`[${label}] getState: ${normalizedState}`);
        if (normalizedStateLower === "unknown") {
          console.warn(
            `[${label}] fallback getState unknown; ${formatFallbackReadyContext(
              state,
              isConnectInFlight(),
              getConnectInFlightDurationMs()
            )}`
          );
        }
        if (
          normalizedStateLower === "connected" ||
          normalizedStateLower === "open"
        ) {
          fallbackStateRetryCounts.set(client, 0);
          fallbackReinitCounts.set(client, 0);
          state.unknownStateRetryCount = 0;
          console.log(
            `[${label}] getState=${normalizedState}; awaiting ready event`
          );
          markFallbackCheckCompleted(client);
          return;
        }

        const currentRetryCount = fallbackStateRetryCounts.get(client) || 0;
        if (currentRetryCount < maxFallbackStateRetries) {
          const nextRetryCount = currentRetryCount + 1;
          fallbackStateRetryCounts.set(client, nextRetryCount);
          const retryDelayMs = getFallbackStateRetryDelayMs();
          console.warn(
            `[${label}] getState=${normalizedState}; retrying ` +
              `(${nextRetryCount}/${maxFallbackStateRetries}) in ${retryDelayMs}ms; ` +
              formatFallbackReadyContext(
                state,
                isConnectInFlight(),
                getConnectInFlightDurationMs()
              )
          );
          scheduleFallbackReadyCheck(client, retryDelayMs);
          return;
        }

        fallbackStateRetryCounts.set(client, 0);
        const reinitAttempts = fallbackReinitCounts.get(client) || 0;
        if (reinitAttempts >= maxFallbackReinitAttempts) {
          console.warn(
            `[${label}] getState=${normalizedState} after retries; reinit skipped ` +
              `(max ${maxFallbackReinitAttempts} attempts); cooldown ` +
              `${fallbackReadyCooldownMs}ms before retrying fallback checks`
          );
          scheduleFallbackCooldown(fallbackReadyCooldownMs);
          return;
        }
        fallbackReinitCounts.set(client, reinitAttempts + 1);
        if (normalizedStateLower !== "unknown") {
          state.unknownStateRetryCount = 0;
        }
        const unknownStateRetryCount = normalizedStateLower === "unknown"
          ? (state.unknownStateRetryCount || 0) + 1
          : 0;
        if (normalizedStateLower === "unknown") {
          state.unknownStateRetryCount = unknownStateRetryCount;
        }
        const shouldEscalateUnknownState =
          normalizedStateLower === "unknown" &&
          label === "WA-GATEWAY" &&
          unknownStateRetryCount >= maxUnknownStateEscalationRetries;
        const shouldClearFallbackSession =
          normalizedStateLower === "unknown" &&
          (label === "WA-GATEWAY" || label === "WA-USER");
        const hasAuthIndicators = hasAuthFailureIndicator(state);
        const sessionPath = client?.sessionPath || null;
        const sessionPathExists = sessionPath ? fs.existsSync(sessionPath) : false;
        const hasSessionContent =
          sessionPathExists && hasPersistedAuthSession(sessionPath);
        const shouldClearCloseSession =
          normalizedStateLower === "close" &&
          label === "WA-GATEWAY" &&
          hasSessionContent;
        const canClearFallbackSession =
          sessionPathExists &&
          ((shouldClearFallbackSession && hasAuthIndicators) ||
            shouldClearCloseSession);
        if (
          shouldEscalateUnknownState &&
          sessionPathExists &&
          typeof client?.reinitialize === "function"
        ) {
          state.lastAuthFailureAt = Date.now();
          state.lastAuthFailureMessage = "fallback-unknown-escalation";
          console.warn(
            `[${label}] getState=${normalizedState} after retries; ` +
              `escalating unknown-state retries (${unknownStateRetryCount}/${maxUnknownStateEscalationRetries}); ` +
              `reinitializing with clear session; ` +
              formatFallbackReadyContext(
                state,
                isConnectInFlight(),
                getConnectInFlightDurationMs()
              )
          );
          reinitializeClient(client, {
              clearAuthSession: true,
              trigger: "fallback-unknown-escalation",
              reason: `unknown state after ${unknownStateRetryCount} retry cycles`,
            })
            .catch((err) => {
              console.error(
                `[${label}] Reinit failed after fallback getState=${normalizedState}: ${err?.message}`
              );
            });
          scheduleFallbackReadyCheck(client, delayMs);
          return;
        }
        if (canClearFallbackSession && typeof client?.reinitialize === "function") {
          const clearReason =
            shouldClearCloseSession && !hasAuthIndicators
              ? "getState close with persisted session"
              : "getState unknown with auth indicator";
          console.warn(
            `[${label}] getState=${normalizedState} after retries; ` +
              `reinitializing with clear session (${reinitAttempts + 1}/${maxFallbackReinitAttempts}); ` +
              formatFallbackReadyContext(
                state,
                isConnectInFlight(),
                getConnectInFlightDurationMs()
              )
          );
          reinitializeClient(client, {
              clearAuthSession: true,
              trigger: "fallback-unknown-auth",
              reason: clearReason,
            })
            .catch((err) => {
              console.error(
                `[${label}] Reinit failed after fallback getState=${normalizedState}: ${err?.message}`
              );
            });
          scheduleFallbackReadyCheck(client, delayMs);
          return;
        }
        if (
          (shouldClearFallbackSession || shouldClearCloseSession) &&
          !canClearFallbackSession
        ) {
          const skipReason = shouldClearCloseSession
            ? "session path missing"
            : !hasAuthIndicators
            ? "no auth indicator"
            : "session path missing";
          console.warn(
            `[${label}] getState=${normalizedState} after retries; ` +
              `skip clear session (${skipReason}); ` +
              formatFallbackReadyContext(
                state,
                isConnectInFlight(),
                getConnectInFlightDurationMs()
              )
          );
        }
        if (typeof client?.connect === "function") {
          console.warn(
            `[${label}] getState=${normalizedState} after retries; reinitializing (${reinitAttempts + 1}/${maxFallbackReinitAttempts})`
          );
          reconnectClient(client).catch((err) => {
            console.error(
              `[${label}] Reinit failed after fallback getState=${normalizedState}: ${err?.message}`
            );
          });
          scheduleFallbackReadyCheck(client, delayMs);
        } else {
          console.warn(
            `[${label}] connect not available; unable to reinit after fallback getState=${normalizedState}`
          );
        }
      } catch (e) {
        console.log(`[${label}] getState error: ${e?.message}`);
        console.warn(`[${label}] fallback readiness deferred after getState error`);
        scheduleFallbackReadyCheck(client, delayMs);
      }
    }, delayMs);
  };

  scheduleFallbackReadyCheck(waClient);
  scheduleFallbackReadyCheck(waUserClient);
  scheduleFallbackReadyCheck(waGatewayClient);

  await Promise.allSettled(initPromises);

  const shouldFailFastOnInit =
    process.env.WA_EXPECT_MESSAGES === "true" ||
    process.env.NODE_ENV === "production";
  if (shouldFailFastOnInit) {
    const initIssues = clientsToInit
      .map((clientEntry) => getInitReadinessIssue(clientEntry))
      .filter(Boolean);
    if (initIssues.length > 0) {
      initIssues.forEach((issue) => {
        console.error(
          `[WA] ${issue.label} init issue: ${issue.reason}. Remediation: ${issue.remediation}`
        );
      });
      const summary = initIssues
        .map(
          (issue) => `${issue.label}:${issue.reason}${issue.detail ? ` (${issue.detail})` : ""}`
        )
        .join("; ");
      throw new Error(
        `[WA] WhatsApp clients not ready while expecting messages. ${summary}`
      );
    }
  }

  // Diagnostic checks to ensure message listeners are attached
  logWaServiceDiagnostics(
    waClient,
    waUserClient,
    waGatewayClient,
    getWaReadinessSummary()
  );
  checkMessageListenersAttached(waClient, waUserClient, waGatewayClient);
}

export default waClient;

// ======================= end of file ======================
