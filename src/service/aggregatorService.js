import {
  findAllActiveDirektoratWithSosmed,
  findById,
  findByRegionalId,
} from "../model/clientModel.js";
import * as instaProfileService from "./instaProfileService.js";
import * as instaPostService from "./instaPostService.js";
import * as tiktokPostService from "./tiktokPostService.js";
import * as instaPostModel from "../model/instaPostModel.js";
import * as tiktokPostModel from "../model/tiktokPostModel.js";
import { fetchInstagramProfile } from "./instagramApi.js";
import { fetchAndStoreInstaContent } from "../handler/fetchpost/instaFetchPost.js";
import { fetchAndStoreTiktokContent } from "../handler/fetchpost/tiktokFetchPost.js";
import { fetchTiktokProfile } from "./tiktokRapidService.js";
import { sendConsoleDebug } from "../middleware/debugHandler.js";

function normalizeRegionalId(value) {
  const normalized = String(value || "").trim();
  return normalized ? normalized.toUpperCase() : null;
}

function normalizeClientId(value) {
  const normalized = String(value || "").trim();
  return normalized ? normalized.toUpperCase() : null;
}

function resolveRegionalScope({ userScope, regionalId }) {
  const directRegionalId = normalizeRegionalId(regionalId);
  if (directRegionalId) return directRegionalId;
  const scopeText = String(userScope || "").trim().toUpperCase();
  if (!scopeText) return null;
  if (scopeText === "JATIM") return "JATIM";
  if (scopeText === "POLDA JATIM" || scopeText === "POLDA_JATIM") return "JATIM";
  if (scopeText.includes("POLDA JATIM")) return "JATIM";
  return null;
}

async function buildRegionalClientScope(scopedRegionalId) {
  if (!scopedRegionalId) return null;
  const regionalClients = await findByRegionalId(scopedRegionalId);
  const regionalClientIds = new Set(
    regionalClients
      .map((client) => normalizeClientId(client.client_id))
      .filter(Boolean)
  );
  return {
    regionalClientIds,
    scopedRegionalId,
  };
}

function isRegionalClientAllowed(client, regionalScope) {
  if (!regionalScope) return true;
  if (!client) return false;
  const clientRegionalId = normalizeRegionalId(client.regional_id);
  if (clientRegionalId !== regionalScope.scopedRegionalId) return false;
  if (client.parent_client_id) {
    const parentId = normalizeClientId(client.parent_client_id);
    if (!regionalScope.regionalClientIds.has(parentId)) return false;
  }
  return true;
}

export async function resolveAggregatorClient(clientId, userRole, options = {}) {
  const regionalScope = await buildRegionalClientScope(
    resolveRegionalScope(options)
  );
  const normalizedClientId = String(clientId || "").trim().toUpperCase();
  const normalizedUserRole = String(userRole || "").trim().toUpperCase();

  if (normalizedClientId === "DITSAMAPTA" && normalizedUserRole === "BIDHUMAS") {
    const bidhumasOrg = await findById("BIDHUMAS");
    if (bidhumasOrg?.client_type?.toLowerCase() === "org") {
      return {
        client: bidhumasOrg,
        resolvedClientId: bidhumasOrg.client_id,
        requestedClientId: normalizedClientId,
        reason: "bidhumas-org-override",
      };
    }
  }

  const requestedClientId = normalizedClientId || clientId;
  const requestedClient = await findById(requestedClientId);
  if (!requestedClient) return null;
  if (!isRegionalClientAllowed(requestedClient, regionalScope)) return null;

  const clientType = requestedClient.client_type?.toLowerCase();
  if (clientType === "direktorat") {
    const directorateRole = userRole?.toLowerCase();
    const roleClient = directorateRole ? await findById(directorateRole) : null;
    const defaultClient =
      roleClient?.client_type?.toLowerCase() === "direktorat"
        ? roleClient
        : requestedClient;
    if (!isRegionalClientAllowed(defaultClient, regionalScope)) return null;
    return {
      client: defaultClient,
      resolvedClientId: defaultClient.client_id,
      requestedClientId: requestedClient.client_id,
      reason:
        defaultClient === requestedClient
          ? "direktorat-requested"
          : "direktorat-role-default",
    };
  }

  if (clientType === "org") {
    const directorateRole = userRole?.toLowerCase();
    if (directorateRole) {
      const directorateClient = await findById(directorateRole);
      if (directorateClient?.client_type?.toLowerCase() === "direktorat") {
        if (!isRegionalClientAllowed(directorateClient, regionalScope)) return null;
        return {
          client: directorateClient,
          resolvedClientId: directorateClient.client_id,
          requestedClientId: requestedClient.client_id,
          reason: "org-role-mapped",
        };
      }
    }
  }

  return {
    client: requestedClient,
    resolvedClientId: requestedClient.client_id,
    requestedClientId: requestedClient.client_id,
    reason: "requested",
  };
}

