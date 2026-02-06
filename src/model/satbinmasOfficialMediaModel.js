import { query } from '../repository/db.js';

function normalizeNullable(value) {
  return value === undefined ? null : value;
}

export async function upsertMedia({
  satbinmas_account_id,
  client_id,
  username,
  media_id,
  code = null,
  media_type = null,
  product_type = null,
  taken_at,
  ig_created_at = null,
  caption_text = null,
  like_count = null,
  comment_count = null,
  view_count = null,
  play_count = null,
  save_count = null,
  share_count = null,
  thumbnail_url = null,
  media_url = null,
  video_url = null,
  width = null,
  height = null,
  duration_seconds = null,
  fetched_for_date = null,
  is_album = false,
  is_video = false,
}) {
  const res = await query(
    `INSERT INTO satbinmas_official_media (
      satbinmas_account_id, client_id, username, media_id, code, media_type, product_type, taken_at, ig_created_at,
      caption_text, like_count, comment_count, view_count, play_count, save_count, share_count, thumbnail_url,
      media_url, video_url, width, height, duration_seconds, fetched_for_date, is_album, is_video
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9,
      $10, $11, $12, $13, $14, $15, $16, $17,
      $18, $19, $20, $21, $22, $23, $24, $25
    )
    ON CONFLICT (client_id, username, media_id, taken_at) DO UPDATE SET
      code = EXCLUDED.code,
      media_type = EXCLUDED.media_type,
      product_type = EXCLUDED.product_type,
      ig_created_at = EXCLUDED.ig_created_at,
      caption_text = EXCLUDED.caption_text,
      like_count = EXCLUDED.like_count,
      comment_count = EXCLUDED.comment_count,
      view_count = EXCLUDED.view_count,
      play_count = EXCLUDED.play_count,
      save_count = EXCLUDED.save_count,
      share_count = EXCLUDED.share_count,
      thumbnail_url = EXCLUDED.thumbnail_url,
      media_url = EXCLUDED.media_url,
      video_url = EXCLUDED.video_url,
      width = EXCLUDED.width,
      height = EXCLUDED.height,
      duration_seconds = EXCLUDED.duration_seconds,
      fetched_for_date = EXCLUDED.fetched_for_date,
      satbinmas_account_id = EXCLUDED.satbinmas_account_id,
      is_album = EXCLUDED.is_album,
      is_video = EXCLUDED.is_video,
      updated_at = NOW()
    RETURNING satbinmas_media_id, satbinmas_account_id, client_id, username, media_id, taken_at, fetched_for_date, created_at, updated_at, (xmax = '0'::xid) AS inserted`,
    [
      satbinmas_account_id,
      client_id,
      username,
      media_id,
      normalizeNullable(code),
      normalizeNullable(media_type),
      normalizeNullable(product_type),
      taken_at,
      normalizeNullable(ig_created_at),
      normalizeNullable(caption_text),
      normalizeNullable(like_count),
      normalizeNullable(comment_count),
      normalizeNullable(view_count),
      normalizeNullable(play_count),
      normalizeNullable(save_count),
      normalizeNullable(share_count),
      normalizeNullable(thumbnail_url),
      normalizeNullable(media_url),
      normalizeNullable(video_url),
      normalizeNullable(width),
      normalizeNullable(height),
      normalizeNullable(duration_seconds),
      fetched_for_date,
      is_album,
      is_video,
    ]
  );

  const media = res.rows[0] || null;
  return { media, inserted: Boolean(media?.inserted) };
}

export async function replaceHashtagsForMedia(satbinmas_media_id, hashtags = []) {
  if (!satbinmas_media_id) return;
  const normalizedTags = Array.from(
    new Set((hashtags || []).map((tag) => tag?.trim()).filter(Boolean))
  );

  await query(
    'DELETE FROM satbinmas_official_media_hashtags WHERE satbinmas_media_id = $1',
    [satbinmas_media_id]
  );

  if (!normalizedTags.length) return;

  const values = normalizedTags
    .map((_, idx) => `($1, $${idx + 2})`)
    .join(',');

  await query(
    `INSERT INTO satbinmas_official_media_hashtags (satbinmas_media_id, tag)
     VALUES ${values}
     ON CONFLICT (satbinmas_media_id, LOWER(tag)) DO NOTHING`,
    [satbinmas_media_id, ...normalizedTags]
  );
}

