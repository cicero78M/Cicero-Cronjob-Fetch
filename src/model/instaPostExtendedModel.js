import { query } from '../repository/db.js';

export async function upsertIgUser(user) {
  if (!user || !user.id) return;
  await query(
    `INSERT INTO ig_ext_users (user_id, username, full_name, is_private, is_verified, profile_pic_url)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id) DO UPDATE
     SET username=EXCLUDED.username,
         full_name=EXCLUDED.full_name,
         is_private=EXCLUDED.is_private,
         is_verified=EXCLUDED.is_verified,
         profile_pic_url=EXCLUDED.profile_pic_url`,
    [user.id, user.username, user.full_name || null, user.is_private || false, user.is_verified || false, user.profile_pic_url || null]
  );
}

export async function upsertIgPost(post, userId) {
  const shortcode = post.code || post.shortcode || null;
  if (!shortcode) return;

  // ensure parent insta_post row exists to satisfy foreign key
  await query(
    `INSERT INTO insta_post (shortcode, created_at)
     VALUES ($1, to_timestamp($2))
     ON CONFLICT (shortcode) DO NOTHING`,
    [shortcode, post.taken_at || post.taken_at_ts || null]
  );

  await query(
    `INSERT INTO ig_ext_posts (post_id, shortcode, user_id, caption_text, created_at, like_count, comment_count, is_video, media_type, is_pinned)
     VALUES ($1,$2,$3,$4,to_timestamp($5),$6,$7,$8,$9,$10)
     ON CONFLICT (post_id) DO UPDATE SET
       shortcode=EXCLUDED.shortcode,
       caption_text=EXCLUDED.caption_text,
       like_count=EXCLUDED.like_count,
       comment_count=EXCLUDED.comment_count,
       is_video=EXCLUDED.is_video,
       media_type=EXCLUDED.media_type,
       is_pinned=EXCLUDED.is_pinned,
       created_at=to_timestamp($5)`,
    [
      post.id,
      shortcode,
      userId,
      post.caption?.text || null,
      post.taken_at || post.taken_at_ts || null,
      post.like_count || 0,
      post.comment_count || 0,
      post.is_video || false,
      post.media_type || null,
      post.is_pinned || false
    ]
  );
}

export async function upsertIgMedia(item, postId) {
  await query(
    `INSERT INTO ig_ext_media_items (media_id, post_id, media_type, is_video, original_width, original_height, image_url, video_url, video_duration, thumbnail_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (media_id) DO UPDATE SET
       post_id=EXCLUDED.post_id,
       media_type=EXCLUDED.media_type,
       is_video=EXCLUDED.is_video,
       original_width=EXCLUDED.original_width,
       original_height=EXCLUDED.original_height,
       image_url=EXCLUDED.image_url,
       video_url=EXCLUDED.video_url,
       video_duration=EXCLUDED.video_duration,
       thumbnail_url=EXCLUDED.thumbnail_url`,
    [
      item.id,
      postId,
      item.media_type || null,
      item.is_video || false,
      item.original_width || null,
      item.original_height || null,
      item.image_versions?.items?.[0]?.url || null,
      item.video_url || null,
      item.video_duration || null,
      item.thumbnail_url || null,
    ]
  );
}

export async function insertHashtags(postId, hashtags=[]) {
  for (const h of hashtags) {
    if (!h) continue;
    await query(
      `INSERT INTO ig_ext_hashtags (post_id, hashtag)
       VALUES ($1,$2)
       ON CONFLICT DO NOTHING`,
      [postId, h.replace('#','')]
    );
  }
}

export async function upsertTaggedUsers(mediaId, tags=[]) {
  for (const tag of tags) {
    const u = tag.user;
    if (!u || !u.id) continue;
    await upsertIgUser(u);
    await query(
      `INSERT INTO ig_ext_tagged_users (media_id, user_id, x, y)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (media_id, user_id) DO UPDATE SET x=EXCLUDED.x, y=EXCLUDED.y`,
      [mediaId, u.id, tag.x || 0, tag.y || 0]
    );
  }
}

export async function getPostIdsTodayByUsername(username) {
  if (!username) return [];
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const res = await query(
    `SELECT p.post_id FROM ig_ext_posts p JOIN ig_ext_users u ON u.user_id = p.user_id WHERE u.username = $1 AND DATE(p.created_at) = $2`,
    [username, `${yyyy}-${mm}-${dd}`]
  );
  return res.rows.map(r => r.post_id);
}

export async function getPostIdShortcodePairsTodayByUsername(username) {
  if (!username) return [];
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const res = await query(
    `SELECT p.post_id, p.shortcode FROM ig_ext_posts p JOIN ig_ext_users u ON u.user_id = p.user_id WHERE u.username = $1 AND DATE(p.created_at) = $2`,
    [username, `${yyyy}-${mm}-${dd}`]
  );
  return res.rows;
}

export async function savePostWithMedia(post) {
  if (!post) return;
  await upsertIgUser(post.user);
  await upsertIgPost(post, post.user?.id);
  if (Array.isArray(post.hashtags)) {
    await insertHashtags(post.id, post.hashtags);
  }
  const medias = post.carousel_media || [post];
  for (const m of medias) {
    await upsertIgMedia(m, post.id);
    if (Array.isArray(m.tagged_users)) {
      await upsertTaggedUsers(m.id, m.tagged_users);
    }
  }
}

