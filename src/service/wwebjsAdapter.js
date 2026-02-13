import fs from 'fs';
import { rm, readFile, stat } from 'fs/promises';
import path from 'path';
import os from 'os';
import net from 'net';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import pkg from 'whatsapp-web.js';

// Enable debug logging only when WA_DEBUG_LOGGING is set to "true"
const debugLoggingEnabled = process.env.WA_DEBUG_LOGGING === 'true';

const DEFAULT_WEB_VERSION_CACHE_URL = '';
const DEFAULT_AUTH_DATA_DIR = 'wwebjs_auth';
const DEFAULT_AUTH_DATA_PARENT_DIR = '.cicero';
const WEB_VERSION_PATTERN = /^\d+\.\d+(\.\d+)?$/;
const DEFAULT_BROWSER_LOCK_BACKOFF_MS = 20000;
const DEFAULT_ACTIVE_BROWSER_LOCK_BACKOFF_MULTIPLIER = 3;
const MIN_ACTIVE_BROWSER_LOCK_BACKOFF_MS = 30000;
const DEFAULT_PUPPETEER_PROTOCOL_TIMEOUT_MS = 120000;
const DEFAULT_PUPPETEER_PROTOCOL_TIMEOUT_MAX_MS = 300000;
const DEFAULT_PROTOCOL_TIMEOUT_BACKOFF_MULTIPLIER = 1.5;
const DEFAULT_CONNECT_TIMEOUT_MS = 180000;
const DEFAULT_CONNECT_RETRY_ATTEMPTS = 3;
const DEFAULT_CONNECT_RETRY_BACKOFF_MS = 5000;
const DEFAULT_CONNECT_RETRY_BACKOFF_MULTIPLIER = 2;
const DEFAULT_RUNTIME_TIMEOUT_RETRY_ATTEMPTS = 2;
const DEFAULT_RUNTIME_TIMEOUT_RETRY_BACKOFF_MS = 250;
const DEFAULT_LOCK_FALLBACK_THRESHOLD = 2;
const STORE_READINESS_RETRY_DELAY_MS = 1000;
const COMMON_CHROME_EXECUTABLE_PATHS = [
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/opt/google/chrome/chrome',
];
const PROTOCOL_TIMEOUT_ENV_VAR_BASE = 'WA_WWEBJS_PROTOCOL_TIMEOUT_MS';
const PROTOCOL_TIMEOUT_ROLE_ALIASES = [
  { prefix: 'wa-gateway', suffix: 'GATEWAY' },
  { prefix: 'wa-user', suffix: 'USER' },
];
const DEFAULT_INGRESS_FALLBACK_WINDOW_MS = 30000;
const DEFAULT_INGRESS_PROCESSED_ID_TTL_MS = 15 * 60 * 1000;


function normalizeMessageBodyForDedupe(body) {
  if (typeof body !== 'string') {
    return '';
  }
  return body
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function toMillisTimestamp(rawTimestamp) {
  if (rawTimestamp === null || rawTimestamp === undefined) {
    return Date.now();
  }
  const numericTimestamp = Number(rawTimestamp);
  if (!Number.isFinite(numericTimestamp) || numericTimestamp <= 0) {
    return Date.now();
  }
  // whatsapp-web.js msg.timestamp usually in seconds
  return numericTimestamp < 1_000_000_000_000
    ? Math.round(numericTimestamp * 1000)
    : Math.round(numericTimestamp);
}

function buildFallbackMessageId(chatId, normalizedText, timestampMs, dedupeWindowMs) {
  const safeWindowMs = Math.max(Number(dedupeWindowMs) || DEFAULT_INGRESS_FALLBACK_WINDOW_MS, 1);
  const roundedTimestampWindow = Math.floor(timestampMs / safeWindowMs) * safeWindowMs;
  const raw = `${chatId}|${normalizedText}|${roundedTimestampWindow}`;
  return `fallback:${crypto.createHash('sha256').update(raw).digest('hex')}`;
}


function resolveDefaultAuthDataPath() {
  const homeDir = os.homedir?.();
  const baseDir = homeDir || process.cwd();
  return path.resolve(
    path.join(baseDir, DEFAULT_AUTH_DATA_PARENT_DIR, DEFAULT_AUTH_DATA_DIR)
  );
}

function resolveAuthDataPath() {
  const configuredPath = (process.env.WA_AUTH_DATA_PATH || '').trim();
  if (configuredPath) {
    return path.resolve(configuredPath);
  }
  return resolveDefaultAuthDataPath();
}

function shouldClearAuthSession() {
  return process.env.WA_AUTH_CLEAR_SESSION_ON_REINIT === 'true';
}

const LOGOUT_DISCONNECT_REASONS = new Set([
  'LOGGED_OUT',
  'UNPAIRED',
  'CONFLICT',
  'UNPAIRED_IDLE',
]);

function resolvePuppeteerCacheDir() {
  const configuredPath = (process.env.PUPPETEER_CACHE_DIR || '').trim();
  if (configuredPath) {
    return path.resolve(configuredPath);
  }
  const homeDir = os.homedir?.();
  const baseDir = homeDir || process.cwd();
  return path.join(baseDir, '.cache', 'puppeteer');
}

function parsePuppeteerLinuxCacheVersion(dirName) {
  if (!dirName.startsWith('linux-')) {
    return null;
  }
  const version = dirName.slice('linux-'.length);
  if (!version) {
    return null;
  }
  const parts = version.split('.').map((segment) => Number.parseInt(segment, 10));
  if (parts.some((part) => Number.isNaN(part))) {
    return null;
  }
  return { dirName, parts, version };
}

function compareVersionParts(left, right) {
  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }
  return 0;
}

async function resolveCachedPuppeteerExecutable() {
  const cacheDir = resolvePuppeteerCacheDir();
  const chromeBaseDir = path.join(cacheDir, 'chrome');
  let entries = [];
  try {
    entries = await fs.promises.readdir(chromeBaseDir, { withFileTypes: true });
  } catch (err) {
    return null;
  }
  const versions = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => parsePuppeteerLinuxCacheVersion(entry.name))
    .filter(Boolean)
    .sort((left, right) => compareVersionParts(left.parts, right.parts));
  if (!versions.length) {
    return null;
  }
  const latest = versions[versions.length - 1];
  const candidatePath = path.join(
    chromeBaseDir,
    latest.dirName,
    'chrome-linux64',
    'chrome'
  );
  const isAccessible = await isExecutableAccessible(candidatePath);
  if (!isAccessible) {
    return null;
  }
  return {
    executablePath: candidatePath,
    source: `puppeteer-cache:${latest.version}`,
  };
}

async function resolvePuppeteerExecutablePath() {
  const configuredPath = (
    process.env.WA_PUPPETEER_EXECUTABLE_PATH ||
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    ''
  ).trim();
  if (configuredPath) {
    const isAccessible = await isExecutableAccessible(configuredPath);
    return isAccessible
      ? { executablePath: configuredPath, source: 'env' }
      : null;
  }
  const cachedExecutable = await resolveCachedPuppeteerExecutable();
  if (cachedExecutable) {
    return cachedExecutable;
  }
  for (const candidatePath of COMMON_CHROME_EXECUTABLE_PATHS) {
    if (await isExecutableAccessible(candidatePath)) {
      return { executablePath: candidatePath, source: 'system' };
    }
  }
  return null;
}

async function isExecutableAccessible(executablePath) {
  if (!executablePath) {
    return false;
  }
  try {
    await fs.promises.access(executablePath, fs.constants.X_OK);
    return true;
  } catch (err) {
    return false;
  }
}

function formatFileMode(mode) {
  if (typeof mode !== 'number') {
    return 'unknown';
  }
  return `0${(mode & 0o777).toString(8)}`;
}

async function getExecutableDiagnostics(executablePath) {
  if (!executablePath) {
    return {
      resolvedPath: null,
      statMode: null,
      statErrorCode: 'ENOENT',
      accessOk: false,
      accessErrorCode: 'ENOENT',
    };
  }
  const resolvedPath = path.resolve(executablePath);
  let statMode = null;
  let statErrorCode = null;
  try {
    const stats = await fs.promises.stat(resolvedPath);
    statMode = stats.mode;
  } catch (err) {
    statErrorCode = err?.code || 'UNKNOWN';
  }
  let accessOk = false;
  let accessErrorCode = null;
  try {
    await fs.promises.access(resolvedPath, fs.constants.X_OK);
    accessOk = true;
  } catch (err) {
    accessErrorCode = err?.code || 'UNKNOWN';
  }
  return {
    resolvedPath,
    statMode,
    statErrorCode,
    accessOk,
    accessErrorCode,
  };
}

