import { withTransaction } from '../repository/db.js';
import * as dashboardPremiumRequestModel from '../model/dashboardPremiumRequestModel.js';
import * as dashboardUserModel from '../model/dashboardUserModel.js';
import * as dashboardSubscriptionModel from '../model/dashboardSubscriptionModel.js';
import { createSubscriptionWithClient } from './dashboardSubscriptionService.js';
import {
  findLatestOpenByDashboardUserId,
  findLatestOpenByUsername,
} from '../model/dashboardPremiumRequestModel.js';

const REQUEST_TTL_HOURS = 24;
const CONFIRMED_TTL_HOURS = 48;
const DEFAULT_SUBSCRIPTION_DURATION_DAYS = 30;

function isUuid(value) {
  if (typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function addHours(baseDate, hours) {
  const date = baseDate ? new Date(baseDate) : new Date();
  date.setHours(date.getHours() + hours);
  return date;
}

function addDays(baseDate, days) {
  const date = baseDate ? new Date(baseDate) : new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function createServiceError(message, statusCode = 400, code = null) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  return err;
}

function resolveExpiry(payload, fallbackHours) {
  if (payload?.expiredAt || payload?.expired_at) return payload.expiredAt || payload.expired_at;
  if (payload?.expires_at) return payload.expires_at;
  if (payload?.expiresAt) return payload.expiresAt;
  return addHours(new Date(), fallbackHours);
}

function isWhatsappApproval(adminContext = {}) {
  return Boolean(
    adminContext.admin_whatsapp ||
      adminContext.adminWhatsapp ||
      adminContext.channel === 'whatsapp',
  );
}

function resolveSubscriptionExpiry(adminContext, request) {
  if (isWhatsappApproval(adminContext)) {
    return addDays(new Date(), DEFAULT_SUBSCRIPTION_DURATION_DAYS);
  }

  const explicit =
    adminContext?.subscriptionExpiresAt ||
    adminContext?.subscription_expires_at ||
    request?.subscription_expires_at;
  if (explicit) return explicit;
  return addDays(new Date(), DEFAULT_SUBSCRIPTION_DURATION_DAYS);
}

async function resolveDashboardUserProfile(dashboardUser) {
  if (!dashboardUser?.dashboard_user_id) {
    return null;
  }
  const dbUser = await dashboardUserModel.findById(dashboardUser.dashboard_user_id);
  if (!dbUser) {
    return null;
  }
  return { ...dashboardUser, ...dbUser };
}

function buildActorLabel({ username, whatsapp, dashboard_user_id }) {
  if (username) return username;
  if (whatsapp) return whatsapp;
  return dashboard_user_id || 'unknown';
}

function buildAuditMetadata(request = {}) {
  return {
    client_id: request.client_id || null,
    premium_tier: request.premium_tier || null,
    transfer_amount: request.transfer_amount ?? null,
    proof_url: request.proof_url || null,
    subscription_expires_at: request.subscription_expires_at || null,
  };
}

function mergeRequestMetadata(request, metadataPatch = {}) {
  return { ...(request?.metadata || {}), ...metadataPatch };
}

function resolveAuthorizedClientId(dashboardUser, requestedClientId) {
  const allowedClientIds = Array.isArray(dashboardUser?.client_ids)
    ? dashboardUser.client_ids.filter(id => id != null && String(id).trim() !== '')
    : [];

  if (!allowedClientIds.length) {
    throw createServiceError('Dashboard user belum memiliki relasi client', 403, 'forbidden');
  }

  const normalizedRequested =
    requestedClientId == null || requestedClientId === '' ? null : String(requestedClientId);
  if (normalizedRequested) {
    const matchIndex = allowedClientIds.findIndex(id => String(id) === normalizedRequested);
    if (matchIndex === -1) {
      throw createServiceError('client_id tidak valid untuk pengguna ini', 403, 'forbidden');
    }
    return allowedClientIds[matchIndex];
  }

  if (allowedClientIds.length === 1) {
    return allowedClientIds[0];
  }

  throw createServiceError('client_id wajib diisi', 400, 'validation');
}

function ensureRequestOwnership(request, dashboardUserId) {
  if (request.dashboard_user_id !== dashboardUserId) {
    throw createServiceError('Request tidak ditemukan untuk pengguna ini', 404, 'forbidden');
  }
}

function assertPendingStatus(request, allowedStatuses = ['pending']) {
  if (!allowedStatuses.includes(request.status)) {
    throw createServiceError(`Request sudah memiliki status ${request.status}`, 400, 'locked');
  }
}

export async function createDashboardPremiumRequest(dashboardUser, payload = {}) {
  const resolvedDashboardUser = await resolveDashboardUserProfile(dashboardUser);
  if (!resolvedDashboardUser?.dashboard_user_id) {
    throw createServiceError('Dashboard user tidak valid', 401, 'unauthorized');
  }
  const resolvedClientId = resolveAuthorizedClientId(resolvedDashboardUser, payload.client_id);
  const requiredFields = ['bank_name', 'account_number', 'sender_name'];
  const missingField = requiredFields.find(field => !payload[field]);
  if (missingField) {
    throw createServiceError(`${missingField} wajib diisi`, 400, 'validation');
  }

  const latestOpenRequest = await findLatestOpenDashboardPremiumRequestByIdentifier(
    resolvedDashboardUser.dashboard_user_id || resolvedDashboardUser.username,
  );
  if (latestOpenRequest) {
    throw createServiceError(
      'Permintaan premium sebelumnya masih diproses. Tunggu hingga selesai sebelum mengajukan kembali.',
      409,
      'conflict',
    );
  }

  const expiredAt = resolveExpiry(
    payload,
    payload.proof_url ? CONFIRMED_TTL_HOURS : REQUEST_TTL_HOURS,
  );
  const status = payload.proof_url ? 'confirmed' : 'pending';

  return withTransaction(async client => {
    const request = await dashboardPremiumRequestModel.createRequest(
      {
        dashboard_user_id: resolvedDashboardUser.dashboard_user_id,
        client_id: resolvedClientId,
        username: resolvedDashboardUser.username,
        whatsapp: payload.whatsapp || resolvedDashboardUser.whatsapp || null,
        bank_name: payload.bank_name,
        account_number: payload.account_number,
        sender_name: payload.sender_name,
        transfer_amount: payload.transfer_amount ?? null,
        premium_tier: payload.premium_tier || null,
        proof_url: payload.proof_url || null,
        subscription_expires_at: payload.subscription_expires_at || null,
        status,
        expired_at: expiredAt,
        metadata: payload.metadata || {},
      },
      client,
    );

    await dashboardPremiumRequestModel.insertAuditEntry(
      {
        request_id: request.request_id,
        dashboard_user_id: resolvedDashboardUser.dashboard_user_id,
        action: 'created',
        actor: buildActorLabel(resolvedDashboardUser),
        status_from: null,
        status_to: request.status,
        metadata: buildAuditMetadata(request),
      },
      client,
    );

    return request;
  });
}

export async function confirmDashboardPremiumRequest(token, dashboardUser, payload = {}) {
  const resolvedDashboardUser = await resolveDashboardUserProfile(dashboardUser);
  if (!resolvedDashboardUser?.dashboard_user_id) {
    throw createServiceError('Dashboard user tidak valid', 401, 'unauthorized');
  }
  if (!payload.proof_url) {
    throw createServiceError('proof_url wajib diisi', 400, 'validation');
  }

  return withTransaction(async client => {
    const request = await dashboardPremiumRequestModel.findByToken(token, client);
    if (!request) {
      throw createServiceError('Request tidak ditemukan', 404, 'not_found');
    }
    ensureRequestOwnership(request, resolvedDashboardUser.dashboard_user_id);
    assertPendingStatus(request, ['pending', 'confirmed']);

    const expiredAt = resolveExpiry(payload, CONFIRMED_TTL_HOURS);
    const updatedRequest = await dashboardPremiumRequestModel.updateRequest(
      request.request_id,
      {
        proof_url: payload.proof_url,
        transfer_amount: payload.transfer_amount ?? request.transfer_amount ?? null,
        bank_name: payload.bank_name || request.bank_name,
        account_number: payload.account_number || request.account_number,
        sender_name: payload.sender_name || request.sender_name,
        premium_tier: payload.premium_tier || request.premium_tier,
        subscription_expires_at:
          payload.subscription_expires_at || request.subscription_expires_at || null,
        status: 'confirmed',
        expired_at: expiredAt,
        metadata: payload.metadata ? { ...(request.metadata || {}), ...payload.metadata } : request.metadata,
      },
      client,
    );

    await dashboardPremiumRequestModel.insertAuditEntry(
      {
        request_id: request.request_id,
        dashboard_user_id: resolvedDashboardUser.dashboard_user_id,
        action: 'confirmed',
        actor: buildActorLabel(resolvedDashboardUser),
        status_from: request.status,
        status_to: 'confirmed',
        metadata: buildAuditMetadata(updatedRequest),
      },
      client,
    );

    return updatedRequest;
  });
}

export async function approveDashboardPremiumRequest(token, adminContext = {}) {
  return withTransaction(async client => {
    const request = await dashboardPremiumRequestModel.findByToken(token, client);
    if (!request) {
      throw createServiceError('Request tidak ditemukan', 404, 'not_found');
    }
    assertPendingStatus(request, ['pending', 'confirmed']);

    const subscriptionExpiresAt = resolveSubscriptionExpiry(adminContext, request);
    const tier = adminContext.premium_tier || adminContext.premiumTier || request.premium_tier || 'premium';

    const subscriptionResult = await createSubscriptionWithClient(
      {
        dashboard_user_id: request.dashboard_user_id,
        tier,
        status: 'active',
        expires_at: subscriptionExpiresAt,
        metadata: {
          request_id: request.request_id,
          request_token: request.request_token,
          client_id: request.client_id,
          transfer_amount: request.transfer_amount ?? null,
        },
      },
      client,
    );

    const approvedRequest = await dashboardPremiumRequestModel.updateRequest(
      request.request_id,
      {
        status: 'approved',
        responded_at: new Date(),
        admin_whatsapp: adminContext.admin_whatsapp || adminContext.adminWhatsapp || null,
        metadata: {
          ...(request.metadata || {}),
          subscription_id: subscriptionResult.subscription.subscription_id,
        },
      },
      client,
    );

    await dashboardPremiumRequestModel.insertAuditEntry(
      {
        request_id: request.request_id,
        dashboard_user_id: request.dashboard_user_id,
        action: 'approved',
        actor: buildActorLabel({
          username: adminContext.actor,
          whatsapp: adminContext.admin_whatsapp || adminContext.adminWhatsapp,
        }),
        status_from: request.status,
        status_to: 'approved',
        admin_whatsapp: adminContext.admin_whatsapp || adminContext.adminWhatsapp || null,
        metadata: {
          ...buildAuditMetadata(approvedRequest),
          subscription_id: subscriptionResult.subscription.subscription_id,
        },
      },
      client,
    );

    return { request: approvedRequest, subscription: subscriptionResult.subscription, cache: subscriptionResult.cache };
  });
}

export async function denyDashboardPremiumRequest(token, adminContext = {}) {
  return withTransaction(async client => {
    const request = await dashboardPremiumRequestModel.findByToken(token, client);
    if (!request) {
      throw createServiceError('Request tidak ditemukan', 404, 'not_found');
    }
    assertPendingStatus(request, ['pending', 'confirmed']);

    const deniedRequest = await dashboardPremiumRequestModel.updateRequest(
      request.request_id,
      {
        status: 'denied',
        responded_at: new Date(),
        admin_whatsapp: adminContext.admin_whatsapp || adminContext.adminWhatsapp || null,
        metadata: adminContext.metadata
          ? { ...(request.metadata || {}), ...adminContext.metadata }
          : request.metadata,
      },
      client,
    );

    await dashboardPremiumRequestModel.insertAuditEntry(
      {
        request_id: request.request_id,
        dashboard_user_id: request.dashboard_user_id,
        action: 'denied',
        actor: buildActorLabel({
          username: adminContext.actor,
          whatsapp: adminContext.admin_whatsapp || adminContext.adminWhatsapp,
        }),
        status_from: request.status,
        status_to: 'denied',
        admin_whatsapp: adminContext.admin_whatsapp || adminContext.adminWhatsapp || null,
        note: adminContext.note || null,
        metadata: buildAuditMetadata(deniedRequest),
      },
      client,
    );

    return deniedRequest;
  });
}

export async function expireDashboardPremiumRequests(referenceDate = new Date()) {
  return withTransaction(async client => {
    const expirable = await dashboardPremiumRequestModel.findExpirable(referenceDate, client);
    if (!expirable.length) return [];
    const previousStatuses = new Map(
      expirable.map(row => [row.request_id, row.status || 'pending']),
    );
    const expiredRows = await dashboardPremiumRequestModel.markRequestsExpired(
      expirable.map(row => row.request_id),
      referenceDate,
      client,
    );

    for (const row of expiredRows) {
      const statusFrom = previousStatuses.get(row.request_id) || row.status;
      await dashboardPremiumRequestModel.insertAuditEntry(
        {
          request_id: row.request_id,
          dashboard_user_id: row.dashboard_user_id,
          action: 'expired',
          actor: 'system',
          status_from: statusFrom,
          status_to: 'expired',
          metadata: buildAuditMetadata(row),
        },
        client,
      );
    }

    return expiredRows;
  });
}

export async function findDashboardPremiumRequestByToken(token) {
  return dashboardPremiumRequestModel.findByToken(token);
}

export async function findDashboardPremiumRequestById(requestId) {
  return dashboardPremiumRequestModel.findById(requestId);
}

export async function findLatestOpenDashboardPremiumRequestByIdentifier(identifier) {
  if (!identifier) return null;
  const normalized = String(identifier).trim();
  if (!normalized) return null;

  if (isUuid(normalized)) {
    const byId = await findLatestOpenByDashboardUserId(normalized);
    if (byId) return byId;
  }

  return findLatestOpenByUsername(normalized);
}

export async function markDashboardPremiumRequestNotified(request, metadataPatch = {}, dbClient) {
  if (!request?.request_id) return request;
  const adminNotificationTimestamp =
    request.metadata?.admin_notification_sent_at || new Date().toISOString();
  const mergedMetadata = mergeRequestMetadata(request, {
    admin_notification_sent: true,
    admin_notification_sent_at: adminNotificationTimestamp,
    ...metadataPatch,
  });

  return dashboardPremiumRequestModel.updateRequest(
    request.request_id,
    { metadata: mergedMetadata },
    dbClient,
  );
}
