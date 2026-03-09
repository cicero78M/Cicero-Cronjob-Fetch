import axios from 'axios';
import { fetchTiktokSecUid } from './clientService.js';
import { env } from '../config/env.js';

const COMMENT_PAGE_MAX_RETRIES = 3;
const COMMENT_PAGE_BASE_DELAY_MS = 500;
const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ECONNABORTED',
  'ENOTFOUND'
]);
const RAPIDAPI_HOST = 'tiktok-api23.p.rapidapi.com';
const RAPIDAPI_KEY = env.RAPIDAPI_KEY;
const RAPIDAPI_FALLBACK_KEY = env.RAPIDAPI_FALLBACK_KEY;
const RAPIDAPI_FALLBACK_HOST = env.RAPIDAPI_FALLBACK_HOST;
const TIKTOK_WEB_BASE_URL = 'https://www.tiktok.com';
const TIKTOK_WEB_COMMENT_REPLY_ENDPOINT = '/api/comment/list/reply/';
const TIKTOK_WEB_DEFAULT_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  Referer: `${TIKTOK_WEB_BASE_URL}/`,
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
};

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableError(err) {
  if (!err) return false;
  if (!err.response) return true;
  if (err.response?.status >= 500) return true;
  if (err.code && RETRYABLE_ERROR_CODES.has(err.code)) return true;
  return false;
}

function normalizePostItem(item) {
  if (!item || typeof item !== 'object') return null;
  const normalizedStats =
    item.stats && typeof item.stats === 'object' ? { ...item.stats } : {};

  if (normalizedStats.diggCount === undefined) {
    normalizedStats.diggCount =
      item.digg_count ?? item.like_count ?? normalizedStats.likeCount ?? 0;
  }
  if (normalizedStats.commentCount === undefined) {
    normalizedStats.commentCount =
      item.comment_count ?? normalizedStats.comments ?? 0;
  }

  return {
    ...item,
    id: item.id ?? item.video_id ?? item.aweme_id,
    video_id: item.video_id ?? item.id ?? item.aweme_id,
    createTime:
      item.createTime ??
      item.create_time ??
      item.timestamp ??
      item.create_at ??
      null,
    desc: item.desc ?? item.caption ?? item.title ?? '',
    stats: normalizedStats
  };
}

function parsePosts(resData) {
  let dataObj = resData?.data?.data || resData?.data?.result || resData?.data;
  if (typeof dataObj === 'string') {
    try {
      dataObj = JSON.parse(dataObj);
    } catch (e) {
      dataObj = {};
    }
  }

  const candidateLists = [
    dataObj?.itemList,
    dataObj?.items,
    resData?.data?.result?.videos,
    dataObj?.videos
  ].find(Array.isArray);

  if (!candidateLists || !Array.isArray(candidateLists)) return [];
  return candidateLists.map(normalizePostItem).filter(Boolean);
}

function parsePostDetail(resData) {
  let payload = resData?.data ?? resData;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch (err) {
      payload = {};
    }
  }

  if (payload?.itemInfo?.itemStruct) return payload.itemInfo.itemStruct;
  if (payload?.data?.itemInfo?.itemStruct) return payload.data.itemInfo.itemStruct;
  if (payload?.itemStruct) return payload.itemStruct;
  if (payload?.itemInfo?.item) return payload.itemInfo.item;
  return null;
}

async function requestRapidApiPosts({ host, key, endpoint, params }) {
  const res = await axios.get(`https://${host}/${endpoint}`, {
    params,
    headers: {
      'X-RapidAPI-Key': key,
      'X-RapidAPI-Host': host,
      'x-cache-control': 'no-cache'
    }
  });
  return parsePosts(res);
}

function buildFallbackFetcher(params, limit) {
  if (!RAPIDAPI_FALLBACK_KEY || !RAPIDAPI_FALLBACK_HOST) return null;
  const fallbackParams = {
    ...params,
    count: String(limit > 0 ? limit : 10)
  };

  return () =>
    requestRapidApiPosts({
      host: RAPIDAPI_FALLBACK_HOST,
      key: RAPIDAPI_FALLBACK_KEY,
      endpoint: 'user/videos',
      params: fallbackParams
    });
}

async function fetchPostsWithFallback(primaryFetcher, fallbackFetcher, limit) {
  let primaryError = null;
  let primaryItems = [];

  try {
    primaryItems = await primaryFetcher();
  } catch (err) {
    primaryError = err;
  }

  if (primaryItems?.length) {
    return limit ? primaryItems.slice(0, limit) : primaryItems;
  }

  if (typeof fallbackFetcher === 'function') {
    const fallbackItems = await fallbackFetcher();
    if (fallbackItems?.length) {
      return limit ? fallbackItems.slice(0, limit) : fallbackItems;
    }
  }

  if (primaryError) throw primaryError;
  return limit ? primaryItems.slice(0, limit) : primaryItems;
}

