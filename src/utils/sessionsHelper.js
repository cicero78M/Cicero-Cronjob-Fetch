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