export async function replaceMentionsForMedia(satbinmas_media_id, mentions = []) {
  if (!satbinmas_media_id) return;
  const normalizedMentions = Array.from(
    new Set((mentions || []).map((mention) => mention?.replace(/^@/, '').trim()).filter(Boolean))
  );

  await query(
    'DELETE FROM satbinmas_official_media_mentions WHERE satbinmas_media_id = $1',
    [satbinmas_media_id]
  );

  if (!normalizedMentions.length) return;

  const values = normalizedMentions
    .map((_, idx) => `($1, $${idx + 2})`)
    .join(',');

  await query(
    `INSERT INTO satbinmas_official_media_mentions (satbinmas_media_id, username)
     VALUES ${values}
     ON CONFLICT (satbinmas_media_id, LOWER(username)) DO NOTHING`,
    [satbinmas_media_id, ...normalizedMentions]
  );
}

export async function deleteMissingMediaForDate(
  satbinmas_account_id,
  fetchDate,
  identifiers = []
) {
  if (!satbinmas_account_id || !fetchDate) return { deleted: 0, ids: [] };

  const uniqueMediaIds = Array.from(
    new Set(
      (identifiers || [])
        .map((item) => item?.media_id)
        .filter((value) => typeof value === 'string' && value.trim())
        .map((value) => value.trim())
    )
  );

  const uniqueCodes = Array.from(
    new Set(
      (identifiers || [])
        .map((item) => item?.code)
        .filter((value) => typeof value === 'string' && value.trim())
        .map((value) => value.trim())
    )
  );

  const params = [satbinmas_account_id, fetchDate];
  const keepClauses = [];

  if (uniqueMediaIds.length) {
    params.push(uniqueMediaIds);
    keepClauses.push(`media_id = ANY($${params.length})`);
  }

  if (uniqueCodes.length) {
    params.push(uniqueCodes);
    keepClauses.push(`code IS NOT NULL AND code = ANY($${params.length})`);
  }

  const keepPredicate = keepClauses.length ? keepClauses.join(' OR ') : 'FALSE';

  const res = await query(
    `DELETE FROM satbinmas_official_media
     WHERE satbinmas_account_id = $1
       AND fetched_for_date = $2::date
       AND NOT (${keepPredicate})
     RETURNING satbinmas_media_id`,
    params
  );

  const ids = res.rows?.map((row) => row.satbinmas_media_id).filter(Boolean) || [];
  return { deleted: ids.length, ids };
}

async function findMediaWithRelations(whereClause, params = []) {
  const res = await query(
    `SELECT
       media.*, 
       COALESCE(tags.hashtags, ARRAY[]::text[]) AS hashtags,
       COALESCE(mentions.mentions, ARRAY[]::text[]) AS mentions
     FROM satbinmas_official_media media
     LEFT JOIN (
       SELECT satbinmas_media_id, ARRAY_AGG(tag ORDER BY LOWER(tag)) AS hashtags
       FROM satbinmas_official_media_hashtags
       GROUP BY satbinmas_media_id
     ) tags ON tags.satbinmas_media_id = media.satbinmas_media_id
     LEFT JOIN (
       SELECT satbinmas_media_id, ARRAY_AGG(username ORDER BY LOWER(username)) AS mentions
       FROM satbinmas_official_media_mentions
       GROUP BY satbinmas_media_id
     ) mentions ON mentions.satbinmas_media_id = media.satbinmas_media_id
     WHERE ${whereClause}
     ORDER BY media.taken_at DESC NULLS LAST, media.created_at DESC`,
    params
  );

  return res.rows;
}

export async function findMediaWithRelationsByClientId(client_id) {
  if (!client_id) return [];
  return findMediaWithRelations('LOWER(media.client_id) = LOWER($1)', [client_id]);
}

export async function findMediaWithRelationsByAccountId(satbinmas_account_id) {
  if (!satbinmas_account_id) return [];
  return findMediaWithRelations('media.satbinmas_account_id = $1', [satbinmas_account_id]);
}

export async function summarizeMediaCountsByAccounts(accountIds = [], startDate, endDate) {
  const normalizedIds = (accountIds || []).filter(Boolean);
  if (!normalizedIds.length || !startDate || !endDate) return new Map();

  const res = await query(
    `SELECT satbinmas_account_id, client_id, username,
            COUNT(*) AS total,
            COALESCE(SUM(like_count), 0) AS likes,
            COALESCE(SUM(comment_count), 0) AS comments
     FROM satbinmas_official_media
     WHERE satbinmas_account_id = ANY($1)
       AND fetched_for_date >= $2::date
       AND fetched_for_date < $3::date
     GROUP BY satbinmas_account_id, client_id, username`,
    [normalizedIds, startDate, endDate]
  );

  const map = new Map();
  res.rows.forEach((row) => {
    map.set(row.satbinmas_account_id, {
      total: Number(row.total) || 0,
      likes: Number(row.likes) || 0,
      comments: Number(row.comments) || 0,
      client_id: row.client_id,
      username: row.username,
    });
  });

  return map;
}
