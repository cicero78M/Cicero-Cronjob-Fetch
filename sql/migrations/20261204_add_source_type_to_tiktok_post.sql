ALTER TABLE tiktok_post
ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'cron_fetch';

UPDATE tiktok_post
SET source_type = 'cron_fetch'
WHERE source_type IS NULL OR BTRIM(source_type) = '';

ALTER TABLE tiktok_post
ALTER COLUMN source_type SET DEFAULT 'cron_fetch';