export async function buildAggregatorPayload(client, resolvedClientId, periode, limit) {
  let igProfile = null;
  let igPosts = [];
  if (client.client_insta) {
    igProfile = await instaProfileService.findByUsername(client.client_insta);
    igPosts =
      periode === "harian"
        ? await instaPostModel.getPostsTodayByClient(resolvedClientId)
        : await instaPostService.findByClientId(resolvedClientId);
    if (Array.isArray(igPosts)) igPosts = igPosts.slice(0, limit);
  }

  let tiktokProfile = null;
  let tiktokPosts = [];
  if (client.client_tiktok) {
    try {
      tiktokProfile = await fetchTiktokProfile(client.client_tiktok);
    } catch (err) {
      sendConsoleDebug({
        tag: "AGG",
        msg: `fetchTiktokProfile error: ${err.message}`,
      });
    }
    tiktokPosts =
      periode === "harian"
        ? await tiktokPostModel.getPostsTodayByClient(resolvedClientId)
        : await tiktokPostService.findByClientId(resolvedClientId);
    if (Array.isArray(tiktokPosts)) tiktokPosts = tiktokPosts.slice(0, limit);
  }

  return { igProfile, igPosts, tiktokProfile, tiktokPosts };
}

function mapInstagramProfile(profilePayload, fallbackUsername) {
  if (!profilePayload) return null;
  const username = profilePayload.username || fallbackUsername;
  return {
    username,
    full_name: profilePayload.full_name,
    biography: profilePayload.biography,
    follower_count: profilePayload.followers_count ?? profilePayload.follower_count,
    following_count: profilePayload.following_count,
    post_count: profilePayload.media_count ?? profilePayload.posts_count,
    profile_pic_url: profilePayload.profile_pic_url,
  };
}

async function refreshInstagramProfile(client) {
  if (!client.client_insta) return null;
  try {
    const profile = await fetchInstagramProfile(client.client_insta);
    const mappedProfile = mapInstagramProfile(profile, client.client_insta);
    if (mappedProfile) {
      await instaProfileService.upsertProfile(mappedProfile);
    }
    return mappedProfile;
  } catch (err) {
    sendConsoleDebug({
      tag: "AGG",
      msg: `refreshInstagramProfile error [${client.client_id}]: ${err.message}`,
    });
    return null;
  }
}

async function refreshInstagramPosts(clientId) {
  try {
    await fetchAndStoreInstaContent(null, null, null, clientId);
    sendConsoleDebug({
      tag: "AGG",
      msg: `Refreshed Instagram posts for ${clientId}`,
    });
  } catch (err) {
    sendConsoleDebug({
      tag: "AGG",
      msg: `refreshInstagramPosts error [${clientId}]: ${err.message}`,
    });
  }
}

async function refreshTiktokPosts(clientId) {
  try {
    await fetchAndStoreTiktokContent(clientId);
    sendConsoleDebug({ tag: "AGG", msg: `Refreshed TikTok posts for ${clientId}` });
  } catch (err) {
    sendConsoleDebug({
      tag: "AGG",
      msg: `refreshTiktokPosts error [${clientId}]: ${err.message}`,
    });
  }
}

export async function refreshAggregatorData({
  clientId,
  periode = "harian",
  limit = 10,
  userRole,
  userScope,
  regionalId,
  skipPostRefresh = false,
} = {}) {
  const activeClients = await findAllActiveDirektoratWithSosmed();
  if (!activeClients.length) return [];

  const regionalScope = await buildRegionalClientScope(
    resolveRegionalScope({ userScope, regionalId })
  );
  const scopedActiveClients = regionalScope
    ? activeClients.filter((client) => isRegionalClientAllowed(client, regionalScope))
    : activeClients;

  const allowedClientIds = new Set(
    scopedActiveClients.map((c) => String(c.client_id || "").trim().toUpperCase())
  );

  let targetClientIds = Array.from(allowedClientIds);
  if (clientId) {
    const resolution = await resolveAggregatorClient(clientId, userRole, {
      userScope,
      regionalId,
    });
    if (!resolution) {
      throw new Error("client not found");
    }
    const resolvedId = String(resolution.resolvedClientId || "").trim().toUpperCase();
    if (!allowedClientIds.has(resolvedId)) {
      throw new Error("Client tidak memenuhi kriteria direktorat aktif dengan sosmed");
    }
    targetClientIds = [resolvedId];
  }

  const results = [];
  for (const target of targetClientIds) {
    const client = await findById(target);
    if (!client) {
      sendConsoleDebug({ tag: "AGG", msg: `Skip refresh, client ${target} not found` });
      continue;
    }

    const igProfile = await refreshInstagramProfile(client);
    if (!skipPostRefresh) {
      if (client.client_insta_status) {
        await refreshInstagramPosts(client.client_id);
      }

      if (client.client_tiktok_status) {
        await refreshTiktokPosts(client.client_id);
      }
    }

    let tiktokProfile = null;
    if (client.client_tiktok) {
      try {
        tiktokProfile = await fetchTiktokProfile(client.client_tiktok);
      } catch (err) {
        sendConsoleDebug({
          tag: "AGG",
          msg: `refreshAggregatorData TikTok profile error [${client.client_id}]: ${err.message}`,
        });
      }
    }

    const payload = await buildAggregatorPayload(client, client.client_id, periode, limit);
    const mergedPayload = {
      ...payload,
      igProfile: payload.igProfile || igProfile,
      tiktokProfile: tiktokProfile || payload.tiktokProfile,
    };

    sendConsoleDebug({
      tag: "AGG",
      msg: `Aggregator refresh completed for ${client.client_id}`,
    });

    results.push({ client_id: client.client_id, ...mergedPayload });
  }

  return results;
}
