-- Store daily Instagram media metadata for Satbinmas Official accounts
CREATE TABLE IF NOT EXISTS satbinmas_official_media (
    satbinmas_media_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    satbinmas_account_id UUID NOT NULL REFERENCES satbinmas_official_accounts(satbinmas_account_id) ON DELETE CASCADE,
    client_id VARCHAR NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    media_id TEXT NOT NULL,
    code TEXT,
    media_type TEXT,
    product_type TEXT,
    taken_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ig_created_at TIMESTAMP WITH TIME ZONE,
    caption_text TEXT,
    like_count INTEGER,
    comment_count INTEGER,
    view_count INTEGER,
    play_count INTEGER,
    save_count INTEGER,
    share_count INTEGER,
    thumbnail_url TEXT,
    media_url TEXT,
    video_url TEXT,
    width INTEGER,
    height INTEGER,
    duration_seconds NUMERIC,
    fetched_for_date DATE NOT NULL DEFAULT CURRENT_DATE,
    is_album BOOLEAN NOT NULL DEFAULT FALSE,
    is_video BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT satbinmas_official_media_unique UNIQUE (client_id, username, media_id, taken_at)
);

CREATE INDEX IF NOT EXISTS satbinmas_official_media_account_idx
    ON satbinmas_official_media (satbinmas_account_id);
CREATE INDEX IF NOT EXISTS satbinmas_official_media_client_username_idx
    ON satbinmas_official_media (client_id, username);
CREATE INDEX IF NOT EXISTS satbinmas_official_media_taken_at_idx
    ON satbinmas_official_media (taken_at);
CREATE INDEX IF NOT EXISTS satbinmas_official_media_fetch_date_idx
    ON satbinmas_official_media (fetched_for_date);

CREATE OR REPLACE FUNCTION set_satbinmas_official_media_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS satbinmas_official_media_set_updated_at ON satbinmas_official_media;
CREATE TRIGGER satbinmas_official_media_set_updated_at
BEFORE UPDATE ON satbinmas_official_media
FOR EACH ROW
EXECUTE PROCEDURE set_satbinmas_official_media_updated_at();

-- Hashtag references for Satbinmas Official media
CREATE TABLE IF NOT EXISTS satbinmas_official_media_hashtags (
    satbinmas_media_hashtag_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    satbinmas_media_id UUID NOT NULL REFERENCES satbinmas_official_media(satbinmas_media_id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS satbinmas_official_media_hashtag_unique
    ON satbinmas_official_media_hashtags (satbinmas_media_id, LOWER(tag));

-- Mention references for Satbinmas Official media
CREATE TABLE IF NOT EXISTS satbinmas_official_media_mentions (
    satbinmas_media_mention_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    satbinmas_media_id UUID NOT NULL REFERENCES satbinmas_official_media(satbinmas_media_id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS satbinmas_official_media_mention_unique
    ON satbinmas_official_media_mentions (satbinmas_media_id, LOWER(username));
