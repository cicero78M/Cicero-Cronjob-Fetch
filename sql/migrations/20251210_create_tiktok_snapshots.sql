-- Store TikTok accounts and posts fetched for Satbinmas official automation without touching legacy tiktok_post table
CREATE TABLE IF NOT EXISTS tiktok_accounts (
    author_secuid TEXT PRIMARY KEY,
    author_id TEXT,
    username TEXT NOT NULL,
    display_name TEXT,
    bio TEXT,
    avatar_url TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    is_private BOOLEAN DEFAULT FALSE,
    followers BIGINT,
    following BIGINT,
    likes_total BIGINT,
    video_count BIGINT,
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS tiktok_accounts_username_unique
    ON tiktok_accounts (LOWER(username));

CREATE TABLE IF NOT EXISTS tiktok_posts (
    post_id TEXT PRIMARY KEY,
    author_secuid TEXT NOT NULL REFERENCES tiktok_accounts(author_secuid) ON DELETE CASCADE,
    caption TEXT,
    created_at TIMESTAMPTZ,
    language TEXT,
    play_url TEXT,
    cover_url TEXT,
    duration_sec INTEGER,
    height INTEGER,
    width INTEGER,
    ratio TEXT,
    views BIGINT,
    likes BIGINT,
    comments BIGINT,
    shares BIGINT,
    bookmarks BIGINT,
    is_ad BOOLEAN DEFAULT FALSE,
    is_private_post BOOLEAN DEFAULT FALSE,
    share_enabled BOOLEAN DEFAULT TRUE,
    duet_enabled BOOLEAN DEFAULT TRUE,
    stitch_enabled BOOLEAN DEFAULT TRUE,
    crawl_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tiktok_posts_author_idx
    ON tiktok_posts (author_secuid);

CREATE INDEX IF NOT EXISTS tiktok_posts_created_idx
    ON tiktok_posts (created_at);

CREATE TABLE IF NOT EXISTS tiktok_post_hashtags (
    post_id TEXT NOT NULL REFERENCES tiktok_posts(post_id) ON DELETE CASCADE,
    hashtag TEXT NOT NULL,
    CONSTRAINT tiktok_post_hashtags_pkey PRIMARY KEY (post_id, hashtag)
);

CREATE UNIQUE INDEX IF NOT EXISTS tiktok_post_hashtags_lower_unique
    ON tiktok_post_hashtags (post_id, LOWER(hashtag));
