-- Add cascading deletes for ig_ext_posts relations
ALTER TABLE ig_ext_posts
  DROP CONSTRAINT IF EXISTS ig_ext_posts_shortcode_fkey,
  ADD CONSTRAINT ig_ext_posts_shortcode_fkey FOREIGN KEY (shortcode)
    REFERENCES insta_post(shortcode) ON DELETE CASCADE;

ALTER TABLE ig_ext_media_items
  DROP CONSTRAINT IF EXISTS ig_ext_media_items_post_id_fkey,
  ADD CONSTRAINT ig_ext_media_items_post_id_fkey FOREIGN KEY (post_id)
    REFERENCES ig_ext_posts(post_id) ON DELETE CASCADE;

ALTER TABLE ig_ext_hashtags
  DROP CONSTRAINT IF EXISTS ig_ext_hashtags_post_id_fkey,
  ADD CONSTRAINT ig_ext_hashtags_post_id_fkey FOREIGN KEY (post_id)
    REFERENCES ig_ext_posts(post_id) ON DELETE CASCADE;

ALTER TABLE ig_post_metrics
  DROP CONSTRAINT IF EXISTS ig_post_metrics_post_id_fkey,
  ADD CONSTRAINT ig_post_metrics_post_id_fkey FOREIGN KEY (post_id)
    REFERENCES ig_ext_posts(post_id) ON DELETE CASCADE;

ALTER TABLE ig_post_like_users
  DROP CONSTRAINT IF EXISTS ig_post_like_users_post_id_fkey,
  ADD CONSTRAINT ig_post_like_users_post_id_fkey FOREIGN KEY (post_id)
    REFERENCES ig_ext_posts(post_id) ON DELETE CASCADE;

ALTER TABLE ig_post_comments
  DROP CONSTRAINT IF EXISTS ig_post_comments_post_id_fkey,
  ADD CONSTRAINT ig_post_comments_post_id_fkey FOREIGN KEY (post_id)
    REFERENCES ig_ext_posts(post_id) ON DELETE CASCADE;
