import { clientRequestHandlers, respondComplaint_message } from '../handler/menu/clientRequestHandlers.js';
import { parseComplaintMessage } from './complaintService.js';
import { normalizeUserId } from '../utils/utilsHelper.js';

function normalizeWhatsAppId(value) {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  if (/@[cs]\.us$/.test(trimmed) || trimmed.endsWith('@g.us')) {
    return trimmed;
  }
  const numeric = trimmed.replace(/\D/g, '');
  if (!numeric) return '';
  return `${numeric}@c.us`;
}

function getGatewayWhatsAppIds(extraIds = []) {
  const envGatewayIds = (process.env.GATEWAY_WHATSAPP_ADMIN || '')
    .split(',')
    .map((id) => normalizeWhatsAppId(id))
    .filter(Boolean);

  const providedIds = (extraIds || [])
    .map((id) => normalizeWhatsAppId(id))
    .filter(Boolean);

  return new Set([...envGatewayIds, ...providedIds]);
}

function isGatewayForwardText(text) {
  if (!text) return false;
  const normalized = text.trim().toLowerCase();
  return /^(wagateway|wabot)\b/.test(normalized);
}

function hasComplaintHeader(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return false;
  const headerIndex = lines.findIndex((line) =>
    /^pesan\s+komplain/i.test(line)
  );
  if (headerIndex < 0) {
    return false;
  }
  const hasKendalaSection = lines
    .slice(headerIndex + 1)
    .some((line) =>
      /^kendala\b/.test(line.toLowerCase().replace(/[:：]/g, ''))
    );
  if (!hasKendalaSection) {
    return false;
  }
  const parsed = parseComplaintMessage(text);
  const nrp = normalizeUserId(parsed?.nrp || '');
  return Boolean(nrp);
}

export function isGatewayComplaintForward({
  senderId,
  text,
  gatewayIds,
  allowImplicitGatewayForward = false,
}) {
  const normalizedSender = normalizeWhatsAppId(senderId);
  const knownGatewayIds = getGatewayWhatsAppIds(gatewayIds);

  if (normalizedSender && knownGatewayIds.has(normalizedSender)) {
    return true;
  }

  if (allowImplicitGatewayForward) {
    const isGroupMessage = (normalizedSender || '').endsWith('@g.us');
    if (!isGroupMessage) {
      return true;
    }
  }

  return isGatewayForwardText(text);
}

export function shouldHandleComplaintMessage({
  text,
  allowUserMenu,
  session,
  senderId,
  gatewayIds,
}) {
  if (allowUserMenu) return false;
  if (session?.menu === 'clientrequest') return false;
  if (isGatewayComplaintForward({ senderId, text, gatewayIds })) return false;
  return hasComplaintHeader(text);
}

export async function handleComplaintMessageIfApplicable({
  text,
  allowUserMenu,
  session,
  isAdmin,
  initialIsMyContact,
  senderId,
  gatewayIds,
  chatId,
  adminOptionSessions,
  setSession,
  getSession,
  waClient,
  pool,
  userModel,
}) {
  if (
    !shouldHandleComplaintMessage({
      text,
      allowUserMenu,
      session,
      isAdmin,
      initialIsMyContact,
      senderId,
      gatewayIds,
    })
  ) {
    return false;
  }

  const adminSession = adminOptionSessions?.[chatId];
  if (adminSession?.timeout) {
    clearTimeout(adminSession.timeout);
  }
  if (adminOptionSessions) {
    delete adminOptionSessions[chatId];
  }

  setSession(chatId, {
    menu: 'clientrequest',
    step: 'respondComplaint_message',
    respondComplaint: {},
  });
  const updatedSession = getSession(chatId);
  await respondComplaint_message(
    updatedSession,
    chatId,
    text,
    waClient,
    pool,
    userModel
  );
  return true;
}
