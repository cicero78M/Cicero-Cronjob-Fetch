ALTER TABLE tiktok_comment_audit
  ADD COLUMN IF NOT EXISTS observed_usernames JSONB NOT NULL DEFAULT '[]'::jsonb;
