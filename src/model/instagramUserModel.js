import { query } from '../repository/db.js';

export async function upsertInstagramUser(data) {
  const {
    user_id,
    username,
    full_name = null,
    biography = null,
    business_contact_method = null,
    category = null,
    category_id = null,
    account_type = null,
    contact_phone_number = null,
    external_url = null,
    fbid_v2 = null,
    is_business = null,
    is_private = null,
    is_verified = null,
    public_email = null,
    public_phone_country_code = null,
    public_phone_number = null,
    profile_pic_url = null,
    profile_pic_url_hd = null
  } = data;
  if (!user_id || !username) return;
  await query(
    `INSERT INTO instagram_user (
      user_id, username, full_name, biography,
      business_contact_method, category, category_id, account_type,
      contact_phone_number, external_url, fbid_v2,
      is_business, is_private, is_verified,
      public_email, public_phone_country_code, public_phone_number,
      profile_pic_url, profile_pic_url_hd
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
      $12,$13,$14,$15,$16,$17,$18,$19
    )
    ON CONFLICT (user_id) DO UPDATE SET
      username = EXCLUDED.username,
      full_name = EXCLUDED.full_name,
      biography = EXCLUDED.biography,
      business_contact_method = EXCLUDED.business_contact_method,
      category = EXCLUDED.category,
      category_id = EXCLUDED.category_id,
      account_type = EXCLUDED.account_type,
      contact_phone_number = EXCLUDED.contact_phone_number,
      external_url = EXCLUDED.external_url,
      fbid_v2 = EXCLUDED.fbid_v2,
      is_business = EXCLUDED.is_business,
      is_private = EXCLUDED.is_private,
      is_verified = EXCLUDED.is_verified,
      public_email = EXCLUDED.public_email,
      public_phone_country_code = EXCLUDED.public_phone_country_code,
      public_phone_number = EXCLUDED.public_phone_number,
      profile_pic_url = EXCLUDED.profile_pic_url,
      profile_pic_url_hd = EXCLUDED.profile_pic_url_hd`,
    [
      user_id,
      username,
      full_name,
      biography,
      business_contact_method,
      category,
      category_id,
      account_type,
      contact_phone_number,
      external_url,
      fbid_v2,
      is_business,
      is_private,
      is_verified,
      public_email,
      public_phone_country_code,
      public_phone_number,
      profile_pic_url,
      profile_pic_url_hd
    ]
  );
}

export async function upsertInstagramUserMetrics(data) {
  const {
    user_id,
    follower_count = null,
    following_count = null,
    media_count = null,
    total_igtv_videos = null,
    latest_reel_media = null
  } = data;
  if (!user_id) return;
  await query(
    `INSERT INTO instagram_user_metrics (
      user_id, follower_count, following_count, media_count,
      total_igtv_videos, latest_reel_media
    ) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id) DO UPDATE SET
      follower_count = EXCLUDED.follower_count,
      following_count = EXCLUDED.following_count,
      media_count = EXCLUDED.media_count,
      total_igtv_videos = EXCLUDED.total_igtv_videos,
      latest_reel_media = EXCLUDED.latest_reel_media`,
    [
      user_id,
      follower_count,
      following_count,
      media_count,
      total_igtv_videos,
      latest_reel_media
    ]
  );
}

export async function findByUserId(user_id) {
  const res = await query('SELECT * FROM instagram_user WHERE user_id = $1', [user_id]);
  return res.rows[0] || null;
}

export async function findByUsername(username) {
  const res = await query('SELECT * FROM instagram_user WHERE username = $1', [username]);
  return res.rows[0] || null;
}

export async function updatePremiumStatus(userId, status, endDate) {
  const res = await query(
    'UPDATE instagram_user SET premium_status=$2, premium_end_date=$3 WHERE user_id=$1 RETURNING *',
    [userId, status, endDate]
  );
  return res.rows[0] || null;
}