export async function fetchTiktokProfile(username) {
  if (!username) return null;
  try {
    const res = await axios.get(`https://${RAPIDAPI_HOST}/api/user/info`, {
      params: { uniqueId: username.replace(/^@/, '') },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
        'x-cache-control': 'no-cache'
      }
    });
    const data = res.data?.userInfo;
    if (!data) return res.data;
    return {
      username: data.user?.uniqueId,
      secUid: data.user?.secUid,
      nickname: data.user?.nickname,
      follower_count: data.stats?.followerCount,
      following_count: data.stats?.followingCount,
      like_count: data.stats?.heart,
      video_count: data.stats?.videoCount,
      avatar_url: data.user?.avatarThumb,
      verified: Boolean(data.user?.verified)
    };
  } catch (err) {
    const msg = err.response?.data
      ? JSON.stringify(err.response.data)
      : err.message;
    const error = new Error(msg);
    error.statusCode = err.response?.status;
    throw error;
  }
}

export async function fetchTiktokInfo(username) {
  if (!username) return null;
  try {
    const res = await axios.get(`https://${RAPIDAPI_HOST}/api/user/info`, {
      params: { uniqueId: username.replace(/^@/, '') },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
        'x-cache-control': 'no-cache'
      }
    });
    return res.data || null;
  } catch (err) {
    const msg = err.response?.data
      ? JSON.stringify(err.response.data)
      : err.message;
    const error = new Error(msg);
    error.statusCode = err.response?.status;
    throw error;
  }
}

export async function fetchTiktokPosts(username, limit = 10) {
  if (!username) return [];
  const normalizedUsername = username.replace(/^@/, '');
  const params = {
    uniqueId: normalizedUsername,
    username: normalizedUsername,
    cursor: '0'
  };

  try {
    return await fetchPostsWithFallback(
      () =>
        requestRapidApiPosts({
          host: RAPIDAPI_HOST,
          key: RAPIDAPI_KEY,
          endpoint: 'api/user/posts',
          params: {
            ...params,
            count: String(limit > 0 ? limit : 10)
          }
        }),
      buildFallbackFetcher(params, limit),
      limit
    );
  } catch (err) {
    const msg = err.response?.data || err.message;
    if (typeof msg === 'object' && /missing required params/i.test(msg.error || '')) {
      try {
        const secUid = await fetchTiktokSecUid(username);
        if (secUid) {
          return await fetchTiktokPostsBySecUid(secUid, limit);
        }
      } catch {}
    }
    const error = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    error.statusCode = err.response?.status;
    throw error;
  }
}

export async function fetchTiktokPostsBySecUid(secUid, limit = 10) {
  if (!secUid) return [];
  const params = {
    secUid,
    cursor: '0'
  };

  try {
    return await fetchPostsWithFallback(
      () =>
        requestRapidApiPosts({
          host: RAPIDAPI_HOST,
          key: RAPIDAPI_KEY,
          endpoint: 'api/user/posts',
          params: {
            ...params,
            count: String(limit > 0 ? limit : 10)
          }
        }),
      buildFallbackFetcher(params, limit),
      limit
    );
  } catch (err) {
    const msg = err.response?.data
      ? JSON.stringify(err.response.data)
      : err.message;
    const error = new Error(msg);
    error.statusCode = err.response?.status;
    throw error;
  }
}

export async function fetchTiktokCommentsPage(videoId, cursor = 0, count = 50) {
  if (!videoId) return { comments: [], next_cursor: null, total: null };

  for (let attempt = 1; attempt <= COMMENT_PAGE_MAX_RETRIES; attempt++) {
    try {
      const res = await axios.get(`https://${RAPIDAPI_HOST}/api/post/comments`, {
        params: { videoId, count: String(count), cursor: String(cursor) },
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': RAPIDAPI_HOST,
          'x-cache-control': 'no-cache'
        }
      });
      let comments = [];
      let total = null;
      const data = res.data;
      if (Array.isArray(data?.data?.comments)) {
        comments = data.data.comments;
        if (typeof data.data.total === 'number') total = data.data.total;
      } else if (Array.isArray(data?.comments)) {
        comments = data.comments;
        if (typeof data.total === 'number') total = data.total;
      }
      const next_cursor = cursor + count;
      const has_more = comments.length > 0 && (total === null || next_cursor <= total);
      return { comments, next_cursor: has_more ? next_cursor : null, total };
    } catch (err) {
      const shouldRetry = attempt < COMMENT_PAGE_MAX_RETRIES && isRetryableError(err);
      if (shouldRetry) {
        const waitMs = COMMENT_PAGE_BASE_DELAY_MS * 2 ** (attempt - 1);
        await delay(waitMs);
        continue;
      }
      const msg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      const error = new Error(msg);
      error.statusCode = err.response?.status;
      throw error;
    }
  }
}