function buildExecutableRemediationHints(diagnostics) {
  const hints = [];
  const hasExecuteBit =
    typeof diagnostics?.statMode === 'number' &&
    (diagnostics.statMode & 0o111) !== 0;
  if (typeof diagnostics?.statMode === 'number' && !hasExecuteBit) {
    hints.push('chmod +x <path>');
  }
  if (diagnostics?.accessErrorCode === 'EACCES' && hasExecuteBit) {
    hints.push('mount -o remount,exec <mountpoint>');
  }
  return hints;
}

function resolveBrowserLockBackoffMs() {
  const configured = Number.parseInt(
    process.env.WA_WWEBJS_BROWSER_LOCK_BACKOFF_MS || '',
    10
  );
  if (Number.isNaN(configured)) {
    return DEFAULT_BROWSER_LOCK_BACKOFF_MS;
  }
  return Math.max(configured, 0);
}

function resolveActiveBrowserLockBackoffMs() {
  const baseBackoffMs = resolveBrowserLockBackoffMs();
  const scaledBackoffMs =
    baseBackoffMs * DEFAULT_ACTIVE_BROWSER_LOCK_BACKOFF_MULTIPLIER;
  return Math.max(scaledBackoffMs, MIN_ACTIVE_BROWSER_LOCK_BACKOFF_MS);
}

function shouldUseStrictLockRecovery() {
  return process.env.WA_WWEBJS_LOCK_RECOVERY_STRICT === 'true';
}

function shouldAllowSharedSession() {
  return process.env.WA_WWEBJS_ALLOW_SHARED_SESSION === 'true';
}

function parseTimeoutEnvValue(rawValue) {
  const configured = Number.parseInt(rawValue || '', 10);
  if (Number.isNaN(configured)) {
    return null;
  }
  return Math.max(configured, 0);
}

function isProcessRunning(pid) {
  if (!pid) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err?.code === 'ESRCH') {
      return false;
    }
    return false;
  }
}

async function readLockPid(lockPath) {
  try {
    const content = await readFile(lockPath, 'utf8');
    const pid = Number.parseInt(String(content).trim(), 10);
    if (Number.isNaN(pid)) {
      return null;
    }
    return pid;
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return null;
    }
    return null;
  }
}

async function isSingletonSocketActive(socketPath) {
  try {
    const socketStats = await stat(socketPath);
    if (!socketStats.isSocket()) {
      return false;
    }
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return false;
    }
    return false;
  }

  return new Promise((resolve) => {
    const socket = net.createConnection({ path: socketPath });
    const finalize = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.once('connect', () => finalize(true));
    socket.once('error', (err) => {
      if (err?.code === 'ECONNREFUSED' || err?.code === 'ENOENT') {
        finalize(false);
        return;
      }
      finalize(false);
    });
  });
}

async function detectActiveBrowserLock(profilePath) {
  const lockPath = path.join(profilePath, 'SingletonLock');
  const socketPath = path.join(profilePath, 'SingletonSocket');
  const pid = await readLockPid(lockPath);
  if (pid && isProcessRunning(pid)) {
    return {
      isActive: true,
      reason: `pid=${pid}`,
      pid,
    };
  }
  const socketActive = await isSingletonSocketActive(socketPath);
  if (socketActive) {
    return {
      isActive: true,
      reason: 'singleton socket active',
      pid,
    };
  }
  return { isActive: false, reason: null, pid };
}

function buildSharedSessionGuardMessage({ clientId, sessionPath, activeLockStatus }) {
  const pid = activeLockStatus?.pid ?? 'unknown';
  const reason = activeLockStatus?.reason || 'active lock';
  return (
    `[WWEBJS] Shared session lock detected for clientId=${clientId} ` +
    `(sessionPath=${sessionPath}, reason=${reason}, pid=${pid}). ` +
    'Another process appears to be using this session. ' +
    'Use distinct WA_AUTH_DATA_PATH per process or configure ' +
    'WA_WWEBJS_FALLBACK_AUTH_DATA_PATH / WA_WWEBJS_FALLBACK_USER_DATA_DIR_SUFFIX ' +
    '(example: WA_WWEBJS_FALLBACK_USER_DATA_DIR_SUFFIX=worker-\\${PM2_INSTANCE_ID}). ' +
    'Set WA_WWEBJS_ALLOW_SHARED_SESSION=true to bypass this guard.'
  );
}

function normalizeClientIdEnvSuffix(clientId) {
  if (!clientId) {
    return '';
  }
  return String(clientId)
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function resolveProtocolTimeoutRoleSuffix(clientId) {
  if (!clientId) {
    return null;
  }
  const normalizedClientId = String(clientId).trim().toLowerCase();
  if (!normalizedClientId) {
    return null;
  }
  const match = PROTOCOL_TIMEOUT_ROLE_ALIASES.find(({ prefix }) =>
    normalizedClientId.startsWith(prefix)
  );
  return match?.suffix || null;
}

function resolveProtocolTimeoutEnvCandidates(clientId) {
  const candidates = [];
  const clientSuffix = normalizeClientIdEnvSuffix(clientId);
  if (clientSuffix) {
    candidates.push(`${PROTOCOL_TIMEOUT_ENV_VAR_BASE}_${clientSuffix}`);
  }
  const roleSuffix = resolveProtocolTimeoutRoleSuffix(clientId);
  if (roleSuffix) {
    candidates.push(`${PROTOCOL_TIMEOUT_ENV_VAR_BASE}_${roleSuffix}`);
  }
  candidates.push(PROTOCOL_TIMEOUT_ENV_VAR_BASE);
  return [...new Set(candidates)];
}

function resolvePuppeteerProtocolTimeoutConfig(clientId) {
  const candidates = resolveProtocolTimeoutEnvCandidates(clientId);
  for (const envVarName of candidates) {
    const configuredValue = parseTimeoutEnvValue(process.env[envVarName]);
    if (configuredValue !== null) {
      return { timeoutMs: configuredValue, envVarName };
    }
  }
  return {
    timeoutMs: DEFAULT_PUPPETEER_PROTOCOL_TIMEOUT_MS,
    envVarName: PROTOCOL_TIMEOUT_ENV_VAR_BASE,
  };
}

function resolveProtocolTimeoutMaxMs() {
  const configured = parseTimeoutEnvValue(
    process.env.WA_WWEBJS_PROTOCOL_TIMEOUT_MAX_MS
  );
  if (configured === null) {
    return DEFAULT_PUPPETEER_PROTOCOL_TIMEOUT_MAX_MS;
  }
  return Math.max(configured, 0);
}

function resolveProtocolTimeoutBackoffMultiplier() {
  const configured = Number.parseFloat(
    process.env.WA_WWEBJS_PROTOCOL_TIMEOUT_BACKOFF_MULTIPLIER || ''
  );
  if (Number.isNaN(configured)) {
    return DEFAULT_PROTOCOL_TIMEOUT_BACKOFF_MULTIPLIER;
  }
  return Math.max(configured, 1);
}

function resolveConnectTimeoutMs() {
  const configured = Number.parseInt(process.env.WA_CONNECT_TIMEOUT_MS || '', 10);
  if (Number.isNaN(configured)) {
    return DEFAULT_CONNECT_TIMEOUT_MS;
  }
  return Math.max(configured, 0);
}

function resolveConnectRetryAttempts() {
  const configured = Number.parseInt(
    process.env.WA_WWEBJS_CONNECT_RETRY_ATTEMPTS || '',
    10
  );
  if (Number.isNaN(configured)) {
    return DEFAULT_CONNECT_RETRY_ATTEMPTS;
  }
  return Math.max(configured, 1);
}

function resolveConnectRetryBackoffMs() {
  const configured = Number.parseInt(
    process.env.WA_WWEBJS_CONNECT_RETRY_BACKOFF_MS || '',
    10
  );
  if (Number.isNaN(configured)) {
    return DEFAULT_CONNECT_RETRY_BACKOFF_MS;
  }
  return Math.max(configured, 0);
}

function resolveConnectRetryBackoffMultiplier() {
  const configured = Number.parseFloat(
    process.env.WA_WWEBJS_CONNECT_RETRY_BACKOFF_MULTIPLIER || ''
  );
  if (Number.isNaN(configured)) {
    return DEFAULT_CONNECT_RETRY_BACKOFF_MULTIPLIER;
  }
  return Math.max(configured, 1);
}

function resolveLockFallbackThreshold() {
  const configured = Number.parseInt(
    process.env.WA_WWEBJS_LOCK_FALLBACK_THRESHOLD || '',
    10
  );
  if (Number.isNaN(configured)) {
    return DEFAULT_LOCK_FALLBACK_THRESHOLD;
  }
  return Math.max(configured, 1);
}

function buildSessionPath(authDataPath, clientId) {
  return path.join(authDataPath, `session-${clientId}`);
}

function resolveFallbackAuthDataPath(authDataPath) {
  const configuredPath = (process.env.WA_WWEBJS_FALLBACK_AUTH_DATA_PATH || '').trim();
  if (configuredPath) {
    return path.resolve(configuredPath);
  }
  return authDataPath;
}

function sanitizePathSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildFallbackAuthDataPath(authDataPath, clientId, attempt) {
  const hostname = sanitizePathSegment(os.hostname());
  const pid = sanitizePathSegment(String(process.pid));
  const envSuffix = sanitizePathSegment(
    (process.env.WA_WWEBJS_FALLBACK_USER_DATA_DIR_SUFFIX || '').trim()
  );
  const suffixParts = [clientId, hostname, pid, `attempt${attempt}`, envSuffix].filter(
    Boolean
  );
  const suffix = sanitizePathSegment(suffixParts.join('_')) || 'fallback';
  const baseName = path.basename(authDataPath);
  const parentDir = path.dirname(authDataPath);
  return path.join(parentDir, `${baseName}-fallback-${suffix}`);
}

function extractVersionString(payload) {
  if (!payload) {
    return null;
  }
  if (typeof payload === 'string') {
    const match = payload.match(/\d+\.\d+(\.\d+)?/);
    return match?.[0] || null;
  }
  if (typeof payload === 'object') {
    const knownKeys = ['version', 'webVersion', 'wa_version', 'waVersion'];
    for (const key of knownKeys) {
      const value = payload[key];
      if (typeof value === 'string') {
        const match = value.match(/\d+\.\d+(\.\d+)?/);
        if (match?.[0]) {
          return match[0];
        }
      }
    }
  }
  return null;
}

function describeSendMessageContentType(content) {
  if (content && typeof content === 'object' && 'document' in content) {
    return 'document';
  }
  if (typeof content === 'string') {
    return 'text';
  }
  if (content && typeof content === 'object' && 'text' in content) {
    return 'text';
  }
  if (content == null) {
    return 'empty';
  }
  return typeof content;
}

async function fetchWebVersionCache(cacheUrl) {
  try {
    const response = await fetch(cacheUrl, { redirect: 'follow' });
    if (!response.ok) {
      console.warn(
        `[WWEBJS] Web version cache fetch failed (${response.status}) for ${cacheUrl}.`
      );
      return null;
    }
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await response.json();
    }
    const textPayload = await response.text();
    try {
      return JSON.parse(textPayload);
    } catch {
      return textPayload;
    }
  } catch (err) {
    console.warn(
      `[WWEBJS] Web version cache fetch error for ${cacheUrl}:`,
      err?.message || err
    );
    return null;
  }
}

