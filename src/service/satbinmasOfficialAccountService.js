import * as clientModel from '../model/clientModel.js';
import * as satbinmasOfficialAccountModel from '../model/satbinmasOfficialAccountModel.js';
import * as satbinmasOfficialMediaModel from '../model/satbinmasOfficialMediaModel.js';

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseOptionalBoolean(value, fallback, defaultValue = true) {
  if (value === undefined) {
    if (fallback !== undefined) {
      return fallback;
    }
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'aktif', 'active'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'nonaktif', 'inactive'].includes(normalized)) {
      return false;
    }
  }

  throw createError('is_active must be a boolean value', 400);
}

export async function listSatbinmasOfficialAccounts(clientId) {
  const client = await clientModel.findById(clientId);
  if (!client) {
    throw createError('Client not found', 404);
  }
  return satbinmasOfficialAccountModel.findByClientId(client.client_id);
}

export async function saveSatbinmasOfficialAccount(clientId, payload = {}) {
  const client = await clientModel.findById(clientId);
  if (!client) {
    throw createError('Client not found', 404);
  }

  const {
    platform,
    username,
    is_active,
    display_name,
    profile_url,
    is_verified,
    secUid,
    secuid,
  } = payload;

  if (!platform || !platform.trim()) {
    throw createError('platform is required', 400);
  }

  if (!username || !username.trim()) {
    throw createError('username is required', 400);
  }

  const normalizedPlatform = platform.trim().toLowerCase();
  const trimmedUsername = username.trim();
  const normalizedDisplayName = display_name?.trim();
  const normalizedProfileUrl = profile_url?.trim();

  const existing = await satbinmasOfficialAccountModel.findByClientIdAndPlatform(
    client.client_id,
    normalizedPlatform
  );

  const conflictingUsername = await satbinmasOfficialAccountModel.findByPlatformAndUsername(
    normalizedPlatform,
    trimmedUsername
  );

  if (
    conflictingUsername &&
    (!existing || conflictingUsername.satbinmas_account_id !== existing.satbinmas_account_id)
  ) {
    throw createError('username already exists for this platform', 409);
  }

  const resolvedDisplayName =
    (normalizedDisplayName && normalizedDisplayName.length > 0
      ? normalizedDisplayName
      : existing?.display_name) ?? null;
  const resolvedProfileUrl =
    (normalizedProfileUrl && normalizedProfileUrl.length > 0
      ? normalizedProfileUrl
      : existing?.profile_url) ?? null;
  const providedSecUid =
    typeof secUid === 'string'
      ? secUid
      : typeof secuid === 'string'
        ? secuid
        : null;
  const normalizedSecUid = providedSecUid?.trim();
  const resolvedSecUid =
    (normalizedSecUid && normalizedSecUid.length > 0
      ? normalizedSecUid
      : existing?.secUid) ?? null;
  const normalizedIsActive = parseOptionalBoolean(is_active, existing?.is_active, true);
  const normalizedIsVerified = parseOptionalBoolean(
    is_verified,
    existing?.is_verified,
    false
  );

  try {
    const account = await satbinmasOfficialAccountModel.upsertAccount({
      client_id: client.client_id,
      platform: normalizedPlatform,
      username: trimmedUsername,
      display_name: resolvedDisplayName,
      profile_url: resolvedProfileUrl,
      secUid: resolvedSecUid,
      is_active: normalizedIsActive,
      is_verified: normalizedIsVerified,
    });

    return {
      account,
      created: !existing,
    };
  } catch (error) {
    if (error?.code === '23505') {
      throw createError('username already exists for this platform', 409);
    }
    throw error;
  }
}

export async function deleteSatbinmasOfficialAccount(clientId, accountId) {
  if (!accountId) {
    throw createError('satbinmas_account_id is required', 400);
  }

  const client = await clientModel.findById(clientId);
  if (!client) {
    throw createError('Client not found', 404);
  }

  const account = await satbinmasOfficialAccountModel.findById(accountId);
  if (!account || account.client_id.toLowerCase() !== client.client_id.toLowerCase()) {
    throw createError('Satbinmas official account not found', 404);
  }

  return satbinmasOfficialAccountModel.removeById(accountId);
}

export async function getSatbinmasOfficialAccountData(clientId) {
  const client = await clientModel.findById(clientId);
  if (!client) {
    throw createError('Client not found', 404);
  }

  const accounts = await satbinmasOfficialAccountModel.findByClientId(client.client_id);
  const media = await satbinmasOfficialMediaModel.findMediaWithRelationsByClientId(
    client.client_id
  );

  const mediaByAccount = media.reduce((acc, item) => {
    if (!item?.satbinmas_account_id) return acc;
    const bucket = acc[item.satbinmas_account_id] || [];
    bucket.push(item);
    acc[item.satbinmas_account_id] = bucket;
    return acc;
  }, {});

  const accountsWithMedia = accounts.map((account) => ({
    ...account,
    media: mediaByAccount[account.satbinmas_account_id] || [],
  }));

  return {
    client: {
      client_id: client.client_id,
      nama: client.nama,
    },
    accounts: accountsWithMedia,
  };
}

export async function getSatbinmasOfficialAttendance() {
  const clients = await clientModel.findAllOrgClients();

  const attendance = [];
  for (const client of clients) {
    const accounts = await satbinmasOfficialAccountModel.findByClientId(
      client.client_id
    );

    const hasPlatform = (platform) =>
      accounts.some(
        (acc) =>
          acc.platform?.toLowerCase() === platform &&
          acc.username?.trim() &&
          acc.is_active !== false
      );

    attendance.push({
      client_id: client.client_id,
      nama: client.nama,
      instagram: hasPlatform('instagram'),
      tiktok: hasPlatform('tiktok'),
    });
  }

  return attendance;
}
