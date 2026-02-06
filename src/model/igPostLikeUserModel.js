import { query } from '../repository/db.js';

export async function insertIgPostLikeUsers(postId, likes = []) {
  if (!postId || !Array.isArray(likes)) return;
  for (const u of likes) {
    const userId = u?.id || null;
    const username = u?.username || (typeof u === 'string' ? u : null);
    if (!userId && !username) continue;
    await query(
      `INSERT INTO ig_post_like_users (post_id, user_id, username)
       VALUES ($1,$2,$3)
       ON CONFLICT (post_id, user_id) DO UPDATE
         SET username = EXCLUDED.username`,
      [postId, userId, username]
    );
  }
}
