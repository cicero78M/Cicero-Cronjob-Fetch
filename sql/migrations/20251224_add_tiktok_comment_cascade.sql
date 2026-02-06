-- Ensure TikTok comment data follows post lifecycle
ALTER TABLE tiktok_comment
  DROP CONSTRAINT IF EXISTS tiktok_comment_video_id_fkey,
  ADD CONSTRAINT tiktok_comment_video_id_fkey FOREIGN KEY (video_id)
    REFERENCES tiktok_post(video_id) ON DELETE CASCADE;

ALTER TABLE tiktok_comment_audit
  DROP CONSTRAINT IF EXISTS tiktok_comment_audit_video_id_fkey,
  ADD CONSTRAINT tiktok_comment_audit_video_id_fkey FOREIGN KEY (video_id)
    REFERENCES tiktok_post(video_id) ON DELETE CASCADE;
