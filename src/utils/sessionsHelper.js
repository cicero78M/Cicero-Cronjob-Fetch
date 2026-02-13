// utils/sessionsHelper.js

// =======================
// KONSTANTA & GLOBAL SESSIONS
// =======================

const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 menit
const USER_MENU_TIMEOUT = 5 * 60 * 1000; // 5 menit
const MENU_WARNING = 1 * 60 * 1000; // 1 menit sebelum berakhir
const MENU_TIMEOUT = 2 * 60 * 1000; // 2 menit
const BIND_TIMEOUT = 2 * 60 * 1000; // 2 menit
const NO_REPLY_TIMEOUT = 90 * 1000; // 90 detik
const USER_REQUEST_LINK_TIMEOUT = 2 * 60 * 1000; // 2 menit

export const userMenuContext = {};         // { chatId: {step, ...} }
export const updateUsernameSession = {};   // { chatId: {step, ...} }
export const userRequestLinkSessions = {}; // { chatId: { ... } }
export const knownUserSet = new Set();     // Set of WA number or chatId (untuk first time/fallback)
export const waBindSessions = {};          // { chatId: {step, ...} }
export const operatorOptionSessions = {};  // { chatId: {timeout} }
export const adminOptionSessions = {};     // { chatId: {timeout} }
const clientRequestSessions = {};          // { chatId: {step, data, ...} }

/**
 * Ambil versi sesi saat ini untuk chat tertentu.
 * Nilai default = 0.
 * @param {string} chatId
 * @returns {number}
 */
export function getSessionVersion(chatId) {
  const session = clientRequestSessions[chatId];
  const version = Number(session?.sessionVersion);
  return Number.isFinite(version) && version >= 0 ? version : 0;
}

/**
 * Inisialisasi sessionVersion jika belum ada di session.
 * @param {string} chatId
 */
export function ensureSessionVersion(chatId) {
  if (!clientRequestSessions[chatId]) {
    clientRequestSessions[chatId] = { time: Date.now(), sessionVersion: 0 };
    return;
  }
  if (!Number.isFinite(Number(clientRequestSessions[chatId].sessionVersion))) {
    clientRequestSessions[chatId].sessionVersion = 0;
  }
}

/**
 * Pindah state session dan increment sessionVersion hanya bila state berubah.
 * @param {string} chatId
 * @param {string} nextState
 * @returns {{previousState: string|undefined, state: string, sessionVersion: number}}
 */
export function transitionSessionState(chatId, nextState) {
  ensureSessionVersion(chatId);
  const session = clientRequestSessions[chatId];
  const previousState = session.step;
  if (previousState !== nextState) {
    session.sessionVersion = getSessionVersion(chatId) + 1;
  }
  session.step = nextState;
  session.time = Date.now();
  return {
    previousState,
    state: session.step,
    sessionVersion: getSessionVersion(chatId),
  };
}

/**
 * Snapshot versi saat validator async dimulai.
 * @param {string} chatId
 * @returns {number}
 */
export function captureSessionVersionSnapshot(chatId) {
  ensureSessionVersion(chatId);
  return getSessionVersion(chatId);
}

/**
 * Cek apakah balasan async masih relevan (tidak stale).
 * @param {string} chatId
 * @param {number} versionAtStart
 * @returns {{shouldSend: boolean, currentVersion: number, droppedAsStale: boolean}}
 */
export function canSendAsyncSessionReply(chatId, versionAtStart) {
  const currentVersion = getSessionVersion(chatId);
  const shouldSend = Number(versionAtStart) === currentVersion;
  return {
    shouldSend,
    currentVersion,
    droppedAsStale: !shouldSend,
  };
}

/**
 * Log terstruktur untuk validator async (IG/TikTok/dll) agar mudah ditelusuri.
 * @param {{chatId: string, messageId: string|number|null, state: string, versionAtStart: number, currentVersion: number, droppedAsStale: boolean}} payload
 */
export function logAsyncValidatorSession(payload) {
  const entry = {
    chatId: payload?.chatId || null,
    messageId: payload?.messageId ?? null,
    state: payload?.state || null,
    versionAtStart: Number(payload?.versionAtStart ?? 0),
    currentVersion: Number(payload?.currentVersion ?? 0),
    droppedAsStale: Boolean(payload?.droppedAsStale),
  };
  console.log('[WA_ASYNC_VALIDATOR]', JSON.stringify(entry));
}

