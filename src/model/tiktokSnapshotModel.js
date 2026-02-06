import { query } from "../repository/db.js";

function toInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1"].includes(normalized)) return true;
    if (["false", "no", "0"].includes(normalized)) return false;
  }
  return fallback;
}

function normalizeTimestamp(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const millis = value > 1e12 ? value : value * 1000;
    const parsed = new Date(millis);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : null;
}

function uniqueHashtags(hashtags = []) {
  const normalized = (hashtags || [])
    .map((tag) => (typeof tag === "string" ? tag.replace(/^#/, "").trim() : ""))
    .filter(Boolean);

  const seen = new Set();
  const result = [];
  normalized.forEach((tag) => {
    const key = tag.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(tag);
    }
  });
  return result;
}

export async function upsertTiktokAccountSnapshot({
  author_secuid,
  author_id = null,
  username,
  display_name = null,
  bio = null,
  avatar_url = null,
  is_verified = false,
  is_private = false,
  followers = null,
  following = null,
  likes_total = null,
  video_count = null,
  snapshot_at = new Date(),
}) {
  const normalizedSecUid = normalizeText(author_secuid);
  if (!normalizedSecUid) return { account: null, inserted: false };

  const normalizedUsername = normalizeText(username);
  if (!normalizedUsername) return { account: null, inserted: false };

  const res = await query(
    `INSERT INTO satbinmas_tiktok_accounts (
      author_secuid, author_id, username, display_name, bio, avatar_url,
      is_verified, is_private, followers, following, likes_total, video_count, snapshot_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11, $12, COALESCE($13, NOW())
    )
    ON CONFLICT (author_secuid) DO UPDATE SET
      author_id = EXCLUDED.author_id,
      username = EXCLUDED.username,
      display_name = EXCLUDED.display_name,
      bio = EXCLUDED.bio,
      avatar_url = EXCLUDED.avatar_url,
      is_verified = EXCLUDED.is_verified,
      is_private = EXCLUDED.is_private,
      followers = EXCLUDED.followers,
      following = EXCLUDED.following,
      likes_total = EXCLUDED.likes_total,
      video_count = EXCLUDED.video_count,
      snapshot_at = EXCLUDED.snapshot_at
    RETURNING *, (xmax = '0'::xid) AS inserted`,
    [
      normalizedSecUid,
      normalizeText(author_id),
      normalizedUsername,
      normalizeText(display_name),
      normalizeText(bio),
      normalizeText(avatar_url),
      toBoolean(is_verified, false),
      toBoolean(is_private, false),
      toInteger(followers),
      toInteger(following),
      toInteger(likes_total),
      toInteger(video_count),
      normalizeTimestamp(snapshot_at),
    ]
  );

  const account = res.rows[0] || null;
  return { account, inserted: Boolean(account?.inserted) };
}

export async function replaceHashtagsForPost(post_id, hashtags = []) {
  const normalizedPostId = normalizeText(post_id);
  if (!normalizedPostId) return;

  await query('DELETE FROM satbinmas_tiktok_post_hashtags WHERE post_id = $1', [
    normalizedPostId,
  ]);

  const unique = uniqueHashtags(hashtags);
  if (!unique.length) return;

  const values = unique.map((_, idx) => `($1, $${idx + 2})`).join(",");
  await query(
    `INSERT INTO satbinmas_tiktok_post_hashtags (post_id, hashtag)
     VALUES ${values}
     ON CONFLICT (post_id, LOWER(hashtag)) DO NOTHING`,
    [normalizedPostId, ...unique]
  );
}

export async function upsertTiktokPostSnapshot(payload = {}) {
  const normalizedPostId = normalizeText(payload.post_id || payload.id);
  const authorSecUid = normalizeText(payload.author_secuid);
  if (!normalizedPostId || !authorSecUid) {
    return { post: null, inserted: false };
  }

  const res = await query(
    `INSERT INTO satbinmas_tiktok_posts (
      post_id, author_secuid, caption, created_at, language, play_url, cover_url,
      duration_sec, height, width, ratio, views, likes, comments, shares, bookmarks,
      is_ad, is_private_post, share_enabled, duet_enabled, stitch_enabled, crawl_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11, $12, $13, $14, $15, $16,
      $17, $18, $19, $20, $21, COALESCE($22, NOW())
    )
    ON CONFLICT (post_id) DO UPDATE SET
      author_secuid = EXCLUDED.author_secuid,
      caption = EXCLUDED.caption,
      created_at = EXCLUDED.created_at,
      language = EXCLUDED.language,
      play_url = EXCLUDED.play_url,
      cover_url = EXCLUDED.cover_url,
      duration_sec = EXCLUDED.duration_sec,
      height = EXCLUDED.height,
      width = EXCLUDED.width,
      ratio = EXCLUDED.ratio,
      views = EXCLUDED.views,
      likes = EXCLUDED.likes,
      comments = EXCLUDED.comments,
      shares = EXCLUDED.shares,
      bookmarks = EXCLUDED.bookmarks,
      is_ad = EXCLUDED.is_ad,
      is_private_post = EXCLUDED.is_private_post,
      share_enabled = EXCLUDED.share_enabled,
      duet_enabled = EXCLUDED.duet_enabled,
      stitch_enabled = EXCLUDED.stitch_enabled,
      crawl_at = EXCLUDED.crawl_at
    RETURNING *, (xmax = '0'::xid) AS inserted`,
    [
      normalizedPostId,
      authorSecUid,
      normalizeText(payload.caption),
      normalizeTimestamp(payload.created_at),
      normalizeText(payload.language),
      normalizeText(payload.play_url),
      normalizeText(payload.cover_url),
      toInteger(payload.duration_sec),
      toInteger(payload.height),
      toInteger(payload.width),
      normalizeText(payload.ratio),
      toInteger(payload.views),
      toInteger(payload.likes),
      toInteger(payload.comments),
      toInteger(payload.shares),
      toInteger(payload.bookmarks),
      toBoolean(payload.is_ad, false),
      toBoolean(payload.is_private_post, false),
      toBoolean(payload.share_enabled, true),
      toBoolean(payload.duet_enabled, true),
      toBoolean(payload.stitch_enabled, true),
      normalizeTimestamp(payload.crawl_at),
    ]
  );

  const post = res.rows[0] || null;
  await replaceHashtagsForPost(normalizedPostId, payload.hashtags || []);
  return { post, inserted: Boolean(post?.inserted) };
}

export async function upsertTiktokPostsSnapshot(posts = [], defaultCrawlAt = null) {
  if (!Array.isArray(posts) || !posts.length) {
    return { inserted: 0, updated: 0, total: 0 };
  }

  const crawlTimestamp = defaultCrawlAt || new Date();
  let inserted = 0;
  let updated = 0;

  for (const post of posts) {
    const { inserted: wasInserted } = await upsertTiktokPostSnapshot({
      ...post,
      crawl_at: post.crawl_at || crawlTimestamp,
    });
    if (wasInserted) inserted += 1;
    else updated += 1;
  }

  return { inserted, updated, total: posts.length };
}

export async function summarizeSatbinmasTiktokPostsBySecuids(authorSecuids = [], startDate, endDate) {
  const normalizedSecuids = (authorSecuids || []).map((secuid) => secuid?.trim()).filter(Boolean);
  if (!normalizedSecuids.length || !startDate || !endDate) return new Map();

  const res = await query(
    `SELECT author_secuid,
            COUNT(*) AS total,
            COALESCE(SUM(likes), 0) AS likes,
            COALESCE(SUM(comments), 0) AS comments
     FROM satbinmas_tiktok_posts
     WHERE author_secuid = ANY($1)
       AND crawl_at >= $2
       AND crawl_at < $3
     GROUP BY author_secuid`,
    [normalizedSecuids, startDate, endDate]
  );

  const map = new Map();
  res.rows.forEach((row) => {
    map.set(row.author_secuid, {
      total: Number(row.total) || 0,
      likes: Number(row.likes) || 0,
      comments: Number(row.comments) || 0,
    });
  });

  return map;
}