async function resolveWebVersionOptions() {
  const cacheUrl =
    (process.env.WA_WEB_VERSION_CACHE_URL || DEFAULT_WEB_VERSION_CACHE_URL).trim();
  const pinnedVersionInput = (process.env.WA_WEB_VERSION || '').trim();
  const recommendedVersionInput = (process.env.WA_WEB_VERSION_RECOMMENDED || '')
    .trim();
  const pinnedVersion = pinnedVersionInput
    ? extractVersionString(pinnedVersionInput)
    : null;
  const recommendedVersion = recommendedVersionInput
    ? extractVersionString(recommendedVersionInput)
    : null;
  const resolvedPinnedVersion = pinnedVersion || recommendedVersion;
  const versionOptions = {};

  if (pinnedVersionInput && !pinnedVersion) {
    console.warn(
      `[WWEBJS] WA_WEB_VERSION must be a valid version string (got "${pinnedVersionInput}").`
    );
  }
  if (recommendedVersionInput && !recommendedVersion) {
    console.warn(
      `[WWEBJS] WA_WEB_VERSION_RECOMMENDED must be a valid version string (got "${recommendedVersionInput}").`
    );
  }

  if (!cacheUrl && !pinnedVersionInput && !recommendedVersionInput) {
    console.warn(
      '[WWEBJS] WA_WEB_VERSION and WA_WEB_VERSION_CACHE_URL are empty; ' +
        'disabling local web cache to avoid LocalWebCache.persist errors.'
    );
    versionOptions.webVersionCache = { type: 'none' };
  }

  if (cacheUrl) {
    const cachePayload = await fetchWebVersionCache(cacheUrl);
    if (!cachePayload) {
      console.warn(
        `[WWEBJS] Web version cache disabled because fetch failed for ${cacheUrl}.`
      );
      versionOptions.webVersionCache = { type: 'none' };
    } else {
      const extractedVersion = extractVersionString(cachePayload);
      if (extractedVersion) {
        versionOptions.webVersionCache = { type: 'remote', remotePath: cacheUrl };
        if (!resolvedPinnedVersion) {
          versionOptions.webVersion = extractedVersion;
        }
      } else {
        console.warn(
          `[WWEBJS] Web version cache validation failed for ${cacheUrl}. ` +
            'Disabling webVersionCache so whatsapp-web.js falls back to defaults.'
        );
        versionOptions.webVersionCache = { type: 'none' };
      }
    }
  }

  if (resolvedPinnedVersion) {
    versionOptions.webVersion = resolvedPinnedVersion;
  }

  return {
    ...versionOptions,
    __webVersionMeta: {
      cacheUrl,
      pinnedVersionInput,
      recommendedVersionInput,
    },
  };
}

function sanitizeWebVersionOptions(versionOptions) {
  const { __webVersionMeta: webVersionMeta, ...baseOptions } = versionOptions;
  const sanitized = { ...baseOptions };
  if (sanitized.webVersionCache?.type === 'remote' && !sanitized.webVersion) {
    console.warn(
      '[WWEBJS] Web version cache disabled because webVersion is empty. ' +
        'Check WA_WEB_VERSION_CACHE_URL for a valid payload.'
    );
    sanitized.webVersionCache = { type: 'none' };
  }

  const resolvedVersion = sanitized.webVersion;
  const isValidResolvedVersion =
    typeof resolvedVersion === 'string' && WEB_VERSION_PATTERN.test(resolvedVersion);
  const shouldValidate =
    Boolean(webVersionMeta?.pinnedVersionInput) ||
    Boolean(webVersionMeta?.recommendedVersionInput) ||
    Boolean(webVersionMeta?.cacheUrl) ||
    sanitized.webVersionCache?.type === 'remote';
  if (shouldValidate && !isValidResolvedVersion) {
    const details = [];
    if (webVersionMeta?.pinnedVersionInput) {
      details.push(`WA_WEB_VERSION="${webVersionMeta.pinnedVersionInput}"`);
    }
    if (webVersionMeta?.recommendedVersionInput) {
      details.push(
        `WA_WEB_VERSION_RECOMMENDED="${webVersionMeta.recommendedVersionInput}"`
      );
    }
    if (webVersionMeta?.cacheUrl) {
      details.push(`WA_WEB_VERSION_CACHE_URL="${webVersionMeta.cacheUrl}"`);
    }
    const metaDetails = details.length ? ` (${details.join(', ')})` : '';
    const reason = resolvedVersion
      ? `Invalid resolved webVersion "${resolvedVersion}"`
      : 'Resolved webVersion is missing';
    console.warn(
      `[WWEBJS] ${reason}${metaDetails}. ` +
        'Disabling webVersionCache so whatsapp-web.js falls back to defaults.'
    );
    sanitized.webVersionCache = { type: 'none' };
    delete sanitized.webVersion;
  }
  if ('webVersion' in sanitized && !sanitized.webVersion) {
    delete sanitized.webVersion;
  }
  return sanitized;
}

const { Client, LocalAuth, MessageMedia } = pkg;
const WEB_VERSION_FALLBACK_ERRORS = [
  'LocalWebCache.persist',
  "Cannot read properties of null (reading '1')",
];
const BROWSER_ALREADY_RUNNING_ERROR = 'browser is already running for';
const MISSING_CHROME_ERROR_PATTERNS = [
  /could not find chrome/i,
  /could not find browser executable/i,
];

function shouldFallbackWebVersion(err) {
  const errorDetails = [err?.stack, err?.message].filter(Boolean).join(' ');
  return WEB_VERSION_FALLBACK_ERRORS.some((needle) =>
    errorDetails.includes(needle)
  );
}

function isBrowserAlreadyRunningError(err) {
  const errorDetails = [err?.stack, err?.message]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return errorDetails.includes(BROWSER_ALREADY_RUNNING_ERROR);
}

function isMissingChromeError(err) {
  const errorDetails = [err?.stack, err?.message].filter(Boolean).join(' ');
  return MISSING_CHROME_ERROR_PATTERNS.some((pattern) =>
    pattern.test(errorDetails)
  );
}

