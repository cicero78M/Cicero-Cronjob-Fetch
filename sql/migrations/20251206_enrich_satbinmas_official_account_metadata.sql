-- Enrich Satbinmas official account metadata
ALTER TABLE satbinmas_official_accounts
    ADD COLUMN IF NOT EXISTS display_name TEXT,
    ADD COLUMN IF NOT EXISTS profile_url TEXT,
    ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill display_name so existing rows have a human-friendly label
UPDATE satbinmas_official_accounts
SET display_name = COALESCE(NULLIF(TRIM(display_name), ''), username)
WHERE display_name IS NULL;
