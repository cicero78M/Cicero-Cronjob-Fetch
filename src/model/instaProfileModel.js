import { query } from '../repository/db.js';

export async function upsertInstaProfile(data) {
  const {
    username,
    full_name = null,
    biography = null,
    follower_count = 0,
    following_count = 0,
    post_count = 0,
    profile_pic_url = null,
  } = data;
  if (!username) return;
  await query(
    `INSERT INTO insta_profile (username, full_name, biography, follower_count, following_count, post_count, profile_pic_url, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT (username) DO UPDATE
       SET full_name = EXCLUDED.full_name,
           biography = EXCLUDED.biography,
           follower_count = EXCLUDED.follower_count,
           following_count = EXCLUDED.following_count,
           post_count = EXCLUDED.post_count,
           profile_pic_url = EXCLUDED.profile_pic_url,
           updated_at = NOW()`,
    [username, full_name, biography, follower_count, following_count, post_count, profile_pic_url]
  );
}

export async function findByUsername(username) {
  const res = await query('SELECT * FROM insta_profile WHERE username = $1', [username]);
  return res.rows[0] || null;
}
