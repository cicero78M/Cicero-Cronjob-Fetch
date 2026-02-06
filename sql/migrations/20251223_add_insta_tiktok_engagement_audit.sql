CREATE TABLE IF NOT EXISTS insta_like_audit (
  audit_id BIGSERIAL PRIMARY KEY,
  shortcode VARCHAR REFERENCES insta_post(shortcode),
  usernames JSONB NOT NULL DEFAULT '[]'::jsonb,
  snapshot_window_start TIMESTAMPTZ NOT NULL,
  snapshot_window_end TIMESTAMPTZ NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insta_like_audit_shortcode ON insta_like_audit (shortcode);
CREATE INDEX IF NOT EXISTS idx_insta_like_audit_window ON insta_like_audit (shortcode, snapshot_window_start, snapshot_window_end);

CREATE TABLE IF NOT EXISTS tiktok_comment_audit (
  audit_id BIGSERIAL PRIMARY KEY,
  video_id VARCHAR REFERENCES tiktok_post(video_id),
  usernames JSONB NOT NULL DEFAULT '[]'::jsonb,
  snapshot_window_start TIMESTAMPTZ NOT NULL,
  snapshot_window_end TIMESTAMPTZ NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tiktok_comment_audit_video ON tiktok_comment_audit (video_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_comment_audit_window ON tiktok_comment_audit (video_id, snapshot_window_start, snapshot_window_end);
