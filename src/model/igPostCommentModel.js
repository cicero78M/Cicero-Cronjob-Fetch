import { query } from '../repository/db.js';

export async function insertIgPostComments(postId, comments = []) {
  if (!postId || !Array.isArray(comments)) return;
  for (const c of comments) {
    const cid = c?.id || c?.pk;
    if (!cid) continue;
    const userId = c.user_id || c.user?.id || null;
    const text = c.text || null;
    const createdAt = c.created_at || null;
    await query(
      `INSERT INTO ig_post_comments (comment_id, post_id, user_id, text, created_at)
       VALUES ($1,$2,$3,$4,to_timestamp($5))
       ON CONFLICT (comment_id) DO UPDATE
         SET user_id=EXCLUDED.user_id,
             text=EXCLUDED.text,
             created_at=to_timestamp($5)`,
      [cid, postId, userId, text, createdAt]
    );
  }
}
