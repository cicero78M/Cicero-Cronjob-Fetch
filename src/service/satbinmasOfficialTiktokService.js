import {
  findAllOrgClients,
  findById as findClientById,
} from "../model/clientModel.js";
import {
  findByClientIdAndPlatform,
  findByPlatformAndUsername,
  upsertAccount,
  findByClientAndPlatform,
} from "../model/satbinmasOfficialAccountModel.js";
import {
  fetchTiktokPosts,
  fetchTiktokPostsBySecUid,
  fetchTiktokProfile,
} from "./tiktokRapidService.js";
import {
  upsertTiktokAccountSnapshot,
  upsertTiktokPostsSnapshot,
} from "../model/tiktokSnapshotModel.js";

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

const RAPIDAPI_FETCH_DELAY_MS = 1500;
const wait = (ms = RAPIDAPI_FETCH_DELAY_MS) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function normalizeTimestamp(value) {
  if (!value && value !== 0) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const ms = value > 1e12 ? value : value * 1000;
    const parsed = new Date(ms);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function resolveCreatedAt(post) {
  const candidates = [
    post?.createTime,
    post?.create_time,
    post?.create_time_unix,
    post?.create_time_ms,
    post?.createTimeISO,
    post?.createTimeMillis,
  ];
  for (const candidate of candidates) {
    const parsed = normalizeTimestamp(candidate);
    if (parsed) return parsed;
  }
  return null;
}

function normalizeClientId(value) {
  return String(value || "").trim();
}

function normalizeUsername(username) {
  return username?.replace(/^@/, "").trim();
}

export async function resolveSatbinmasOfficialTiktokSecUid({ clientId, username }) {
  const normalizedClientId = normalizeClientId(clientId);
  const normalizedUsername = normalizeUsername(username);

  if (!normalizedClientId) {
    throw createError("Client ID wajib diisi.", 400);
  }

  if (!normalizedUsername) {
    throw createError("Username TikTok wajib diisi.", 400);
  }

  const client = await findClientById(normalizedClientId);
  if (!client) {
    throw createError("Client tidak ditemukan.", 404);
  }

  if ((client.client_type || "").toUpperCase() !== "ORG") {
    throw createError("Resolusi secUid hanya berlaku untuk client bertipe ORG.", 400);
  }

  const existingAccount = await findByClientIdAndPlatform(client.client_id, "tiktok");

  const conflictingUsername = await findByPlatformAndUsername(
    "tiktok",
    normalizedUsername,
  );

  const isSameAccount =
    conflictingUsername &&
    conflictingUsername.client_id?.toLowerCase() === client.client_id.toLowerCase();

  if (conflictingUsername && !isSameAccount) {
    throw createError(
      "Username TikTok sudah terdaftar sebagai Satbinmas Official untuk client lain.",
      409,
    );
  }

  const profile = await fetchTiktokProfile(normalizedUsername);
  const resolvedSecUid = profile?.secUid;

  if (!resolvedSecUid) {
    throw createError("secUid TikTok tidak ditemukan dari RapidAPI.", 502);
  }

  const savedAccount = await upsertAccount({
    client_id: client.client_id,
    platform: "tiktok",
    username: normalizedUsername,
    display_name: profile?.nickname || existingAccount?.display_name,
    profile_url: profile?.avatar_url || existingAccount?.profile_url,
    secUid: resolvedSecUid,
    is_active: existingAccount?.is_active ?? true,
    is_verified: profile?.verified ?? existingAccount?.is_verified ?? false,
  });

  return {
    client,
    account: savedAccount,
    secUid: resolvedSecUid,
    username: normalizedUsername,
    profile,
  };
}

export async function syncSatbinmasOfficialTiktokSecUidForOrgClients(
  delayMs = RAPIDAPI_FETCH_DELAY_MS
) {
  const clients = await findAllOrgClients();
  const summary = {
    clients: [],
    totals: {
      clients: 0,
      accounts: 0,
      resolved: 0,
      failed: 0,
      missing: 0,
    },
  };

  for (let clientIndex = 0; clientIndex < clients.length; clientIndex += 1) {
    const client = clients[clientIndex];
    const accounts = await findByClientAndPlatform(client.client_id, "tiktok");

    const clientSummary = {
      clientId: client.client_id,
      name: client.nama,
      accounts: [],
      errors: [],
      missingAccounts: accounts.length === 0,
    };

    summary.totals.clients += 1;

    if (clientSummary.missingAccounts) {
      summary.totals.missing += 1;
      summary.clients.push(clientSummary);
      const isLastClient = clientIndex === clients.length - 1;
      if (!isLastClient) await wait(delayMs);
      continue;
    }

    for (let index = 0; index < accounts.length; index += 1) {
      const account = accounts[index];
      summary.totals.accounts += 1;

      if (!account.username?.trim()) {
        clientSummary.errors.push({
          username: account.username || "(kosong)",
          message: "Username TikTok kosong di tabel satbinmas_official_accounts.",
        });
        summary.totals.failed += 1;
      } else {
        try {
          const result = await resolveSatbinmasOfficialTiktokSecUid({
            clientId: client.client_id,
            username: account.username,
          });
          clientSummary.accounts.push({
            username: result.username,
            secUid: result.secUid,
          });
          summary.totals.resolved += 1;
        } catch (error) {
          clientSummary.errors.push({
            username: account.username,
            message: error?.message?.slice(0, 200) || "Gagal sinkron secUid.",
          });
          summary.totals.failed += 1;
        }
      }

      const isLastAccount = index === accounts.length - 1;
      if (!isLastAccount) await wait(delayMs);
    }

    summary.clients.push(clientSummary);

    const isLastClient = clientIndex === clients.length - 1;
    if (!isLastClient) await wait(delayMs);
  }

  return summary;
}

function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function normalizeCaption(post) {
  if (typeof post?.desc === "string") return post.desc.trim();
  if (typeof post?.caption === "string") return post.caption.trim();
  return "";
}

function extractHashtags(post) {
  const tags = [];

  (post?.challenges || []).forEach((challenge) => {
    if (challenge?.title) tags.push(challenge.title);
    if (challenge?.name) tags.push(challenge.name);
  });

  (post?.textExtra || []).forEach((item) => {
    if (item?.hashtagName) tags.push(item.hashtagName);
  });

  const normalized = tags
    .map((tag) => (typeof tag === "string" ? tag.replace(/^#/, "").trim() : ""))
    .filter(Boolean);

  const unique = new Set();
  return normalized.filter((tag) => {
    const key = tag.toLowerCase();
    if (unique.has(key)) return false;
    unique.add(key);
    return true;
  });
}

function pickAuthorFromPosts(posts = []) {
  for (const post of posts) {
    if (post?.author) return post.author;
  }
  return null;
}

function pickPlayUrl(video = {}) {
  if (typeof video?.playAddr === "string") return video.playAddr;
  if (Array.isArray(video?.playAddr) && video.playAddr.length) return video.playAddr[0];
  if (typeof video?.downloadAddr === "string") return video.downloadAddr;
  if (Array.isArray(video?.downloadAddr) && video.downloadAddr.length)
    return video.downloadAddr[0];
  return null;
}

function pickCoverUrl(video = {}) {
  const candidates = [video.dynamicCover, video.originCover, video.cover];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    if (Array.isArray(candidate) && candidate.length) return candidate[0];
  }
  return null;
}

function normalizeLanguage(post) {
  const candidates = [post?.language, post?.lang, post?.video?.language];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function normalizeAccountSnapshot({ accountRow, profile, author, snapshotAt }) {
  const resolvedSecUid = [accountRow?.secUid, accountRow?.secuid, profile?.secUid, author?.secUid]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find((value) => value);

  return {
    author_secuid: resolvedSecUid,
    author_id: author?.id || author?.userId || author?.authorId || null,
    username: normalizeUsername(author?.uniqueId || profile?.username || accountRow?.username),
    display_name: author?.nickname || profile?.nickname || accountRow?.display_name,
    bio: author?.signature || null,
    avatar_url: author?.avatarThumb || profile?.avatar_url || accountRow?.profile_url,
    is_verified: author?.verified ?? profile?.verified ?? accountRow?.is_verified ?? false,
    is_private: author?.privateAccount ?? author?.secret ?? false,
    followers: author?.followerCount ?? profile?.follower_count ?? null,
    following: author?.followingCount ?? profile?.following_count ?? null,
    likes_total: author?.heart ?? author?.heartCount ?? profile?.like_count ?? null,
    video_count: author?.videoCount ?? profile?.video_count ?? null,
    snapshot_at: snapshotAt,
  };
}

function normalizeTiktokPostSnapshot(post, authorSecUid, crawlAt) {
  const video = post?.video || {};
  const stats = post?.stats || {};

  return {
    post_id: post?.id || post?.video_id,
    author_secuid: authorSecUid,
    caption: normalizeCaption(post),
    created_at: resolveCreatedAt(post),
    language: normalizeLanguage(post),
    play_url: pickPlayUrl(video),
    cover_url: pickCoverUrl(video),
    duration_sec: video?.duration,
    height: video?.height,
    width: video?.width,
    ratio: video?.ratio,
    views: stats?.playCount,
    likes: stats?.diggCount,
    comments: stats?.commentCount,
    shares: stats?.shareCount,
    bookmarks: stats?.collectCount,
    is_ad: Boolean(post?.isAd || post?.isAds),
    is_private_post: Boolean(post?.privateItem || post?.privateItemStruct),
    share_enabled: post?.shareEnabled ?? true,
    duet_enabled: post?.duetEnabled ?? true,
    stitch_enabled: post?.stitchEnabled ?? true,
    hashtags: extractHashtags(post),
    crawl_at: crawlAt,
  };
}

function summarizePostCounts(posts = []) {
  const summary = { likes: 0, comments: 0 };
  posts.forEach((post) => {
    const likeCount = Number(post?.digg_count ?? post?.stats?.diggCount);
    const commentCount = Number(post?.comment_count ?? post?.stats?.commentCount);
    if (Number.isFinite(likeCount)) summary.likes += likeCount;
    if (Number.isFinite(commentCount)) summary.comments += commentCount;
  });
  return summary;
}

export async function fetchTodaySatbinmasOfficialTiktokMediaForOrgClients(
  delayMs = RAPIDAPI_FETCH_DELAY_MS
) {
  const clients = await findAllOrgClients();
  const { start, end } = getTodayRange();

  const summary = {
    clients: [],
    totals: { clients: clients.length, accounts: 0, fetched: 0, inserted: 0, updated: 0, removed: 0 },
  };

  for (let clientIndex = 0; clientIndex < clients.length; clientIndex += 1) {
    const client = clients[clientIndex];
    const accounts = await findByClientAndPlatform(client.client_id, "tiktok");
    const clientSummary = {
      clientId: client.client_id,
      name: client.nama,
      accounts: [],
      errors: [],
    };

    if (!accounts.length) {
      summary.clients.push(clientSummary);
      const isLastClient = clientIndex === clients.length - 1;
      if (!isLastClient) await wait(delayMs);
      continue;
    }

    for (let accountIndex = 0; accountIndex < accounts.length; accountIndex += 1) {
      const account = accounts[accountIndex];
      summary.totals.accounts += 1;

      try {
        const profile = await fetchTiktokProfile(account.username);
        const secUid = account.secUid || account.secuid || profile?.secUid;
        const posts = secUid
          ? await fetchTiktokPostsBySecUid(secUid, 50)
          : await fetchTiktokPosts(account.username, 50);

        const todaysPosts = (posts || []).filter((post) => {
          const createdAt = resolveCreatedAt(post);
          return createdAt && createdAt >= start && createdAt < end;
        });

        const author = pickAuthorFromPosts(todaysPosts) || pickAuthorFromPosts(posts);
        const crawlAt = new Date();
        const accountSnapshot = normalizeAccountSnapshot({
          accountRow: account,
          profile,
          author,
          snapshotAt: crawlAt,
        });

        if (!accountSnapshot.author_secuid) {
          throw createError("secUid TikTok tidak ditemukan untuk akun Satbinmas.", 502);
        }

        await upsertTiktokAccountSnapshot(accountSnapshot);

        let postSummary = { inserted: 0, updated: 0, total: todaysPosts.length };
        if (todaysPosts.length) {
          const normalizedPosts = todaysPosts.map((post) =>
            normalizeTiktokPostSnapshot(post, accountSnapshot.author_secuid, crawlAt)
          );

          postSummary = await upsertTiktokPostsSnapshot(normalizedPosts, crawlAt);
        }

        const counts = summarizePostCounts(todaysPosts);

        summary.totals.fetched += todaysPosts.length;
        summary.totals.inserted += postSummary.inserted;
        summary.totals.updated += postSummary.updated;

        clientSummary.accounts.push({
          username: account.username,
          total: todaysPosts.length,
          inserted: postSummary.inserted,
          updated: postSummary.updated,
          removed: 0,
          likes: counts.likes,
          comments: counts.comments,
        });
      } catch (error) {
        clientSummary.errors.push({
          username: account.username,
          message: error?.message?.slice(0, 200) || "Gagal mengambil konten TikTok.",
        });
      }

      const isLastAccount = accountIndex === accounts.length - 1;
      if (!isLastAccount) await wait(delayMs);
    }

    summary.clients.push(clientSummary);

    const isLastClient = clientIndex === clients.length - 1;
    if (!isLastClient) await wait(delayMs);
  }

  return summary;
}