// =======================
// UTILITY UNTUK MENU USER (INTERAKTIF)
// =======================

/**
 * Set timeout auto-expire pada userMenuContext (menu interaktif user).
 * Sekaligus mengatur timeout balasan jika diperlukan.
 * @param {string} chatId
 * @param {object} waClient - client untuk mengirim pesan WA
 * @param {boolean} [expectReply=false] - apakah menunggu balasan user
 */
export function setMenuTimeout(chatId, waClient, expectReply = false) {
  if (!userMenuContext[chatId]) {
    userMenuContext[chatId] = {};
  }
  const ctx = userMenuContext[chatId];
  if (ctx.timeout) {
    clearTimeout(ctx.timeout);
  }
  if (ctx.warningTimeout) {
    clearTimeout(ctx.warningTimeout);
  }
  if (ctx.noReplyTimeout) {
    clearTimeout(ctx.noReplyTimeout);
  }
  ctx.timeout = setTimeout(() => {
    delete userMenuContext[chatId];
  }, USER_MENU_TIMEOUT);
  ctx.warningTimeout = setTimeout(() => {
    if (waClient) {
      waClient
        .sendMessage(
          chatId,
          "⏰ Sesi akan berakhir dalam 1 menit. Balas sesuai pilihan Anda untuk melanjutkan."
        )
        .catch((e) => console.error(e));
    }
  }, USER_MENU_TIMEOUT - MENU_WARNING);
  if (expectReply) {
    ctx.noReplyTimeout = setTimeout(() => {
      if (waClient) {
        waClient
          .sendMessage(
            chatId,
            "🤖 Kami masih menunggu balasan Anda. Silakan jawab jika sudah siap agar sesi dapat berlanjut."
          )
          .catch((e) => console.error(e));
      }
    }, NO_REPLY_TIMEOUT);
  }
}

// Timeout untuk proses binding WhatsApp
export function setBindTimeout(chatId) {
  if (waBindSessions[chatId]?.timeout) {
    clearTimeout(waBindSessions[chatId].timeout);
  }
  waBindSessions[chatId].timeout = setTimeout(() => {
    delete waBindSessions[chatId];
  }, BIND_TIMEOUT);
}

// Timeout untuk pilihan operator/menu user
export function setOperatorOptionTimeout(chatId) {
  if (operatorOptionSessions[chatId]?.timeout) {
    clearTimeout(operatorOptionSessions[chatId].timeout);
  }
  operatorOptionSessions[chatId].timeout = setTimeout(() => {
    delete operatorOptionSessions[chatId];
  }, MENU_TIMEOUT);
}

// Timeout untuk pilihan admin
export function setAdminOptionTimeout(chatId) {
  if (adminOptionSessions[chatId]?.timeout) {
    clearTimeout(adminOptionSessions[chatId].timeout);
  }
  adminOptionSessions[chatId].timeout = setTimeout(() => {
    delete adminOptionSessions[chatId];
  }, MENU_TIMEOUT);
}

export function setUserRequestLinkTimeout(chatId) {
  const session = userRequestLinkSessions[chatId];
  if (!session) {
    return;
  }
  if (session.timeout) {
    clearTimeout(session.timeout);
  }
  session.timeout = setTimeout(() => {
    delete userRequestLinkSessions[chatId];
  }, USER_REQUEST_LINK_TIMEOUT);
}

// =======================
// UTILITY UNTUK SESSION CLIENTREQUEST
// =======================

/**
 * Set session untuk clientrequest.
 * @param {string} chatId 
 * @param {object} data 
 */
export function setSession(chatId, data) {
  clientRequestSessions[chatId] = { ...data, time: Date.now() };
}

/**
 * Get session untuk clientrequest. Otomatis auto-expire setelah timeout.
 * @param {string} chatId 
 * @returns {object|null}
 */
export function getSession(chatId) {
  const s = clientRequestSessions[chatId];
  if (!s) return null;
  if (Date.now() - s.time > SESSION_TIMEOUT) {
    delete clientRequestSessions[chatId];
    return null;
  }
  return s;
}

/**
 * Hapus session clientrequest untuk chatId.
 * @param {string} chatId 
 */
export function clearSession(chatId) {
  delete clientRequestSessions[chatId];
}

// =======================
// END OF FILE
// =======================