function parseCommentListPayload(payload) {
  const comments =
    payload?.comments ||
    payload?.data?.comments ||
    payload?.comment_list ||
    payload?.data?.comment_list ||
    [];
  const safeComments = Array.isArray(comments) ? comments : [];
  const hasMoreRaw =
    payload?.has_more ?? payload?.data?.has_more ?? payload?.hasMore ?? payload?.data?.hasMore;
  const hasMore = hasMoreRaw === true || Number(hasMoreRaw) === 1;
  const nextCursorRaw =
    payload?.cursor ?? payload?.data?.cursor ?? payload?.next_cursor ?? payload?.data?.next_cursor;
  const nextCursor = Number.isFinite(Number(nextCursorRaw)) ? Number(nextCursorRaw) : null;
  return {
    comments: safeComments,
    hasMore,
    nextCursor,
  };
}

async function fetchTiktokCommentRepliesPageWeb(videoId, commentId, cursor = 0, count = 50) {
  const res = await axios.get(`${TIKTOK_WEB_BASE_URL}${TIKTOK_WEB_COMMENT_REPLY_ENDPOINT}`, {
    params: {
      item_id: videoId,
      comment_id: commentId,
      cursor: String(cursor),
      count: String(count),
    },
    headers: TIKTOK_WEB_DEFAULT_HEADERS,
  });
  const parsed = parseCommentListPayload(res?.data || {});
  const nextCursor = parsed.hasMore
    ? parsed.nextCursor ?? cursor + count
    : null;
  return {
    comments: parsed.comments,
    next_cursor: nextCursor,
  };
}

async function fetchAllTiktokCommentRepliesWeb(videoId, commentId, count = 50) {
  if (!videoId || !commentId) return [];
  const allReplies = [];
  let cursor = 0;

  while (true) {
    const { comments, next_cursor } = await fetchTiktokCommentRepliesPageWeb(
      videoId,
      commentId,
      cursor,
      count
    );
    if (!comments.length) break;
    allReplies.push(...comments);
    if (!next_cursor) break;
    cursor = next_cursor;
    await delay(300);
  }

  return allReplies;
}

export async function fetchTiktokPostDetail(videoId) {
  if (!videoId) {
    throw new Error('Parameter videoId wajib diisi.');
  }

  try {
    const res = await axios.get(`https://${RAPIDAPI_HOST}/api/post/detail`, {
      params: { videoId },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
        'x-cache-control': 'no-cache'
      }
    });

    const itemStruct = parsePostDetail(res.data);
    if (!itemStruct) {
      throw new Error('Response detail TikTok tidak memiliki itemStruct.');
    }

    return itemStruct;
  } catch (err) {
    const msg = err.response?.data
      ? JSON.stringify(err.response.data)
      : err.message;
    const error = new Error(msg);
    error.statusCode = err.response?.status;
    throw error;
  }
}

export async function fetchAllTiktokComments(videoId) {
  const all = [];
  let cursor = 0;
  let total = null;
  while (true) {
    const { comments, next_cursor, total: tot } = await fetchTiktokCommentsPage(videoId, cursor);
    if (tot !== null) total = tot;
    if (!comments.length) break;
    all.push(...comments);
    if (!next_cursor) break;
    cursor = next_cursor;
    await new Promise(r => setTimeout(r, 2000));
  }

  for (const comment of all) {
    const commentId = comment?.cid || comment?.comment_id || comment?.id;
    const existingReplies = Array.isArray(comment?.reply_comment) ? comment.reply_comment : [];
    const totalReplies = Number(comment?.reply_comment_total ?? comment?.reply_comment_count ?? 0) || 0;

    if (!commentId || totalReplies <= existingReplies.length) {
      continue;
    }

    try {
      const fetchedReplies = await fetchAllTiktokCommentRepliesWeb(videoId, commentId);
      const mergedReplies = [...existingReplies, ...fetchedReplies];
      comment.reply_comment = mergedReplies;
    } catch (err) {
      const message = err?.response?.data
        ? JSON.stringify(err.response.data)
        : err?.message || String(err);
      console.warn(
        `[TikTok] Gagal mengambil reply comment untuk video ${videoId}, comment ${commentId}: ${message}`
      );
    }
  }

  return all;
}
