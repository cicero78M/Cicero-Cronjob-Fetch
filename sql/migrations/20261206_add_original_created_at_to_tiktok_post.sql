ALTER TABLE tiktok_post
ADD COLUMN IF NOT EXISTS original_created_at TIMESTAMPTZ;
