import { query } from '../repository/db.js';

export async function upsertPostMetrics(postId, metrics = {}) {
  if (!postId) return;
  const {
    play_count = null,
    save_count = null,
    share_count = null,
    view_count = null,
    fb_like_count = null,
    fb_play_count = null
  } = metrics;
  await query(
    `INSERT INTO ig_post_metrics (
      post_id, play_count, save_count, share_count, view_count, fb_like_count, fb_play_count
    ) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (post_id) DO UPDATE SET
      play_count=EXCLUDED.play_count,
      save_count=EXCLUDED.save_count,
      share_count=EXCLUDED.share_count,
      view_count=EXCLUDED.view_count,
      fb_like_count=EXCLUDED.fb_like_count,
      fb_play_count=EXCLUDED.fb_play_count`,
    [postId, play_count, save_count, share_count, view_count, fb_like_count, fb_play_count]
  );
}
