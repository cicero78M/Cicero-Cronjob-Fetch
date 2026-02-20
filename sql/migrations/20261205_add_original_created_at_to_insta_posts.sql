ALTER TABLE insta_post
ADD COLUMN IF NOT EXISTS original_created_at TIMESTAMPTZ;

ALTER TABLE insta_post_khusus
ADD COLUMN IF NOT EXISTS original_created_at TIMESTAMPTZ;