function delay(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function isRuntimeCallTimeout(err) {
  const errorDetails = [err?.stack, err?.message].filter(Boolean).join(' ');
  return errorDetails.includes('Runtime.callFunctionOn timed out');
}

async function withRuntimeTimeoutRetry(
  action,
  label,
  protocolTimeoutEnvVarName,
  clientId
) {
  let lastError = null;
  for (let attempt = 1; attempt <= DEFAULT_RUNTIME_TIMEOUT_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await action();
    } catch (err) {
      lastError = err;
      if (!isRuntimeCallTimeout(err) || attempt >= DEFAULT_RUNTIME_TIMEOUT_RETRY_ATTEMPTS) {
        throw err;
      }
      const backoffMs = DEFAULT_RUNTIME_TIMEOUT_RETRY_BACKOFF_MS * attempt;
      console.warn(
        `[WWEBJS] ${label} timed out (Runtime.callFunctionOn). ` +
          `Retrying in ${backoffMs}ms (attempt ${attempt}/${DEFAULT_RUNTIME_TIMEOUT_RETRY_ATTEMPTS}). ` +
          `Protocol timeout env var: ${protocolTimeoutEnvVarName}. ` +
          `clientId=${clientId}.`,
        err?.message || err
      );
      await delay(backoffMs);
    }
  }
  throw lastError;
}

/**
 * Create a whatsapp-web.js client that matches the WAAdapter contract.
 * The client stays in standby mode and does not mark messages as read
 * unless explicitly invoked.
 *
 * @param {string} [clientId='wa-admin'] - WhatsApp client identifier used by LocalAuth.
 */
