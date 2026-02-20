ALTER TABLE insta_post
ADD COLUMN IF NOT EXISTS source_type VARCHAR(20);

UPDATE insta_post
SET source_type = 'cron_fetch'
WHERE source_type IS NULL;

ALTER TABLE insta_post
ALTER COLUMN source_type SET DEFAULT 'cron_fetch';

ALTER TABLE insta_post
ALTER COLUMN source_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'insta_post_source_type_check'
  ) THEN
    ALTER TABLE insta_post
      ADD CONSTRAINT insta_post_source_type_check
      CHECK (source_type IN ('cron_fetch', 'manual_input'));
  END IF;
END $$;
