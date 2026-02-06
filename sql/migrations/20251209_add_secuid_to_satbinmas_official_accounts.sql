-- Capture platform-native security identifiers (e.g. TikTok secUid) for Satbinmas official accounts
ALTER TABLE satbinmas_official_accounts
    ADD COLUMN IF NOT EXISTS secuid TEXT;