export async function createWwebjsClient(clientId = 'wa-admin') {
  const emitter = new EventEmitter();
  emitter.fatalInitError = null;
  const configuredAuthPath = (process.env.WA_AUTH_DATA_PATH || '').trim();
  const recommendedAuthPath = resolveDefaultAuthDataPath();
  const initialAuthDataPath = resolveAuthDataPath();
  let authDataPath = initialAuthDataPath;
  const clearAuthSession = shouldClearAuthSession();
  const ensureAuthDataPathWritable = async (candidatePath, isConfiguredPath) => {
    try {
      await fs.promises.mkdir(candidatePath, { recursive: true });
      await fs.promises.access(candidatePath, fs.constants.W_OK);
      return true;
    } catch (err) {
      if (isConfiguredPath) {
        console.error(
          `[WWEBJS] WA_AUTH_DATA_PATH must be writable by the runtime user. ` +
            `Failed to access ${candidatePath}. Recommended path: ${recommendedAuthPath}.`,
          err?.message || err
        );
      } else {
        console.error(
          `[WWEBJS] Auth data path must be writable by the runtime user. ` +
            `Failed to access ${candidatePath}.`,
          err?.message || err
        );
      }
      return false;
    }
  };
  let authPathWritable = await ensureAuthDataPathWritable(
    authDataPath,
    Boolean(configuredAuthPath)
  );
  if (!authPathWritable && configuredAuthPath) {
    console.warn(
      `[WWEBJS] Falling back to recommended auth path ${recommendedAuthPath} ` +
        `because WA_AUTH_DATA_PATH is not writable.`
    );
    authDataPath = recommendedAuthPath;
    authPathWritable = await ensureAuthDataPathWritable(authDataPath, false);
  }
  if (!authPathWritable) {
    if (configuredAuthPath) {
      throw new Error(
        `[WWEBJS] WA_AUTH_DATA_PATH is not writable: ${configuredAuthPath}. ` +
          `Fallback path is also not writable: ${authDataPath}.`
      );
    }
    throw new Error(
      `[WWEBJS] Auth data path is not writable: ${authDataPath}. ` +
        `Recommended path: ${recommendedAuthPath}.`
    );
  }
  const baseAuthDataPath = authDataPath;
  let activeAuthDataPath = baseAuthDataPath;
  let fallbackAttempt = 0;
  let lockActiveFailureCount = 0;
  const resolveSessionPath = () => buildSessionPath(activeAuthDataPath, clientId);
  const resolvePuppeteerProfilePath = () => resolveSessionPath();
  const resolveFallbackBasePath = () =>
    resolveFallbackAuthDataPath(baseAuthDataPath);
  let reinitInProgress = false;
  let connectInProgress = null;
  let connectStartedAt = null;
  const ingressFallbackWindowMs = Math.max(
    Number.parseInt(process.env.WA_INGRESS_DEDUPE_WINDOW_MS || '', 10) || DEFAULT_INGRESS_FALLBACK_WINDOW_MS,
    1000
  );
  const ingressProcessedIdTtlMs = Math.max(
    Number.parseInt(process.env.WA_INGRESS_PROCESSED_ID_TTL_MS || '', 10) || DEFAULT_INGRESS_PROCESSED_ID_TTL_MS,
    1000
  );
  const perChatIngressState = new Map();
  const ingressMetrics = {
    duplicateDropped: 0,
    lateDropped: 0,
  };
  const webVersionOptions = sanitizeWebVersionOptions(
    await resolveWebVersionOptions()
  );
  const puppeteerExecutable = await resolvePuppeteerExecutablePath();
  const puppeteerExecutablePath = puppeteerExecutable?.executablePath ?? null;
  if (puppeteerExecutablePath) {
    console.info(
      `[WWEBJS] Resolved Puppeteer executable for clientId=${clientId} ` +
        `(${puppeteerExecutable?.source ?? 'unknown'}): ${puppeteerExecutablePath}.`
    );
  }
  const puppeteerProtocolTimeoutConfig =
    resolvePuppeteerProtocolTimeoutConfig(clientId);
  let puppeteerProtocolTimeoutMs = puppeteerProtocolTimeoutConfig.timeoutMs;
  const protocolTimeoutEnvVarName = puppeteerProtocolTimeoutConfig.envVarName;
  const protocolTimeoutMaxMs = resolveProtocolTimeoutMaxMs();
  const protocolTimeoutBackoffMultiplier =
    resolveProtocolTimeoutBackoffMultiplier();
  const connectRetryAttempts = resolveConnectRetryAttempts();
  const connectRetryBackoffMs = resolveConnectRetryBackoffMs();
  const connectRetryBackoffMultiplier = resolveConnectRetryBackoffMultiplier();
  const lockFallbackThreshold = resolveLockFallbackThreshold();
  const client = new Client({
    authStrategy: new LocalAuth({ clientId, dataPath: activeAuthDataPath }),
    puppeteer: {
      args: ['--no-sandbox'],
      headless: true,
      protocolTimeout: puppeteerProtocolTimeoutMs,
      ...(puppeteerExecutablePath
        ? { executablePath: puppeteerExecutablePath }
        : {}),
    },
    ...webVersionOptions,
  });

  const applyProtocolTimeout = (nextTimeoutMs, reasonLabel) => {
    const normalizedTimeoutMs = Math.max(Number(nextTimeoutMs) || 0, 0);
    if (!client.options.puppeteer) {
      client.options.puppeteer = {};
    }
    client.options.puppeteer.protocolTimeout = normalizedTimeoutMs;
    puppeteerProtocolTimeoutMs = normalizedTimeoutMs;
    console.warn(
      `[WWEBJS] Updated protocolTimeout to ${normalizedTimeoutMs}ms for clientId=${clientId}` +
        `${reasonLabel ? ` (${reasonLabel})` : ''}.`
    );
  };

  const maybeIncreaseProtocolTimeout = (triggerLabel, err) => {
    if (!isRuntimeCallTimeout(err)) {
      return false;
    }
    const resolvedMaxMs = Math.max(protocolTimeoutMaxMs, puppeteerProtocolTimeoutMs);
    if (puppeteerProtocolTimeoutMs >= resolvedMaxMs) {
      console.warn(
        `[WWEBJS] Runtime.callFunctionOn timed out for clientId=${clientId} (${triggerLabel}), ` +
          `but protocolTimeout is already at ${puppeteerProtocolTimeoutMs}ms (max ${resolvedMaxMs}ms). ` +
          `Protocol timeout env var: ${protocolTimeoutEnvVarName}.`
      );
      return false;
    }
    const scaledTimeoutMs = Math.round(
      puppeteerProtocolTimeoutMs * protocolTimeoutBackoffMultiplier
    );
    const incrementedTimeoutMs = Math.max(puppeteerProtocolTimeoutMs + 10000, scaledTimeoutMs);
    const nextTimeoutMs = Math.min(incrementedTimeoutMs, resolvedMaxMs);
    applyProtocolTimeout(
      nextTimeoutMs,
      `${triggerLabel}: Runtime.callFunctionOn timeout`
    );
    return true;
  };

  const applyWebVersionFallback = () => {
    client.options.webVersionCache = { type: 'none' };
    delete client.options.webVersion;
  };

  const applyAuthDataPath = async (nextPath, reasonLabel) => {
    if (!nextPath || nextPath === activeAuthDataPath) {
      return false;
    }
    const isWritable = await ensureAuthDataPathWritable(nextPath, false);
    if (!isWritable) {
      console.warn(
        `[WWEBJS] Fallback auth data path is not writable for clientId=${clientId}: ${nextPath}.`
      );
      return false;
    }
    activeAuthDataPath = nextPath;
    // Update Puppeteer userDataDir instead of modifying LocalAuth dataPath
    // to avoid "LocalAuth is not compatible with a user-supplied userDataDir" error
    const sessionPath = buildSessionPath(nextPath, clientId);
    if (!client.options) {
      console.error(
        `[WWEBJS] Cannot apply fallback auth data path for clientId=${clientId} because ` +
          'client.options is undefined. This indicates an unexpected client state. Fallback aborted.'
      );
      return false;
    }
    if (!client.options.puppeteer) {
      client.options.puppeteer = {};
    }
    client.options.puppeteer.userDataDir = sessionPath;
    emitter.sessionPath = sessionPath;
    console.warn(
      `[WWEBJS] Using fallback auth data path for clientId=${clientId} (${reasonLabel}): ${nextPath} ` +
        `(userDataDir=${sessionPath}).`
    );
    return true;
  };

  const cleanupPuppeteerLocks = async (profilePath = resolvePuppeteerProfilePath()) => {
    if (!profilePath) {
      return;
    }
    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
    await Promise.all(
      lockFiles.map(async (lockFile) => {
        const lockPath = path.join(profilePath, lockFile);
        try {
          await rm(lockPath, { force: true });
        } catch (err) {
          console.warn(
            `[WWEBJS] Failed to remove puppeteer lock file for clientId=${clientId}: ${lockPath}`,
            err?.message || err
          );
        }
      })
    );
  };

  const hasPuppeteerLocks = async (profilePath) => {
    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
    const results = await Promise.all(
      lockFiles.map(async (lockFile) => {
        const lockPath = path.join(profilePath, lockFile);
        try {
          await stat(lockPath);
          return true;
        } catch (err) {
          if (err?.code === 'ENOENT') {
            return false;
          }
          return false;
        }
      })
    );
    return results.some(Boolean);
  };

  const cleanupStaleBrowserLocks = async (contextLabel) => {
    const profilePath = resolvePuppeteerProfilePath();
    if (!profilePath) {
      return false;
    }
    const activeLockStatus = await detectActiveBrowserLock(profilePath);
    if (activeLockStatus.isActive) {
      const activeLockPid = activeLockStatus.pid ?? 'unknown';
      console.warn(
        `[WWEBJS] Active browser lock detected before ${contextLabel} for clientId=${clientId} ` +
          `(reason: ${activeLockStatus.reason}, profilePath=${profilePath}, pid=${activeLockPid}); ` +
          'skipping lock cleanup.'
      );
      return false;
    }
    const hasLocks = await hasPuppeteerLocks(profilePath);
    if (!hasLocks) {
      return false;
    }
    await cleanupPuppeteerLocks(profilePath);
    console.warn(
      `[WWEBJS] Stale browser locks cleaned before ${contextLabel} for clientId=${clientId} at ${profilePath}.`
    );
    return true;
  };

  const recoverFromBrowserAlreadyRunning = async (triggerLabel, err) => {
    const strictLockRecovery = shouldUseStrictLockRecovery();
    const profilePath = resolvePuppeteerProfilePath();
    const activeLockStatus = await detectActiveBrowserLock(profilePath);
    const isActiveLock = activeLockStatus.isActive;
    const backoffMs = isActiveLock
      ? resolveActiveBrowserLockBackoffMs()
      : resolveBrowserLockBackoffMs();
    const activeReason = activeLockStatus.reason
      ? ` (active lock: ${activeLockStatus.reason})`
      : '';
    const activeLockDetails = isActiveLock
      ? ` (profilePath=${profilePath}, pid=${activeLockStatus.pid ?? 'unknown'})`
      : '';
    console.warn(
      `[WWEBJS] Detected browser lock for clientId=${clientId} (${triggerLabel})${activeReason}${activeLockDetails}. ` +
        `Waiting ${backoffMs}ms before retry to avoid hammering userDataDir.`,
      err?.message || err
    );
    const hasActivePuppeteer = Boolean(client.pupBrowser || client.pupPage);
    if (!hasActivePuppeteer) {
      console.debug(
        `[WWEBJS] Skipping destroy during browser lock recovery for clientId=${clientId} ` +
          'because Puppeteer is not initialized.'
      );
    } else {
      try {
        await client.destroy();
      } catch (destroyErr) {
        console.warn(
          `[WWEBJS] destroy failed during browser lock recovery for clientId=${clientId}:`,
          destroyErr?.message || destroyErr
        );
      }
    }

    if (isActiveLock) {
      lockActiveFailureCount += 1;
      if (strictLockRecovery) {
        console.warn(
          `[WWEBJS] Active browser lock detected for clientId=${clientId}; ` +
            'skipping lock cleanup because WA_WWEBJS_LOCK_RECOVERY_STRICT=true.'
        );
      } else {
        console.warn(
          `[WWEBJS] Active browser lock detected for clientId=${clientId}; ` +
            'skipping lock cleanup to avoid stomping on a running browser session.'
        );
      }
    } else {
      lockActiveFailureCount = 0;
      await cleanupPuppeteerLocks(profilePath);
    }

    if (backoffMs > 0) {
      await delay(backoffMs);
    }

    let fallbackApplied = false;
    if (isActiveLock && lockActiveFailureCount >= lockFallbackThreshold) {
      fallbackAttempt += 1;
      const fallbackBasePath = resolveFallbackBasePath();
      const fallbackPath = buildFallbackAuthDataPath(
        fallbackBasePath,
        clientId,
        fallbackAttempt
      );
      fallbackApplied = await applyAuthDataPath(
        fallbackPath,
        `lock active fallback attempt ${fallbackAttempt}`
      );
      if (fallbackApplied) {
        console.warn(
          `[WWEBJS] Applying unique userDataDir fallback for clientId=${clientId} ` +
            `after ${lockActiveFailureCount} lock failures.`
        );
        lockActiveFailureCount = 0;
      }
    }

    if (
      isActiveLock &&
      !strictLockRecovery &&
      lockActiveFailureCount >= lockFallbackThreshold &&
      !fallbackApplied
    ) {
      const activeLockPid = activeLockStatus.pid ?? 'unknown';
      const error = new Error(
        `[WWEBJS] Browser lock still active for clientId=${clientId} after ` +
          `${lockActiveFailureCount} attempts (profilePath=${profilePath}, pid=${activeLockPid}). ` +
          `Fallback userDataDir could not be applied. Stop the existing Chromium process or ` +
          'configure a writable fallback path before retrying.'
      );
      error.code = 'WA_WWEBJS_LOCK_ACTIVE';
      throw error;
    }

    if (isActiveLock && strictLockRecovery) {
      const error = new Error(
        `[WWEBJS] Browser lock still active for clientId=${clientId}. ` +
          'Reuse the existing session or stop the previous Chromium process before reinit.'
      );
      error.code = 'WA_WWEBJS_LOCK_ACTIVE';
      throw error;
    }
  };

  const initializeClientWithFallback = async (triggerLabel) => {
    emitter.fatalInitError = null;
    try {
      await client.initialize();
      lockActiveFailureCount = 0;
    } catch (err) {
      if (isMissingChromeError(err)) {
        let executableAccessible = false;
        if (puppeteerExecutablePath) {
          const diagnostics = await getExecutableDiagnostics(
            puppeteerExecutablePath
          );
          const accessLabel = diagnostics.accessOk
            ? 'OK'
            : diagnostics.accessErrorCode || 'UNKNOWN';
          const hints = buildExecutableRemediationHints(diagnostics);
          console.warn(
            `[WWEBJS] Missing Chrome diagnostics for clientId=${clientId} (${triggerLabel}): ` +
              `resolvedPath=${diagnostics.resolvedPath}, ` +
              `stat.mode=${formatFileMode(diagnostics.statMode)}, ` +
              `access=${accessLabel}` +
              (diagnostics.statErrorCode
                ? `, statError=${diagnostics.statErrorCode}`
                : '') +
              (hints.length ? `. Remediation: ${hints.join(' or ')}.` : '.')
          );
          executableAccessible = diagnostics.accessOk;
        } else {
          executableAccessible = await isExecutableAccessible(
            puppeteerExecutablePath
          );
        }
        if (!executableAccessible) {
          const taggedError =
            err instanceof Error ? err : new Error(err?.message || String(err));
          taggedError.isMissingChromeError = true;
          emitter.fatalInitError = {
            type: 'missing-chrome',
            error: taggedError,
          };
          console.error(
            `[WWEBJS] Chrome executable not found for clientId=${clientId} (${triggerLabel}). ` +
              'Set WA_PUPPETEER_EXECUTABLE_PATH or run "npx puppeteer browsers install chrome" ' +
              'to populate the Puppeteer cache.',
            err?.message || err
          );
          throw taggedError;
        }
        console.warn(
          `[WWEBJS] Missing Chrome error reported for clientId=${clientId} (${triggerLabel}) ` +
            `but executablePath is accessible at ${puppeteerExecutablePath}. ` +
            'Continuing initialization without marking fatalInitError.',
          err?.message || err
        );
      }
      if (isBrowserAlreadyRunningError(err)) {
        await recoverFromBrowserAlreadyRunning(triggerLabel, err);
        try {
          await client.initialize();
          return;
        } catch (retryErr) {
          console.error(
            `[WWEBJS] initialize retry failed after browser lock recovery for clientId=${clientId} (${triggerLabel}):`,
            retryErr?.message || retryErr
          );
          throw retryErr;
        }
      }
      if (shouldFallbackWebVersion(err)) {
        console.warn(
          `[WWEBJS] initialize failed for clientId=${clientId} (${triggerLabel}). ` +
            'Applying webVersionCache fallback; check WA_WEB_VERSION_CACHE_URL and/or WA_WEB_VERSION.',
          err?.message || err
        );
        applyWebVersionFallback();
        try {
          await client.initialize();
          return;
        } catch (retryErr) {
          console.error(
            `[WWEBJS] initialize retry failed for clientId=${clientId} (${triggerLabel}):`,
            retryErr?.message || retryErr
          );
          throw retryErr;
        }
      }
      if (isRuntimeCallTimeout(err)) {
        const didIncrease = maybeIncreaseProtocolTimeout(triggerLabel, err);
        if (didIncrease) {
          try {
            await client.initialize();
            return;
          } catch (retryErr) {
            console.error(
              `[WWEBJS] initialize retry failed after protocolTimeout bump for clientId=${clientId} (${triggerLabel}):`,
              retryErr?.message || retryErr
            );
            throw retryErr;
          }
        }
      }
      console.error(
        `[WWEBJS] initialize failed for clientId=${clientId} (${triggerLabel}):`,
        err?.message || err
      );
      throw err;
    }
  };

  const initializeClientWithTimeout = (triggerLabel) => {
    const timeoutMs = resolveConnectTimeoutMs();
    if (timeoutMs <= 0) {
      return initializeClientWithFallback(triggerLabel);
    }
    let timeoutId;
    return new Promise((resolve, reject) => {
      timeoutId = setTimeout(() => {
        connectInProgress = null;
        connectStartedAt = null;
        const error = new Error(
          `[WWEBJS] connect timeout after ${timeoutMs}ms for clientId=${clientId} (${triggerLabel}).`
        );
        error.code = 'WA_CONNECT_TIMEOUT';
        console.error(
          `[WWEBJS] Koneksi macet (timeout ${timeoutMs}ms) untuk clientId=${clientId} (${triggerLabel}). ` +
            'Menandai connect sebagai gagal agar reinit bisa berjalan.'
        );
        reject(error);
      }, timeoutMs);
      initializeClientWithFallback(triggerLabel)
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timeoutId));
    });
  };

  const initializeClientWithRetry = async (triggerLabel) => {
    let lastError = null;
    for (let attempt = 1; attempt <= connectRetryAttempts; attempt += 1) {
      try {
        await initializeClientWithTimeout(`${triggerLabel}:attempt-${attempt}`);
        return;
      } catch (err) {
        lastError = err;
        if (err?.isMissingChromeError) {
          throw err;
        }
        if (err?.code === 'WA_WWEBJS_LOCK_ACTIVE') {
          throw err;
        }
        if (attempt >= connectRetryAttempts) {
          break;
        }
        const backoffMs = Math.round(
          connectRetryBackoffMs * connectRetryBackoffMultiplier ** (attempt - 1)
        );
        console.warn(
          `[WWEBJS] initialize attempt ${attempt} failed for clientId=${clientId} (${triggerLabel}). ` +
            `Retrying in ${backoffMs}ms.`,
          err?.message || err
        );
        if (backoffMs > 0) {
          await delay(backoffMs);
        }
      }
    }
    throw lastError;
  };

  const startConnect = (triggerLabel) => {
    if (connectInProgress) {
      return connectInProgress;
    }
    connectStartedAt = Date.now();
    connectInProgress = (async () => {
      const sessionPath = resolveSessionPath();
      const activeLockStatus = await detectActiveBrowserLock(sessionPath);
      if (activeLockStatus.isActive && !shouldAllowSharedSession()) {
        const warningMessage = buildSharedSessionGuardMessage({
          clientId,
          sessionPath,
          activeLockStatus,
        });
        console.warn(warningMessage);
        const error = new Error(warningMessage);
        error.code = 'WA_WWEBJS_SHARED_SESSION_LOCK';
        throw error;
      }
      await cleanupStaleBrowserLocks(triggerLabel);
      await initializeClientWithRetry(triggerLabel);
    })().finally(() => {
      connectInProgress = null;
      connectStartedAt = null;
    });
    return connectInProgress;
  };

  // Store references to internal event handlers so they can be removed without affecting external listeners
  let internalMessageHandler = null;
  let internalReadyHandler = null;
  let internalAuthFailureHandler = null;
  let internalDisconnectedHandler = null;

  const getOrCreateChatIngressState = (chatId) => {
    const existingState = perChatIngressState.get(chatId);
    if (existingState) {
      return existingState;
    }
    const createdState = {
      queue: [],
      isProcessing: false,
      queueDepth: 0,
      lastProcessedMessageTimestamp: 0,
      processedMessageIds: new Map(),
    };
    perChatIngressState.set(chatId, createdState);
    return createdState;
  };

  const evictExpiredProcessedMessageIds = (chatState, nowMs) => {
    for (const [messageKey, expiryTs] of chatState.processedMessageIds.entries()) {
      if (expiryTs <= nowMs) {
        chatState.processedMessageIds.delete(messageKey);
      }
    }
  };

  const processChatQueue = async (chatId) => {
    const chatState = perChatIngressState.get(chatId);
    if (!chatState || chatState.isProcessing) {
      return;
    }

    chatState.isProcessing = true;
    while (chatState.queue.length > 0) {
      const nextJob = chatState.queue.shift();
      chatState.queueDepth = chatState.queue.length;
      if (nextJob) {
        try {
          const messageHandlers = emitter.listeners('message');
          for (const handler of messageHandlers) {
            // Execute listeners serially to preserve deterministic single-flight processing per chat
            await handler(nextJob.message);
          }
          const committedTimestampMs = Number(nextJob.messageTimestampMs) || 0;
          if (committedTimestampMs > chatState.lastProcessedMessageTimestamp) {
            chatState.lastProcessedMessageTimestamp = committedTimestampMs;
          }
        } catch (err) {
          console.error(
            `[WWEBJS] Failed processing queued ingress message for chatId=${chatId}:`,
            err?.message || err
          );
        }
      }
    }

    chatState.isProcessing = false;
    chatState.queueDepth = 0;
  };

  const enqueueIncomingChatMessage = (messageEnvelope) => {
    const chatId = messageEnvelope?.message?.from;
    if (!chatId) {
      return;
    }

    const chatState = getOrCreateChatIngressState(chatId);
    chatState.queue.push(messageEnvelope);
    chatState.queueDepth = chatState.queue.length;

    if (debugLoggingEnabled) {
      console.log(`[WWEBJS][INGRESS] queueDepth chatId=${chatId}: ${chatState.queueDepth}`);
    }

    processChatQueue(chatId).catch((err) => {
      console.error(`[WWEBJS] Queue worker crashed for chatId=${chatId}:`, err?.message || err);
      chatState.isProcessing = false;
    });
  };

  const registerEventListeners = () => {
    console.log(`[WWEBJS] Registering event listeners for clientId=${clientId}`);
    // Remove only internal listeners, preserving external ones (e.g., from waService.js)
    if (internalMessageHandler) {
      client.removeListener('message', internalMessageHandler);
    }
    if (internalReadyHandler) {
      client.removeListener('ready', internalReadyHandler);
    }
    if (internalAuthFailureHandler) {
      client.removeListener('auth_failure', internalAuthFailureHandler);
    }
    if (internalDisconnectedHandler) {
      client.removeListener('disconnected', internalDisconnectedHandler);
    }
    
    // Note: qr events are transient and safe to remove all
    client.removeAllListeners('qr');

    client.on('qr', (qr) => emitter.emit('qr', qr));
    
    internalReadyHandler = async () => {
      console.log(`[WWEBJS] Client ready event received for clientId=${clientId}`);
      try {
        // Wait for WidFactory to be available (max 3 attempts)
        await ensureWidFactory(`ready handler for clientId=${clientId}`, false, 3);
        
        // Give stores additional time to initialize, especially GroupMetadata for group chats
        // This helps prevent "GroupMetadata not available" errors when processing early messages
        // Configurable via WA_STORE_INIT_DELAY_MS (default: 2000ms, set to 0 to disable)
        const envDelayMs = parseInt(process.env.WA_STORE_INIT_DELAY_MS, 10);
        const storeInitDelayMs = Number.isNaN(envDelayMs) ? 2000 : Math.max(0, envDelayMs);
        if (storeInitDelayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, storeInitDelayMs));
        }
        
        console.log(`[WWEBJS] Client ${clientId} fully initialized and ready to receive messages`);
        if (debugLoggingEnabled) {
          console.log(`[WWEBJS] Client ${clientId} ready, stores initialized`);
        }
        
        emitter.emit('ready');
      } catch (err) {
        console.warn(
          `[WWEBJS] Ready handler initialization error for clientId=${clientId}:`,
          err?.message || err
        );
        // Emit ready anyway to maintain backward compatibility and not block client usage
        emitter.emit('ready');
      }
    };
    client.on('ready', internalReadyHandler);
    
    internalAuthFailureHandler = async (message) => {
      console.warn(`[WWEBJS] auth_failure for clientId=${clientId}:`, message);
      await reinitializeClient('auth_failure', message);
    };
    client.on('auth_failure', internalAuthFailureHandler);
    
    internalDisconnectedHandler = async (reason) => {
      const normalizedReason = String(reason || '').toUpperCase();
      if (LOGOUT_DISCONNECT_REASONS.has(normalizedReason)) {
        await reinitializeClient('disconnected', reason, {
          clearAuthSessionOverride: true,
        });
      }
      emitter.emit('disconnected', reason);
    };
    client.on('disconnected', internalDisconnectedHandler);
    
    internalMessageHandler = async (msg) => {
      // CRITICAL: This log proves whatsapp-web.js is emitting message events
      console.log(`[WWEBJS-ADAPTER] *** MESSAGE EVENT TRIGGERED *** clientId=${clientId}, from=${msg.from}`);
      if (debugLoggingEnabled) {
        console.log(`[WWEBJS-ADAPTER] Raw message details - body=${msg.body?.substring(0, 50) || '(empty)'}`);
      }
      let contactMeta = {};
      try {
        const contact = await msg.getContact();
        contactMeta = {
          contactName: contact?.name || null,
          contactPushname: contact?.pushname || null,
          isMyContact: contact?.isMyContact ?? null,
        };
      } catch (err) {
        contactMeta = { error: err?.message || 'contact_fetch_failed' };
      }
      // ALWAYS log before queueing message (critical for diagnosing reception issues)
      console.log(`[WWEBJS-ADAPTER] Queueing 'message' event - clientId=${clientId}, from=${msg.from}`);
      if (debugLoggingEnabled) {
        console.log(`[WWEBJS-ADAPTER] Message ID: ${msg.id?.id || msg.id?._serialized || 'unknown'}`);
      }

      const chatId = msg.from;
      const chatState = getOrCreateChatIngressState(chatId);
      const receivedAtMs = Date.now();
      evictExpiredProcessedMessageIds(chatState, receivedAtMs);

      const normalizedText = normalizeMessageBodyForDedupe(msg.body);
      const messageTimestampMs = toMillisTimestamp(msg.timestamp);
      const providerMessageId = String(msg.id?.id || msg.id?._serialized || '').trim();
      const dedupeMessageId = providerMessageId || buildFallbackMessageId(
        chatId,
        normalizedText,
        messageTimestampMs,
        ingressFallbackWindowMs
      );

      if (chatState.processedMessageIds.has(dedupeMessageId)) {
        ingressMetrics.duplicateDropped += 1;
        if (debugLoggingEnabled) {
          console.log(
            `[WWEBJS][INGRESS] duplicate dropped chatId=${chatId} messageId=${dedupeMessageId} total=${ingressMetrics.duplicateDropped}`
          );
        }
        return;
      }

      if (messageTimestampMs < chatState.lastProcessedMessageTimestamp) {
        ingressMetrics.lateDropped += 1;
        chatState.processedMessageIds.set(dedupeMessageId, receivedAtMs + ingressProcessedIdTtlMs);
        if (debugLoggingEnabled) {
          console.log(
            `[WWEBJS][INGRESS] late message dropped chatId=${chatId} messageTs=${messageTimestampMs} committedTs=${chatState.lastProcessedMessageTimestamp} total=${ingressMetrics.lateDropped}`
          );
        }
        return;
      }

      chatState.processedMessageIds.set(dedupeMessageId, receivedAtMs + ingressProcessedIdTtlMs);

      enqueueIncomingChatMessage({
        messageTimestampMs,
        dedupeMessageId,
        receivedAtMs,
        message: {
          from: chatId,
          body: msg.body,
          id: msg.id,
          author: msg.author,
          timestamp: msg.timestamp,
          ingressMeta: {
            dedupeMessageId,
            providerMessageId: providerMessageId || null,
            isFallbackMessageId: !providerMessageId,
            queueDepth: chatState.queueDepth,
            metrics: {
              duplicateDropped: ingressMetrics.duplicateDropped,
              lateDropped: ingressMetrics.lateDropped,
            },
            lastProcessedMessageTimestamp: chatState.lastProcessedMessageTimestamp,
          },
          ...contactMeta,
        },
      });
    };
    client.on('message', internalMessageHandler);
    console.log(`[WWEBJS] Internal message handler registered for clientId=${clientId}`);
    console.log(`[WWEBJS] Message handler function signature: ${typeof internalMessageHandler === 'function' ? 'valid' : 'INVALID'}`);
    console.log(`[WWEBJS] When messages arrive, watch for "[WWEBJS-ADAPTER] *** MESSAGE EVENT TRIGGERED ***" ` +
      `to confirm whatsapp-web.js is working. If missing, check client connection/authentication.`);
  };

  const reinitializeClient = async (trigger, reason, options = {}) => {
    if (reinitInProgress) {
      console.warn(
        `[WWEBJS] Reinit already in progress for clientId=${clientId}, skipping ${trigger}.`
      );
      return;
    }
    if (connectInProgress) {
      console.warn(
        `[WWEBJS] Reinit waiting for in-flight connect for clientId=${clientId} (${trigger}).`
      );
      try {
        await connectInProgress;
      } catch (err) {
        console.warn(
          `[WWEBJS] In-flight connect failed before reinit for clientId=${clientId}:`,
          err?.message || err
        );
      }
    }
    const shouldClearSession =
      options?.clearAuthSessionOverride ?? clearAuthSession;
    const clearSessionLabel = shouldClearSession ? ' (clear session)' : '';
    reinitInProgress = true;
    console.warn(
      `[WWEBJS] Reinitializing clientId=${clientId} after ${trigger}${
        reason ? ` (${reason})` : ''
      }${clearSessionLabel}.`
    );
    try {
      await client.destroy();
    } catch (err) {
      console.warn(
        `[WWEBJS] destroy failed for clientId=${clientId}:`,
        err?.message || err
      );
    }

    if (shouldClearSession) {
      const currentSessionPath = resolveSessionPath();
      try {
        await rm(currentSessionPath, { recursive: true, force: true });
        console.warn(
          `[WWEBJS] Cleared auth session for clientId=${clientId} at ${currentSessionPath}.`
        );
      } catch (err) {
        console.warn(
          `[WWEBJS] Failed to clear auth session for clientId=${clientId}:`,
          err?.message || err
        );
      }
    }

    try {
      registerEventListeners();
      await startConnect(`reinitialize:${trigger}`);
    } finally {
      reinitInProgress = false;
    }
  };

  registerEventListeners();
  
  // Log initial state for diagnostics
  console.log(`[WWEBJS] Client created for clientId=${clientId}, event listeners registered`);
  console.log(`[WWEBJS] To diagnose message reception, watch for:` +
    ` 1) 'Client ready event received', 2) 'fully initialized and ready to receive messages', 3) 'Message received by internal handler'`);
  
  const ensureWidFactory = async (contextLabel, requireGroupMetadata = false, retryAttempts = 1) => {
    if (!client.pupPage) {
      if (client.info?.wid) {
        return true;
      }
      console.warn(
        `[WWEBJS] ${contextLabel} skipped: WidFactory belum tersedia karena pupPage belum siap.`
      );
      return false;
    }
    
    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        const storeReadiness = await client.pupPage.evaluate((checkGroupMeta) => {
          if (!window.Store?.WidFactory) {
            return { ready: false, reason: 'WidFactory not available' };
          }
          if (!window.Store.WidFactory.toUserWidOrThrow) {
            window.Store.WidFactory.toUserWidOrThrow = (jid) =>
              window.Store.WidFactory.createWid(jid);
          }
          // Check for GroupMetadata store availability only if required (e.g., for group chat operations)
          if (checkGroupMeta) {
            if (!window.Store?.GroupMetadata) {
              return { ready: false, reason: 'GroupMetadata not available' };
            }
            if (typeof window.Store.GroupMetadata.update !== 'function') {
              return { ready: false, reason: 'GroupMetadata.update not a function' };
            }
          }
          return { ready: true, reason: 'all required stores available' };
        }, requireGroupMetadata);
        
        if (storeReadiness.ready) {
          return true;
        }
        
        // If not ready and we have more attempts, wait before retrying
        if (attempt < retryAttempts) {
          const delayMs = STORE_READINESS_RETRY_DELAY_MS * attempt;
          if (debugLoggingEnabled) {
            console.log(
              `[WWEBJS] ${contextLabel}: ${storeReadiness.reason}, retrying in ${delayMs}ms (attempt ${attempt}/${retryAttempts})`
            );
          }
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } else {
          // Only log warning on final attempt
          console.warn(
            `[WWEBJS] ${contextLabel} skipped after ${retryAttempts} attempts: ${storeReadiness.reason}`
          );
        }
      } catch (err) {
        if (debugLoggingEnabled && attempt < retryAttempts) {
          console.log(
            `[WWEBJS] ${contextLabel} check error, retrying (attempt ${attempt}/${retryAttempts}):`,
            err?.message || err
          );
        }
        if (attempt === retryAttempts) {
          console.warn(
            `[WWEBJS] ${contextLabel} WidFactory check failed:`,
            err?.message || err
          );
        }
        if (attempt < retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, STORE_READINESS_RETRY_DELAY_MS * attempt));
        }
      }
    }
    
    return false;
  };

  emitter.connect = async () => startConnect('connect');
  emitter.reinitialize = async (options = {}) => {
    const safeOptions = options && typeof options === 'object' ? options : {};
    const hasClearAuthSession =
      typeof safeOptions.clearAuthSession === 'boolean';
    const clearAuthSessionOverride = hasClearAuthSession
      ? safeOptions.clearAuthSession
      : undefined;
    const reason = safeOptions.reason || null;
    const trigger = safeOptions.trigger || 'manual';
    return reinitializeClient(trigger, reason, { clearAuthSessionOverride });
  };

  emitter.disconnect = async () => {
    await client.destroy();
  };

  emitter.getNumberId = async (phone) => {
    const widReady = await ensureWidFactory('getNumberId', false, 2);
    if (!widReady) {
      return null;
    }
    try {
      return await withRuntimeTimeoutRetry(
        () => client.getNumberId(phone),
        'getNumberId',
        protocolTimeoutEnvVarName,
        clientId
      );
    } catch (err) {
      console.warn('[WWEBJS] getNumberId failed:', err?.message || err);
      return null;
    }
  };

  emitter.getChat = async (jid) => {
    const normalizedJid = typeof jid === 'string' ? jid.trim() : '';
    if (!normalizedJid) {
      console.warn('[WWEBJS] getChat skipped: jid kosong atau tidak valid.');
      return null;
    }
    
    // Check if this is a group chat (JIDs ending with @g.us are group chats)
    const isGroupChat = normalizedJid.endsWith('@g.us');
    
    // Ensure WidFactory and GroupMetadata are ready with retries (up to 3 attempts for groups, 2 for others)
    // GroupMetadata is only required for group chats because getChatById calls GroupMetadata.update() for them
    const maxAttempts = isGroupChat ? 3 : 2;
    let widReady = await ensureWidFactory('getChat', isGroupChat, maxAttempts);
    if (!widReady) {
      return null;
    }
    
    try {
      return await withRuntimeTimeoutRetry(
        () => client.getChatById(normalizedJid),
        'getChat',
        protocolTimeoutEnvVarName,
        clientId
      );
    } catch (err) {
      console.warn('[WWEBJS] getChat failed:', err?.message || err);
      return null;
    }
  };

  emitter.sendMessage = async (jid, content, options = {}) => {
    const safeOptions = options && typeof options === 'object' ? options : {};
    const normalizedOptions = { sendSeen: false, ...safeOptions };
    const contentType = describeSendMessageContentType(content);
    let message;
    if (
      content &&
      typeof content === 'object' &&
      'document' in content
    ) {
      const media = new MessageMedia(
        content.mimetype || 'application/octet-stream',
        Buffer.from(content.document).toString('base64'),
        content.fileName
      );
      message = await client.sendMessage(jid, media, {
        ...normalizedOptions,
        sendMediaAsDocument: true,
      });
    } else {
      const text =
        typeof content === 'string' ? content : content?.text ?? '';
      message = await client.sendMessage(jid, text, normalizedOptions);
    }
    if (!message || !message.id) {
      console.warn(
        `[WWEBJS] sendMessage returned no id (jid=${jid}, contentType=${contentType}).`
      );
      const error = new Error('sendMessage returned no id');
      error.jid = jid;
      error.contentType = contentType;
      error.retryable = false;
      throw error;
    }
    return message.id._serialized || message.id.id || '';
  };

  emitter.onMessage = (handler) => emitter.on('message', handler);
  emitter.onDisconnect = (handler) => emitter.on('disconnected', handler);
  emitter.getIngressMetrics = () => {
    const queueDepthByChat = {};
    for (const [chatId, chatState] of perChatIngressState.entries()) {
      queueDepthByChat[chatId] = chatState.queueDepth;
    }
    return {
      duplicateDropped: ingressMetrics.duplicateDropped,
      lateDropped: ingressMetrics.lateDropped,
      queueDepthByChat,
      trackedChats: perChatIngressState.size,
    };
  };
  emitter.isReady = async () => client.info !== undefined;
  emitter.getConnectPromise = () => connectInProgress;
  emitter.getConnectStartedAt = () => connectStartedAt;
  emitter.getState = async () => {
    try {
      const state = await client.getState();
      if (state === null || state === undefined) {
        return 'unknown';
      }
      return state;
    } catch {
      return 'close';
    }
  };

  emitter.sendSeen = async (jid) => {
    // Check if this is a group chat (JIDs ending with @g.us are group chats)
    const isGroupChat = jid?.endsWith('@g.us') ?? false;
    
    // Ensure stores are ready before calling getChatById
    // GroupMetadata is only required for group chats, use 2 retry attempts
    const widReady = await ensureWidFactory('sendSeen', isGroupChat, 2);
    if (!widReady) {
      if (debugLoggingEnabled) {
        console.warn(`[WWEBJS] sendSeen skipped (jid=${jid}): stores not ready`);
      }
      return false;
    }
    
    let hydratedChat = null;
    try {
      hydratedChat = await withRuntimeTimeoutRetry(
        () => client.getChatById(jid),
        'sendSeen.getChatById',
        protocolTimeoutEnvVarName,
        clientId
      );
    } catch (err) {
      console.warn(
        `[WWEBJS] sendSeen hydration failed (jid=${jid}):`,
        err?.message || err
      );
    }

    const chatState = hydratedChat?._data;
    if (hydratedChat && !chatState) {
      console.warn(
        `[WWEBJS] sendSeen skipped (jid=${jid}): chat state unavailable`,
        {
          chatId: jid,
          event: 'sendSeen',
        }
      );
      return false;
    }
    const markedUnread = chatState?.markedUnread ?? false;
    if (
      hydratedChat &&
      chatState &&
      !Object.prototype.hasOwnProperty.call(chatState, 'markedUnread')
    ) {
      console.warn(
        `[WWEBJS] sendSeen fallback (jid=${jid}): markedUnread missing`,
        {
          chatId: jid,
          event: 'sendSeen',
          markedUnread,
        }
      );
    }

    if (hydratedChat && typeof hydratedChat.sendSeen !== 'function') {
      console.warn(
        `[WWEBJS] sendSeen skipped (jid=${jid}): chat.sendSeen unavailable`
      );
      return false;
    }

    try {
      if (hydratedChat && typeof hydratedChat.sendSeen === 'function') {
        return await hydratedChat.sendSeen();
      }
      return await client.sendSeen(jid);
    } catch (err) {
      const message = err?.message || err;
      if (String(message).includes('markedUnread')) {
        console.warn(
          `[WWEBJS] sendSeen markedUnread error (jid=${jid}):`,
          message
        );
        return false;
      }
      console.warn(`[WWEBJS] sendSeen failed (jid=${jid}):`, message);
      return false;
    }
  };

  emitter.getContact = async (jid) => {
    try {
      const contact = await withRuntimeTimeoutRetry(
        () => client.getContactById(jid),
        'getContact',
        protocolTimeoutEnvVarName,
        clientId
      );
      return contact;
    } catch (err) {
      console.warn('[WWEBJS] getContact failed:', err?.message || err);
      return null;
    }
  };

  emitter.clientId = clientId;
  emitter.sessionPath = resolveSessionPath();
  emitter.getSessionPath = () => resolveSessionPath();
  emitter.puppeteerExecutablePath = puppeteerExecutablePath;
  emitter.getPuppeteerExecutablePath = () => puppeteerExecutablePath;

  return emitter;
}
