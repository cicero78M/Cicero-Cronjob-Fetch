import * as clientModel from '../model/clientModel.js';
import * as satbinmasOfficialAccountModel from '../model/satbinmasOfficialAccountModel.js';
import * as satbinmasOfficialMediaModel from '../model/satbinmasOfficialMediaModel.js';
import { fetchInstagramPosts } from './instaRapidService.js';

const RAPIDAPI_FETCH_DELAY_MS = 1500;

function wait(ms = RAPIDAPI_FETCH_DELAY_MS) {
  if (!ms || ms < 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeTimestamp(value) {
  if (!value && value !== 0) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const ms = value > 1e12 ? value : value * 1000;
    const parsed = new Date(ms);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function resolveTakenAt(post) {
  const candidates = [
    post?.taken_at,
    post?.taken_at_timestamp,
    post?.taken_at_ms,
    post?.created_at,
    post?.created_time,
    post?.device_timestamp,
    post?.timestamp,
  ];
  for (const candidate of candidates) {
    const date = normalizeTimestamp(candidate);
    if (date) return date;
  }
  return null;
}

function toInteger(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.trunc(numeric);
}

function parseCaptionText(post) {
  const caption = post?.caption;
  if (caption && typeof caption === 'object' && typeof caption.text === 'string') {
    return caption.text.trim();
  }
  if (typeof post?.caption_text === 'string') return post.caption_text.trim();
  if (typeof post?.captionText === 'string') return post.captionText.trim();
  if (typeof caption === 'string') return caption.trim();
  return null;
}

function extractHashtags(captionText) {
  if (!captionText) return [];
  const matches = captionText.match(/#([\p{L}\p{N}._-]+)/gu) || [];
  return matches.map((tag) => tag.replace(/^#/, '')).filter(Boolean);
}

function extractMentions(captionText) {
  if (!captionText) return [];
  const matches = captionText.match(/@([A-Za-z0-9._]+)/gu) || [];
  return matches.map((mention) => mention.replace(/^@/, '')).filter(Boolean);
}

function extractMediaUrls(post) {
  const primaryImage =
    post?.thumbnail_url ||
    post?.thumbnail_src ||
    post?.display_url ||
    post?.image_versions2?.candidates?.[0]?.url ||
    (Array.isArray(post?.carousel_media)
      ? post.carousel_media[0]?.image_versions2?.candidates?.[0]?.url
      : null);
  const mediaUrl =
    primaryImage ||
    (Array.isArray(post?.carousel_media)
      ? post.carousel_media[0]?.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url
      : null);
  const videoUrl =
    post?.video_url ||
    post?.video_versions?.[0]?.url ||
    (Array.isArray(post?.carousel_media)
      ? post.carousel_media[0]?.video_versions?.[0]?.url
      : null);
  return {
    thumbnail_url: primaryImage || null,
    media_url: mediaUrl || primaryImage || null,
    video_url: videoUrl || null,
  };
}

function extractDimensions(post) {
  const width = post?.original_width || post?.dimensions?.width || post?.width;
  const height = post?.original_height || post?.dimensions?.height || post?.height;
  const duration = post?.video_duration || post?.duration || post?.duration_seconds;
  const durationNumber = Number(duration);
  return {
    width: toInteger(width),
    height: toInteger(height),
    duration_seconds: Number.isFinite(durationNumber) ? durationNumber : null,
  };
}

function normalizeInstagramMedia(account, post, takenAt, fetchDate) {
  if (!account?.satbinmas_account_id) {
    throw createError('satbinmas_account_id is required', 400);
  }
  if (!takenAt) return null;

  const igCreatedAt = normalizeTimestamp(post?.created_at) || normalizeTimestamp(post?.created_time);
  const captionText = parseCaptionText(post);
  const { thumbnail_url, media_url, video_url } = extractMediaUrls(post);
  const { width, height, duration_seconds } = extractDimensions(post);
  const hashtags = extractHashtags(captionText);
  const mentions = extractMentions(captionText);
  const mediaId = post?.media_id || post?.id || (post?.pk ? String(post.pk) : null);

  if (!mediaId) return null;

  return {
    satbinmas_account_id: account.satbinmas_account_id,
    client_id: account.client_id,
    username: account.username,
    media_id: mediaId,
    code: post?.code || post?.shortcode || null,
    media_type: post?.media_type || null,
    product_type: post?.product_type || null,
    taken_at: takenAt,
    ig_created_at: igCreatedAt,
    caption_text: captionText,
    like_count: toInteger(post?.like_count ?? post?.likeCount ?? post?.likes),
    comment_count: toInteger(post?.comment_count ?? post?.commentCount),
    view_count: toInteger(post?.view_count ?? post?.viewCount),
    play_count: toInteger(post?.play_count ?? post?.playCount),
    save_count: toInteger(post?.save_count ?? post?.saveCount),
    share_count: toInteger(post?.share_count ?? post?.shareCount),
    thumbnail_url,
    media_url,
    video_url,
    width,
    height,
    duration_seconds,
    fetched_for_date: fetchDate,
    is_album: Array.isArray(post?.carousel_media) || post?.media_type === 'CAROUSEL_ALBUM',
    is_video: Boolean(video_url || post?.media_type === 'VIDEO' || post?.product_type === 'igtv'),
    hashtags,
    mentions,
  };
}

function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

async function fetchMediaForClient(client, usernameFilter = null, delayMs = RAPIDAPI_FETCH_DELAY_MS) {
  const accounts = await satbinmasOfficialAccountModel.findByClientAndPlatform(
    client.client_id,
    'instagram'
  );

  const normalizedUsername = usernameFilter?.trim().toLowerCase() || null;
  const scopedAccounts = normalizedUsername
    ? accounts.filter((acc) => acc.username?.toLowerCase() === normalizedUsername)
    : accounts;

  const { start, end } = getTodayRange();
  const summary = {
    clientId: client.client_id,
    name: client.nama || null,
    accounts: [],
    totals: { fetched: 0, inserted: 0, updated: 0, removed: 0 },
    errors: [],
  };

  if (!scopedAccounts.length) {
    return summary;
  }

  for (let index = 0; index < scopedAccounts.length; index += 1) {
    const account = scopedAccounts[index];
    try {
      const posts = await fetchInstagramPosts(account.username, 50);
      const postsWithDate = posts
        .map((post) => ({ post, takenAt: resolveTakenAt(post) }))
        .filter((item) => item.takenAt && item.takenAt >= start && item.takenAt < end);

      let inserted = 0;
      let updated = 0;
      let removed = 0;
      let likeCount = 0;
      let commentCount = 0;
      const identifiers = [];

      for (const item of postsWithDate) {
        const normalized = normalizeInstagramMedia(account, item.post, item.takenAt, start);
        if (!normalized) continue;

        identifiers.push({ media_id: normalized.media_id, code: normalized.code });

        const { media, inserted: isInserted } = await satbinmasOfficialMediaModel.upsertMedia(
          normalized
        );

        if (media?.satbinmas_media_id) {
          await satbinmasOfficialMediaModel.replaceHashtagsForMedia(
            media.satbinmas_media_id,
            normalized.hashtags
          );
          await satbinmasOfficialMediaModel.replaceMentionsForMedia(
            media.satbinmas_media_id,
            normalized.mentions
          );
        }

        if (isInserted) {
          inserted += 1;
        } else {
          updated += 1;
        }

        likeCount += Number.isFinite(normalized.like_count) ? normalized.like_count : 0;
        commentCount += Number.isFinite(normalized.comment_count)
          ? normalized.comment_count
          : 0;
      }

      if (account?.satbinmas_account_id) {
        const deletionResult = await satbinmasOfficialMediaModel.deleteMissingMediaForDate(
          account.satbinmas_account_id,
          start,
          identifiers
        );
        removed = deletionResult.deleted;
      }

      summary.accounts.push({
        username: account.username,
        total: postsWithDate.length,
        inserted,
        updated,
        removed,
        likes: likeCount,
        comments: commentCount,
      });
      summary.totals.fetched += postsWithDate.length;
      summary.totals.inserted += inserted;
      summary.totals.updated += updated;
      summary.totals.removed += removed;
    } catch (error) {
      summary.errors.push({
        username: account.username,
        message: error?.message || 'Unknown error',
      });
    }

    const isLastAccount = index === scopedAccounts.length - 1;
    if (!isLastAccount) {
      await wait(delayMs);
    }
  }

  return summary;
}

export async function fetchTodaySatbinmasOfficialMedia(clientId, usernameFilter = null) {
  const client = await clientModel.findById(clientId);
  if (!client) {
    throw createError('Client not found', 404);
  }

  return fetchMediaForClient(client, usernameFilter);
}

export async function fetchTodaySatbinmasOfficialMediaForOrgClients(
  delayMs = RAPIDAPI_FETCH_DELAY_MS
) {
  const clients = await clientModel.findAllOrgClients();
  const results = [];

  const totals = {
    clients: 0,
    accounts: 0,
    fetched: 0,
    inserted: 0,
    updated: 0,
    removed: 0,
    errors: 0,
  };

  for (let index = 0; index < clients.length; index += 1) {
    const client = clients[index];
    const summary = await fetchMediaForClient(client, null, delayMs);

    results.push(summary);
    totals.clients += 1;
    totals.accounts += summary.accounts.length;
    totals.fetched += summary.totals.fetched;
    totals.inserted += summary.totals.inserted;
    totals.updated += summary.totals.updated;
    totals.removed += summary.totals.removed;
    totals.errors += summary.errors.length;

    const isLastClient = index === clients.length - 1;
    if (!isLastClient) {
      await wait(delayMs);
    }
  }

  return { clients: results, totals };
}

export async function fetchSatbinmasOfficialMediaFromDb({ start, end } = {}) {
  const { start: defaultStart, end: defaultEnd } = getTodayRange();
  const rangeStart = start || defaultStart;
  const rangeEnd = end || defaultEnd;

  const clients = await clientModel.findAllOrgClients();
  const summary = {
    clients: [],
    totals: { clients: clients.length, accounts: 0, fetched: 0 },
  };

  for (const client of clients) {
    const accounts = await satbinmasOfficialAccountModel.findActiveByClientAndPlatform(
      client.client_id,
      "instagram"
    );
    const clientSummary = { clientId: client.client_id, name: client.nama, accounts: [], errors: [] };

    if (accounts.length) {
      const statsMap = await satbinmasOfficialMediaModel.summarizeMediaCountsByAccounts(
        accounts.map((acc) => acc.satbinmas_account_id),
        rangeStart,
        rangeEnd
      );

      accounts.forEach((account) => {
        const stats = statsMap.get(account.satbinmas_account_id) || { total: 0, likes: 0, comments: 0 };

        summary.totals.accounts += 1;
        summary.totals.fetched += stats.total;

        clientSummary.accounts.push({
          username: account.username,
          total: stats.total,
          inserted: 0,
          updated: 0,
          removed: 0,
          likes: stats.likes,
          comments: stats.comments,
        });
      });
    }

    summary.clients.push(clientSummary);
  }

  return summary;
}
