import { findClientById } from './clientService.js';
import {
  getUsersByClient,
  getUsersByClientAndRole,
  getUsersByDirektorat,
} from '../model/userModel.js';

const DIREKTORAT_ROLES = ['ditbinmas', 'ditlantas', 'bidhumas', 'ditsamapta'];

export class UserDirectoryError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'UserDirectoryError';
    this.status = status;
  }
}

function normalizeClientId(value) {
  if (value == null) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}

function normalizeClientIdList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => normalizeClientId(item))
    .filter((item) => item !== null);
}

function validateScope(scope) {
  const normalizedScope = (scope || 'org').toLowerCase();
  if (!['org', 'direktorat'].includes(normalizedScope)) {
    throw new UserDirectoryError('scope tidak valid', 400);
  }
  return normalizedScope;
}

function validateDirektoratRole(scope, role) {
  const normalizedRole = (role || '').toLowerCase();
  if (!normalizedRole) {
    throw new UserDirectoryError('role wajib diisi', 400);
  }
  if (scope === 'direktorat' && !DIREKTORAT_ROLES.includes(normalizedRole)) {
    throw new UserDirectoryError('role direktorat tidak valid', 400);
  }
  return normalizedRole;
}

function filterByRegionalId(users, regionalId) {
  if (!regionalId) return users;
  const normalizedRegional = String(regionalId).trim().toUpperCase();
  return users.filter(
    (user) =>
      user?.regional_id &&
      String(user.regional_id).trim().toUpperCase() === normalizedRegional
  );
}

function selectClientIdForOperator(requestedClientId, tokenClientIds) {
  const normalizedTokenIds = tokenClientIds.map((id) => id.toLowerCase());

  if (requestedClientId) {
    const normalizedRequested = requestedClientId.toLowerCase();
    const matchedIndex = normalizedTokenIds.indexOf(normalizedRequested);
    if (matchedIndex === -1) {
      throw new UserDirectoryError('client_id tidak diizinkan', 403);
    }
    return tokenClientIds[matchedIndex];
  }

  if (tokenClientIds.length === 1) {
    return tokenClientIds[0];
  }

  throw new UserDirectoryError('client_id wajib diisi', 400);
}

function buildDirektoratClientFilter(tokenClientId, loweredRequestedId) {
  if (!tokenClientId) return null;
  return tokenClientId.toLowerCase() !== loweredRequestedId ? tokenClientId : null;
}

export async function getUserDirectoryUsers({
  requesterRole,
  tokenClientId,
  tokenClientIds = [],
  clientId,
  role,
  scope,
  regionalId,
}) {
  const normalizedScope = validateScope(scope);
  const normalizedRole = validateDirektoratRole(normalizedScope, role);
  const normalizedRequesterRole = (requesterRole || '').toLowerCase();
  const normalizedTokenClientIds = normalizeClientIdList(tokenClientIds);
  const normalizedTokenClientId =
    normalizeClientId(tokenClientId) ||
    (normalizedTokenClientIds.length === 1 ? normalizedTokenClientIds[0] : null);
  const normalizedClientId = normalizeClientId(clientId);

  let resolvedClientId = normalizedClientId;
  let users;

  if (normalizedRequesterRole === 'operator') {
    if (normalizedTokenClientIds.length === 0 && !normalizedTokenClientId) {
      throw new UserDirectoryError('client_id tidak diizinkan', 403);
    }
    resolvedClientId = selectClientIdForOperator(
      normalizedClientId,
      normalizedTokenClientIds.length > 0 ? normalizedTokenClientIds : [normalizedTokenClientId]
    );
    if (normalizedScope === 'direktorat') {
      users = await getUsersByDirektorat(normalizedRole, resolvedClientId);
    } else {
      users = await getUsersByClientAndRole(resolvedClientId, normalizedRole);
    }
  } else {
    if (!resolvedClientId) {
      throw new UserDirectoryError('client_id wajib diisi', 400);
    }
    const loweredRequestedId = resolvedClientId.toLowerCase();

    if (normalizedScope === 'direktorat') {
      const filterClientId = buildDirektoratClientFilter(
        normalizedTokenClientId,
        loweredRequestedId
      );
      users = await getUsersByDirektorat(normalizedRole, filterClientId);
    } else if (normalizedScope === 'org') {
      users = await getUsersByClientAndRole(resolvedClientId, normalizedRole);
    } else if (DIREKTORAT_ROLES.includes(loweredRequestedId)) {
      const filterClientId = buildDirektoratClientFilter(
        normalizedTokenClientId,
        loweredRequestedId
      );
      users = await getUsersByDirektorat(loweredRequestedId, filterClientId);
    } else {
      const client = await findClientById(resolvedClientId);
      const clientType = client?.client_type?.toLowerCase();
      if (clientType === 'direktorat') {
        const filterClientId = buildDirektoratClientFilter(
          normalizedTokenClientId,
          loweredRequestedId
        );
        users = await getUsersByDirektorat(loweredRequestedId, filterClientId);
      } else {
        users = await getUsersByClient(resolvedClientId, normalizedRole);
      }
    }
  }

  const filteredUsers = filterByRegionalId(users, regionalId);
  return {
    users: filteredUsers,
    clientId: resolvedClientId,
    role: normalizedRole,
    scope: normalizedScope,
  };
}
