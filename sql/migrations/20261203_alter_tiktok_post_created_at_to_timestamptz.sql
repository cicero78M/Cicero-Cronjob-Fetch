-- Standardize TikTok post timestamps to UTC-aware TIMESTAMPTZ.
-- Existing rows are interpreted as UTC because legacy writes stored UTC wall-clock
-- values in a TIMESTAMP (without timezone) column.
ALTER TABLE tiktok_post
  ALTER COLUMN created_at TYPE TIMESTAMPTZ
  USING created_at AT TIME ZONE 'UTC';
